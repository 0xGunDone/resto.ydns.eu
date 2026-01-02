import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import dbClient from '../utils/db';
import { logAction } from '../utils/actionLog';
import { AuthRequest } from '../middleware/auth';

// Создание обратной связи (может быть анонимной)
export const createFeedback = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    const { restaurantId, type, message, isAnonymous, email, phone } = req.body;
    const userId = !isAnonymous && req.user ? req.user.id : null;

    const feedback = await dbClient.feedback.create({
      data: {
        restaurantId,
        userId,
        type: type || 'COMPLAINT',
        message,
        isAnonymous: isAnonymous || false,
        email: email || null,
        phone: phone || null,
        status: 'PENDING',
      },
      include: {
        user: userId ? true : false,
        restaurant: true,
      },
    });

    if (!isAnonymous && req.user) {
      await logAction({
        userId: req.user.id,
        type: 'CREATE',
        entityType: 'Feedback',
        entityId: feedback.id,
        description: `Created feedback: ${feedback.type}`,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });
    }

    res.status(201).json({ feedback });
  } catch (error) {
    next(error);
  }
};

// Получение обратной связи
export const getFeedback = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { restaurantId, status, type } = req.query;

    const where: any = {};

    if (restaurantId) where.restaurantId = restaurantId as string;
    if (status) where.status = status as string;
    if (type) where.type = type as string;

    // Если сотрудник, показываем только свою обратную связь
    if (req.user.role === 'EMPLOYEE') {
      where.userId = req.user.id;
    }

    const feedback = await dbClient.feedback.findMany({
      where,
      include: {
        user: true,
        restaurant: true,
        attachments: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    res.json({ feedback });
  } catch (error) {
    next(error);
  }
};

// Обновление статуса обратной связи
export const updateFeedbackStatus = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
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
    const { status, response } = req.body;

    const feedback = await dbClient.feedback.update({
      where: { id },
      data: {
        status,
        response: response || null,
      },
      include: {
        user: true,
      },
    });

    await logAction({
      userId: req.user.id,
      type: 'UPDATE',
      entityType: 'Feedback',
      entityId: feedback.id,
      description: `Updated feedback status to ${status}`,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({ feedback });
  } catch (error) {
    next(error);
  }
};

// Загрузка вложения для обратной связи
export const uploadAttachment = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    const { feedbackId } = req.params;

    const attachment = await dbClient.feedbackAttachment.create({
      data: {
        feedbackId,
        fileName: req.file.originalname,
        filePath: req.file.path,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
      },
    });

    res.status(201).json({ attachment });
  } catch (error) {
    next(error);
  }
};

