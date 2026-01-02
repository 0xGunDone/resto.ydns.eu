import { Response, NextFunction } from 'express';
import dbClient from '../utils/db';
import { AuthRequest } from '../middleware/auth';
import { logger } from '../services/loggerService';

// Получение всех уведомлений пользователя
export const getNotifications = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { limit = 50, unreadOnly } = req.query;

    const where: any = {
      userId: req.user.id,
    };

    if (unreadOnly === 'true') {
      where.isRead = false;
    }

    let notifications;
    try {
      notifications = await dbClient.notification.findMany({
        where,
        orderBy: {
          createdAt: 'desc',
        },
        take: parseInt(limit as string),
      });
    } catch (error: any) {
      logger.error('Error in notification.findMany', { 
        error: error?.message, 
        where: JSON.stringify(where), 
        code: error?.code 
      });
      throw error;
    }

    // Подсчитываем непрочитанные
    let unreadCount = 0;
    try {
      unreadCount = await dbClient.notification.count({
        where: {
          userId: req.user.id,
          isRead: false,
        },
      });
    } catch (error: any) {
      logger.error('Error in notification.count', { error: error?.message });
      // Не прерываем выполнение, просто используем 0
    }

    res.json({
      notifications: notifications || [],
      unreadCount: unreadCount || 0,
    });
  } catch (error: any) {
    logger.error('Error in getNotifications', { 
      error: error?.message, 
      code: error?.code, 
      meta: error?.meta 
    });
    res.status(500).json({ 
      error: 'Ошибка загрузки уведомлений',
      details: process.env.NODE_ENV === 'development' ? error?.message : undefined
    });
  }
};

// Отметка уведомления как прочитанного
export const markAsRead = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { id } = req.params;

    const notification = await dbClient.notification.findUnique({
      where: { id },
    });

    if (!notification) {
      res.status(404).json({ error: 'Notification not found' });
      return;
    }

    if (notification.userId !== req.user.id) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    await dbClient.notification.update({
      where: { id },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    res.json({ message: 'Notification marked as read' });
  } catch (error) {
    next(error);
  }
};

// Отметка всех уведомлений как прочитанных
export const markAllAsRead = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // updateMany не реализован, используем цикл
    const notifications = await dbClient.notification.findMany({
      where: {
        userId: req.user.id,
        isRead: false,
      },
    });
    
    for (const notification of notifications) {
      await dbClient.notification.update({
        where: { id: notification.id },
        data: {
          isRead: true,
          readAt: new Date(),
        },
      });
    }

    res.json({ message: 'All notifications marked as read' });
  } catch (error) {
    next(error);
  }
};

// Удаление уведомления
export const deleteNotification = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { id } = req.params;

    const notification = await dbClient.notification.findUnique({
      where: { id },
    });

    if (!notification) {
      res.status(404).json({ error: 'Notification not found' });
      return;
    }

    if (notification.userId !== req.user.id) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    await dbClient.notification.delete({
      where: { id },
    });

    res.json({ message: 'Notification deleted' });
  } catch (error) {
    next(error);
  }
};

// Получение количества непрочитанных уведомлений
export const getUnreadCount = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const count = await dbClient.notification.count({
      where: {
        userId: req.user.id,
        isRead: false,
      },
    });

    res.json({ unreadCount: count });
  } catch (error) {
    next(error);
  }
};

