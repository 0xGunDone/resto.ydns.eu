/**
 * Property-Based Tests for Task Service
 * Tests for Property 9 from the design document
 * 
 * **Feature: project-refactoring, Property 9: VIEW_OWN vs VIEW_ALL Permission Filtering**
 * **Validates: Requirements 4.4, 4.5**
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import {
  createTaskService,
  TaskServiceDatabase,
  ITaskService,
  TaskFilterOptions,
} from '../../src/services/taskService';
import {
  createPermissionService,
  PermissionServiceDatabase,
  IPermissionService,
  PERMISSIONS,
} from '../../src/services/permissionService';
import { TaskWithRelations } from '../../src/database/types';

/**
 * Create a mock task with relations
 */
function createMockTask(overrides: Partial<TaskWithRelations> = {}): TaskWithRelations {
  const id = overrides.id || fc.sample(fc.uuid(), 1)[0];
  return {
    id,
    restaurantId: overrides.restaurantId || fc.sample(fc.uuid(), 1)[0],
    title: overrides.title || 'Test Task',
    description: overrides.description || null,
    status: overrides.status || 'PENDING',
    priority: overrides.priority || 'MEDIUM',
    category: overrides.category || 'ADMIN',
    assignedToId: overrides.assignedToId || null,
    createdById: overrides.createdById || fc.sample(fc.uuid(), 1)[0],
    dueDate: overrides.dueDate || null,
    completedAt: overrides.completedAt || null,
    createdAt: overrides.createdAt || new Date().toISOString(),
    updatedAt: overrides.updatedAt || new Date().toISOString(),
    createdBy: overrides.createdBy,
    assignedTo: overrides.assignedTo,
    attachments: overrides.attachments || [],
    restaurant: overrides.restaurant,
  };
}

/**
 * Create mock permission database
 */
function createMockPermissionDb(config: {
  userRoles?: Map<string, string>;
  restaurantManagers?: Map<string, string>;
  memberships?: Set<string>;
  positionPermissions?: Map<string, string[]>;
}): PermissionServiceDatabase {
  const {
    userRoles = new Map(),
    restaurantManagers = new Map(),
    memberships = new Set(),
    positionPermissions = new Map(),
  } = config;

  return {
    async getUserRole(userId: string): Promise<string | null> {
      return userRoles.get(userId) ?? null;
    },
    async getRestaurantManagerId(restaurantId: string): Promise<string | null> {
      return restaurantManagers.get(restaurantId) ?? null;
    },
    async isRestaurantMember(userId: string, restaurantId: string): Promise<boolean> {
      return memberships.has(`${userId}:${restaurantId}`);
    },
    async getUserPositionPermissions(userId: string, restaurantId: string): Promise<string[]> {
      return positionPermissions.get(`${userId}:${restaurantId}`) ?? [];
    },
  };
}

/**
 * Create mock task database
 */
function createMockTaskDb(tasks: TaskWithRelations[]): TaskServiceDatabase {
  return {
    async findTasks(where: Record<string, unknown>): Promise<TaskWithRelations[]> {
      return tasks.filter(task => {
        // Filter by restaurantId
        if (where.restaurantId && task.restaurantId !== where.restaurantId) {
          return false;
        }
        
        // Filter by status
        if (where.status && task.status !== where.status) {
          return false;
        }
        
        // Filter by OR conditions (for VIEW_OWN filtering)
        if (where.OR && Array.isArray(where.OR)) {
          const orConditions = where.OR as Array<Record<string, unknown>>;
          const matchesOr = orConditions.some(condition => {
            if (condition.assignedToId && task.assignedToId === condition.assignedToId) {
              return true;
            }
            if (condition.createdById && task.createdById === condition.createdById) {
              return true;
            }
            return false;
          });
          if (!matchesOr) {
            return false;
          }
        }
        
        return true;
      });
    },
    async findTaskById(id: string): Promise<TaskWithRelations | null> {
      return tasks.find(t => t.id === id) || null;
    },
    async createTask(): Promise<TaskWithRelations> {
      return createMockTask();
    },
    async updateTask(id: string): Promise<TaskWithRelations> {
      return tasks.find(t => t.id === id) || createMockTask();
    },
    async deleteTask(): Promise<void> {},
    async findTaskAttachments(): Promise<Array<{ id: string; filePath: string }>> {
      return [];
    },
    async deleteTaskAttachment(): Promise<void> {},
  };
}

// Arbitrary generators
const userIdArb = fc.uuid();
const restaurantIdArb = fc.uuid();

describe('Task Service Properties', () => {
  /**
   * **Feature: project-refactoring, Property 9: VIEW_OWN vs VIEW_ALL Permission Filtering**
   * **Validates: Requirements 4.4, 4.5**
   * 
   * For any user with VIEW_OWN_TASKS but without VIEW_ALL_TASKS, requesting tasks
   * SHALL return only tasks where assignedToId === userId or createdById === userId.
   * 
   * For any user with VIEW_ALL_TASKS, requesting tasks SHALL return all tasks in the restaurant.
   */
  describe('Property 9: VIEW_OWN vs VIEW_ALL Permission Filtering', () => {
    it('should return only own tasks for users with VIEW_OWN_TASKS but not VIEW_ALL_TASKS', async () => {
      await fc.assert(
        fc.asyncProperty(
          userIdArb,
          restaurantIdArb,
          fc.array(userIdArb, { minLength: 1, maxLength: 5 }), // Other user IDs
          async (userId, restaurantId, otherUserIds) => {
            // Create tasks: some assigned to user, some created by user, some by others
            const tasks: TaskWithRelations[] = [
              // Task assigned to user
              createMockTask({
                restaurantId,
                assignedToId: userId,
                createdById: otherUserIds[0] || fc.sample(fc.uuid(), 1)[0],
              }),
              // Task created by user
              createMockTask({
                restaurantId,
                assignedToId: null,
                createdById: userId,
              }),
              // Task by other user (should NOT be returned)
              createMockTask({
                restaurantId,
                assignedToId: otherUserIds[0] || fc.sample(fc.uuid(), 1)[0],
                createdById: otherUserIds[0] || fc.sample(fc.uuid(), 1)[0],
              }),
            ];

            // Setup: user has VIEW_OWN_TASKS but NOT VIEW_ALL_TASKS
            const permissionDb = createMockPermissionDb({
              userRoles: new Map([[userId, 'EMPLOYEE']]),
              memberships: new Set([`${userId}:${restaurantId}`]),
              positionPermissions: new Map([
                [`${userId}:${restaurantId}`, [PERMISSIONS.VIEW_OWN_TASKS]],
              ]),
            });
            const permissionService = createPermissionService(permissionDb);

            const taskDb = createMockTaskDb(tasks);
            const taskService = createTaskService(taskDb, permissionService);

            // Get tasks
            const result = await taskService.getTasks(userId, 'EMPLOYEE', { restaurantId });

            // Verify: only tasks where assignedToId === userId OR createdById === userId
            for (const task of result) {
              const isOwnTask = task.assignedToId === userId || task.createdById === userId;
              expect(isOwnTask).toBe(true);
            }

            // Verify: should have exactly 2 tasks (assigned + created)
            expect(result.length).toBe(2);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return all tasks for users with VIEW_ALL_TASKS', async () => {
      await fc.assert(
        fc.asyncProperty(
          userIdArb,
          restaurantIdArb,
          fc.array(userIdArb, { minLength: 1, maxLength: 5 }),
          async (userId, restaurantId, otherUserIds) => {
            // Create tasks: mix of user's and others'
            const tasks: TaskWithRelations[] = [
              createMockTask({
                restaurantId,
                assignedToId: userId,
                createdById: otherUserIds[0] || fc.sample(fc.uuid(), 1)[0],
              }),
              createMockTask({
                restaurantId,
                assignedToId: otherUserIds[0] || fc.sample(fc.uuid(), 1)[0],
                createdById: otherUserIds[0] || fc.sample(fc.uuid(), 1)[0],
              }),
              createMockTask({
                restaurantId,
                assignedToId: null,
                createdById: userId,
              }),
            ];

            // Setup: user has VIEW_ALL_TASKS
            const permissionDb = createMockPermissionDb({
              userRoles: new Map([[userId, 'EMPLOYEE']]),
              memberships: new Set([`${userId}:${restaurantId}`]),
              positionPermissions: new Map([
                [`${userId}:${restaurantId}`, [PERMISSIONS.VIEW_ALL_TASKS]],
              ]),
            });
            const permissionService = createPermissionService(permissionDb);

            const taskDb = createMockTaskDb(tasks);
            const taskService = createTaskService(taskDb, permissionService);

            // Get tasks
            const result = await taskService.getTasks(userId, 'EMPLOYEE', { restaurantId });

            // Verify: should return ALL tasks in the restaurant
            expect(result.length).toBe(tasks.length);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return all tasks for OWNER/ADMIN regardless of position permissions', async () => {
      await fc.assert(
        fc.asyncProperty(
          userIdArb,
          restaurantIdArb,
          fc.constantFrom('OWNER', 'ADMIN'),
          fc.array(userIdArb, { minLength: 1, maxLength: 5 }),
          async (userId, restaurantId, role, otherUserIds) => {
            // Create tasks by other users
            const tasks: TaskWithRelations[] = [
              createMockTask({
                restaurantId,
                assignedToId: otherUserIds[0] || fc.sample(fc.uuid(), 1)[0],
                createdById: otherUserIds[0] || fc.sample(fc.uuid(), 1)[0],
              }),
              createMockTask({
                restaurantId,
                assignedToId: otherUserIds[1] || otherUserIds[0] || fc.sample(fc.uuid(), 1)[0],
                createdById: otherUserIds[1] || otherUserIds[0] || fc.sample(fc.uuid(), 1)[0],
              }),
            ];

            // Setup: user is OWNER/ADMIN (no position permissions needed)
            const permissionDb = createMockPermissionDb({
              userRoles: new Map([[userId, role]]),
              // No memberships or position permissions
            });
            const permissionService = createPermissionService(permissionDb);

            const taskDb = createMockTaskDb(tasks);
            const taskService = createTaskService(taskDb, permissionService);

            // Get tasks
            const result = await taskService.getTasks(userId, role, { restaurantId });

            // Verify: OWNER/ADMIN should see all tasks
            expect(result.length).toBe(tasks.length);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return empty array for users who are not restaurant members', async () => {
      await fc.assert(
        fc.asyncProperty(
          userIdArb,
          restaurantIdArb,
          fc.array(userIdArb, { minLength: 1, maxLength: 3 }),
          async (userId, restaurantId, otherUserIds) => {
            // Create tasks
            const tasks: TaskWithRelations[] = [
              createMockTask({
                restaurantId,
                assignedToId: userId, // Even assigned to user
                createdById: otherUserIds[0] || fc.sample(fc.uuid(), 1)[0],
              }),
            ];

            // Setup: user is NOT a member of the restaurant (no membership)
            // Non-members should not be able to view any tasks
            const permissionDb = createMockPermissionDb({
              userRoles: new Map([[userId, 'EMPLOYEE']]),
              memberships: new Set(), // NOT a member of any restaurant
              positionPermissions: new Map(),
            });
            const permissionService = createPermissionService(permissionDb);

            const taskDb = createMockTaskDb(tasks);
            const taskService = createTaskService(taskDb, permissionService);

            // Get tasks
            const result = await taskService.getTasks(userId, 'EMPLOYEE', { restaurantId });

            // Verify: should return empty array since user is not a restaurant member
            expect(result.length).toBe(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return own tasks for restaurant members with default permissions (VIEW_OWN_TASKS)', async () => {
      await fc.assert(
        fc.asyncProperty(
          userIdArb,
          restaurantIdArb,
          fc.array(userIdArb, { minLength: 1, maxLength: 3 }),
          async (userId, restaurantId, otherUserIds) => {
            // Create tasks: one assigned to user, one by others
            const tasks: TaskWithRelations[] = [
              createMockTask({
                restaurantId,
                assignedToId: userId, // Assigned to user
                createdById: otherUserIds[0] || fc.sample(fc.uuid(), 1)[0],
              }),
              createMockTask({
                restaurantId,
                assignedToId: otherUserIds[0] || fc.sample(fc.uuid(), 1)[0],
                createdById: otherUserIds[0] || fc.sample(fc.uuid(), 1)[0],
              }),
            ];

            // Setup: user is a restaurant member with no explicit position permissions
            // They should still get VIEW_OWN_TASKS as a default employee permission
            const permissionDb = createMockPermissionDb({
              userRoles: new Map([[userId, 'EMPLOYEE']]),
              memberships: new Set([`${userId}:${restaurantId}`]),
              positionPermissions: new Map([
                [`${userId}:${restaurantId}`, []], // No explicit permissions
              ]),
            });
            const permissionService = createPermissionService(permissionDb);

            const taskDb = createMockTaskDb(tasks);
            const taskService = createTaskService(taskDb, permissionService);

            // Get tasks
            const result = await taskService.getTasks(userId, 'EMPLOYEE', { restaurantId });

            // Verify: should return only the task assigned to user (default VIEW_OWN_TASKS)
            expect(result.length).toBe(1);
            expect(result[0].assignedToId).toBe(userId);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('filterTasksByPermission should correctly filter tasks based on canViewAll flag', () => {
      fc.assert(
        fc.property(
          userIdArb,
          restaurantIdArb,
          fc.array(userIdArb, { minLength: 2, maxLength: 5 }),
          fc.boolean(),
          (userId, restaurantId, otherUserIds, canViewAll) => {
            // Create a mix of tasks
            const tasks: TaskWithRelations[] = [
              // User's own tasks
              createMockTask({ restaurantId, assignedToId: userId, createdById: otherUserIds[0] }),
              createMockTask({ restaurantId, assignedToId: null, createdById: userId }),
              // Other users' tasks
              createMockTask({ restaurantId, assignedToId: otherUserIds[0], createdById: otherUserIds[1] || otherUserIds[0] }),
            ];

            // Create service with minimal mocks
            const permissionDb = createMockPermissionDb({});
            const permissionService = createPermissionService(permissionDb);
            const taskDb = createMockTaskDb([]);
            const taskService = createTaskService(taskDb, permissionService);

            // Filter tasks
            const filtered = taskService.filterTasksByPermission(tasks, userId, canViewAll);

            if (canViewAll) {
              // Should return all tasks
              expect(filtered.length).toBe(tasks.length);
            } else {
              // Should return only user's tasks
              expect(filtered.length).toBe(2); // assigned + created
              for (const task of filtered) {
                expect(task.assignedToId === userId || task.createdById === userId).toBe(true);
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Additional property tests for task permissions
   */
  describe('Task Edit/Delete Permissions', () => {
    it('canEditTask should allow OWNER/ADMIN/MANAGER to edit any task', () => {
      fc.assert(
        fc.property(
          userIdArb,
          userIdArb, // Different creator
          userIdArb, // Different assignee
          restaurantIdArb,
          fc.constantFrom('OWNER', 'ADMIN', 'MANAGER'),
          (userId, creatorId, assigneeId, restaurantId, role) => {
            // Skip if user happens to be creator or assignee
            if (userId === creatorId || userId === assigneeId) {
              return;
            }

            const task = createMockTask({
              restaurantId,
              createdById: creatorId,
              assignedToId: assigneeId,
            });

            const permissionDb = createMockPermissionDb({});
            const permissionService = createPermissionService(permissionDb);
            const taskDb = createMockTaskDb([]);
            const taskService = createTaskService(taskDb, permissionService);

            expect(taskService.canEditTask(task, userId, role)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('canEditTask should allow creator to edit their task', () => {
      fc.assert(
        fc.property(
          userIdArb,
          restaurantIdArb,
          (userId, restaurantId) => {
            const task = createMockTask({
              restaurantId,
              createdById: userId,
              assignedToId: null,
            });

            const permissionDb = createMockPermissionDb({});
            const permissionService = createPermissionService(permissionDb);
            const taskDb = createMockTaskDb([]);
            const taskService = createTaskService(taskDb, permissionService);

            expect(taskService.canEditTask(task, userId, 'EMPLOYEE')).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('canEditTask should allow assignee to edit their task', () => {
      fc.assert(
        fc.property(
          userIdArb,
          userIdArb, // Different creator
          restaurantIdArb,
          (userId, creatorId, restaurantId) => {
            if (userId === creatorId) return;

            const task = createMockTask({
              restaurantId,
              createdById: creatorId,
              assignedToId: userId,
            });

            const permissionDb = createMockPermissionDb({});
            const permissionService = createPermissionService(permissionDb);
            const taskDb = createMockTaskDb([]);
            const taskService = createTaskService(taskDb, permissionService);

            expect(taskService.canEditTask(task, userId, 'EMPLOYEE')).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('canDeleteTask should only allow creator or OWNER/ADMIN/MANAGER to delete', () => {
      fc.assert(
        fc.property(
          userIdArb,
          userIdArb, // Different creator
          restaurantIdArb,
          (userId, creatorId, restaurantId) => {
            if (userId === creatorId) return;

            const task = createMockTask({
              restaurantId,
              createdById: creatorId,
              assignedToId: userId, // User is assignee but not creator
            });

            const permissionDb = createMockPermissionDb({});
            const permissionService = createPermissionService(permissionDb);
            const taskDb = createMockTaskDb([]);
            const taskService = createTaskService(taskDb, permissionService);

            // Assignee (EMPLOYEE) should NOT be able to delete
            expect(taskService.canDeleteTask(task, userId, 'EMPLOYEE')).toBe(false);

            // But OWNER/ADMIN/MANAGER should be able to delete
            expect(taskService.canDeleteTask(task, userId, 'OWNER')).toBe(true);
            expect(taskService.canDeleteTask(task, userId, 'ADMIN')).toBe(true);
            expect(taskService.canDeleteTask(task, userId, 'MANAGER')).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
