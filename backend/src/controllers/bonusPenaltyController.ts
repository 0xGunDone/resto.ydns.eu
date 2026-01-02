import { Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import dbClient from '../utils/db';
import { logAction } from '../utils/actionLog';
import { AuthRequest } from '../middleware/auth';
import { checkPermission } from '../utils/checkPermissions';
import { PERMISSIONS } from '../utils/permissions';

// Получение списка премий
export const getBonuses = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { restaurantId, userId, timesheetId, month, year, startDate, endDate } = req.query;

    const where: any = {};

    if (restaurantId) {
      where.restaurantId = restaurantId as string;
    }

    if (userId) {
      where.userId = userId as string;
    }

    if (timesheetId) {
      where.timesheetId = timesheetId as string;
    }

    if (month && year) {
      where.month = parseInt(month as string);
      where.year = parseInt(year as string);
    }

    // Фильтр по дате создания
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = new Date(startDate as string);
      }
      if (endDate) {
        const end = new Date(endDate as string);
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }

    // Проверка прав доступа
    if (req.user.role !== 'OWNER' && req.user.role !== 'ADMIN') {
      if (restaurantId) {
        const hasViewAll = await checkPermission(req.user.id, restaurantId as string, PERMISSIONS.VIEW_ALL_TIMESHEETS);
      const hasViewOwn = await checkPermission(req.user.id, restaurantId as string, PERMISSIONS.VIEW_OWN_TIMESHEETS);
        
        if (!hasViewAll && !hasViewOwn) {
          res.status(403).json({ error: 'Forbidden' });
          return;
        }
        
        // Если есть только VIEW_OWN, показываем только свои премии
        if (!hasViewAll && hasViewOwn && !userId) {
          where.userId = req.user.id;
        }
      } else if (!userId) {
        // Если ресторан не указан, показываем только свои
        where.userId = req.user.id;
      }
    }

    const bonuses = await dbClient.bonus.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        restaurant: {
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

    res.json({ bonuses });
  } catch (error) {
    next(error);
  }
};

// Создание премии
export const createBonus = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
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

    const { restaurantId, userId, timesheetId, amount, comment, month, year } = req.body;

    // Проверяем права доступа
    const isOwnerOrAdmin = ['OWNER', 'ADMIN'].includes(req.user.role);
    let hasPermission = isOwnerOrAdmin;
    
    if (!hasPermission) {
      // Проверяем право на редактирование табелей
      hasPermission = await checkPermission(req.user.id, restaurantId, PERMISSIONS.EDIT_TIMESHEETS);
    }

    if (!hasPermission) {
      res.status(403).json({ error: 'Недостаточно прав для начисления премий' });
      return;
    }

    const bonus = await dbClient.bonus.create({
      data: {
        restaurantId,
        userId,
        timesheetId: timesheetId || null,
        amount: parseFloat(amount),
        comment: comment || null,
        month: month ? parseInt(month) : null,
        year: year ? parseInt(year) : null,
        createdById: req.user.id,
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
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
    });

    await logAction({
      userId: req.user.id,
      type: 'CREATE',
      entityType: 'Bonus',
      entityId: bonus.id,
      description: `Начислена премия ${amount} руб. сотруднику ${bonus.user ? `${bonus.user.firstName} ${bonus.user.lastName}` : 'неизвестному сотруднику'}`,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.status(201).json({ bonus });
  } catch (error) {
    next(error);
  }
};

// Обновление премии
export const updateBonus = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
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

    const { id } = req.params;
    const { amount, comment } = req.body;

    // Получаем премию
    const bonus = await dbClient.bonus.findUnique({
      where: { id },
      include: {
        restaurant: {
          select: {
            id: true,
          },
        },
      },
    });

    if (!bonus) {
      res.status(404).json({ error: 'Премия не найдена' });
      return;
    }

    // Проверяем права доступа
    const isOwnerOrAdmin = ['OWNER', 'ADMIN'].includes(req.user.role);
    let hasPermission = isOwnerOrAdmin;
    
    if (!hasPermission) {
      hasPermission = await checkPermission(req.user.id, bonus.restaurantId, PERMISSIONS.EDIT_TIMESHEETS);
    }

    if (!hasPermission) {
      res.status(403).json({ error: 'Недостаточно прав для редактирования премий' });
      return;
    }

    const updateData: any = {};
    if (amount !== undefined) updateData.amount = parseFloat(amount);
    if (comment !== undefined) updateData.comment = comment;

    const updatedBonus = await dbClient.bonus.update({
      where: { id },
      data: updateData,
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
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
    });

    await logAction({
      userId: req.user.id,
      type: 'UPDATE',
      entityType: 'Bonus',
      entityId: id,
      description: `Обновлена премия ${updatedBonus.amount} руб.`,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({ bonus: updatedBonus });
  } catch (error) {
    next(error);
  }
};

// Удаление премии
export const deleteBonus = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { id } = req.params;

    // Получаем премию
    const bonus = await dbClient.bonus.findUnique({
      where: { id },
      include: {
        restaurant: {
          select: {
            id: true,
          },
        },
        user: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (!bonus) {
      res.status(404).json({ error: 'Премия не найдена' });
      return;
    }

    // Проверяем права доступа
    const isOwnerOrAdmin = ['OWNER', 'ADMIN'].includes(req.user.role);
    let hasPermission = isOwnerOrAdmin;
    
    if (!hasPermission) {
      hasPermission = await checkPermission(req.user.id, bonus.restaurantId, PERMISSIONS.EDIT_TIMESHEETS);
    }

    if (!hasPermission) {
      res.status(403).json({ error: 'Недостаточно прав для удаления премий' });
      return;
    }

    await dbClient.bonus.delete({
      where: { id },
    });

    await logAction({
      userId: req.user.id,
      type: 'DELETE',
      entityType: 'Bonus',
      entityId: id,
      description: `Удалена премия ${bonus.amount} руб. сотруднику ${bonus.user ? `${bonus.user.firstName} ${bonus.user.lastName}` : 'неизвестному сотруднику'}`,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({ message: 'Премия удалена успешно' });
  } catch (error) {
    next(error);
  }
};

// Получение списка штрафов
export const getPenalties = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { restaurantId, userId, timesheetId, month, year, startDate, endDate } = req.query;

    const where: any = {};

    if (restaurantId) {
      where.restaurantId = restaurantId as string;
    }

    if (userId) {
      where.userId = userId as string;
    }

    if (timesheetId) {
      where.timesheetId = timesheetId as string;
    }

    if (month && year) {
      where.month = parseInt(month as string);
      where.year = parseInt(year as string);
    }

    // Фильтр по дате создания
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = new Date(startDate as string);
      }
      if (endDate) {
        const end = new Date(endDate as string);
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }

    // Проверка прав доступа
    if (req.user.role !== 'OWNER' && req.user.role !== 'ADMIN') {
      if (restaurantId) {
        const hasViewAll = await checkPermission(req.user.id, restaurantId as string, PERMISSIONS.VIEW_ALL_TIMESHEETS);
      const hasViewOwn = await checkPermission(req.user.id, restaurantId as string, PERMISSIONS.VIEW_OWN_TIMESHEETS);
        
        if (!hasViewAll && !hasViewOwn) {
          res.status(403).json({ error: 'Forbidden' });
          return;
        }
        
        // Если есть только VIEW_OWN, показываем только свои штрафы
        if (!hasViewAll && hasViewOwn && !userId) {
          where.userId = req.user.id;
        }
      } else if (!userId) {
        // Если ресторан не указан, показываем только свои
        where.userId = req.user.id;
      }
    }

    const penalties = await dbClient.penalty.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        restaurant: {
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

    res.json({ penalties });
  } catch (error) {
    next(error);
  }
};

// Создание штрафа
export const createPenalty = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
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

    const { restaurantId, userId, timesheetId, amount, comment, month, year } = req.body;

    // Проверяем права доступа
    const isOwnerOrAdmin = ['OWNER', 'ADMIN'].includes(req.user.role);
    let hasPermission = isOwnerOrAdmin;
    
    if (!hasPermission) {
      hasPermission = await checkPermission(req.user.id, restaurantId, PERMISSIONS.EDIT_TIMESHEETS);
    }

    if (!hasPermission) {
      res.status(403).json({ error: 'Недостаточно прав для назначения штрафов' });
      return;
    }

    const penalty = await dbClient.penalty.create({
      data: {
        restaurantId,
        userId,
        timesheetId: timesheetId || null,
        amount: parseFloat(amount),
        comment: comment || null,
        month: month ? parseInt(month) : null,
        year: year ? parseInt(year) : null,
        createdById: req.user.id,
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
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
    });

    await logAction({
      userId: req.user.id,
      type: 'CREATE',
      entityType: 'Penalty',
      entityId: penalty.id,
      description: `Назначен штраф ${amount} руб. сотруднику ${penalty.user ? `${penalty.user.firstName} ${penalty.user.lastName}` : 'неизвестному сотруднику'}`,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.status(201).json({ penalty });
  } catch (error) {
    next(error);
  }
};

// Обновление штрафа
export const updatePenalty = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
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

    const { id } = req.params;
    const { amount, comment } = req.body;

    // Получаем штраф
    const penalty = await dbClient.penalty.findUnique({
      where: { id },
      include: {
        restaurant: {
          select: {
            id: true,
          },
        },
      },
    });

    if (!penalty) {
      res.status(404).json({ error: 'Штраф не найден' });
      return;
    }

    // Проверяем права доступа
    const isOwnerOrAdmin = ['OWNER', 'ADMIN'].includes(req.user.role);
    let hasPermission = isOwnerOrAdmin;
    
    if (!hasPermission) {
      hasPermission = await checkPermission(req.user.id, penalty.restaurantId, PERMISSIONS.EDIT_TIMESHEETS);
    }

    if (!hasPermission) {
      res.status(403).json({ error: 'Недостаточно прав для редактирования штрафов' });
      return;
    }

    const updateData: any = {};
    if (amount !== undefined) updateData.amount = parseFloat(amount);
    if (comment !== undefined) updateData.comment = comment;

    const updatedPenalty = await dbClient.penalty.update({
      where: { id },
      data: updateData,
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
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
    });

    await logAction({
      userId: req.user.id,
      type: 'UPDATE',
      entityType: 'Penalty',
      entityId: id,
      description: `Обновлен штраф ${updatedPenalty.amount} руб.`,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({ penalty: updatedPenalty });
  } catch (error) {
    next(error);
  }
};

// Удаление штрафа
export const deletePenalty = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { id } = req.params;

    // Получаем штраф
    const penalty = await dbClient.penalty.findUnique({
      where: { id },
      include: {
        restaurant: {
          select: {
            id: true,
          },
        },
        user: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (!penalty) {
      res.status(404).json({ error: 'Штраф не найден' });
      return;
    }

    // Проверяем права доступа
    const isOwnerOrAdmin = ['OWNER', 'ADMIN'].includes(req.user.role);
    let hasPermission = isOwnerOrAdmin;
    
    if (!hasPermission) {
      hasPermission = await checkPermission(req.user.id, penalty.restaurantId, PERMISSIONS.EDIT_TIMESHEETS);
    }

    if (!hasPermission) {
      res.status(403).json({ error: 'Недостаточно прав для удаления штрафов' });
      return;
    }

    await dbClient.penalty.delete({
      where: { id },
    });

    await logAction({
      userId: req.user.id,
      type: 'DELETE',
      entityType: 'Penalty',
      entityId: id,
      description: `Удален штраф ${penalty.amount} руб. сотруднику ${penalty.user ? `${penalty.user.firstName} ${penalty.user.lastName}` : 'неизвестному сотруднику'}`,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({ message: 'Штраф удален успешно' });
  } catch (error) {
    next(error);
  }
};

