import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import dbClient from '../utils/db';
import { logAction } from '../utils/actionLog';
import { AuthRequest } from '../middleware/auth';
import { logger } from '../services/loggerService';

// Получение времени смены на основе даты и шаблона (ID или название)
const getShiftTimes = async (date: Date, templateId: string, restaurantId?: string) => {
  // Сначала пытаемся найти шаблон по ID
  let template = await dbClient.shiftTemplate.findUnique({
    where: { id: templateId },
  });

  // Если не найден по ID, ищем по названию
  if (!template) {
    template = await dbClient.shiftTemplate.findFirst({
      where: {
        name: templateId,
        isActive: true,
        OR: [
          { restaurantId: restaurantId || null },
          { restaurantId: null }, // Общие шаблоны
        ],
      },
    });
  }

  // Fallback на старые типы для обратной совместимости
  if (!template) {
    const fallback: Record<string, { startHour: number; endHour: number }> = {
      FULL: { startHour: 9, endHour: 18 },
      MORNING: { startHour: 9, endHour: 15 },
      EVENING: { startHour: 15, endHour: 23 },
      PARTIAL: { startHour: 10, endHour: 14 },
    };
    const fallbackTemplate = fallback[templateId];
    if (!fallbackTemplate) {
      throw new Error(`Unknown shift type: ${templateId}`);
    }
    template = {
      startHour: fallbackTemplate.startHour,
      endHour: fallbackTemplate.endHour,
    } as any;
  }

  if (!template) {
    throw new Error(`Shift template not found: ${templateId}`);
  }

  const start = new Date(date);
  start.setHours(template.startHour, 0, 0, 0);

  const end = new Date(date);
  // Если смена заканчивается после полуночи (например, ночная)
  if (template.endHour < template.startHour) {
    end.setDate(end.getDate() + 1);
  }
  end.setHours(template.endHour, 0, 0, 0);

  const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);

  return { start, end, hours };
};

// Массовое создание смен (для мультивыбора)
export const createShiftsBatch = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn('Validation errors in createShiftsBatch', { errors: errors.array(), body: req.body });
      res.status(400).json({ errors: errors.array() });
      return;
    }

    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { restaurantId, shifts } = req.body; // shifts: [{ userId, type, date, notes? }]

    // Проверяем права через permissions
    const { checkPermission } = await import('../utils/checkPermissions');
    const { PERMISSIONS } = await import('../utils/permissions');
    
    // OWNER и ADMIN имеют все права
    const isOwnerOrAdmin = req.user.role === 'OWNER' || req.user.role === 'ADMIN';
    const hasEditSchedule = isOwnerOrAdmin || await checkPermission(req.user.id, restaurantId, PERMISSIONS.EDIT_SCHEDULE);
    
    if (!hasEditSchedule) {
      res.status(403).json({ error: 'Недостаточно прав для создания смен' });
      return;
    }

    if (!Array.isArray(shifts) || shifts.length === 0) {
      res.status(400).json({ error: 'Shifts array is required' });
      return;
    }

    const createdShifts = [];
    const skippedShifts = [];

    for (const shiftData of shifts) {
      const { userId, type, date, notes } = shiftData;
      // Парсим дату (может быть в формате YYYY-MM-DD или ISO)
      let shiftDate: Date;
      if (typeof date === 'string' && date.match(/^\d{4}-\d{2}-\d{2}$/)) {
        // Формат YYYY-MM-DD
        shiftDate = new Date(date + 'T00:00:00');
      } else {
        shiftDate = new Date(date);
      }
      shiftDate.setHours(0, 0, 0, 0);

      const { start, end, hours } = await getShiftTimes(shiftDate, type, restaurantId);

      // Проверяем, нет ли уже смены на это время
      const dayStart = new Date(shiftDate);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(shiftDate);
      dayEnd.setHours(23, 59, 59, 999);

      const existingShift = await dbClient.shift.findFirst({
        where: {
          restaurantId,
          userId,
          startTime: {
            gte: dayStart,
            lte: dayEnd,
          },
        },
      });

      if (existingShift) {
        skippedShifts.push({ userId, date });
        continue;
      }

      try {
        const shift = await dbClient.shift.create({
          data: {
            restaurantId,
            userId,
            type,
            startTime: start,
            endTime: end,
            hours,
            notes: notes || null,
          },
          include: {
            user: true,
          },
        });

        // Логируем создание в историю изменений
        const shiftDateForHistory = new Date(start);
        shiftDateForHistory.setHours(0, 0, 0, 0);

        await dbClient.shiftSwapHistory.create({
          data: {
            shiftId: shift.id,
            restaurantId,
            fromUserId: userId,
            toUserId: userId,
            status: 'CREATED',
            shiftDate: shiftDateForHistory,
            shiftStartTime: start,
            shiftEndTime: end,
            shiftType: type,
            approvedById: req.user.id,
            approvedAt: new Date(),
            notes: 'Смена создана (массовое создание)',
            changeType: 'BATCH_CREATE',
          } as any,
        });

        createdShifts.push(shift);
      } catch (error: any) {
        // Пропускаем дубликаты и другие ошибки
        if (error.code === 'P2002') {
          skippedShifts.push({ userId, date });
        } else {
          throw error;
        }
      }
    }

    await logAction({
      userId: req.user.id,
      type: 'CREATE',
      entityType: 'Shift',
      description: `Created ${createdShifts.length} shifts in batch`,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.status(201).json({
      shifts: createdShifts,
      count: createdShifts.length,
      skipped: skippedShifts.length,
      message: `Created ${createdShifts.length} shifts${skippedShifts.length > 0 ? `, skipped ${skippedShifts.length} duplicates` : ''}`,
    });
  } catch (error) {
    next(error);
  }
};

// Создание смены (менеджер назначает: дату, тип смены, сотрудника)
export const createShift = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn('Validation errors in createShift', { errors: errors.array(), body: req.body });
      res.status(400).json({ errors: errors.array() });
      return;
    }

    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { restaurantId, userId, type, date, notes } = req.body;

    // Проверяем права через permissions
    const { checkPermission } = await import('../utils/checkPermissions');
    const { PERMISSIONS } = await import('../utils/permissions');
    
    // OWNER и ADMIN имеют все права
    const isOwnerOrAdmin = req.user.role === 'OWNER' || req.user.role === 'ADMIN';
    const hasEditSchedule = isOwnerOrAdmin || await checkPermission(req.user.id, restaurantId, PERMISSIONS.EDIT_SCHEDULE);
    
    if (!hasEditSchedule) {
      res.status(403).json({ error: 'Недостаточно прав для создания смены' });
      return;
    }

    // Дата смены (только день, время будет вычислено из типа)
    const shiftDateForTemplate = new Date(date);
    shiftDateForTemplate.setHours(0, 0, 0, 0);

    // Получаем время из шаблона
      const { start, end, hours } = await getShiftTimes(shiftDateForTemplate, type, restaurantId);

    const shift = await dbClient.shift.create({
      data: {
        restaurantId,
        userId,
        type,
        startTime: start,
        endTime: end,
        hours,
        notes: notes || null,
      },
      include: {
        user: true,
        restaurant: true,
      },
    });

    // Логируем создание в историю изменений
    const shiftDateForHistory = new Date(start);
    shiftDateForHistory.setHours(0, 0, 0, 0);

    await dbClient.shiftSwapHistory.create({
      data: {
        shiftId: shift.id,
        restaurantId,
        fromUserId: userId,
        toUserId: userId,
        status: 'CREATED',
        shiftDate: shiftDateForHistory,
        shiftStartTime: start,
        shiftEndTime: end,
        shiftType: type,
        approvedById: req.user.id,
        approvedAt: new Date(),
        notes: 'Смена создана',
        changeType: 'CREATE',
      } as any,
    });

    await logAction({
      userId: req.user.id,
      type: 'CREATE',
      entityType: 'Shift',
      entityId: shift.id,
      description: `Created shift for ${shift.user.firstName} ${shift.user.lastName}`,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    // Создаем уведомление сотруднику о новой смене
    if (userId !== req.user.id) {
      const { notifyShiftCreated } = await import('../utils/notifications');
      await notifyShiftCreated(
        userId,
        shift.id,
        new Date(start),
        shift.restaurant.name
      );
    }

    res.status(201).json({ shift });
  } catch (error) {
    next(error);
  }
};

// Получение смен
export const getShifts = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { restaurantId, userId, startDate, endDate, type } = req.query;

    const where: any = {};

    if (restaurantId) {
      where.restaurantId = restaurantId as string;
    }

    if (userId) {
      where.userId = userId as string;
    }

    if (startDate || endDate) {
      where.startTime = {};
      if (startDate) {
        // Парсим дату в формате YYYY-MM-DD как начало дня в UTC
        const startDateStr = startDate as string;
        const startDateObj = startDateStr.includes('T')
          ? new Date(startDateStr)
          : new Date(startDateStr + 'T00:00:00.000Z');
        logger.debug('Start date filter', { startDateStr, parsed: startDateObj.toISOString() });
        where.startTime.gte = startDateObj;
      }
      if (endDate) {
        // Парсим дату в формате YYYY-MM-DD как конец дня в UTC
        const endDateStr = endDate as string;
        const endDateObj = endDateStr.includes('T')
          ? new Date(endDateStr)
          : new Date(endDateStr + 'T23:59:59.999Z');
        logger.debug('End date filter', { endDateStr, parsed: endDateObj.toISOString() });
        where.startTime.lte = endDateObj;
      }
    }

    if (type) {
      where.type = type;
    }

    // Ограничения доступа по ролям
    // Сотрудники с правом VIEW_SCHEDULE видят график всех в ресторане (чтобы видеть кто на сменах)
    // Фильтрация по userId происходит только если явно указан userId в запросе
    if (req.user.role === 'MANAGER') {
      // Менеджер видит смены в ресторанах, которыми управляет, или где он числится как сотрудник
      const managed = await dbClient.restaurant.findMany({
        where: { managerId: req.user.id },
        select: { id: true },
      });
      const employed = await dbClient.restaurantUser.findMany({
        where: { userId: req.user.id },
        select: { restaurantId: true },
      });

      const accessibleIds = Array.from(
        new Set([
          ...managed.map((r) => r.id),
          ...employed.map((ru) => ru.restaurantId),
        ])
      );

      if (accessibleIds.length === 0) {
        logger.debug('Manager has no accessible restaurants, returning empty shifts');
        res.json({ shifts: [] });
        return;
      }

      if (restaurantId) {
        if (!accessibleIds.includes(restaurantId as string)) {
          logger.debug('Manager requested foreign restaurant, returning empty shifts');
          res.json({ shifts: [] });
          return;
        }
        // restaurantId уже выставлен выше
      } else {
        where.restaurantId = { in: accessibleIds };
      }
    }
    // OWNER и ADMIN видят все смены

    let shifts;
    try {
      shifts = await dbClient.shift.findMany({
        where,
        include: {
          user: true,
          restaurant: true,
        },
        orderBy: {
          startTime: 'asc',
        },
      });
    } catch (error: any) {
      logger.error('Error in shift.findMany', { 
        error: error?.message, 
        where: JSON.stringify(where), 
        code: error?.code 
      });
      throw error;
    }

    logger.debug('Shifts query', { 
      restaurantId, 
      userId, 
      startDate, 
      endDate, 
      startDateType: typeof startDate,
      endDateType: typeof endDate,
      where, 
      count: shifts.length 
    });
    
    // Проверяем, есть ли смены в базе без фильтров по датам (fallback)
    if (shifts.length === 0 && restaurantId) {
      const fallbackShifts = await dbClient.shift.findMany({
        where: { restaurantId },
        include: { user: true, restaurant: true },
        orderBy: { startTime: 'asc' },
        take: 20,
      });
      logger.debug('All shifts in restaurant (first 20)', { 
        shifts: fallbackShifts.map(s => ({
          id: s.id,
          userId: s.userId,
          startTime: s.startTime,
          endTime: s.endTime,
          restaurantId: s.restaurantId,
          type: s.type,
        }))
      });

      const totalCount = await dbClient.shift.count({ where: { restaurantId } });
      logger.debug('Total shifts in restaurant', { totalCount });

      // Возвращаем fallback, чтобы пользователь увидел смены, даже если фильтр по датам не сработал
      res.json({ shifts: fallbackShifts });
      return;
    }
    
    if (shifts.length > 0) {
      logger.debug('First shift sample', {
        id: shifts[0].id,
        userId: shifts[0].userId,
        startTime: shifts[0].startTime,
        endTime: shifts[0].endTime,
        user: shifts[0].user ? { id: shifts[0].user.id, firstName: shifts[0].user.firstName, lastName: shifts[0].user.lastName } : null,
        restaurant: shifts[0].restaurant ? { id: shifts[0].restaurant.id, name: shifts[0].restaurant.name } : null,
      });
    } else {
      logger.debug('No shifts found with current filters');
    }

    // Обогащаем данными о пользователе, которому предлагается смена
    const enrichedShifts = await Promise.all(
      shifts.map(async (shift) => {
        let swapTarget = null;
        if (shift.swapRequestedTo) {
          const targetUser = await dbClient.user.findUnique({
            where: { id: shift.swapRequestedTo },
            select: {
              id: true,
              firstName: true,
              lastName: true,
              phone: true,
            },
          });
          swapTarget = targetUser;
        }
        return {
          ...shift,
          swapTarget,
        };
      })
    );

    res.json({ shifts: enrichedShifts });
  } catch (error) {
    next(error);
  }
};

// Получение одной смены
export const getShift = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { id } = req.params;

    const shift = await dbClient.shift.findUnique({
      where: { id },
      include: {
        user: true,
        restaurant: true,
      },
    });

    if (!shift) {
      res.status(404).json({ error: 'Shift not found' });
      return;
    }

    res.json({ shift });
  } catch (error) {
    next(error);
  }
};

// Обновление смены
export const updateShift = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
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

    // Получаем смену для проверки прав
    const existingShift = await dbClient.shift.findUnique({
      where: { id },
      include: {
        restaurant: true,
      },
    });

    if (!existingShift) {
      res.status(404).json({ error: 'Смена не найдена' });
      return;
    }

    // Проверяем права через permissions
    const { checkPermission } = await import('../utils/checkPermissions');
    const { PERMISSIONS } = await import('../utils/permissions');
    
    // OWNER и ADMIN имеют все права
    const isOwnerOrAdmin = req.user.role === 'OWNER' || req.user.role === 'ADMIN';
    const hasEditSchedule = isOwnerOrAdmin || await checkPermission(req.user.id, existingShift.restaurantId, PERMISSIONS.EDIT_SCHEDULE);
    
    if (!hasEditSchedule) {
      res.status(403).json({ error: 'Недостаточно прав для редактирования смены' });
      return;
    }
    const { type, startTime, endTime, notes, isConfirmed, isCompleted } = req.body;

    const updateData: any = {};

    if (type) updateData.type = type;

    if (startTime) {
      const startDate = new Date(startTime);
      if (isNaN(startDate.getTime())) {
        res.status(400).json({ error: 'Некорректное значение startTime' });
        return;
      }
      updateData.startTime = startDate;
    }

    if (endTime) {
      const endDate = new Date(endTime);
      if (isNaN(endDate.getTime())) {
        res.status(400).json({ error: 'Некорректное значение endTime' });
        return;
      }
      updateData.endTime = endDate;
    }

    if (notes !== undefined) updateData.notes = notes;
    if (isConfirmed !== undefined) updateData.isConfirmed = isConfirmed;
    if (isCompleted !== undefined) updateData.isCompleted = isCompleted;

    logger.debug('Update shift payload', {
      id,
      body: req.body,
      updateData,
    });

    // Пересчитываем часы если изменилось время
    if (startTime || endTime) {
      const start = updateData.startTime || existingShift.startTime;
      const end = updateData.endTime || existingShift.endTime;
      updateData.hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
    }

    let shift;
    try {
      shift = await dbClient.shift.update({
        where: { id },
        data: updateData,
        include: {
          user: true,
          restaurant: true,
        },
      });
    } catch (error: any) {
      logger.error('Error updating shift in DB', { error: error?.message, updateData });
      res.status(500).json({ error: 'Ошибка обновления смены' });
      return;
    }

    // Логируем обновление в историю изменений
    const shiftDate = new Date(shift.startTime);
    shiftDate.setHours(0, 0, 0, 0);

    await dbClient.shiftSwapHistory.create({
      data: {
        shiftId: shift.id,
        restaurantId: shift.restaurantId,
        fromUserId: shift.userId,
        toUserId: shift.userId,
        status: 'UPDATED',
        shiftDate,
        shiftStartTime: shift.startTime,
        shiftEndTime: shift.endTime,
        shiftType: shift.type,
        approvedById: req.user.id,
        approvedAt: new Date(),
        notes: 'Смена обновлена',
        changeType: 'UPDATE',
      } as any,
    });

    await logAction({
      userId: req.user.id,
      type: 'UPDATE',
      entityType: 'Shift',
      entityId: shift.id,
      description: `Updated shift`,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({ shift });
  } catch (error) {
    next(error);
  }
};

// Удаление смены
export const deleteShift = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { id } = req.params;

    // Получаем смену для проверки прав
    const shift = await dbClient.shift.findUnique({
      where: { id },
      include: {
        restaurant: true,
      },
    });

    if (!shift) {
      res.status(404).json({ error: 'Смена не найдена' });
      return;
    }

    // Проверяем права через permissions
    const { checkPermission } = await import('../utils/checkPermissions');
    const { PERMISSIONS } = await import('../utils/permissions');
    
    // OWNER и ADMIN имеют все права
    const isOwnerOrAdmin = req.user.role === 'OWNER' || req.user.role === 'ADMIN';
    const hasEditSchedule = isOwnerOrAdmin || await checkPermission(req.user.id, shift.restaurantId, PERMISSIONS.EDIT_SCHEDULE);
    
    if (!hasEditSchedule) {
      res.status(403).json({ error: 'Недостаточно прав для удаления смены' });
      return;
    }

    await dbClient.shift.delete({
      where: { id },
    });

    await logAction({
      userId: req.user.id,
      type: 'DELETE',
      entityType: 'Shift',
      entityId: id,
      description: `Deleted shift`,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    // Логируем удаление в историю изменений
    const shiftDate = new Date(shift.startTime);
    shiftDate.setHours(0, 0, 0, 0);

    await dbClient.shiftSwapHistory.create({
      data: {
        shiftId: id,
        restaurantId: shift.restaurantId,
        fromUserId: shift.userId,
        toUserId: shift.userId, // Для удаления указываем того же пользователя
        status: 'DELETED',
        shiftDate,
        shiftStartTime: shift.startTime,
        shiftEndTime: shift.endTime,
        shiftType: shift.type,
        approvedById: req.user.id,
        approvedAt: new Date(),
        notes: 'Смена удалена',
      },
    });

    await logAction({
      userId: req.user.id,
      type: 'DELETE',
      entityType: 'Shift',
      entityId: id,
      description: `Deleted shift`,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({ message: 'Смена удалена успешно' });
  } catch (error) {
    next(error);
  }
};

// Массовое удаление смен по выбранным ячейкам
export const deleteShiftsBatch = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { restaurantId, cellKeys } = req.body; // cellKeys: ["userId|dateStr", ...]

    if (!restaurantId || !Array.isArray(cellKeys) || cellKeys.length === 0) {
      res.status(400).json({ error: 'restaurantId и cellKeys (массив) обязательны' });
      return;
    }

    // Проверяем права через permissions
    const { checkPermission } = await import('../utils/checkPermissions');
    const { PERMISSIONS } = await import('../utils/permissions');
    
    const isOwnerOrAdmin = req.user.role === 'OWNER' || req.user.role === 'ADMIN';
    const hasEditSchedule = isOwnerOrAdmin || await checkPermission(req.user.id, restaurantId, PERMISSIONS.EDIT_SCHEDULE);
    
    if (!hasEditSchedule) {
      res.status(403).json({ error: 'Недостаточно прав для удаления смен' });
      return;
    }

    const deletedShifts = [];
    const notFoundShifts = [];

    for (const cellKey of cellKeys) {
      const [userId, dateStr] = cellKey.split('|');
      
      // Создаем дату в UTC для избежания проблем с часовыми поясами
      const shiftDate = new Date(dateStr + 'T00:00:00.000Z');
      
      const dayStart = new Date(dateStr + 'T00:00:00.000Z');
      const dayEnd = new Date(dateStr + 'T23:59:59.999Z');

      const shift = await dbClient.shift.findFirst({
        where: {
          restaurantId,
          userId,
          startTime: {
            gte: dayStart,
            lte: dayEnd,
          },
        },
      });

      if (shift) {
        // Логируем удаление в историю изменений
        const shiftDateForHistory = new Date(shift.startTime);
        shiftDateForHistory.setHours(0, 0, 0, 0);

        await dbClient.shiftSwapHistory.create({
          data: {
            shiftId: shift.id,
            restaurantId: shift.restaurantId,
            fromUserId: shift.userId,
            toUserId: shift.userId,
            status: 'DELETED',
            shiftDate: shiftDateForHistory,
            shiftStartTime: shift.startTime,
            shiftEndTime: shift.endTime,
            shiftType: shift.type,
            approvedById: req.user.id,
            approvedAt: new Date(),
            notes: 'Смена удалена (массовое удаление)',
            changeType: 'BATCH_DELETE',
          } as any,
        });

        await dbClient.shift.delete({
          where: { id: shift.id },
        });

        deletedShifts.push(shift.id);
      } else {
        notFoundShifts.push(cellKey);
      }
    }

    await logAction({
      userId: req.user.id,
      type: 'DELETE',
      entityType: 'Shift',
      description: `Deleted ${deletedShifts.length} shifts in batch`,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({
      message: `Удалено ${deletedShifts.length} смен`,
      deleted: deletedShifts.length,
      notFound: notFoundShifts.length,
    });
  } catch (error) {
    next(error);
  }
};

// Удаление всех смен сотрудника за период
export const deleteEmployeeShifts = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { restaurantId, userId, startDate, endDate } = req.body;

    if (!restaurantId || !userId || !startDate || !endDate) {
      res.status(400).json({ error: 'restaurantId, userId, startDate и endDate обязательны' });
      return;
    }

    // Проверяем права через permissions
    const { checkPermission } = await import('../utils/checkPermissions');
    const { PERMISSIONS } = await import('../utils/permissions');
    
    const isOwnerOrAdmin = req.user.role === 'OWNER' || req.user.role === 'ADMIN';
    const hasEditSchedule = isOwnerOrAdmin || await checkPermission(req.user.id, restaurantId, PERMISSIONS.EDIT_SCHEDULE);
    
    if (!hasEditSchedule) {
      res.status(403).json({ error: 'Недостаточно прав для удаления смен' });
      return;
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      res.status(400).json({ error: 'Некорректные даты' });
      return;
    }
    // Устанавливаем время в UTC для избежания проблем с часовыми поясами
    start.setUTCHours(0, 0, 0, 0);
    end.setUTCHours(23, 59, 59, 999);

    // Получаем все смены сотрудника за период
    const shifts = await dbClient.shift.findMany({
      where: {
        restaurantId,
        userId,
        startTime: {
          gte: start,
          lte: end,
        },
      },
      include: { user: true, restaurant: true },
    });

    // Логируем каждое удаление в историю изменений
    for (const shift of shifts) {
      const shiftDate = new Date(shift.startTime);
      shiftDate.setHours(0, 0, 0, 0);

      await dbClient.shiftSwapHistory.create({
        data: {
          shiftId: shift.id,
          restaurantId: shift.restaurantId,
          fromUserId: shift.userId,
          toUserId: shift.userId,
          status: 'DELETED',
          shiftDate,
          shiftStartTime: shift.startTime,
          shiftEndTime: shift.endTime,
          shiftType: shift.type,
          approvedById: req.user.id,
          approvedAt: new Date(),
          notes: 'Смена удалена (удаление всех смен сотрудника)',
          changeType: 'BATCH_DELETE',
        } as any,
      });
    }

    // Удаляем все смены
    const result = await dbClient.shift.deleteMany({
      where: {
        restaurantId,
        userId,
        startTime: {
          gte: start,
          lte: end,
        },
      },
    });

    await logAction({
      userId: req.user.id,
      type: 'DELETE',
      entityType: 'Shift',
      description: `Deleted ${result.count} shifts for employee ${userId} in period`,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({
      message: `Удалено ${result.count} смен сотрудника`,
      count: result.count,
    });
  } catch (error) {
    next(error);
  }
};

// Запрос на обмен сменой
export const requestShiftSwap = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { id } = req.params;
    const { swapRequestedTo } = req.body;

    // Проверяем, что смена принадлежит текущему пользователю
    const shift = await dbClient.shift.findUnique({
      where: { id },
    });

    if (!shift) {
      res.status(404).json({ error: 'Смена не найдена' });
      return;
    }

    if (shift.userId !== req.user.id) {
      res.status(403).json({ error: 'Вы можете запросить обмен только для своих смен' });
      return;
    }

    // Проверяем ограничение времени (не менее 12 часов до начала смены)
    const hoursUntilShift = (shift.startTime.getTime() - new Date().getTime()) / (1000 * 60 * 60);
    if (hoursUntilShift < 12) {
      res.status(400).json({ error: 'Нельзя обменять смену менее чем за 12 часов до её начала' });
      return;
    }

    const updatedShift = await dbClient.shift.update({
      where: { id },
      data: {
        swapRequested: true,
        swapRequestedTo,
        employeeResponse: 'PENDING', // Ожидает ответа сотрудника
        swapApproved: null,
      },
      include: {
        user: true,
      },
    });

    // Сохраняем в историю обменов
    const shiftDate = new Date(shift.startTime);
    shiftDate.setHours(0, 0, 0, 0);

    await dbClient.shiftSwapHistory.create({
      data: {
        shiftId: shift.id,
        restaurantId: shift.restaurantId,
        fromUserId: shift.userId,
        toUserId: swapRequestedTo,
        status: 'REQUESTED',
        shiftDate,
        shiftStartTime: shift.startTime,
        shiftEndTime: shift.endTime,
        shiftType: shift.type,
        changeType: 'SWAP',
      } as any,
    });

    await logAction({
      userId: req.user.id,
      type: 'UPDATE',
      entityType: 'Shift',
      entityId: shift.id,
      description: `Requested shift swap to user ${swapRequestedTo}`,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    // Создаем уведомление сотруднику, которому предложен обмен
    const { notifyShiftSwapRequest } = await import('../utils/notifications');
    const fromUserName = `${updatedShift.user.firstName} ${updatedShift.user.lastName}`;
    await notifyShiftSwapRequest(
      swapRequestedTo,
      shift.id,
      fromUserName,
      shift.startTime
    );

    res.json({ shift: updatedShift });
  } catch (error) {
    next(error);
  }
};

// Ответ сотрудника на запрос обмена (принять/отклонить)
export const respondToSwapRequest = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { id } = req.params;
    const { accepted } = req.body; // true или false

    const shift = await dbClient.shift.findUnique({
      where: { id },
    });

    if (!shift) {
      res.status(404).json({ error: 'Смена не найдена' });
      return;
    }

    // Проверяем, что запрос адресован текущему пользователю
    if (shift.swapRequestedTo !== req.user.id) {
      res.status(403).json({ error: 'Этот запрос адресован не вам' });
      return;
    }

    // Проверяем, что запрос еще не обработан
    if (shift.employeeResponse !== 'PENDING' && shift.employeeResponse !== null) {
      res.status(400).json({ error: 'Вы уже ответили на этот запрос' });
      return;
    }

    const response = accepted ? 'ACCEPTED' : 'REJECTED';

    await dbClient.shift.update({
      where: { id },
      data: {
        employeeResponse: response,
      },
    });

    // Обновляем историю
    const shiftDate = new Date(shift.startTime);
    shiftDate.setHours(0, 0, 0, 0);

    let historyRecord = await dbClient.shiftSwapHistory.findFirst({
      where: {
        shiftId: shift.id,
        status: 'REQUESTED',
      },
      orderBy: {
        requestedAt: 'desc',
      },
    });

    if (historyRecord) {
      // Обновляем статус в истории (но не финальный, менеджер еще должен одобрить)
        await dbClient.shiftSwapHistory.update({
          where: { id: historyRecord.id },
          data: {
            status: accepted ? 'ACCEPTED_BY_EMPLOYEE' : 'REJECTED_BY_EMPLOYEE',
            changeType: 'SWAP',
          } as any,
        });
    }

    await logAction({
      userId: req.user.id,
      type: accepted ? 'APPROVE' : 'REJECT',
      entityType: 'Shift',
      entityId: shift.id,
      description: `${accepted ? 'Принял' : 'Отклонил'} запрос на обмен сменой`,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    // Создаем уведомление пользователю, который запросил обмен
    const { notifyShiftSwapAccepted, notifyShiftSwapRejected } = await import('../utils/notifications');
    const user = await dbClient.user.findUnique({
      where: { id: req.user.id },
      select: { firstName: true, lastName: true },
    });
    const acceptedByUserName = user ? `${user.firstName} ${user.lastName}` : 'Сотрудник';
    
    if (accepted) {
      await notifyShiftSwapAccepted(shift.userId, shift.id, acceptedByUserName);
    } else {
      await notifyShiftSwapRejected(shift.userId, shift.id, acceptedByUserName);
    }

    res.json({ message: `Запрос ${accepted ? 'принят' : 'отклонен'}. Ожидается подтверждение менеджера.` });
  } catch (error) {
    next(error);
  }
};

// Подтверждение/отклонение обмена сменой менеджером (финальное одобрение)
export const approveShiftSwap = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { id } = req.params;
    const { approved } = req.body; // true или false

    const shift = await dbClient.shift.findUnique({
      where: { id },
    });

    if (!shift) {
      res.status(404).json({ error: 'Смена не найдена' });
      return;
    }

    // Проверяем, что сотрудник принял запрос
    if (shift.employeeResponse !== 'ACCEPTED') {
      res.status(400).json({ error: 'Сотрудник еще не принял запрос на обмен' });
      return;
    }

    // Проверяем права доступа: OWNER, ADMIN, MANAGER или EMPLOYEE, который является менеджером ресторана
    const isOwnerOrAdmin = ['OWNER', 'ADMIN'].includes(req.user.role);
    
    // Проверяем, является ли пользователь менеджером ресторана этой смены (для любой роли, включая EMPLOYEE)
    const restaurant = await dbClient.restaurant.findUnique({
      where: { id: shift.restaurantId },
      select: { managerId: true },
    });
    const isRestaurantManager = restaurant?.managerId === req.user.id;

    if (!isOwnerOrAdmin && !isRestaurantManager) {
      res.status(403).json({ error: 'Только менеджеры могут одобрять обмены сменами' });
      return;
    }

    // Находим или создаем запись в истории
    const shiftDate = new Date(shift.startTime);
    shiftDate.setHours(0, 0, 0, 0);

    let historyRecord = await dbClient.shiftSwapHistory.findFirst({
      where: {
        shiftId: shift.id,
        status: 'REQUESTED',
      },
      orderBy: {
        requestedAt: 'desc',
      },
    });

    // Если записи нет (для обратной совместимости), создаем её
    if (!historyRecord && shift.swapRequestedTo) {
      historyRecord = await dbClient.shiftSwapHistory.create({
        data: {
          shiftId: shift.id,
          restaurantId: shift.restaurantId,
          fromUserId: shift.userId,
          toUserId: shift.swapRequestedTo,
          status: 'REQUESTED',
          shiftDate,
          shiftStartTime: shift.startTime,
          shiftEndTime: shift.endTime,
          shiftType: shift.type,
        },
      });
    }

    if (approved) {
      // Меняем пользователя смены
      const newUserId = shift.swapRequestedTo;
      if (!newUserId) {
        res.status(400).json({ error: 'Не указан сотрудник для обмена' });
        return;
      }

      await dbClient.shift.update({
        where: { id },
        data: {
          userId: newUserId,
          swapRequested: false,
          swapRequestedTo: null,
          employeeResponse: null,
          swapApproved: true,
        },
      });

      // Обновляем историю
      if (historyRecord) {
        await dbClient.shiftSwapHistory.update({
          where: { id: historyRecord.id },
          data: {
            status: 'APPROVED',
            approvedAt: new Date(),
            approvedById: req.user.id,
            changeType: 'SWAP',
          } as any,
        });
      }
    } else {
      // Отклоняем обмен
      await dbClient.shift.update({
        where: { id },
        data: {
          swapRequested: false,
          swapRequestedTo: null,
          employeeResponse: null,
          swapApproved: false,
        },
      });

      // Обновляем историю
      if (historyRecord) {
        await dbClient.shiftSwapHistory.update({
          where: { id: historyRecord.id },
          data: {
            status: 'REJECTED',
            approvedAt: new Date(),
            approvedById: req.user.id,
            changeType: 'SWAP',
          } as any,
        });
      }
    }

    await logAction({
      userId: req.user.id,
      type: approved ? 'APPROVE' : 'REJECT',
      entityType: 'Shift',
      entityId: shift.id,
      description: `${approved ? 'Approved' : 'Rejected'} shift swap`,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    // Создаем уведомления обоим сотрудникам о решении менеджера
    const { notifyShiftSwapApproved, notifyShiftSwapDeclined } = await import('../utils/notifications');
    if (approved) {
      // Уведомляем обоих: того, кто запросил, и того, кто принял
      await notifyShiftSwapApproved(shift.userId, shift.id);
      if (shift.swapRequestedTo) {
        await notifyShiftSwapApproved(shift.swapRequestedTo, shift.id);
      }
    } else {
      // Уведомляем обоих об отклонении
      await notifyShiftSwapDeclined(shift.userId, shift.id);
      if (shift.swapRequestedTo) {
        await notifyShiftSwapDeclined(shift.swapRequestedTo, shift.id);
      }
    }

    res.json({ message: `Обмен сменой ${approved ? 'одобрен' : 'отклонен'}` });
  } catch (error) {
    next(error);
  }
};

// Копирование графика на неделю/месяц
export const copySchedule = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { restaurantId, fromDate, toDate, period } = req.body; // period: 'week' или 'month'

    // Проверяем права через permissions
    const { checkPermission } = await import('../utils/checkPermissions');
    const { PERMISSIONS } = await import('../utils/permissions');
    
    // OWNER и ADMIN имеют все права
    const isOwnerOrAdmin = req.user.role === 'OWNER' || req.user.role === 'ADMIN';
    const hasEditSchedule = isOwnerOrAdmin || await checkPermission(req.user.id, restaurantId, PERMISSIONS.EDIT_SCHEDULE);
    
    if (!hasEditSchedule) {
      res.status(403).json({ error: 'Недостаточно прав для копирования графика' });
      return;
    }

    const from = new Date(fromDate);
    const to = new Date(toDate);

    // Получаем смены за период
    const sourceShifts = await dbClient.shift.findMany({
      where: {
        restaurantId,
        startTime: {
          gte: from,
          lte: to,
        },
      },
    });

    if (sourceShifts.length === 0) {
      res.status(400).json({ error: 'Нет смен в указанном периоде' });
      return;
    }

    // Вычисляем смещение для нового периода
    const newShifts = [];

    for (const shift of sourceShifts) {
      const startTime = new Date(shift.startTime);
      const endTime = new Date(shift.endTime);

      if (period === 'week') {
        // Для недели: добавляем 7 дней (следующая неделя)
        startTime.setDate(startTime.getDate() + 7);
        endTime.setDate(endTime.getDate() + 7);
      } else if (period === 'month') {
        // Для месяца: добавляем один месяц, сохраняя день месяца и время
        const startDay = startTime.getDate();
        const startHours = startTime.getHours();
        const startMinutes = startTime.getMinutes();
        
        // Добавляем месяц
        startTime.setMonth(startTime.getMonth() + 1);
        // Если день месяца не существует в следующем месяце (например, 31 января -> февраль),
        // устанавливаем последний день месяца
        const lastDayOfStartMonth = new Date(startTime.getFullYear(), startTime.getMonth() + 1, 0).getDate();
        startTime.setDate(Math.min(startDay, lastDayOfStartMonth));
        startTime.setHours(startHours, startMinutes, 0, 0);
        
        // То же самое для endTime
        const endDay = endTime.getDate();
        const endHours = endTime.getHours();
        const endMinutes = endTime.getMinutes();
        
        endTime.setMonth(endTime.getMonth() + 1);
        const lastDayOfEndMonth = new Date(endTime.getFullYear(), endTime.getMonth() + 1, 0).getDate();
        endTime.setDate(Math.min(endDay, lastDayOfEndMonth));
        endTime.setHours(endHours, endMinutes, 0, 0);
      }

      const hours = (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60);

      newShifts.push({
        restaurantId: shift.restaurantId,
        userId: shift.userId,
        type: shift.type,
        startTime,
        endTime,
        hours,
        notes: shift.notes,
      });
    }

    // Создаем новые смены
    const created = await dbClient.shift.createMany({
      data: newShifts,
    });

    await logAction({
      userId: req.user.id,
      type: 'CREATE',
      entityType: 'Shift',
      description: `Copied ${created.count} shifts for ${period}`,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({
      message: `Скопировано ${created.count} смен`,
      count: created.count,
    });
  } catch (error) {
    next(error);
  }
};

// Получение списка запросов на обмен сменами (для менеджера)
export const getShiftSwapRequests = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { restaurantId } = req.query;

    // Проверяем права доступа: OWNER, ADMIN или менеджер ресторана (любая роль, включая EMPLOYEE)
    const isOwnerOrAdmin = ['OWNER', 'ADMIN'].includes(req.user.role);
    
    // Проверяем, является ли пользователь менеджером ресторана (для любой роли, не только EMPLOYEE)
    let isRestaurantManager = false;
    if (restaurantId) {
      const restaurant = await dbClient.restaurant.findUnique({
        where: { id: restaurantId as string },
        select: { managerId: true },
      });
      isRestaurantManager = restaurant?.managerId === req.user.id;
    } else {
      // Если ресторан не указан, проверяем все рестораны пользователя
      const managedRestaurants = await dbClient.restaurant.findMany({
        where: { managerId: req.user.id },
        select: { id: true },
      });
      isRestaurantManager = managedRestaurants.length > 0;
    }

    if (!isOwnerOrAdmin && !isRestaurantManager) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const where: any = {
      swapRequested: true,
      swapApproved: null, // Только ожидающие финального подтверждения менеджера
      // Показываем все запросы: ожидающие ответа сотрудника и ожидающие одобрения менеджера
    };

    // OWNER и ADMIN видят все запросы (или по выбранному ресторану)
    if (isOwnerOrAdmin) {
      if (restaurantId) {
        where.restaurantId = restaurantId as string;
      }
      // Если restaurantId не указан, OWNER/ADMIN видят все запросы (фильтр не применяется)
    } else if (restaurantId) {
      // Если restaurantId передан, используем его (но только если пользователь имеет доступ)
      where.restaurantId = restaurantId as string;
    } else if (isRestaurantManager) {
      // Менеджер (включая EMPLOYEE-менеджера) видит только запросы в своих ресторанах
      const restaurants = await dbClient.restaurant.findMany({
        where: { managerId: req.user.id },
        select: { id: true },
      });
      if (restaurants.length > 0) {
        where.restaurantId = {
          in: restaurants.map((r) => r.id),
        };
      } else {
        // Если нет ресторанов, возвращаем пустой список
        res.json({ requests: [] });
        return;
      }
    }

    const swapRequests = await dbClient.shift.findMany({
      where,
      include: {
        user: true,
        restaurant: true,
      },
      orderBy: {
        startTime: 'asc',
      },
    });

    // Обогащаем данными о пользователе, которому предлагается смена
    const enrichedRequests = await Promise.all(
      swapRequests.map(async (shift) => {
        let swapTarget = null;
        if (shift.swapRequestedTo) {
          const targetUser = await dbClient.user.findUnique({
            where: { id: shift.swapRequestedTo },
            select: {
              id: true,
              firstName: true,
              lastName: true,
              phone: true,
            },
          });
          swapTarget = targetUser;
        }
        return {
          ...shift,
          swapTarget,
        };
      })
    );

    res.json({ requests: enrichedRequests });
  } catch (error) {
    logger.error('Error in getShiftSwapRequests', { error: error instanceof Error ? error.message : error });
    next(error);
  }
};

// Получение входящих запросов на обмен (для сотрудников, которым предложили обмен)
export const getIncomingSwapRequests = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { restaurantId } = req.query;

    const where: any = {
      swapRequested: true,
      swapRequestedTo: req.user.id, // Запросы, где текущий пользователь является получателем
      OR: [
        { employeeResponse: null },
        { employeeResponse: 'PENDING' },
      ],
      swapApproved: null, // Еще не одобрено менеджером
    };

    if (restaurantId) {
      where.restaurantId = restaurantId as string;
    }

    const swapRequests = await dbClient.shift.findMany({
      where,
      include: {
        user: true,
        restaurant: true,
      },
      orderBy: {
        startTime: 'asc',
      },
    });

    res.json({ requests: swapRequests });
  } catch (error) {
    next(error);
  }
};

// Получение истории обменов сменами
export const getShiftSwapHistory = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { restaurantId, userId, status, changeType, startDate, endDate } = req.query;

    const where: any = {};

    // Фильтр по ресторану
    if (restaurantId) {
      where.restaurantId = restaurantId as string;
    } else if (req.user.role === 'MANAGER') {
      // Менеджер видит только историю в своих ресторанах
      const restaurants = await dbClient.restaurant.findMany({
        where: { managerId: req.user.id },
        select: { id: true },
      });
      where.restaurantId = {
        in: restaurants.map((r) => r.id),
      };
    }

    // Фильтр по пользователю (сотрудники видят только свою историю)
    if (req.user.role === 'EMPLOYEE') {
      where.OR = [
        { fromUserId: req.user.id },
        { toUserId: req.user.id },
      ];
    } else if (userId) {
      where.OR = [
        { fromUserId: userId as string },
        { toUserId: userId as string },
      ];
    }

    // Фильтр по статусу
    if (status) {
      where.status = status as string;
    }

    // Фильтр по типу изменения
    if (changeType) {
      where.changeType = changeType as string;
    }

    // Фильтр по дате смены
    if (startDate) {
      where.shiftDate = {
        gte: new Date(startDate as string),
      };
    }
    if (endDate) {
      where.shiftDate = {
        ...where.shiftDate,
        lte: new Date(endDate as string),
      };
    }

    const history = await dbClient.shiftSwapHistory.findMany({
      where,
      include: {
        fromUser: true,
        toUser: true,
        approvedBy: true,
        restaurant: true,
      },
      orderBy: {
        requestedAt: 'desc',
      },
      take: 100, // Ограничиваем 100 последними записями
    });

    res.json({ history });
  } catch (error) {
    next(error);
  }
};

