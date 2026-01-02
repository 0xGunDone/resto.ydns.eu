/**
 * Task Service
 * Business logic for task management
 * 
 * Requirements: 4.2, 4.3, 4.4, 4.5, 10.2
 */

import { logger } from './loggerService';
import {
  getPermissionService,
  IPermissionService,
  PERMISSIONS,
} from './permissionService';
import { Task, TaskWithRelations, User } from '../database/types';

/**
 * Task filter options
 */
export interface TaskFilterOptions {
  restaurantId?: string;
  status?: string;
  category?: string;
  assignedToId?: string;
  createdById?: string;
  search?: string;
}

/**
 * Task creation data
 */
export interface CreateTaskData {
  restaurantId: string;
  createdById: string;
  title: string;
  description?: string | null;
  category?: string;
  status?: string;
  assignedToId?: string | null;
  dueDate?: Date | null;
  isRecurring?: boolean;
  recurringRule?: string | null;
}

/**
 * Task update data
 */
export interface UpdateTaskData {
  title?: string;
  description?: string | null;
  category?: string;
  status?: string;
  assignedToId?: string | null;
  dueDate?: Date | null;
  isRecurring?: boolean;
  recurringRule?: string | null;
}

/**
 * Task permission check result
 */
export interface TaskPermissionResult {
  canView: boolean;
  canViewAll: boolean;
  canViewOwn: boolean;
  canEdit: boolean;
}

/**
 * Database interface for Task Service
 */
export interface TaskServiceDatabase {
  findTasks(where: Record<string, unknown>, include?: Record<string, boolean>): Promise<TaskWithRelations[]>;
  findTaskById(id: string, include?: Record<string, boolean>): Promise<TaskWithRelations | null>;
  createTask(data: CreateTaskData): Promise<TaskWithRelations>;
  updateTask(id: string, data: UpdateTaskData): Promise<TaskWithRelations>;
  deleteTask(id: string): Promise<void>;
  findTaskAttachments(taskId: string): Promise<Array<{ id: string; filePath: string }>>;
  deleteTaskAttachment(id: string): Promise<void>;
}

/**
 * Task Service Interface
 */
export interface ITaskService {
  /**
   * Get tasks with permission-based filtering
   * Requirements: 4.4, 4.5
   */
  getTasks(
    userId: string,
    userRole: string,
    filters: TaskFilterOptions
  ): Promise<TaskWithRelations[]>;

  /**
   * Get a single task by ID with permission check
   */
  getTaskById(
    taskId: string,
    userId: string,
    userRole: string
  ): Promise<{ task: TaskWithRelations | null; error?: string; statusCode?: number }>;

  /**
   * Check user's task permissions for a restaurant
   * Requirements: 4.4, 4.5
   */
  checkTaskPermissions(
    userId: string,
    userRole: string,
    restaurantId: string
  ): Promise<TaskPermissionResult>;

  /**
   * Check if user can edit a specific task
   */
  canEditTask(
    task: TaskWithRelations,
    userId: string,
    userRole: string
  ): boolean;

  /**
   * Check if user can delete a specific task
   */
  canDeleteTask(
    task: TaskWithRelations,
    userId: string,
    userRole: string
  ): boolean;

  /**
   * Filter tasks based on VIEW_OWN vs VIEW_ALL permissions
   * Requirements: 4.4, 4.5
   */
  filterTasksByPermission(
    tasks: TaskWithRelations[],
    userId: string,
    canViewAll: boolean
  ): TaskWithRelations[];

  /**
   * Create a new task
   */
  createTask(data: CreateTaskData): Promise<TaskWithRelations>;

  /**
   * Update an existing task
   */
  updateTask(id: string, data: UpdateTaskData): Promise<TaskWithRelations>;

  /**
   * Delete a task and its attachments
   */
  deleteTask(id: string): Promise<void>;
}

/**
 * Create a Task Service instance
 */
export function createTaskService(
  db: TaskServiceDatabase,
  permissionService?: IPermissionService
): ITaskService {
  const permissions = permissionService || getPermissionService();

  /**
   * Check user's task permissions for a restaurant
   * Requirements: 4.4, 4.5
   */
  async function checkTaskPermissions(
    userId: string,
    userRole: string,
    restaurantId: string
  ): Promise<TaskPermissionResult> {
    // OWNER/ADMIN have all permissions
    if (userRole === 'OWNER' || userRole === 'ADMIN') {
      return {
        canView: true,
        canViewAll: true,
        canViewOwn: true,
        canEdit: true,
      };
    }

    const [viewAllResult, viewOwnResult, editResult] = await Promise.all([
      permissions.checkPermission({ userId, restaurantId }, PERMISSIONS.VIEW_ALL_TASKS),
      permissions.checkPermission({ userId, restaurantId }, PERMISSIONS.VIEW_OWN_TASKS),
      permissions.checkPermission({ userId, restaurantId }, PERMISSIONS.EDIT_TASKS),
    ]);

    return {
      canView: viewAllResult.allowed || viewOwnResult.allowed,
      canViewAll: viewAllResult.allowed,
      canViewOwn: viewOwnResult.allowed,
      canEdit: editResult.allowed,
    };
  }

  /**
   * Filter tasks based on VIEW_OWN vs VIEW_ALL permissions
   * Requirements: 4.4, 4.5
   * 
   * For users with VIEW_OWN_TASKS but not VIEW_ALL_TASKS:
   * - Only return tasks where assignedToId === userId OR createdById === userId
   * 
   * For users with VIEW_ALL_TASKS:
   * - Return all tasks in the restaurant
   */
  function filterTasksByPermission(
    tasks: TaskWithRelations[],
    userId: string,
    canViewAll: boolean
  ): TaskWithRelations[] {
    if (canViewAll) {
      return tasks;
    }

    // VIEW_OWN: only tasks assigned to or created by the user
    return tasks.filter(
      task => task.assignedToId === userId || task.createdById === userId
    );
  }

  /**
   * Check if user can edit a specific task
   */
  function canEditTask(
    task: TaskWithRelations,
    userId: string,
    userRole: string
  ): boolean {
    // OWNER, ADMIN, MANAGER can edit any task
    if (['OWNER', 'ADMIN', 'MANAGER'].includes(userRole)) {
      return true;
    }

    // Creator or assignee can edit
    return task.createdById === userId || task.assignedToId === userId;
  }

  /**
   * Check if user can delete a specific task
   */
  function canDeleteTask(
    task: TaskWithRelations,
    userId: string,
    userRole: string
  ): boolean {
    // OWNER, ADMIN, MANAGER can delete any task
    if (['OWNER', 'ADMIN', 'MANAGER'].includes(userRole)) {
      return true;
    }

    // Only creator can delete
    return task.createdById === userId;
  }

  /**
   * Get tasks with permission-based filtering
   * Requirements: 4.4, 4.5
   */
  async function getTasks(
    userId: string,
    userRole: string,
    filters: TaskFilterOptions
  ): Promise<TaskWithRelations[]> {
    const { restaurantId, status, category, assignedToId, createdById, search } = filters;

    logger.debug('Getting tasks', {
      userId,
      restaurantId,
      action: 'getTasks',
    });

    // Build where clause
    const where: Record<string, unknown> = {};

    if (restaurantId) {
      where.restaurantId = restaurantId;
    }

    if (status) {
      where.status = status;
    }

    if (category) {
      where.category = category;
    }

    if (assignedToId) {
      where.assignedToId = assignedToId;
    }

    if (createdById) {
      where.createdById = createdById;
    }

    // Check permissions if restaurantId is provided
    let taskPermissions: TaskPermissionResult | null = null;
    if (restaurantId) {
      taskPermissions = await checkTaskPermissions(userId, userRole, restaurantId);

      // If no view permissions at all, return empty array
      if (!taskPermissions.canView) {
        logger.debug('No task view permissions', {
          userId,
          restaurantId,
          action: 'getTasks:denied',
        });
        return [];
      }

      // If only VIEW_OWN, add filter for user's tasks
      if (!taskPermissions.canViewAll && taskPermissions.canViewOwn) {
        where.OR = [
          { assignedToId: userId },
          { createdById: userId },
        ];
      }
    }

    // Add search filter
    if (search) {
      const searchConditions = [
        { title: { contains: search } },
        { description: { contains: search } },
      ];

      if (where.OR) {
        // Combine with permission filter using AND
        where.AND = [
          { OR: where.OR },
          { OR: searchConditions },
        ];
        delete where.OR;
      } else {
        where.OR = searchConditions;
      }
    }

    // Fetch tasks from database
    const tasks = await db.findTasks(where, {
      createdBy: true,
      assignedTo: true,
      attachments: true,
      restaurant: true,
    });

    logger.debug('Tasks retrieved', {
      userId,
      restaurantId,
      count: tasks.length,
      action: 'getTasks:success',
    });

    return tasks;
  }

  /**
   * Get a single task by ID with permission check
   */
  async function getTaskById(
    taskId: string,
    userId: string,
    userRole: string
  ): Promise<{ task: TaskWithRelations | null; error?: string; statusCode?: number }> {
    const task = await db.findTaskById(taskId, {
      createdBy: true,
      assignedTo: true,
      attachments: true,
      restaurant: true,
    });

    if (!task) {
      return { task: null, error: 'Task not found', statusCode: 404 };
    }

    // Check permissions
    const taskPermissions = await checkTaskPermissions(userId, userRole, task.restaurantId);

    if (!taskPermissions.canView) {
      return { task: null, error: 'Forbidden: No permission to view tasks', statusCode: 403 };
    }

    // If only VIEW_OWN, check if task belongs to user
    if (!taskPermissions.canViewAll && taskPermissions.canViewOwn) {
      if (task.assignedToId !== userId && task.createdById !== userId) {
        return { task: null, error: 'Forbidden: Can only view own tasks', statusCode: 403 };
      }
    }

    return { task };
  }

  /**
   * Create a new task
   */
  async function createTask(data: CreateTaskData): Promise<TaskWithRelations> {
    logger.debug('Creating task', {
      userId: data.createdById,
      restaurantId: data.restaurantId,
      action: 'createTask',
    });

    const task = await db.createTask(data);

    logger.info('Task created', {
      userId: data.createdById,
      restaurantId: data.restaurantId,
      action: 'createTask:success',
    });

    return task;
  }

  /**
   * Update an existing task
   */
  async function updateTask(id: string, data: UpdateTaskData): Promise<TaskWithRelations> {
    logger.debug('Updating task', {
      action: 'updateTask',
    });

    // Handle status change to DONE
    const updateData: UpdateTaskData & { completedAt?: Date | null } = { ...data };
    if (data.status === 'DONE') {
      updateData.completedAt = new Date();
    } else if (data.status && data.status !== 'DONE') {
      updateData.completedAt = null;
    }

    const task = await db.updateTask(id, updateData);

    logger.info('Task updated', {
      action: 'updateTask:success',
    });

    return task;
  }

  /**
   * Delete a task and its attachments
   */
  async function deleteTask(id: string): Promise<void> {
    logger.debug('Deleting task', {
      action: 'deleteTask',
    });

    // Get attachments to delete files
    const attachments = await db.findTaskAttachments(id);

    // Delete the task (attachments should cascade)
    await db.deleteTask(id);

    logger.info('Task deleted', {
      action: 'deleteTask:success',
    });
  }

  return {
    getTasks,
    getTaskById,
    checkTaskPermissions,
    canEditTask,
    canDeleteTask,
    filterTasksByPermission,
    createTask,
    updateTask,
    deleteTask,
  };
}

/**
 * Create database adapter from dbClient
 */
export function createTaskDatabaseAdapter(dbClient: any): TaskServiceDatabase {
  return {
    async findTasks(where: Record<string, unknown>, include?: Record<string, boolean>): Promise<TaskWithRelations[]> {
      return dbClient.task.findMany({
        where,
        include,
        orderBy: { createdAt: 'desc' },
      });
    },

    async findTaskById(id: string, include?: Record<string, boolean>): Promise<TaskWithRelations | null> {
      return dbClient.task.findUnique({
        where: { id },
        include,
      });
    },

    async createTask(data: CreateTaskData): Promise<TaskWithRelations> {
      return dbClient.task.create({
        data: {
          restaurantId: data.restaurantId,
          createdById: data.createdById,
          title: data.title,
          description: data.description || null,
          category: data.category || 'ADMIN',
          status: data.status || 'NEW',
          assignedToId: data.assignedToId || null,
          dueDate: data.dueDate || null,
          isRecurring: data.isRecurring || false,
          recurringRule: data.recurringRule || null,
        },
        include: {
          createdBy: true,
          assignedTo: true,
          attachments: true,
        },
      });
    },

    async updateTask(id: string, data: UpdateTaskData): Promise<TaskWithRelations> {
      const updateData: Record<string, unknown> = {};
      
      if (data.title !== undefined) updateData.title = data.title;
      if (data.description !== undefined) updateData.description = data.description;
      if (data.category !== undefined) updateData.category = data.category;
      if (data.status !== undefined) updateData.status = data.status;
      if (data.assignedToId !== undefined) updateData.assignedToId = data.assignedToId;
      if (data.dueDate !== undefined) updateData.dueDate = data.dueDate;
      if (data.isRecurring !== undefined) updateData.isRecurring = data.isRecurring;
      if (data.recurringRule !== undefined) updateData.recurringRule = data.recurringRule;
      if ((data as any).completedAt !== undefined) updateData.completedAt = (data as any).completedAt;

      return dbClient.task.update({
        where: { id },
        data: updateData,
        include: {
          createdBy: true,
          assignedTo: true,
          attachments: true,
        },
      });
    },

    async deleteTask(id: string): Promise<void> {
      await dbClient.task.delete({ where: { id } });
    },

    async findTaskAttachments(taskId: string): Promise<Array<{ id: string; filePath: string }>> {
      return dbClient.taskAttachment.findMany({
        where: { taskId },
        select: { id: true, filePath: true },
      });
    },

    async deleteTaskAttachment(id: string): Promise<void> {
      await dbClient.taskAttachment.delete({ where: { id } });
    },
  };
}

// Default instance
let defaultTaskService: ITaskService | null = null;

/**
 * Get the default task service instance
 */
export function getTaskService(): ITaskService {
  if (!defaultTaskService) {
    const dbClient = require('../utils/db').default;
    const dbAdapter = createTaskDatabaseAdapter(dbClient);
    defaultTaskService = createTaskService(dbAdapter);
  }
  return defaultTaskService;
}

/**
 * Set a custom task service (useful for testing)
 */
export function setTaskService(service: ITaskService): void {
  defaultTaskService = service;
}

/**
 * Reset the task service to default (useful for testing)
 */
export function resetTaskService(): void {
  defaultTaskService = null;
}
