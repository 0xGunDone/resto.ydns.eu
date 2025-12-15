import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import prisma from '../utils/prisma';
import { logAction } from '../utils/actionLog';
import { AuthRequest } from '../middleware/auth';

// Получение отделов ресторана
export const getDepartments = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { restaurantId } = req.params;

    const departments = await prisma.department.findMany({
      where: {
        restaurantId,
        isActive: true,
      },
      orderBy: { name: 'asc' },
    });

    res.json({ departments });
  } catch (error) {
    next(error);
  }
};

// Создание отдела
export const createDepartment = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
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
    const { name } = req.body;

    const department = await prisma.department.create({
      data: {
        restaurantId,
        name,
        isActive: true,
      },
    });

    await logAction({
      userId: req.user.id,
      type: 'CREATE',
      entityType: 'Department',
      entityId: department.id,
      description: `Created department: ${department.name}`,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.status(201).json({ department });
  } catch (error) {
    next(error);
  }
};

// Обновление отдела
export const updateDepartment = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
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
    const { name, isActive } = req.body;

    const department = await prisma.department.update({
      where: { id },
      data: {
        name,
        isActive,
      },
    });

    await logAction({
      userId: req.user.id,
      type: 'UPDATE',
      entityType: 'Department',
      entityId: department.id,
      description: `Updated department: ${department.name}`,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({ department });
  } catch (error) {
    next(error);
  }
};

// Удаление отдела
export const deleteDepartment = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
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

    // Проверяем, есть ли сотрудники в отделе
    const employeesCount = await prisma.restaurantUser.count({
      where: { departmentId: id },
    });

    if (employeesCount > 0) {
      // Деактивируем вместо удаления
      const department = await prisma.department.update({
        where: { id },
        data: { isActive: false },
      });

      await logAction({
        userId: req.user.id,
        type: 'UPDATE',
        entityType: 'Department',
        entityId: id,
        description: `Deactivated department: ${department.name} (has ${employeesCount} employees)`,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });

      res.json({ 
        message: 'Department deactivated (has employees)',
        department,
      });
      return;
    }

    await prisma.department.delete({
      where: { id },
    });

    await logAction({
      userId: req.user.id,
      type: 'DELETE',
      entityType: 'Department',
      entityId: id,
      description: 'Deleted department',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({ message: 'Department deleted successfully' });
  } catch (error) {
    next(error);
  }
};

