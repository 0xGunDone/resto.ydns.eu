import { Response, NextFunction } from 'express';
import prisma from '../utils/prisma';
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
    const totalShifts = await prisma.shift.count({ where });
    const completedShifts = await prisma.shift.count({ where: { ...where, isCompleted: true } });
    const confirmedShifts = await prisma.shift.count({ where: { ...where, isConfirmed: true } });

    // Статистика по задачам
    const taskWhere: any = { restaurantId: restaurantId as string };
    const totalTasks = await prisma.task.count({ where: taskWhere });
    const doneTasks = await prisma.task.count({ where: { ...taskWhere, status: 'DONE' } });
    const inProgressTasks = await prisma.task.count({ where: { ...taskWhere, status: 'IN_PROGRESS' } });

    // Статистика по сотрудникам
    const totalEmployees = await prisma.restaurantUser.count({
      where: { restaurantId: restaurantId as string, isActive: true },
    });

    // Статистика по обратной связи
    const feedbackWhere: any = { restaurantId: restaurantId as string };
    const totalFeedback = await prisma.feedback.count({ where: feedbackWhere });
    const pendingFeedback = await prisma.feedback.count({ where: { ...feedbackWhere, status: 'PENDING' } });

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

    const employeeStats = await prisma.shift.groupBy({
      by: ['userId'],
      where: {
        restaurantId: restaurantId as string,
        userId: userId ? (userId as string) : undefined,
        startTime: month && year
          ? {
              gte: new Date(parseInt(year as string), parseInt(month as string) - 1, 1),
              lt: new Date(parseInt(year as string), parseInt(month as string), 1),
            }
          : undefined,
        isConfirmed: true,
      },
      _sum: {
        hours: true,
      },
      _count: {
        id: true,
      },
    });

    const statsWithUsers = await Promise.all(
      employeeStats.map(async (stat) => {
        const user = await prisma.user.findUnique({
          where: { id: stat.userId },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        });
        return {
          user,
          totalHours: stat._sum.hours || 0,
          shiftCount: stat._count.id,
        };
      })
    );

    res.json({ stats: statsWithUsers });
  } catch (error) {
    next(error);
  }
};

