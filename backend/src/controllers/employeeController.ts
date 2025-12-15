import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import prisma from '../utils/prisma';
import { logAction } from '../utils/actionLog';
import { AuthRequest } from '../middleware/auth';
import bcrypt from 'bcryptjs';
import { hashPassword } from '../utils/bcrypt';

// Получение всех пользователей (для выбора при добавлении сотрудника)
export const getUsers = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!['OWNER', 'ADMIN', 'MANAGER'].includes(req.user.role)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const { role } = req.query;
    
    const where: any = { isActive: true };
    if (role) {
      where.role = role as string;
    } else {
      // По умолчанию показываем сотрудников, но можно получить всех
      where.role = 'EMPLOYEE';
    }
    
    const users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
      },
      orderBy: [
        { lastName: 'asc' },
        { firstName: 'asc' },
      ],
    });

    res.json({ users });
  } catch (error) {
    next(error);
  }
};

// Получение сотрудников ресторана
export const getEmployees = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { restaurantId } = req.params;

    // Проверка доступа к ресторану
    if (req.user.role !== 'OWNER' && req.user.role !== 'ADMIN') {
      if (req.user.role === 'MANAGER') {
        const restaurant = await prisma.restaurant.findUnique({
          where: { id: restaurantId },
          select: { managerId: true },
        });

        if (restaurant?.managerId !== req.user.id) {
          res.status(403).json({ error: 'Forbidden' });
          return;
        }
      } else {
        // Для сотрудников проверяем, работают ли они в этом ресторане
        const restaurantUser = await prisma.restaurantUser.findFirst({
          where: {
            restaurantId,
            userId: req.user.id,
            isActive: true,
          },
        });

        if (!restaurantUser) {
          res.status(403).json({ error: 'Forbidden' });
          return;
        }
      }
    }

    const employees = await prisma.restaurantUser.findMany({
      where: {
        restaurantId,
        isActive: true,
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            // OWNER может видеть email (логин)
            ...(req.user.role === 'OWNER' && { email: true }),
          },
        },
        position: {
          select: {
            id: true,
            name: true,
          },
        },
        department: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: [
        { user: { lastName: 'asc' } },
        { user: { firstName: 'asc' } },
      ],
    });

    const result = employees.map((emp) => ({
      id: emp.user.id,
      firstName: emp.user.firstName,
      lastName: emp.user.lastName,
      phone: emp.user.phone,
      ...(req.user && req.user.role === 'OWNER' && 'email' in emp.user && { email: emp.user.email }),
      positionId: emp.positionId,
      position: emp.position ? {
        id: emp.position.id,
        name: emp.position.name,
      } : null,
      departmentId: emp.departmentId,
      department: emp.department ? {
        id: emp.department.id,
        name: emp.department.name,
      } : null,
    }));

    res.json({ employees: result });
  } catch (error) {
    next(error);
  }
};

// Создание сотрудника (регистрация + добавление в ресторан)
export const createEmployee = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
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

    if (!['OWNER', 'ADMIN', 'MANAGER'].includes(req.user.role)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const { restaurantId } = req.params;
    const { email: providedEmail, password, firstName, lastName, phone, positionId, departmentId } = req.body;

    // Используем указанный email или генерируем уникальный
    let email: string;
    if (providedEmail && providedEmail.trim()) {
      // Используем указанный email
      email = providedEmail.trim();
      
      // Проверяем, не занят ли уже этот email
      const existingUser = await prisma.user.findUnique({ where: { email } });
      if (existingUser) {
        res.status(400).json({ error: 'Пользователь с таким логином уже существует' });
        return;
      }
    } else {
      // Генерируем уникальный email на основе имени и телефона
      const baseEmail = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${phone ? `.${phone.replace(/\D/g, '')}` : ''}`;
      email = `${baseEmail}@resto.local`;
      let counter = 1;
      
      // Проверяем уникальность email
      while (await prisma.user.findUnique({ where: { email } })) {
        email = `${baseEmail}${counter}@resto.local`;
        counter++;
      }
    }

    // Проверяем, существует ли пользователь с таким именем и телефоном
    let user = await prisma.user.findFirst({
      where: {
        firstName,
        lastName,
        phone: phone || null,
        role: 'EMPLOYEE',
      },
    });

    if (!user) {
      // Создаем нового пользователя
      const passwordHash = await bcrypt.hash(password || 'Temp123!', 10);
      user = await prisma.user.create({
        data: {
          email,
          passwordHash,
          firstName,
          lastName,
          phone: phone || null,
          role: 'EMPLOYEE',
          isActive: true,
        },
      });
    }

    // Проверяем, не работает ли уже в этом ресторане
    const existing = await prisma.restaurantUser.findUnique({
      where: {
        restaurantId_userId: {
          restaurantId,
          userId: user.id,
        },
      },
    });

    if (existing) {
      // Обновляем, если нужно
      const restaurantUser = await prisma.restaurantUser.update({
        where: { id: existing.id },
        data: {
          positionId,
          departmentId: departmentId || null,
          isActive: true,
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              phone: true,
            },
          },
          position: {
            select: {
              id: true,
              name: true,
            },
          },
          department: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      res.json({ employee: restaurantUser });
      return;
    }

    // Добавляем в ресторан
    const restaurantUser = await prisma.restaurantUser.create({
      data: {
        restaurantId,
        userId: user.id,
        positionId,
        departmentId: departmentId || null,
        isActive: true,
      },
      include: {
        user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        position: {
          select: {
            id: true,
            name: true,
          },
        },
        department: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    await logAction({
      userId: req.user.id,
      type: 'CREATE',
      entityType: 'Employee',
      entityId: restaurantUser.id,
      description: `Added employee ${user.firstName} ${user.lastName} to restaurant`,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.status(201).json({ employee: restaurantUser });
  } catch (error: any) {
    console.error('Error creating employee:', error);
    if (error.code === 'P2002') {
      res.status(400).json({ error: 'Employee already exists in this restaurant' });
      return;
    }
    if (error.code === 'P2003') {
      res.status(400).json({ error: 'Invalid position or department ID' });
      return;
    }
    res.status(500).json({ error: error.message || 'Error creating employee' });
  }
};

// Обновление сотрудника
export const updateEmployee = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const errorMessages = errors.array().map((err: any) => {
        const msg = err.msg || err.message || 'Invalid value';
        // Переводим сообщения на русский
        if (msg.includes('Password must be at least')) return 'Пароль должен быть не менее 6 символов';
        return msg;
      });
      res.status(400).json({ 
        error: errorMessages.join(', '),
        errors: errors.array() 
      });
      return;
    }

    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!['OWNER', 'ADMIN', 'MANAGER'].includes(req.user.role)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const { restaurantId, employeeId } = req.params;
    const { positionId, departmentId, isActive, email, password } = req.body;

    const restaurantUser = await prisma.restaurantUser.findFirst({
      where: {
        restaurantId,
        userId: employeeId,
      },
      include: {
        user: true,
      },
    });

    if (!restaurantUser) {
      res.status(404).json({ error: 'Employee not found' });
      return;
    }

    // Обновляем данные пользователя (email и пароль) - только для OWNER
    if (req.user.role === 'OWNER') {
      const userUpdateData: any = {};

      // Обновление email (только если передан и отличается от текущего)
      const trimmedEmail = email?.trim();
      if (trimmedEmail && trimmedEmail !== restaurantUser.user.email) {
        // Проверяем уникальность email
        const existingUser = await prisma.user.findUnique({
          where: { email: trimmedEmail },
        });

        if (existingUser && existingUser.id !== employeeId) {
          res.status(400).json({ error: 'Email уже используется другим пользователем' });
          return;
        }

        userUpdateData.email = trimmedEmail;
      }

      // Обновление пароля (только если указан и не пустой)
      const trimmedPassword = password?.trim();
      if (trimmedPassword && trimmedPassword.length > 0) {
        if (trimmedPassword.length < 6) {
          res.status(400).json({ error: 'Пароль должен быть не менее 6 символов' });
          return;
        }
        userUpdateData.passwordHash = await hashPassword(trimmedPassword);
      }

      // Обновляем пользователя, если есть изменения
      if (Object.keys(userUpdateData).length > 0) {
        await prisma.user.update({
          where: { id: employeeId },
          data: userUpdateData,
        });
      }
    }

    // Обновляем данные сотрудника в ресторане
    const updated = await prisma.restaurantUser.update({
      where: { id: restaurantUser.id },
      data: {
        positionId,
        departmentId: departmentId || null,
        isActive,
      },
      include: {
        user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              phone: true,
            },
          },
        position: {
          select: {
            id: true,
            name: true,
          },
        },
        department: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    await logAction({
      userId: req.user.id,
      type: 'UPDATE',
      entityType: 'Employee',
      entityId: updated.id,
      description: `Updated employee ${updated.user.firstName} ${updated.user.lastName}`,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({ employee: updated });
  } catch (error) {
    next(error);
  }
};

// Удаление сотрудника из ресторана
export const removeEmployee = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!['OWNER', 'ADMIN', 'MANAGER'].includes(req.user.role)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const { restaurantId, employeeId } = req.params;

    const restaurantUser = await prisma.restaurantUser.findFirst({
      where: {
        restaurantId,
        userId: employeeId,
      },
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (!restaurantUser) {
      res.status(404).json({ error: 'Employee not found' });
      return;
    }

    // Деактивируем вместо удаления
    await prisma.restaurantUser.update({
      where: { id: restaurantUser.id },
      data: { isActive: false },
    });

    await logAction({
      userId: req.user.id,
      type: 'UPDATE',
      entityType: 'Employee',
      entityId: restaurantUser.id,
      description: `Removed employee ${restaurantUser.user.firstName} ${restaurantUser.user.lastName} from restaurant`,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({ message: 'Employee removed successfully' });
  } catch (error) {
    next(error);
  }
};

// Получение расширенного профиля сотрудника
export const getEmployeeExtendedProfile = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { userId } = req.params;

    // Проверяем права доступа - сотрудник может смотреть только свой профиль, менеджер/админ - любой
    if (req.user.role === 'EMPLOYEE' && req.user.id !== userId) {
      // Проверяем, имеет ли сотрудник право просматривать других сотрудников
      const { checkPermission } = await import('../utils/checkPermissions');
      const { PERMISSIONS } = await import('../utils/permissions');
      
      // Если смотрим профиль другого сотрудника, нужны права просмотра
      const restaurantId = req.query.restaurantId as string | undefined;
      if (!restaurantId) {
        res.status(400).json({ error: 'restaurantId is required' });
        return;
      }

      const canViewEmployees = await checkPermission(req.user.id, restaurantId, PERMISSIONS.VIEW_EMPLOYEES);
      if (!canViewEmployees) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
    }

    // Получаем основную информацию о пользователе
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        createdAt: true,
      },
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Получаем историю работы (все рестораны, где работал/работает сотрудник)
    const workHistory = await prisma.restaurantUser.findMany({
      where: { userId },
      include: {
        restaurant: {
          select: {
            id: true,
            name: true,
            address: true,
          },
        },
        position: {
          select: {
            id: true,
            name: true,
          },
        },
        department: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Получаем статистику по сменам
    const allShifts = await prisma.shift.findMany({
      where: {
        userId,
      },
      select: {
        id: true,
        startTime: true,
        endTime: true,
        hours: true,
        restaurantId: true,
        isConfirmed: true,
      },
    });

    // Подсчитываем статистику
    const totalShifts = allShifts.filter(s => s.isConfirmed).length;
    const totalHours = allShifts
      .filter(s => s.isConfirmed)
      .reduce((sum, shift) => sum + (shift.hours || 0), 0);
    const averageHoursPerShift = totalShifts > 0 ? totalHours / totalShifts : 0;

    // Статистика по месяцам (последние 12 месяцев)
    const monthlyStats: Array<{
      month: number;
      year: number;
      shifts: number;
      hours: number;
    }> = [];

    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const month = date.getMonth() + 1;
      const year = date.getFullYear();

      const monthShifts = allShifts.filter(s => {
        if (!s.isConfirmed) return false;
        const shiftDate = new Date(s.startTime);
        return shiftDate.getMonth() + 1 === month && shiftDate.getFullYear() === year;
      });

      const monthHours = monthShifts.reduce((sum, shift) => sum + (shift.hours || 0), 0);

      monthlyStats.push({
        month,
        year,
        shifts: monthShifts.length,
        hours: monthHours,
      });
    }

    res.json({
      user,
      workHistory: workHistory.map(wh => ({
        id: wh.id,
        restaurant: wh.restaurant,
        position: wh.position,
        department: wh.department,
        isActive: wh.isActive,
        startDate: wh.createdAt,
        endDate: wh.isActive ? null : wh.updatedAt,
      })),
      shiftStats: {
        totalShifts,
        totalHours,
        averageHoursPerShift: Math.round(averageHoursPerShift * 100) / 100,
        monthlyStats,
      },
    });
  } catch (error) {
    next(error);
  }
};

