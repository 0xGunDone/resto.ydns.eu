import { Response, NextFunction } from 'express';
import prisma from '../utils/prisma';
import { AuthRequest } from '../middleware/auth';

// Получение настроек уведомлений
export const getSettings = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    let settings = await prisma.notificationSettings.findUnique({
      where: { userId: req.user.id },
    });

    // Если настроек нет, создаем с дефолтными значениями
    if (!settings) {
      settings = await prisma.notificationSettings.create({
        data: {
          userId: req.user.id,
        },
      });
    }

    res.json({ settings });
  } catch (error) {
    next(error);
  }
};

// Обновление настроек уведомлений
export const updateSettings = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const {
      enablePushNotifications,
      enableTaskNotifications,
      enableShiftNotifications,
      enableSwapNotifications,
      enableTimesheetNotifications,
      enableInAppNotifications,
    } = req.body;

    // Проверяем существование настроек
    let settings = await prisma.notificationSettings.findUnique({
      where: { userId: req.user.id },
    });

    if (!settings) {
      // Создаем новые настройки
      settings = await prisma.notificationSettings.create({
        data: {
          userId: req.user.id,
          enablePushNotifications: enablePushNotifications !== undefined ? enablePushNotifications : true,
          enableTaskNotifications: enableTaskNotifications !== undefined ? enableTaskNotifications : true,
          enableShiftNotifications: enableShiftNotifications !== undefined ? enableShiftNotifications : true,
          enableSwapNotifications: enableSwapNotifications !== undefined ? enableSwapNotifications : true,
          enableTimesheetNotifications: enableTimesheetNotifications !== undefined ? enableTimesheetNotifications : true,
          enableInAppNotifications: enableInAppNotifications !== undefined ? enableInAppNotifications : true,
        },
      });
    } else {
      // Обновляем существующие настройки
      const updateData: any = {};
      if (enablePushNotifications !== undefined) updateData.enablePushNotifications = enablePushNotifications;
      if (enableTaskNotifications !== undefined) updateData.enableTaskNotifications = enableTaskNotifications;
      if (enableShiftNotifications !== undefined) updateData.enableShiftNotifications = enableShiftNotifications;
      if (enableSwapNotifications !== undefined) updateData.enableSwapNotifications = enableSwapNotifications;
      if (enableTimesheetNotifications !== undefined) updateData.enableTimesheetNotifications = enableTimesheetNotifications;
      if (enableInAppNotifications !== undefined) updateData.enableInAppNotifications = enableInAppNotifications;

      settings = await prisma.notificationSettings.update({
        where: { userId: req.user.id },
        data: updateData,
      });
    }

    res.json({ settings });
  } catch (error) {
    next(error);
  }
};

