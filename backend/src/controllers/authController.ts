import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import dbClient from '../utils/db';
import { hashPassword, comparePassword } from '../utils/bcrypt';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../utils/jwt';
import { generateTwoFactorSecret, verifyTwoFactorToken } from '../utils/twoFactor';
import { logAction } from '../utils/actionLog';
import { AuthRequest } from '../middleware/auth';
import { isJwtError, isDatabaseError, getErrorMessage } from '../middleware/errorHandler';
// Константы для ролей и типов действий (SQLite не поддерживает enum)
const UserRole = {
  OWNER: 'OWNER',
  ADMIN: 'ADMIN',
  MANAGER: 'MANAGER',
  EMPLOYEE: 'EMPLOYEE',
} as const;

const ActionLogType = {
  CREATE: 'CREATE',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
  LOGIN: 'LOGIN',
  LOGOUT: 'LOGOUT',
  APPROVE: 'APPROVE',
  REJECT: 'REJECT',
  COMPLETE: 'COMPLETE',
} as const;

export const register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    const { email, password, firstName, lastName, phone, role } = req.body;

    // Проверяем, что email не занят
    const existingUser = await dbClient.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      res.status(400).json({ error: 'User with this email already exists' });
      return;
    }

    // По умолчанию создаем сотрудника, если роль не указана
    const userRole = role && ['OWNER', 'ADMIN', 'MANAGER'].includes(role) ? role : UserRole.EMPLOYEE;

    // Хешируем пароль
    const passwordHash = await hashPassword(password);

    // Создаем пользователя
    const user = await dbClient.user.create({
      data: {
        email,
        passwordHash,
        firstName,
        lastName,
        phone,
        role: userRole,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        createdAt: true,
      },
    });

    // Логируем действие
    await logAction({
      userId: user.id,
      type: ActionLogType.CREATE,
      entityType: 'User',
      entityId: user.id,
      description: `User registered: ${user.email}`,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.status(201).json({
      message: 'User registered successfully',
      user,
    });
  } catch (error) {
    next(error);
  }
};

export const login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    const { email, password } = req.body;

    // Находим пользователя
    const user = await dbClient.user.findUnique({
      where: { email },
    });

    if (!user) {
      res.status(401).json({ error: 'Неверный логин или пароль' });
      return;
    }

    if (!user.isActive) {
      res.status(403).json({ error: 'Аккаунт деактивирован. Обратитесь к администратору.' });
      return;
    }

    // Проверяем пароль
    const isPasswordValid = await comparePassword(password, user.passwordHash);
    if (!isPasswordValid) {
      res.status(401).json({ error: 'Неверный логин или пароль' });
      return;
    }

    // Если включена 2FA, возвращаем флаг, что нужна проверка
    if (user.twoFactorEnabled) {
      res.json({
        requires2FA: true,
        message: '2FA verification required',
      });
      return;
    }

    // Генерируем токены
    const tokenPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);

    // Логируем вход
    await logAction({
      userId: user.id,
      type: ActionLogType.LOGIN,
      entityType: 'User',
      entityId: user.id,
      description: `User logged in: ${user.email}`,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        twoFactorEnabled: user.twoFactorEnabled,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const verify2FA = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    const { email, token } = req.body;

    const user = await dbClient.user.findUnique({
      where: { email },
    });

    if (!user || !user.isActive || !user.twoFactorEnabled || !user.twoFactorSecret) {
      res.status(401).json({ error: 'Invalid request' });
      return;
    }

    // Проверяем токен 2FA
    const isTokenValid = verifyTwoFactorToken(token, user.twoFactorSecret);
    if (!isTokenValid) {
      res.status(401).json({ error: 'Invalid 2FA token' });
      return;
    }

    // Генерируем токены
    const tokenPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);

    await logAction({
      userId: user.id,
      type: ActionLogType.LOGIN,
      entityType: 'User',
      entityId: user.id,
      description: `User logged in with 2FA: ${user.email}`,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        twoFactorEnabled: user.twoFactorEnabled,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const refreshToken = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { refreshToken: token } = req.body;

    if (!token) {
      res.status(400).json({ error: 'Refresh token is required' });
      return;
    }

    const payload = verifyRefreshToken(token);

    // Проверяем, что пользователь существует и активен
    const user = await dbClient.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, email: true, role: true, isActive: true },
    });

    if (!user || !user.isActive) {
      res.status(401).json({ error: 'Invalid refresh token' });
      return;
    }

    const tokenPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = generateAccessToken(tokenPayload);
    const newRefreshToken = generateRefreshToken(tokenPayload);

    res.json({
      accessToken,
      refreshToken: newRefreshToken,
    });
  } catch (error: unknown) {
    if (isJwtError(error)) {
      res.status(401).json({ error: 'Invalid or expired refresh token' });
      return;
    }
    next(error);
  }
};

export const logout = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    await logAction({
      userId: req.user.id,
      type: ActionLogType.LOGOUT,
      entityType: 'User',
      entityId: req.user.id,
      description: `User logged out: ${req.user.email}`,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    next(error);
  }
};

export const generate2FA = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // Только для владельцев и менеджеров
    if (!['OWNER', 'ADMIN', 'MANAGER'].includes(req.user.role)) {
      res.status(403).json({ error: '2FA is only available for owners, admins, and managers' });
      return;
    }

    const user = await dbClient.user.findUnique({
      where: { id: req.user.id },
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const { secret, qrCodeUrl } = await generateTwoFactorSecret(user.email);

    res.json({
      secret,
      qrCodeUrl,
    });
  } catch (error) {
    next(error);
  }
};

export const enable2FA = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { token, secret } = req.body;

    // Проверяем токен
    const isTokenValid = verifyTwoFactorToken(token, secret);
    if (!isTokenValid) {
      res.status(400).json({ error: 'Invalid 2FA token' });
      return;
    }

    // Сохраняем секрет и включаем 2FA
    await dbClient.user.update({
      where: { id: req.user.id },
      data: {
        twoFactorSecret: secret,
        twoFactorEnabled: true,
      },
    });

    await logAction({
      userId: req.user.id,
      type: ActionLogType.UPDATE,
      entityType: 'User',
      entityId: req.user.id,
      description: '2FA enabled',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({ message: '2FA enabled successfully' });
  } catch (error) {
    next(error);
  }
};

export const disable2FA = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    await dbClient.user.update({
      where: { id: req.user.id },
      data: {
        twoFactorEnabled: false,
        twoFactorSecret: null,
      },
    });

    await logAction({
      userId: req.user.id,
      type: ActionLogType.UPDATE,
      entityType: 'User',
      entityId: req.user.id,
      description: '2FA disabled',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({ message: '2FA disabled successfully' });
  } catch (error) {
    next(error);
  }
};

export const getMe = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const user = await dbClient.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        telegramId: true,
        role: true,
        twoFactorEnabled: true,
        isActive: true,
        createdAt: true,
        restaurants: {
          select: {
            restaurant: {
              select: {
                id: true,
                name: true,
                address: true,
              },
            },
            position: true,
          },
        },
      },
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({ user });
  } catch (error) {
    next(error);
  }
};

// Обновление профиля пользователя
export const updateProfile = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { email, password, firstName, lastName, phone } = req.body;

    const updateData: any = {};

    // Обновление email (проверяем уникальность)
    if (email && email !== req.user.email) {
      const existingUser = await dbClient.user.findUnique({
        where: { email },
      });

      if (existingUser) {
        res.status(400).json({ error: 'Email already in use' });
        return;
      }

      updateData.email = email;
    }

    // Обновление пароля (если указан)
    if (password) {
      updateData.passwordHash = await hashPassword(password);
    }

    // Обновление других полей
    if (firstName !== undefined) updateData.firstName = firstName;
    if (lastName !== undefined) updateData.lastName = lastName;
    if (phone !== undefined) updateData.phone = phone || null;

    // Обновляем пользователя
    const updatedUser = await dbClient.user.update({
      where: { id: req.user.id },
      data: updateData,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        twoFactorEnabled: true,
        isActive: true,
        createdAt: true,
      },
    });

    await logAction({
      userId: req.user.id,
      type: ActionLogType.UPDATE,
      entityType: 'User',
      entityId: updatedUser.id,
      description: 'Updated profile',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({
      message: 'Profile updated successfully',
      user: updatedUser,
    });
  } catch (error: unknown) {
    if (isDatabaseError(error) && error.code === 'P2002') {
      res.status(400).json({ error: 'Email already in use' });
      return;
    }
    next(error);
  }
};

