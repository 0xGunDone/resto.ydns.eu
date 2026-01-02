import { Response, NextFunction } from 'express';
import dbClient from '../utils/db';
import { AuthRequest } from '../middleware/auth';

// Получение KPI и статистики
export const getKPIs = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!['OWNER', 'ADMIN', 'MANAGER'].includes(req.user.role)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const { restaurantId, startDate, endDate } = req.query;

    const where: any = { restaurantId: restaurantId as string };
    if (startDate) where.startTime = { gte: new Date(startDate as string) };
    if (endDate) where.endTime = { lte: new Date(endDate as string) };

    // Статистика по сменам
    const totalShifts = await dbClient.shift.count({ where });
    const completedShifts = await dbClient.shift.count({ where: { ...where, isCompleted: true } });
    const confirmedShifts = await dbClient.shift.count({ where: { ...where, isConfirmed: true } });

    // Статистика по задачам
    const taskWhere: any = { restaurantId: restaurantId as string };
    const totalTasks = await dbClient.task.count({ where: taskWhere });
    const doneTasks = await dbClient.task.count({ where: { ...taskWhere, status: 'DONE' } });
    const inProgressTasks = await dbClient.task.count({ where: { ...taskWhere, status: 'IN_PROGRESS' } });

    // Статистика по сотрудникам
    const totalEmployees = await dbClient.restaurantUser.count({
      where: { restaurantId: restaurantId as string, isActive: true },
    });

    // Статистика по обратной связи
    const feedbackWhere: any = { restaurantId: restaurantId as string };
    const totalFeedback = await dbClient.feedback.count({ where: feedbackWhere });
    const pendingFeedback = await dbClient.feedback.count({ where: { ...feedbackWhere, status: 'PENDING' } });

    res.json({
      shifts: {
        total: totalShifts,
        completed: completedShifts,
        confirmed: confirmedShifts,
        completionRate: totalShifts > 0 ? (completedShifts / totalShifts) * 100 : 0,
      },
      tasks: {
        total: totalTasks,
        done: doneTasks,
        inProgress: inProgressTasks,
        completionRate: totalTasks > 0 ? (doneTasks / totalTasks) * 100 : 0,
      },
      employees: {
        total: totalEmployees,
      },
      feedback: {
        total: totalFeedback,
        pending: pendingFeedback,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Статистика по сотрудникам
export const getEmployeeStats = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { restaurantId, userId, month, year } = req.query;

    const where: any = {
      restaurantId: restaurantId as string,
      userId: userId ? (userId as string) : undefined,
      startTime:
        month && year
          ? {
              gte: new Date(parseInt(year as string), parseInt(month as string) - 1, 1),
              lt: new Date(parseInt(year as string), parseInt(month as string), 1),
            }
          : undefined,
      isConfirmed: true,
    };

    const shifts = await dbClient.shift.findMany({ where });

    const statsByUserId = new Map<string, { totalHours: number; shiftCount: number }>();
    for (const shift of shifts) {
      if (!shift.userId) continue;
      const current = statsByUserId.get(shift.userId) || { totalHours: 0, shiftCount: 0 };
      current.totalHours += Number(shift.hours) || 0;
      current.shiftCount += 1;
      statsByUserId.set(shift.userId, current);
    }

    const statsWithUsers = await Promise.all(
      Array.from(statsByUserId.entries()).map(async ([uid, stat]) => {
        const user = await dbClient.user.findUnique({
          where: { id: uid },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        });

        return {
          user,
          totalHours: stat.totalHours,
          shiftCount: stat.shiftCount,
        };
      })
    );

    res.json({ stats: statsWithUsers });
  } catch (error) {
    next(error);
  }
};

