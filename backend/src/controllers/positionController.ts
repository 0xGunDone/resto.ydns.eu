import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import prisma from '../utils/prisma';
import { logAction } from '../utils/actionLog';
import { AuthRequest } from '../middleware/auth';

// Получение должностей ресторана
export const getPositions = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { restaurantId } = req.params;

    const positions = await prisma.position.findMany({
      where: {
        restaurantId,
        isActive: true,
      },
      orderBy: { name: 'asc' },
    });

    res.json({ positions });
  } catch (error) {
    next(error);
  }
};

// Создание должности
export const createPosition = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
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
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const { restaurantId } = req.params;
    const { name, bonusPerShift } = req.body;

    const createData: {
      restaurantId: string;
      name: string;
      isActive: boolean;
      bonusPerShift: number;
    } = {
      restaurantId,
      name,
      isActive: true,
      bonusPerShift: bonusPerShift !== undefined && bonusPerShift !== null && bonusPerShift !== '' 
        ? parseFloat(String(bonusPerShift)) 
        : 0,
    };

    const position = await prisma.position.create({
      data: createData,
    });

    await logAction({
      userId: req.user.id,
      type: 'CREATE',
      entityType: 'Position',
      entityId: position.id,
      description: `Created position: ${position.name}`,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.status(201).json({ position });
  } catch (error) {
    next(error);
  }
};

// Обновление должности
export const updatePosition = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
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
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const { id } = req.params;
    const { name, bonusPerShift, isActive } = req.body;

    const updateData: any = {
      name,
      isActive,
    };

    if (bonusPerShift !== undefined) {
      updateData.bonusPerShift = parseFloat(String(bonusPerShift)) || 0;
    }

    const position = await prisma.position.update({
      where: { id },
      data: updateData,
    });

    await logAction({
      userId: req.user.id,
      type: 'UPDATE',
      entityType: 'Position',
      entityId: position.id,
      description: `Updated position: ${position.name}`,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({ position });
  } catch (error) {
    next(error);
  }
};

// Удаление должности
export const deletePosition = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!['OWNER', 'ADMIN', 'MANAGER'].includes(req.user.role)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const { id } = req.params;

    // Проверяем, есть ли сотрудники с этой должностью
    const employeesCount = await prisma.restaurantUser.count({
      where: { positionId: id },
    });

    if (employeesCount > 0) {
      // Деактивируем вместо удаления
      const position = await prisma.position.update({
        where: { id },
        data: { isActive: false },
      });

      await logAction({
        userId: req.user.id,
        type: 'UPDATE',
        entityType: 'Position',
        entityId: id,
        description: `Deactivated position: ${position.name} (has ${employeesCount} employees)`,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });

      res.json({ 
        message: 'Position deactivated (has employees)',
        position,
      });
      return;
    }

    await prisma.position.delete({
      where: { id },
    });

    await logAction({
      userId: req.user.id,
      type: 'DELETE',
      entityType: 'Position',
      entityId: id,
      description: 'Deleted position',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({ message: 'Position deleted successfully' });
  } catch (error) {
    next(error);
  }
};

