import { Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import dbClient from '../utils/db';
import { logAction } from '../utils/actionLog';
import { AuthRequest } from '../middleware/auth';
import { checkPermission } from '../utils/checkPermissions';
import { PERMISSIONS } from '../utils/permissions';

// Получение списка праздников/выходных
export const getHolidays = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { restaurantId, startDate, endDate } = req.query;

    if (!restaurantId) {
      res.status(400).json({ error: 'restaurantId обязателен' });
      return;
    }

    const where: any = {
      restaurantId: restaurantId as string,
    };

    // Фильтр по датам
    if (startDate || endDate) {
      where.date = {};
      if (startDate) {
        where.date.gte = new Date(startDate as string);
      }
      if (endDate) {
        const end = new Date(endDate as string);
        end.setHours(23, 59, 59, 999);
        where.date.lte = end;
      }
    }

    const holidays = await dbClient.holiday.findMany({
      where,
      orderBy: {
        date: 'asc',
      },
    });

    res.json({ holidays });
  } catch (error) {
    next(error);
  }
};

// Создание праздника/выходного
export const createHoliday = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
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

    const { restaurantId, name, date, type, isRecurring } = req.body;

    // Проверяем права доступа: OWNER, ADMIN или менеджер ресторана
    const isOwnerOrAdmin = ['OWNER', 'ADMIN'].includes(req.user.role);
    
    // Проверяем, является ли пользователь менеджером ресторана
    const restaurant = await dbClient.restaurant.findUnique({
      where: { id: restaurantId },
      select: { managerId: true },
    });
    const isRestaurantManager = restaurant?.managerId === req.user.id;

    if (!isOwnerOrAdmin && !isRestaurantManager) {
      res.status(403).json({ error: 'Недостаточно прав для создания праздников' });
      return;
    }

    // Нормализуем дату (убираем время, оставляем только день)
    const holidayDate = new Date(date);
    holidayDate.setHours(0, 0, 0, 0);

    // Проверяем, не существует ли уже праздник на эту дату
    const existing = await dbClient.holiday.findUnique({
      where: {
        restaurantId_date: {
          restaurantId,
          date: holidayDate,
        },
      },
    });

    if (existing) {
      res.status(400).json({ error: 'На эту дату уже установлен праздник или выходной' });
      return;
    }

    const holiday = await dbClient.holiday.create({
      data: {
        restaurantId,
        name,
        date: holidayDate,
        type: type || 'HOLIDAY',
        isRecurring: isRecurring || false,
      },
    });

    await logAction({
      userId: req.user.id,
      type: 'CREATE',
      entityType: 'Holiday',
      entityId: holiday.id,
      description: `Создан праздник/выходной: ${name}`,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.status(201).json({ holiday });
  } catch (error: any) {
    if (error.code === 'P2002') {
      res.status(400).json({ error: 'На эту дату уже установлен праздник или выходной' });
      return;
    }
    next(error);
  }
};

// Обновление праздника/выходного
export const updateHoliday = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
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
    const { name, date, type, isRecurring } = req.body;

    // Получаем праздник
    const holiday = await dbClient.holiday.findUnique({
      where: { id },
      include: {
        restaurant: {
          select: {
            managerId: true,
          },
        },
      },
    });

    if (!holiday) {
      res.status(404).json({ error: 'Праздник не найден' });
      return;
    }

    // Проверяем права доступа
    const isOwnerOrAdmin = ['OWNER', 'ADMIN'].includes(req.user.role);
    const isRestaurantManager = holiday.restaurant.managerId === req.user.id;

    if (!isOwnerOrAdmin && !isRestaurantManager) {
      res.status(403).json({ error: 'Недостаточно прав для редактирования праздника' });
      return;
    }

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (type !== undefined) updateData.type = type;
    if (isRecurring !== undefined) updateData.isRecurring = isRecurring;
    
    if (date !== undefined) {
      const holidayDate = new Date(date);
      holidayDate.setHours(0, 0, 0, 0);
      updateData.date = holidayDate;

      // Проверяем, не существует ли уже праздник на новую дату
      if (holidayDate.getTime() !== holiday.date.getTime()) {
        const existing = await dbClient.holiday.findUnique({
          where: {
            restaurantId_date: {
              restaurantId: holiday.restaurantId,
              date: holidayDate,
            },
          },
        });

        if (existing) {
          res.status(400).json({ error: 'На эту дату уже установлен праздник или выходной' });
          return;
        }
      }
    }

    const updatedHoliday = await dbClient.holiday.update({
      where: { id },
      data: updateData,
    });

    await logAction({
      userId: req.user.id,
      type: 'UPDATE',
      entityType: 'Holiday',
      entityId: id,
      description: `Обновлен праздник/выходной: ${updatedHoliday.name}`,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({ holiday: updatedHoliday });
  } catch (error: any) {
    if (error.code === 'P2002') {
      res.status(400).json({ error: 'На эту дату уже установлен праздник или выходной' });
      return;
    }
    next(error);
  }
};

// Удаление праздника/выходного
export const deleteHoliday = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { id } = req.params;

    // Получаем праздник
    const holiday = await dbClient.holiday.findUnique({
      where: { id },
      include: {
        restaurant: {
          select: {
            managerId: true,
          },
        },
      },
    });

    if (!holiday) {
      res.status(404).json({ error: 'Праздник не найден' });
      return;
    }

    // Проверяем права доступа
    const isOwnerOrAdmin = ['OWNER', 'ADMIN'].includes(req.user.role);
    const isRestaurantManager = holiday.restaurant.managerId === req.user.id;

    if (!isOwnerOrAdmin && !isRestaurantManager) {
      res.status(403).json({ error: 'Недостаточно прав для удаления праздника' });
      return;
    }

    await dbClient.holiday.delete({
      where: { id },
    });

    await logAction({
      userId: req.user.id,
      type: 'DELETE',
      entityType: 'Holiday',
      entityId: id,
      description: `Удален праздник/выходной: ${holiday.name}`,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({ message: 'Праздник удален успешно' });
  } catch (error) {
    next(error);
  }
};

