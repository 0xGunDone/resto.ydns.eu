import { Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import prisma from '../utils/prisma';
import { logAction } from '../utils/actionLog';
import { AuthRequest } from '../middleware/auth';
import crypto from 'crypto';

// Генерация уникального токена
function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

// Создание пригласительной ссылки
export const createInviteLink = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
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

    const { restaurantId, positionId, departmentId, expiresAt, maxUses } = req.body;

    // Проверка доступа к ресторану
    if (req.user.role !== 'OWNER' && req.user.role !== 'ADMIN') {
      const restaurant = await prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: { managerId: true },
      });

      if (restaurant?.managerId !== req.user.id) {
        res.status(403).json({ error: 'Forbidden: Only restaurant manager can create invite links' });
        return;
      }
    }

    // Проверяем, что ресторан существует
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
    });

    if (!restaurant) {
      res.status(404).json({ error: 'Restaurant not found' });
      return;
    }

    // Генерируем уникальный токен
    let token = generateToken();
    while (await (prisma as any).inviteLink.findUnique({ where: { token } })) {
      token = generateToken();
    }

    // Создаем пригласительную ссылку
    const inviteLink = await (prisma as any).inviteLink.create({
      data: {
        token,
        restaurantId,
        positionId: positionId || null,
        departmentId: departmentId || null,
        createdById: req.user.id,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        maxUses: maxUses || 1,
        isActive: true,
      },
      include: {
        restaurant: {
          select: {
            id: true,
            name: true,
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
      entityType: 'InviteLink',
      entityId: inviteLink.id,
      description: `Created invite link for restaurant: ${restaurant.name}`,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    // Формируем ссылку для Telegram бота
    const botUsername = process.env.TELEGRAM_BOT_USERNAME || 'myResto_robot';
    const inviteUrl = `https://t.me/${botUsername}?start=${token}`;

    res.status(201).json({
      message: 'Invite link created successfully',
      inviteLink: {
        id: inviteLink.id,
        token: inviteLink.token,
        url: inviteUrl,
        restaurant: inviteLink.restaurant,
        position: inviteLink.position,
        department: inviteLink.department,
        expiresAt: inviteLink.expiresAt,
        maxUses: inviteLink.maxUses,
        usedCount: inviteLink.usedCount,
        isActive: inviteLink.isActive,
        createdAt: inviteLink.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Получение списка пригласительных ссылок
export const getInviteLinks = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { restaurantId } = req.query;

    const where: any = {};
    
    // Фильтрация по ресторану
    if (restaurantId) {
      where.restaurantId = restaurantId as string;
      
      // Проверка доступа
      if (req.user.role !== 'OWNER' && req.user.role !== 'ADMIN') {
        const restaurant = await prisma.restaurant.findUnique({
          where: { id: restaurantId as string },
          select: { managerId: true },
        });

        if (restaurant?.managerId !== req.user.id) {
          res.status(403).json({ error: 'Forbidden' });
          return;
        }
      }
    } else {
      // Если ресторан не указан, показываем только свои рестораны (для менеджеров)
      if (req.user.role !== 'OWNER' && req.user.role !== 'ADMIN') {
        const restaurants = await prisma.restaurant.findMany({
          where: { managerId: req.user.id },
          select: { id: true },
        });
        where.restaurantId = { in: restaurants.map((r) => r.id) };
      }
    }

    const inviteLinks = await (prisma as any).inviteLink.findMany({
      where,
      include: {
        restaurant: {
          select: {
            id: true,
            name: true,
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
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    const botUsername = process.env.TELEGRAM_BOT_USERNAME || 'myResto_robot';

    const linksWithUrl = inviteLinks.map((link: any) => ({
      ...link,
      url: `https://t.me/${botUsername}?start=${link.token}`,
    }));

    res.json({ inviteLinks: linksWithUrl });
  } catch (error) {
    next(error);
  }
};

// Получение информации о пригласительной ссылке по токену (для бота)
export const getInviteLinkByToken = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const token = ((req as any).params?.token) || ((req as any).query?.token);
    
    if (!token) {
      res.status(400).json({ error: 'Token is required' });
      return;
    }

    const inviteLink = await (prisma as any).inviteLink.findUnique({
      where: { token },
      include: {
        restaurant: {
          select: {
            id: true,
            name: true,
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

    if (!inviteLink) {
      res.status(404).json({ error: 'Invite link not found' });
      return;
    }

    // Проверяем активность и срок действия
    if (!inviteLink.isActive) {
      res.status(400).json({ error: 'Invite link is inactive' });
      return;
    }

    if (inviteLink.expiresAt && new Date(inviteLink.expiresAt) < new Date()) {
      res.status(400).json({ error: 'Invite link has expired' });
      return;
    }

    if (inviteLink.usedCount >= inviteLink.maxUses) {
      res.status(400).json({ error: 'Invite link has reached maximum uses' });
      return;
    }

    res.json({ inviteLink });
  } catch (error) {
    next(error);
  }
};

// Деактивация пригласительной ссылки
export const deactivateInviteLink = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { id } = req.params;

    const inviteLink = await (prisma as any).inviteLink.findUnique({
      where: { id },
      include: {
        restaurant: {
          select: { managerId: true },
        },
      },
    });

    if (!inviteLink) {
      res.status(404).json({ error: 'Invite link not found' });
      return;
    }

    // Проверка доступа
    if (req.user.role !== 'OWNER' && req.user.role !== 'ADMIN') {
      if (inviteLink.restaurant.managerId !== req.user.id) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
    }

    await (prisma as any).inviteLink.update({
      where: { id },
      data: { isActive: false },
    });

    await logAction({
      userId: req.user.id,
      type: 'UPDATE',
      entityType: 'InviteLink',
      entityId: id,
      description: 'Deactivated invite link',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({ message: 'Invite link deactivated successfully' });
  } catch (error) {
    next(error);
  }
};

// Использование пригласительной ссылки (вызывается ботом)
export const useInviteLink = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const body = req.body as any;
    const token = body?.token;

    if (!token) {
      res.status(400).json({ error: 'Token is required' });
      return;
    }

    const inviteLink = await (prisma as any).inviteLink.findUnique({
      where: { token },
    });

    if (!inviteLink) {
      res.status(404).json({ error: 'Invite link not found' });
      return;
    }

    if (!inviteLink.isActive) {
      res.status(400).json({ error: 'Invite link is inactive' });
      return;
    }

    if (inviteLink.expiresAt && new Date(inviteLink.expiresAt) < new Date()) {
      res.status(400).json({ error: 'Invite link has expired' });
      return;
    }

    if (inviteLink.usedCount >= inviteLink.maxUses) {
      res.status(400).json({ error: 'Invite link has reached maximum uses' });
      return;
    }

    // Увеличиваем счетчик использований
    await (prisma as any).inviteLink.update({
      where: { id: inviteLink.id },
      data: {
        usedCount: {
          increment: 1,
        },
      },
    });

    res.json({
      message: 'Invite link used successfully',
      inviteLink: {
        id: inviteLink.id,
      restaurantId: inviteLink.restaurantId,
      positionId: inviteLink.positionId,
      departmentId: inviteLink.departmentId,
    },
  });
  } catch (error) {
    next(error);
  }
};

// Создание ссылки для привязки Telegram аккаунта
export const createTelegramBindLink = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // Проверяем, не привязан ли уже Telegram
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { telegramId: true } as any,
    });

    if ((user as any)?.telegramId) {
      res.status(400).json({ error: 'Telegram account already linked' });
      return;
    }

    // Генерируем уникальный токен
    let token = generateToken();
    while (await (prisma as any).inviteLink.findUnique({ where: { token } })) {
      token = generateToken();
    }

    // Создаем ссылку для привязки (без restaurantId)
    const inviteLink = await (prisma as any).inviteLink.create({
      data: {
        token,
        restaurantId: null, // Ссылка для привязки не требует ресторана
        positionId: null,
        departmentId: null,
        createdById: req.user.id,
        expiresAt: null, // Бессрочная ссылка
        maxUses: 1,
        isActive: true,
      },
    });

    await logAction({
      userId: req.user.id,
      type: 'CREATE',
      entityType: 'TelegramBindLink',
      entityId: inviteLink.id,
      description: 'Created Telegram binding link',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    // Формируем ссылку для Telegram бота
    const botUsername = process.env.TELEGRAM_BOT_USERNAME || 'myResto_robot';
    const inviteUrl = `https://t.me/${botUsername}?start=${token}`;

    res.status(201).json({
      message: 'Telegram binding link created successfully',
      link: inviteUrl,
      token: inviteLink.token,
      expiresAt: inviteLink.expiresAt,
    });
  } catch (error) {
    next(error);
  }
};

