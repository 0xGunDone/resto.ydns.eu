import { Response, NextFunction } from 'express';
import dbClient from '../utils/db';
import { AuthRequest } from '../middleware/auth';

// Регистрация push-подписки
export const subscribe = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { endpoint, keys } = req.body;

    if (!endpoint || !keys || !keys.p256dh || !keys.auth) {
      res.status(400).json({ error: 'Invalid subscription data' });
      return;
    }

    // Проверяем, существует ли уже такая подписка
    const existing = await dbClient.pushSubscription.findUnique({
      where: { endpoint },
    });

    if (existing) {
      // Обновляем существующую подписку
      await dbClient.pushSubscription.update({
        where: { endpoint },
        data: {
          userId: req.user.id,
          p256dh: keys.p256dh,
          auth: keys.auth,
          userAgent: req.get('user-agent') || null,
          isActive: true,
        },
      });
    } else {
      // Создаем новую подписку
      await dbClient.pushSubscription.create({
        data: {
          userId: req.user.id,
          endpoint,
          p256dh: keys.p256dh,
          auth: keys.auth,
          userAgent: req.get('user-agent') || null,
          isActive: true,
        },
      });
    }

    res.json({ message: 'Subscription saved successfully' });
  } catch (error) {
    next(error);
  }
};

// Отмена push-подписки
export const unsubscribe = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { endpoint } = req.body;

    if (!endpoint) {
      res.status(400).json({ error: 'Endpoint is required' });
      return;
    }

    // Проверяем, что подписка принадлежит текущему пользователю
    const subscription = await dbClient.pushSubscription.findUnique({
      where: { endpoint },
    });

    if (!subscription) {
      res.status(404).json({ error: 'Subscription not found' });
      return;
    }

    if (subscription.userId !== req.user.id) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    // Деактивируем подписку
    await dbClient.pushSubscription.update({
      where: { endpoint },
      data: { isActive: false },
    });

    res.json({ message: 'Subscription removed successfully' });
  } catch (error) {
    next(error);
  }
};

// Получение всех подписок пользователя
export const getSubscriptions = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const subscriptions = await dbClient.pushSubscription.findMany({
      where: {
        userId: req.user.id,
        isActive: true,
      },
      select: {
        id: true,
        endpoint: true,
        userAgent: true,
        createdAt: true,
      },
    });

    res.json({ subscriptions });
  } catch (error) {
    next(error);
  }
};

