import { Response, NextFunction } from 'express';
import dbClient from '../utils/db';
import { AuthRequest } from '../middleware/auth';

// Получение статистики для главной страницы
export const getDashboardStats = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let restaurantIds: string[] = [];

    // Определяем рестораны для пользователя
    if (req.user.role === 'OWNER' || req.user.role === 'ADMIN') {
      const restaurants = await dbClient.restaurant.findMany({
        where: { isActive: true },
        select: { id: true },
      });
      restaurantIds = restaurants.map((r) => r.id);
    } else if (req.user.role === 'MANAGER') {
      const restaurants = await dbClient.restaurant.findMany({
        where: {
          managerId: req.user.id,
          isActive: true,
        },
        select: { id: true },
      });
      restaurantIds = restaurants.map((r) => r.id);
    } else {
      const restaurantUsers = await dbClient.restaurantUser.findMany({
        where: {
          userId: req.user.id,
          isActive: true,
        },
        select: { restaurantId: true },
      });
      restaurantIds = restaurantUsers.map((ru) => ru.restaurantId);
    }

    // Всего сотрудников
    const totalEmployees = await dbClient.restaurantUser.count({
      where: {
        restaurantId: { in: restaurantIds },
        // isActive: true,
      },
    });

    // Задач в работе
    const tasksInProgress = await dbClient.task.count({
      where: {
        restaurantId: { in: restaurantIds },
        status: {
          in: ['NEW', 'IN_PROGRESS'],
        },
      },
    });

    // Производительность (процент выполненных задач за месяц)
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59);

    const totalTasksThisMonth = await dbClient.task.count({
      where: {
        restaurantId: { in: restaurantIds },
        createdAt: {
          gte: monthStart,
          lte: monthEnd,
        },
      },
    });

    const completedTasksThisMonth = await dbClient.task.count({
      where: {
        restaurantId: { in: restaurantIds },
        status: 'DONE',
        completedAt: {
          gte: monthStart,
          lte: monthEnd,
        },
      },
    });

    const productivity = totalTasksThisMonth > 0
      ? Math.round((completedTasksThisMonth / totalTasksThisMonth) * 100)
      : 0;

    res.json({
      totalEmployees,
      tasksInProgress,
      productivity,
    });
  } catch (error) {
    next(error);
  }
};

