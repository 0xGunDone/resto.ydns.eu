import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import prisma from '../utils/prisma';
import { logAction } from '../utils/actionLog';
import { AuthRequest } from '../middleware/auth';
import fs from 'fs/promises';

// Получение списка задач с фильтрами
export const getTasks = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { restaurantId, status, category, assignedToId, createdById, search } = req.query;

    const where: any = {};

    if (restaurantId) {
      where.restaurantId = restaurantId as string;
    }

    if (status) {
      where.status = status as string;
    }

    if (category) {
      where.category = category as string;
    }

    if (assignedToId) {
      where.assignedToId = assignedToId as string;
    }

    if (createdById) {
      where.createdById = createdById as string;
    }

    // Проверяем права доступа для фильтрации задач
    let userTaskFilter: any[] = [];
    if (req.user.role !== 'OWNER' && req.user.role !== 'ADMIN') {
      const { checkPermission } = await import('../utils/checkPermissions');
      const { PERMISSIONS } = await import('../utils/permissions');
      
      if (restaurantId) {
        const hasViewAll = await checkPermission(req.user.id, restaurantId as string, PERMISSIONS.VIEW_ALL_TASKS);
        const hasViewOwn = await checkPermission(req.user.id, restaurantId as string, PERMISSIONS.VIEW_OWN_TASKS);
        
        // Если есть только VIEW_OWN, показываем только свои задачи
        if (!hasViewAll && hasViewOwn) {
          userTaskFilter = [
            { assignedToId: req.user.id },
            { createdById: req.user.id },
          ];
        } else if (!hasViewAll && !hasViewOwn) {
          // Нет прав вообще - возвращаем пустой список
          res.json({ tasks: [] });
          return;
        }
        // Если есть VIEW_ALL - показываем все задачи ресторана (фильтр не применяется)
      }
    }

    // Объединяем фильтры поиска и прав доступа
    const orConditions: any[] = [];
    
    if (search) {
      orConditions.push(
        { title: { contains: search as string } },
        { description: { contains: search as string } }
      );
    }

    // Если есть фильтр по правам доступа, объединяем с поиском
    if (userTaskFilter.length > 0) {
      if (orConditions.length > 0) {
        // Если есть и поиск, и фильтр по правам - используем AND с OR внутри
        where.AND = [
          {
            OR: userTaskFilter,
          },
          {
            OR: orConditions,
          },
        ];
      } else {
        // Только фильтр по правам
        where.OR = userTaskFilter;
      }
    } else if (orConditions.length > 0) {
      // Только поиск
      where.OR = orConditions;
    }

    const tasks = await prisma.task.findMany({
      where,
      include: {
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        assignedTo: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        attachments: true,
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

    res.json({ tasks });
  } catch (error) {
    next(error);
  }
};

// Получение задачи по ID
export const getTask = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { id } = req.params;

    const task = await prisma.task.findUnique({
      where: { id },
      include: {
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        assignedTo: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        attachments: true,
        restaurant: {
          select: {
            id: true,
            name: true,
          },
        },
        actionLogs: {
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
            createdAt: 'desc',
          },
          take: 20,
        },
      },
    });

    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    // Проверка прав доступа
    if (req.user.role !== 'OWNER' && req.user.role !== 'ADMIN') {
      const { checkPermission } = await import('../utils/checkPermissions');
      const { PERMISSIONS } = await import('../utils/permissions');
      
      const hasViewAll = await checkPermission(req.user.id, task.restaurantId, PERMISSIONS.VIEW_ALL_TASKS);
      const hasViewOwn = await checkPermission(req.user.id, task.restaurantId, PERMISSIONS.VIEW_OWN_TASKS);
      
      if (!hasViewAll && !hasViewOwn) {
        res.status(403).json({ error: 'Forbidden: No permission to view tasks' });
        return;
      }
      
      // Если есть только VIEW_OWN, проверяем что задача принадлежит пользователю
      if (!hasViewAll && hasViewOwn) {
        if (task.assignedToId !== req.user.id && task.createdById !== req.user.id) {
          res.status(403).json({ error: 'Forbidden: Can only view own tasks' });
          return;
        }
      }
    }

    res.json({ task });
  } catch (error) {
    next(error);
  }
};

// Создание задачи
export const createTask = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.error('updateTask validation errors:', errors.array());
      res.status(400).json({ errors: errors.array() });
      return;
    }

    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { restaurantId, assignedToId, title, description, category, status, dueDate, isRecurring, recurringRule } = req.body;

    const task = await prisma.task.create({
      data: {
        restaurantId,
        createdById: req.user.id,
        assignedToId: assignedToId || null,
        title,
        description: description || null,
        category: category || 'ADMIN',
        status: status || 'NEW',
        dueDate: dueDate ? new Date(dueDate) : null,
        isRecurring: isRecurring || false,
        recurringRule: recurringRule || null,
      },
      include: {
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        assignedTo: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        attachments: true,
      },
    });

    await logAction({
      userId: req.user.id,
      type: 'CREATE',
      entityType: 'Task',
      entityId: task.id,
      description: `Created task: ${task.title}`,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    // Создаем уведомление, если задача назначена на кого-то
    if (task.assignedToId && task.assignedToId !== req.user.id) {
      const { notifyTaskAssigned } = await import('../utils/notifications');
      const creatorName = `${task.createdBy.firstName} ${task.createdBy.lastName}`;
      await notifyTaskAssigned(
        task.assignedToId,
        task.id,
        task.title,
        creatorName
      );
    }

    res.status(201).json({ task });
  } catch (error) {
    console.error('updateTask error:', error);
    next(error);
  }
};

// Обновление задачи
export const updateTask = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.error('updateTask validation errors:', errors.array(), 'body:', req.body);
      res.status(400).json({ errors: errors.array() });
      return;
    }

    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { id } = req.params;
    const { assignedToId, title, description, category, status, dueDate, isRecurring, recurringRule } = req.body;

    const existingTask = await prisma.task.findUnique({
      where: { id },
    });

    if (!existingTask) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    // Проверка прав: только создатель, назначенный или менеджер могут редактировать
    const canEdit =
      existingTask.createdById === req.user.id ||
      existingTask.assignedToId === req.user.id ||
      ['OWNER', 'ADMIN', 'MANAGER'].includes(req.user.role);

    if (!canEdit) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const updateData: any = {};
    if (assignedToId !== undefined) updateData.assignedToId = assignedToId;
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (category !== undefined) updateData.category = category;
    if (status !== undefined) {
      updateData.status = status;
      if (status === 'DONE' && existingTask.status !== 'DONE') {
        updateData.completedAt = new Date();
      } else if (status !== 'DONE') {
        updateData.completedAt = null;
      }
    }
    if (dueDate !== undefined) updateData.dueDate = dueDate ? new Date(dueDate) : null;
    if (isRecurring !== undefined) updateData.isRecurring = isRecurring;
    if (recurringRule !== undefined) updateData.recurringRule = recurringRule;

    const task = await prisma.task.update({
      where: { id },
      data: updateData,
      include: {
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        assignedTo: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        attachments: true,
      },
    });

    await logAction({
      userId: req.user.id,
      type: 'UPDATE',
      entityType: 'Task',
      entityId: task.id,
      description: `Updated task: ${task.title}`,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({ task });
  } catch (error) {
    next(error);
  }
};

// Удаление задачи
export const deleteTask = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { id } = req.params;

    const task = await prisma.task.findUnique({
      where: { id },
    });

    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    // Только создатель или менеджер может удалить
    const canDelete = task.createdById === req.user.id || ['OWNER', 'ADMIN', 'MANAGER'].includes(req.user.role);

    if (!canDelete) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    // Удаляем вложения
    const attachments = await prisma.taskAttachment.findMany({
      where: { taskId: id },
    });

    for (const attachment of attachments) {
      try {
        await fs.unlink(attachment.filePath);
      } catch (error) {
        console.error('Error deleting file:', error);
      }
    }

    await prisma.task.delete({
      where: { id },
    });

    await logAction({
      userId: req.user.id,
      type: 'DELETE',
      entityType: 'Task',
      entityId: id,
      description: `Deleted task: ${task.title}`,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({ message: 'Task deleted successfully' });
  } catch (error) {
    next(error);
  }
};

// Загрузка файла для задачи
export const uploadAttachment = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { taskId } = req.params;

    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    const task = await prisma.task.findUnique({
      where: { id: taskId },
    });

    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    const attachment = await prisma.taskAttachment.create({
      data: {
        taskId,
        fileName: req.file.originalname,
        filePath: req.file.path,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
      },
    });

    await logAction({
      userId: req.user.id,
      type: 'CREATE',
      entityType: 'TaskAttachment',
      entityId: attachment.id,
      description: `Uploaded attachment to task: ${task.title}`,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.status(201).json({ attachment });
  } catch (error) {
    next(error);
  }
};

// Удаление вложения
export const deleteAttachment = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { attachmentId } = req.params;

    const attachment = await prisma.taskAttachment.findUnique({
      where: { id: attachmentId },
      include: {
        task: true,
      },
    });

    if (!attachment) {
      res.status(404).json({ error: 'Attachment not found' });
      return;
    }

    // Проверка прав
    const canDelete =
      attachment.task.createdById === req.user.id ||
      attachment.task.assignedToId === req.user.id ||
      ['OWNER', 'ADMIN', 'MANAGER'].includes(req.user.role);

    if (!canDelete) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    try {
      await fs.unlink(attachment.filePath);
    } catch (error) {
      console.error('Error deleting file:', error);
    }

    await prisma.taskAttachment.delete({
      where: { id: attachmentId },
    });

    await logAction({
      userId: req.user.id,
      type: 'DELETE',
      entityType: 'TaskAttachment',
      entityId: attachmentId,
      description: `Deleted attachment from task: ${attachment.task.title}`,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({ message: 'Attachment deleted successfully' });
  } catch (error) {
    next(error);
  }
};

// Получение QR-кода задачи

