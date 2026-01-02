import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import dbClient from '../utils/db';
import { logAction } from '../utils/actionLog';
import { AuthRequest } from '../middleware/auth';
import { logger } from '../services/loggerService';
import { isDatabaseError } from '../middleware/errorHandler';

// Получение всех типов смен (если restaurantId не указан, то общие шаблоны)
export const getShiftTemplates = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { restaurantId } = req.query;

    const where: any = {
      // Показываем все типы смен, не только активные (для админки)
    };

    if (restaurantId) {
      // Показываем типы смен для конкретного ресторана И общие (null)
      where.OR = [
        { restaurantId: restaurantId as string },
        { restaurantId: null },
      ];
    } else {
      // Если restaurantId не указан, показываем только общие шаблоны
      where.restaurantId = null;
    }

    const templates = await dbClient.shiftTemplate.findMany({
      where,
      orderBy: {
        startHour: 'asc',
      },
    });

    logger.debug('Shift templates query', { restaurantId, where, count: templates.length });

    res.json({ templates });
  } catch (error) {
    next(error);
  }
};

// Создание типа смены
export const createShiftTemplate = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
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

    // Только менеджер, админ или владелец могут создавать типы смен
    if (!['OWNER', 'ADMIN', 'MANAGER'].includes(req.user.role)) {
      res.status(403).json({ error: 'Only managers can create shift templates' });
      return;
    }

    const { restaurantId, name, startHour, endHour, color, rate } = req.body;

    // Проверяем, что время валидно
    if (startHour < 0 || startHour > 23 || endHour < 0 || endHour > 23) {
      res.status(400).json({ error: 'Hours must be between 0 and 23' });
      return;
    }

    const template = await dbClient.shiftTemplate.create({
      data: {
        restaurantId: restaurantId || null,
        name,
        startHour,
        endHour,
        color: color || null,
        rate: rate !== undefined && rate !== null && rate !== '' ? parseFloat(String(rate)) : 0,
        isActive: true,
      },
    });

    await logAction({
      userId: req.user.id,
      type: 'CREATE',
      entityType: 'ShiftTemplate',
      entityId: template.id,
      description: `Created shift template: ${template.name}`,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.status(201).json({ template });
  } catch (error: unknown) {
    if (isDatabaseError(error) && error.code === 'P2002') {
      res.status(400).json({ error: 'Template with this name already exists' });
      return;
    }
    next(error);
  }
};

// Обновление типа смены
export const updateShiftTemplate = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
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
      res.status(403).json({ error: 'Only managers can update shift templates' });
      return;
    }

    const { id } = req.params;
    const { name, startHour, endHour, color, rate, isActive } = req.body;

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (startHour !== undefined) {
      if (startHour < 0 || startHour > 23) {
        res.status(400).json({ error: 'Start hour must be between 0 and 23' });
        return;
      }
      updateData.startHour = startHour;
    }
    if (endHour !== undefined) {
      if (endHour < 0 || endHour > 23) {
        res.status(400).json({ error: 'End hour must be between 0 and 23' });
        return;
      }
      updateData.endHour = endHour;
    }
    if (color !== undefined) updateData.color = color;
    if (rate !== undefined) updateData.rate = parseFloat(String(rate)) || 0;
    if (isActive !== undefined) updateData.isActive = isActive;

    const template = await dbClient.shiftTemplate.update({
      where: { id },
      data: updateData,
    });

    await logAction({
      userId: req.user.id,
      type: 'UPDATE',
      entityType: 'ShiftTemplate',
      entityId: template.id,
      description: `Updated shift template: ${template.name}`,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({ template });
  } catch (error: unknown) {
    if (isDatabaseError(error) && error.code === 'P2025') {
      res.status(404).json({ error: 'Template not found' });
      return;
    }
    next(error);
  }
};

// Удаление типа смены
export const deleteShiftTemplate = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!['OWNER', 'ADMIN', 'MANAGER'].includes(req.user.role)) {
      res.status(403).json({ error: 'Only managers can delete shift templates' });
      return;
    }

    const { id } = req.params;

    // Проверяем, используется ли шаблон в сменах
    const shiftsCount = await dbClient.shift.count({
      where: {
        type: id,
      },
    });

    if (shiftsCount > 0) {
      // Вместо удаления деактивируем
      const template = await dbClient.shiftTemplate.update({
        where: { id },
        data: { isActive: false },
      });

      await logAction({
        userId: req.user.id,
        type: 'UPDATE',
        entityType: 'ShiftTemplate',
        entityId: template.id,
        description: `Deactivated shift template: ${template.name} (used in ${shiftsCount} shifts)`,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });

      res.json({ 
        message: 'Template deactivated (used in existing shifts)',
        template,
      });
      return;
    }

    await dbClient.shiftTemplate.delete({
      where: { id },
    });

    await logAction({
      userId: req.user.id,
      type: 'DELETE',
      entityType: 'ShiftTemplate',
      entityId: id,
      description: 'Deleted shift template',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({ message: 'Template deleted successfully' });
  } catch (error: unknown) {
    if (isDatabaseError(error) && error.code === 'P2025') {
      res.status(404).json({ error: 'Template not found' });
      return;
    }
    next(error);
  }
};

