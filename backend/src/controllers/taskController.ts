/**
 * Task Controller
 * HTTP request handling for task operations
 * 
 * Requirements: 4.1, 4.2, 10.2
 */

import { Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import { AuthRequest } from '../middleware/auth';
import { logAction } from '../utils/actionLog';
import { logger } from '../services/loggerService';
import {
  getTaskService,
  CreateTaskData,
  UpdateTaskData,
} from '../services/taskService';
import dbClient from '../utils/db';
import fs from 'fs/promises';

const taskService = getTaskService();

/**
 * Get tasks with filters
 * Uses Task Service for permission-based filtering
 */
export const getTasks = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { restaurantId, status, category, assignedToId, createdById, search } = req.query;

    const tasks = await taskService.getTasks(req.user.id, req.user.role, {
      restaurantId: restaurantId as string | undefined,
      status: status as string | undefined,
      category: category as string | undefined,
      assignedToId: assignedToId as string | undefined,
      createdById: createdById as string | undefined,
      search: search as string | undefined,
    });

    res.json({ tasks });
  } catch (error) {
    next(error);
  }
};

/**
 * Get a single task by ID
 */
export const getTask = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { id } = req.params;

    const result = await taskService.getTaskById(id, req.user.id, req.user.role);

    if (result.error) {
      res.status(result.statusCode || 500).json({ error: result.error });
      return;
    }

    res.json({ task: result.task });
  } catch (error) {
    next(error);
  }
};

/**
 * Create a new task
 */
export const createTask = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn('createTask validation errors', { errors: errors.array() });
      res.status(400).json({ errors: errors.array() });
      return;
    }

    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { restaurantId, assignedToId, title, description, category, status, dueDate, isRecurring, recurringRule } = req.body;

    const taskData: CreateTaskData = {
      restaurantId,
      createdById: req.user.id,
      title,
      description: description || null,
      category: category || 'ADMIN',
      status: status || 'NEW',
      assignedToId: assignedToId || null,
      dueDate: dueDate ? new Date(dueDate) : null,
      isRecurring: isRecurring || false,
      recurringRule: recurringRule || null,
    };

    const task = await taskService.createTask(taskData);

    await logAction({
      userId: req.user.id,
      type: 'CREATE',
      entityType: 'Task',
      entityId: task.id,
      description: `Created task: ${task.title}`,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    // Create notification if task is assigned to someone else
    if (task.assignedToId && task.assignedToId !== req.user.id) {
      const { notifyTaskAssigned } = await import('../utils/notifications');
      const creatorName = task.createdBy 
        ? `${task.createdBy.firstName} ${task.createdBy.lastName}`
        : 'Unknown';
      await notifyTaskAssigned(
        task.assignedToId,
        task.id,
        task.title,
        creatorName
      );
    }

    res.status(201).json({ task });
  } catch (error) {
    logger.error('createTask error', { error: (error as Error).message });
    next(error);
  }
};

/**
 * Update an existing task
 */
export const updateTask = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn('updateTask validation errors', { errors: errors.array(), body: req.body });
      res.status(400).json({ errors: errors.array() });
      return;
    }

    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { id } = req.params;

    // Get existing task to check permissions
    const existingResult = await taskService.getTaskById(id, req.user.id, req.user.role);
    
    if (existingResult.error) {
      res.status(existingResult.statusCode || 500).json({ error: existingResult.error });
      return;
    }

    const existingTask = existingResult.task!;

    // Check edit permission
    if (!taskService.canEditTask(existingTask, req.user.id, req.user.role)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const { assignedToId, title, description, category, status, dueDate, isRecurring, recurringRule } = req.body;

    const updateData: UpdateTaskData = {};
    if (assignedToId !== undefined) updateData.assignedToId = assignedToId;
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (category !== undefined) updateData.category = category;
    if (status !== undefined) updateData.status = status;
    if (dueDate !== undefined) updateData.dueDate = dueDate ? new Date(dueDate) : null;
    if (isRecurring !== undefined) updateData.isRecurring = isRecurring;
    if (recurringRule !== undefined) updateData.recurringRule = recurringRule;

    const task = await taskService.updateTask(id, updateData);

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

/**
 * Delete a task
 */
export const deleteTask = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { id } = req.params;

    // Get existing task to check permissions
    const existingResult = await taskService.getTaskById(id, req.user.id, req.user.role);
    
    if (existingResult.error) {
      res.status(existingResult.statusCode || 500).json({ error: existingResult.error });
      return;
    }

    const existingTask = existingResult.task!;

    // Check delete permission
    if (!taskService.canDeleteTask(existingTask, req.user.id, req.user.role)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    // Get attachments to delete files
    const attachments = await dbClient.taskAttachment.findMany({
      where: { taskId: id },
    });

    for (const attachment of attachments) {
      try {
        await fs.unlink(attachment.filePath);
      } catch (error) {
        logger.warn('Error deleting attachment file', { 
          attachmentId: attachment.id, 
          error: (error as Error).message 
        });
      }
    }

    await taskService.deleteTask(id);

    await logAction({
      userId: req.user.id,
      type: 'DELETE',
      entityType: 'Task',
      entityId: id,
      description: `Deleted task: ${existingTask.title}`,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({ message: 'Task deleted successfully' });
  } catch (error) {
    next(error);
  }
};

/**
 * Upload attachment for a task
 */
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

    const task = await dbClient.task.findUnique({
      where: { id: taskId },
    });

    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    const attachment = await dbClient.taskAttachment.create({
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

/**
 * Delete an attachment
 */
export const deleteAttachment = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { attachmentId } = req.params;

    const attachment = await dbClient.taskAttachment.findUnique({
      where: { id: attachmentId },
      include: {
        task: true,
      },
    });

    if (!attachment) {
      res.status(404).json({ error: 'Attachment not found' });
      return;
    }

    // Check permissions using task service
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
      logger.warn('Error deleting attachment file', { 
        attachmentId, 
        error: (error as Error).message 
      });
    }

    await dbClient.taskAttachment.delete({
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
