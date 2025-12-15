import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import prisma from '../utils/prisma';
import { logAction } from '../utils/actionLog';
import { AuthRequest } from '../middleware/auth';

// Получение всех ресторанов
export const getRestaurants = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    let restaurants;

    if (req.user.role === 'OWNER' || req.user.role === 'ADMIN') {
      restaurants = await prisma.restaurant.findMany({
        where: { isActive: true },
        include: {
          manager: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
        orderBy: { name: 'asc' },
      });
    } else if (req.user.role === 'MANAGER') {
      restaurants = await prisma.restaurant.findMany({
        where: {
          managerId: req.user.id,
          isActive: true,
        },
        include: {
          manager: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
        orderBy: { name: 'asc' },
      });
    } else {
      // Для EMPLOYEE возвращаем только рестораны, где пользователь является активным сотрудником
      // VIEW_RESTAURANTS позволяет только видеть список, но не дает доступа к ресторану
      // Доступ к ресторану возможен только если пользователь является сотрудником (RestaurantUser)
      restaurants = await prisma.restaurant.findMany({
        where: {
          isActive: true,
          employees: {
            some: {
              userId: req.user.id,
              isActive: true,
            },
          },
        },
        include: {
          manager: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
        orderBy: { name: 'asc' },
      });
    }

    res.json({ restaurants });
  } catch (error) {
    next(error);
  }
};

// Создание ресторана
export const createRestaurant = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
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

    if (req.user.role !== 'OWNER' && req.user.role !== 'ADMIN') {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const { name, address, phone, email, managerId } = req.body;

    const restaurant = await prisma.restaurant.create({
      data: {
        name,
        address: address || null,
        phone: phone || null,
        email: email || null,
        managerId: managerId || null,
        isActive: true,
      },
      include: {
        manager: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    await logAction({
      userId: req.user.id,
      type: 'CREATE',
      entityType: 'Restaurant',
      entityId: restaurant.id,
      description: `Created restaurant: ${restaurant.name}`,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.status(201).json({ restaurant });
  } catch (error) {
    next(error);
  }
};

// Обновление ресторана
export const updateRestaurant = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
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

    if (req.user.role !== 'OWNER' && req.user.role !== 'ADMIN') {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const { id } = req.params;
    const { name, address, phone, email, managerId, isActive } = req.body;

    // Подготавливаем данные для обновления
    const updateData: any = {
      name,
      isActive,
    };

    // Обрабатываем опциональные поля
    if (address !== undefined) updateData.address = address || null;
    if (phone !== undefined) updateData.phone = phone || null;
    if (email !== undefined) updateData.email = email || null;

    // Проверяем и обрабатываем managerId
    if (managerId !== undefined) {
      if (managerId && managerId.trim() !== '') {
        // Проверяем, что менеджер существует
        const manager = await prisma.user.findUnique({
          where: { id: managerId },
          select: { id: true },
        });
        if (!manager) {
          res.status(400).json({ error: 'Менеджер не найден' });
          return;
        }
        updateData.managerId = managerId;
      } else {
        // Пустая строка или null - убираем менеджера
        updateData.managerId = null;
      }
    }

    const restaurant = await prisma.restaurant.update({
      where: { id },
      data: updateData,
      include: {
        manager: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    await logAction({
      userId: req.user.id,
      type: 'UPDATE',
      entityType: 'Restaurant',
      entityId: restaurant.id,
      description: `Updated restaurant: ${restaurant.name}`,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({ restaurant });
  } catch (error) {
    next(error);
  }
};

// Удаление ресторана со всеми связанными данными
export const deleteRestaurant = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (req.user.role !== 'OWNER' && req.user.role !== 'ADMIN') {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const { id } = req.params;

    const existing = await prisma.restaurant.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: 'Restaurant not found' });
      return;
    }

    // Благодаря onDelete: Cascade в схеме Prisma связанные сущности удалятся автоматически
    await prisma.restaurant.delete({
      where: { id },
    });

    await logAction({
      userId: req.user.id,
      type: 'DELETE',
      entityType: 'Restaurant',
      entityId: id,
      description: `Deleted restaurant: ${existing.name}`,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({ success: true, message: 'Ресторан и связанные данные удалены' });
  } catch (error) {
    next(error);
  }
};

// Получение сотрудников ресторана (сгруппированных по отделам и должностям)
export const getRestaurantEmployees = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { restaurantId } = req.params;

    const employees = await prisma.restaurantUser.findMany({
      where: {
        restaurantId,
        isActive: true,
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
          },
        },
        position: {
          select: {
            id: true,
            name: true,
          },
        },
        department: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: [
        { position: { name: 'asc' } },
        { department: { name: 'asc' } },
        { user: { lastName: 'asc' } },
      ],
    });

    // Группируем по отделам, затем по должностям
    const grouped: Record<string, Record<string, any[]>> = {};

    employees.forEach((emp) => {
      const deptName = emp.department?.name || 'Без отдела';
      const posName = emp.position?.name || 'Без должности';

      if (!grouped[deptName]) {
        grouped[deptName] = {};
      }
      if (!grouped[deptName][posName]) {
        grouped[deptName][posName] = [];
      }

      grouped[deptName][posName].push({
        id: emp.user.id,
        firstName: emp.user.firstName,
        lastName: emp.user.lastName,
        phone: emp.user.phone,
        positionId: emp.positionId,
        positionName: emp.position?.name,
        departmentId: emp.departmentId,
        departmentName: emp.department?.name,
      });
    });

    res.json({
      employees: grouped,
      allEmployees: employees.map((e) => ({
        id: e.user.id,
        firstName: e.user.firstName,
        lastName: e.user.lastName,
        phone: e.user.phone,
        positionId: e.positionId,
        positionName: e.position?.name,
        departmentId: e.departmentId,
        departmentName: e.department?.name,
      })),
    });
  } catch (error) {
    next(error);
  }
};

// Получение сотрудников ресторана для выбора менеджера
export const getRestaurantUsersForManager = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (req.user.role !== 'OWNER' && req.user.role !== 'ADMIN') {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const { restaurantId } = req.params;

    // Получаем всех сотрудников ресторана
    const restaurantUsers = await prisma.restaurantUser.findMany({
      where: {
        restaurantId,
        isActive: true,
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            role: true,
          },
        },
      },
    });

    // Также добавляем существующих менеджеров и админов
    const managers = await prisma.user.findMany({
      where: {
        isActive: true,
        role: {
          in: ['MANAGER', 'ADMIN'],
        },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
      },
    });

    // Объединяем и убираем дубликаты
    const allUsers = new Map();
    
    // Сначала добавляем сотрудников ресторана
    restaurantUsers.forEach((ru) => {
      allUsers.set(ru.user.id, {
        id: ru.user.id,
        firstName: ru.user.firstName,
        lastName: ru.user.lastName,
        phone: ru.user.phone,
        role: ru.user.role,
      });
    });

    // Затем добавляем менеджеров и админов
    managers.forEach((m) => {
      allUsers.set(m.id, m);
    });

    res.json({ users: Array.from(allUsers.values()) });
  } catch (error) {
    next(error);
  }
};
