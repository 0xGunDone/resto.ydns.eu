import { Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import prisma from '../utils/prisma';
import { logAction } from '../utils/actionLog';
import { AuthRequest } from '../middleware/auth';

interface ScheduleShiftData {
  userId: string;
  shiftType: string;
  dayOfWeek?: number; // 0-6 для недельного шаблона
  dayOffset?: number; // смещение дней для месячного шаблона
  startTime: string; // время начала в формате HH:mm
  endTime: string; // время окончания в формате HH:mm
  notes?: string;
}

// Получение всех шаблонов графиков
export const getScheduleTemplates = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { restaurantId } = req.query;

    if (!restaurantId) {
      res.status(400).json({ error: 'restaurantId is required' });
      return;
    }

    const templates = await prisma.scheduleTemplate.findMany({
      where: {
        restaurantId: restaurantId as string,
        isActive: true,
      },
      include: {
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

    res.json({ templates });
  } catch (error) {
    next(error);
  }
};

// Создание шаблона графика из текущего графика
export const createScheduleTemplate = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
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

    // Проверяем права через permissions
    const { checkPermission } = await import('../utils/checkPermissions');
    const { PERMISSIONS } = await import('../utils/permissions');
    
    // OWNER и ADMIN имеют все права
    const isOwnerOrAdmin = req.user.role === 'OWNER' || req.user.role === 'ADMIN';
    const hasEditSchedule = isOwnerOrAdmin || await checkPermission(req.user.id, restaurantId, PERMISSIONS.EDIT_SCHEDULE);
    
    if (!hasEditSchedule) {
      res.status(403).json({ error: 'Недостаточно прав для создания шаблона графика' });
      return;
    }

    const { restaurantId, name, description, periodType, startDate, endDate } = req.body;

    // Получаем смены за указанный период
    const shifts = await prisma.shift.findMany({
      where: {
        restaurantId,
        startTime: {
          gte: new Date(startDate),
          lte: new Date(endDate),
        },
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: {
        startTime: 'asc',
      },
    });

    if (shifts.length === 0) {
      res.status(400).json({ error: 'No shifts found for the specified period' });
      return;
    }

    // Формируем данные шаблона
    const shiftsData: ScheduleShiftData[] = [];
    const baseDate = new Date(startDate);

    for (const shift of shifts) {
      const shiftDate = new Date(shift.startTime);
      
      let shiftData: ScheduleShiftData = {
        userId: shift.userId,
        shiftType: shift.type,
        startTime: formatTime(shift.startTime),
        endTime: formatTime(shift.endTime),
        notes: shift.notes || undefined,
      };

      if (periodType === 'week') {
        // Для недельного шаблона сохраняем день недели относительно начала периода (0 = первый день, 1 = второй, ...)
        const dayOffset = Math.floor((shiftDate.getTime() - baseDate.getTime()) / (1000 * 60 * 60 * 24));
        shiftData.dayOfWeek = dayOffset;
      } else {
        // Для месячного шаблона сохраняем смещение от начала периода
        const dayOffset = Math.floor((shiftDate.getTime() - baseDate.getTime()) / (1000 * 60 * 60 * 24));
        shiftData.dayOffset = dayOffset;
      }

      shiftsData.push(shiftData);
    }

    const template = await prisma.scheduleTemplate.create({
      data: {
        restaurantId,
        createdById: req.user.id,
        name,
        description: description || null,
        periodType: periodType || 'week',
        shiftsData: JSON.stringify(shiftsData),
      },
      include: {
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
      entityType: 'ScheduleTemplate',
      entityId: template.id,
      description: `Created schedule template: ${template.name}`,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.status(201).json({ template });
  } catch (error: any) {
    next(error);
  }
};

// Применение шаблона к новому периоду
export const applyScheduleTemplate = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
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

    const { templateId, startDate, replaceExisting } = req.body;

    const template = await prisma.scheduleTemplate.findUnique({
      where: { id: templateId },
    });

    if (!template || !template.isActive) {
      res.status(404).json({ error: 'Template not found or inactive' });
      return;
    }

    const shiftsData: ScheduleShiftData[] = JSON.parse(template.shiftsData);
    const baseDate = new Date(startDate);
    baseDate.setHours(0, 0, 0, 0);

    const createdShifts = [];
    const skippedShifts = [];

    // Если replaceExisting = true, удаляем существующие смены в этом периоде
    if (replaceExisting) {
      const periodEnd = new Date(baseDate);
      if (template.periodType === 'week') {
        periodEnd.setDate(periodEnd.getDate() + 7);
      } else {
        periodEnd.setMonth(periodEnd.getMonth() + 1);
      }

      await prisma.shift.deleteMany({
        where: {
          restaurantId: template.restaurantId,
          startTime: {
            gte: baseDate,
            lt: periodEnd,
          },
        },
      });
    }

    for (const shiftData of shiftsData) {
      let shiftDate: Date;

      if (template.periodType === 'week') {
        // Для недельного шаблона используем смещение от начала периода
        shiftDate = new Date(baseDate);
        shiftDate.setDate(shiftDate.getDate() + (shiftData.dayOfWeek || 0));
      } else {
        // Для месячного шаблона используем смещение
        shiftDate = new Date(baseDate);
        shiftDate.setDate(shiftDate.getDate() + (shiftData.dayOffset || 0));
      }

      shiftDate.setHours(0, 0, 0, 0);

      // Парсим время начала и окончания
      const [startHours, startMinutes] = shiftData.startTime.split(':').map(Number);
      const [endHours, endMinutes] = shiftData.endTime.split(':').map(Number);

      const startTime = new Date(shiftDate);
      startTime.setHours(startHours, startMinutes, 0, 0);

      let endTime = new Date(shiftDate);
      endTime.setHours(endHours, endMinutes, 0, 0);

      // Если время окончания меньше времени начала, значит смена переходит на следующий день
      if (endTime <= startTime) {
        endTime.setDate(endTime.getDate() + 1);
      }

      // Проверяем, нет ли уже смены на это время
      const dayStart = new Date(shiftDate);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(shiftDate);
      dayEnd.setHours(23, 59, 59, 999);

      const existingShift = await prisma.shift.findFirst({
        where: {
          restaurantId: template.restaurantId,
          userId: shiftData.userId,
          startTime: {
            gte: dayStart,
            lte: dayEnd,
          },
        },
      });

      if (existingShift && !replaceExisting) {
        skippedShifts.push({ userId: shiftData.userId, date: shiftDate });
        continue;
      }

      // Вычисляем количество часов
      const hours = (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60);

      try {
        const shift = await prisma.shift.create({
          data: {
            restaurantId: template.restaurantId,
            userId: shiftData.userId,
            type: shiftData.shiftType,
            startTime,
            endTime,
            hours,
            notes: shiftData.notes || null,
          },
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        });

        createdShifts.push(shift);
      } catch (error: any) {
        if (error.code === 'P2002') {
          skippedShifts.push({ userId: shiftData.userId, date: shiftDate });
        } else {
          throw error;
        }
      }
    }

    await logAction({
      userId: req.user.id,
      type: 'CREATE',
      entityType: 'Shift',
      description: `Applied schedule template "${template.name}" to period starting ${startDate}`,
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

// Удаление шаблона
export const deleteScheduleTemplate = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { id } = req.params;

    const template = await prisma.scheduleTemplate.findUnique({
      where: { id },
    });

    if (!template) {
      res.status(404).json({ error: 'Шаблон не найден' });
      return;
    }

    // Проверяем права через permissions
    const { checkPermission } = await import('../utils/checkPermissions');
    const { PERMISSIONS } = await import('../utils/permissions');
    
    // OWNER и ADMIN имеют все права
    const isOwnerOrAdmin = req.user.role === 'OWNER' || req.user.role === 'ADMIN';
    const hasEditSchedule = isOwnerOrAdmin || await checkPermission(req.user.id, template.restaurantId, PERMISSIONS.EDIT_SCHEDULE);
    
    if (!hasEditSchedule) {
      res.status(403).json({ error: 'Недостаточно прав для удаления шаблона графика' });
      return;
    }

    // Проверяем, что шаблон принадлежит ресторану, к которому у пользователя есть доступ
    // (можно добавить дополнительную проверку прав)

    await prisma.scheduleTemplate.update({
      where: { id },
      data: { isActive: false },
    });

    await logAction({
      userId: req.user.id,
      type: 'DELETE',
      entityType: 'ScheduleTemplate',
      entityId: id,
      description: `Deleted schedule template: ${template.name}`,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({ message: 'Template deleted successfully' });
  } catch (error) {
    next(error);
  }
};

// Вспомогательная функция для форматирования времени
function formatTime(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

