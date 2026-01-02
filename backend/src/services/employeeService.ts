/**
 * Employee Service
 * Business logic for employee management
 * 
 * Requirements: 10.2
 */

import { logger } from './loggerService';
import { IPermissionService, PERMISSIONS, PermissionCode } from './permissionService';

/**
 * Employee data structure
 */
export interface Employee {
  id: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  email?: string;
  positionId?: string | null;
  position?: { id: string; name: string } | null;
  departmentId?: string | null;
  department?: { id: string; name: string } | null;
}

/**
 * User data structure
 */
export interface User {
  id: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  role: string;
}

/**
 * Restaurant user data
 */
export interface RestaurantUser {
  id: string;
  restaurantId: string;
  userId: string;
  positionId: string | null;
  departmentId: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    phone: string | null;
    role: string;
  };
  position?: { id: string; name: string } | null;
  department?: { id: string; name: string } | null;
}

/**
 * Create employee input
 */
export interface CreateEmployeeInput {
  email?: string;
  password?: string;
  firstName: string;
  lastName: string;
  phone?: string;
  positionId: string;
  departmentId?: string;
}

/**
 * Update employee input
 */
export interface UpdateEmployeeInput {
  positionId?: string;
  departmentId?: string | null;
  isActive?: boolean;
  email?: string;
  password?: string;
}

/**
 * Extended profile data
 */
export interface ExtendedProfile {
  user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    phone: string | null;
    role: string;
    createdAt: Date;
  };
  workHistory: Array<{
    id: string;
    restaurant: any;
    position: any;
    department: any;
    isActive: boolean;
    startDate: Date;
    endDate: Date | null;
  }>;
  shiftStats: {
    totalShifts: number;
    totalHours: number;
    averageHoursPerShift: number;
    monthlyStats: Array<{
      month: number;
      year: number;
      shifts: number;
      hours: number;
    }>;
  };
}

/**
 * Database interface for employee service
 */
export interface EmployeeServiceDatabase {
  findUsers(where: any, select: any, orderBy?: any): Promise<User[]>;
  findRestaurantUsers(restaurantId: string): Promise<RestaurantUser[]>;
  findUserByEmail(email: string): Promise<{ id: string } | null>;
  findUserByNameAndPhone(firstName: string, lastName: string, phone: string | null): Promise<{ id: string; email: string; firstName: string | null; lastName: string | null; phone: string | null; role: string } | null>;
  createUser(data: { email: string; passwordHash: string; firstName: string; lastName: string; phone: string | null; role: string; isActive: boolean }): Promise<{ id: string; email: string; firstName: string | null; lastName: string | null; phone: string | null; role: string }>;
  findRestaurantUser(restaurantId: string, userId: string): Promise<RestaurantUser | null>;
  createRestaurantUser(data: { restaurantId: string; userId: string; positionId: string; departmentId: string | null; isActive: boolean }): Promise<RestaurantUser>;
  updateRestaurantUser(id: string, data: any): Promise<RestaurantUser>;
  deleteRestaurantUser(id: string): Promise<void>;
  updateUser(userId: string, data: any): Promise<void>;
  getRestaurantManagerId(restaurantId: string): Promise<string | null>;
  getUserById(userId: string): Promise<{ id: string; email: string; firstName: string | null; lastName: string | null; phone: string | null; role: string; createdAt: Date } | null>;
  getWorkHistory(userId: string): Promise<any[]>;
  getShifts(userId: string): Promise<Array<{ id: string; startTime: Date; endTime: Date | null; hours: number | null; restaurantId: string; isConfirmed: boolean }>>;
}

/**
 * Employee Service interface
 */
export interface IEmployeeService {
  checkEmployeePermissions(userId: string, role: string, restaurantId: string): Promise<{ canView: boolean; canManage: boolean }>;
  getUsers(role?: string): Promise<User[]>;
  getEmployees(restaurantId: string, requestingUserId: string, requestingUserRole: string): Promise<Employee[]>;
  createEmployee(restaurantId: string, input: CreateEmployeeInput, hashPassword: (password: string) => Promise<string>): Promise<RestaurantUser>;
  updateEmployee(restaurantId: string, employeeId: string, input: UpdateEmployeeInput, isOwner: boolean, hashPassword: (password: string) => Promise<string>): Promise<RestaurantUser>;
  removeEmployee(restaurantId: string, employeeId: string): Promise<void>;
  getExtendedProfile(userId: string, requestingUserId: string, requestingUserRole: string, restaurantId?: string): Promise<ExtendedProfile>;
  canManageEmployees(userId: string, role: string, restaurantId: string): Promise<boolean>;
}

/**
 * Create Employee Service instance
 */
export function createEmployeeService(
  db: EmployeeServiceDatabase,
  permissionService: IPermissionService
): IEmployeeService {
  
  async function checkEmployeePermissions(
    userId: string,
    role: string,
    restaurantId: string
  ): Promise<{ canView: boolean; canManage: boolean }> {
    // OWNER/ADMIN can do everything
    if (role === 'OWNER' || role === 'ADMIN') {
      return { canView: true, canManage: true };
    }

    // Check if user is restaurant manager
    const managerId = await db.getRestaurantManagerId(restaurantId);
    if (managerId === userId) {
      return { canView: true, canManage: true };
    }

    // Check VIEW_EMPLOYEES permission
    const viewResult = await permissionService.checkPermission(
      { userId, restaurantId },
      PERMISSIONS.VIEW_EMPLOYEES
    );

    return { canView: viewResult.allowed, canManage: false };
  }

  async function canManageEmployees(
    userId: string,
    role: string,
    restaurantId: string
  ): Promise<boolean> {
    const permissions = await checkEmployeePermissions(userId, role, restaurantId);
    return permissions.canManage;
  }

  async function getUsers(role?: string): Promise<User[]> {
    const where: any = { isActive: true };
    if (role) {
      where.role = role;
    } else {
      where.role = 'EMPLOYEE';
    }

    const users = await db.findUsers(
      where,
      { id: true, firstName: true, lastName: true, phone: true, role: true },
      { lastName: 'asc' }
    );

    // Sort by firstName after lastName
    users.sort((a, b) => {
      if (a.lastName !== b.lastName) return 0;
      return (a.firstName || '').localeCompare(b.firstName || '');
    });

    return users;
  }

  async function getEmployees(
    restaurantId: string,
    requestingUserId: string,
    requestingUserRole: string
  ): Promise<Employee[]> {
    logger.debug('Getting employees', { restaurantId, requestingUserId });

    const employees = await db.findRestaurantUsers(restaurantId);

    // Sort by lastName, then firstName
    employees.sort((a, b) => {
      const lastNameA = a.user?.lastName || '';
      const lastNameB = b.user?.lastName || '';
      if (lastNameA !== lastNameB) return lastNameA.localeCompare(lastNameB);
      const firstNameA = a.user?.firstName || '';
      const firstNameB = b.user?.firstName || '';
      return firstNameA.localeCompare(firstNameB);
    });

    return employees.map((emp) => ({
      id: emp.user.id,
      firstName: emp.user.firstName,
      lastName: emp.user.lastName,
      phone: emp.user.phone,
      ...(requestingUserRole === 'OWNER' && { email: emp.user.email }),
      positionId: emp.positionId,
      position: emp.position ? { id: emp.position.id, name: emp.position.name } : null,
      departmentId: emp.departmentId,
      department: emp.department ? { id: emp.department.id, name: emp.department.name } : null,
    }));
  }

  async function createEmployee(
    restaurantId: string,
    input: CreateEmployeeInput,
    hashPassword: (password: string) => Promise<string>
  ): Promise<RestaurantUser> {
    const { email: providedEmail, password, firstName, lastName, phone, positionId, departmentId } = input;

    // Generate or use provided email
    let email: string;
    if (providedEmail && providedEmail.trim()) {
      email = providedEmail.trim();
      const existingUser = await db.findUserByEmail(email);
      if (existingUser) {
        throw new Error('Пользователь с таким логином уже существует');
      }
    } else {
      const baseEmail = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${phone ? `.${phone.replace(/\D/g, '')}` : ''}`;
      email = `${baseEmail}@resto.local`;
      let counter = 1;
      while (await db.findUserByEmail(email)) {
        email = `${baseEmail}${counter}@resto.local`;
        counter++;
      }
    }

    // Check if user exists with same name and phone
    let user = await db.findUserByNameAndPhone(firstName, lastName, phone || null);

    if (!user) {
      const passwordHash = await hashPassword(password || 'Temp123!');
      user = await db.createUser({
        email,
        passwordHash,
        firstName,
        lastName,
        phone: phone || null,
        role: 'EMPLOYEE',
        isActive: true,
      });
    }

    // Check if already in restaurant
    const existing = await db.findRestaurantUser(restaurantId, user.id);
    if (existing) {
      return await db.updateRestaurantUser(existing.id, {
        positionId,
        departmentId: departmentId || null,
        isActive: true,
      });
    }

    return await db.createRestaurantUser({
      restaurantId,
      userId: user.id,
      positionId,
      departmentId: departmentId || null,
      isActive: true,
    });
  }

  async function updateEmployee(
    restaurantId: string,
    employeeId: string,
    input: UpdateEmployeeInput,
    isOwner: boolean,
    hashPassword: (password: string) => Promise<string>
  ): Promise<RestaurantUser> {
    const { positionId, departmentId, isActive, email, password } = input;

    const restaurantUser = await db.findRestaurantUser(restaurantId, employeeId);
    if (!restaurantUser) {
      throw new Error('Employee not found');
    }

    // Update user data (email and password) - only for OWNER
    if (isOwner) {
      const userUpdateData: any = {};

      const trimmedEmail = email?.trim();
      if (trimmedEmail && trimmedEmail !== restaurantUser.user.email) {
        const existingUser = await db.findUserByEmail(trimmedEmail);
        if (existingUser && existingUser.id !== employeeId) {
          throw new Error('Email уже используется другим пользователем');
        }
        userUpdateData.email = trimmedEmail;
      }

      const trimmedPassword = password?.trim();
      if (trimmedPassword && trimmedPassword.length > 0) {
        if (trimmedPassword.length < 6) {
          throw new Error('Пароль должен быть не менее 6 символов');
        }
        userUpdateData.passwordHash = await hashPassword(trimmedPassword);
      }

      if (Object.keys(userUpdateData).length > 0) {
        await db.updateUser(employeeId, userUpdateData);
      }
    }

    // Update restaurant user data
    const updateData: any = { departmentId: departmentId || null };
    if (positionId !== undefined) updateData.positionId = positionId;
    if (isActive !== undefined) updateData.isActive = isActive;

    return await db.updateRestaurantUser(restaurantUser.id, updateData);
  }

  async function removeEmployee(restaurantId: string, employeeId: string): Promise<void> {
    const restaurantUser = await db.findRestaurantUser(restaurantId, employeeId);
    if (!restaurantUser) {
      throw new Error('Employee not found');
    }

    logger.debug('Removing employee', { restaurantUserId: restaurantUser.id, employeeId });
    await db.deleteRestaurantUser(restaurantUser.id);
  }

  async function getExtendedProfile(
    userId: string,
    requestingUserId: string,
    requestingUserRole: string,
    restaurantId?: string
  ): Promise<ExtendedProfile> {
    // Permission check for viewing other users' profiles
    if (requestingUserRole === 'EMPLOYEE' && requestingUserId !== userId) {
      if (!restaurantId) {
        throw new Error('restaurantId is required');
      }
      const viewResult = await permissionService.checkPermission(
        { userId: requestingUserId, restaurantId },
        PERMISSIONS.VIEW_EMPLOYEES
      );
      if (!viewResult.allowed) {
        throw new Error('Forbidden');
      }
    }

    const user = await db.getUserById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const workHistory = await db.getWorkHistory(userId);
    const allShifts = await db.getShifts(userId);

    // Calculate statistics
    const confirmedShifts = allShifts.filter(s => s.isConfirmed);
    const totalShifts = confirmedShifts.length;
    const totalHours = confirmedShifts.reduce((sum, shift) => sum + (shift.hours || 0), 0);
    const averageHoursPerShift = totalShifts > 0 ? totalHours / totalShifts : 0;

    // Monthly stats for last 12 months
    const monthlyStats: Array<{ month: number; year: number; shifts: number; hours: number }> = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const month = date.getMonth() + 1;
      const year = date.getFullYear();

      const monthShifts = confirmedShifts.filter(s => {
        const shiftDate = new Date(s.startTime);
        return shiftDate.getMonth() + 1 === month && shiftDate.getFullYear() === year;
      });

      monthlyStats.push({
        month,
        year,
        shifts: monthShifts.length,
        hours: monthShifts.reduce((sum, shift) => sum + (shift.hours || 0), 0),
      });
    }

    return {
      user,
      workHistory: workHistory.map(wh => ({
        id: wh.id,
        restaurant: wh.restaurant,
        position: wh.position,
        department: wh.department,
        isActive: wh.isActive,
        startDate: wh.createdAt,
        endDate: wh.isActive ? null : wh.updatedAt,
      })),
      shiftStats: {
        totalShifts,
        totalHours,
        averageHoursPerShift: Math.round(averageHoursPerShift * 100) / 100,
        monthlyStats,
      },
    };
  }

  return {
    checkEmployeePermissions,
    getUsers,
    getEmployees,
    createEmployee,
    updateEmployee,
    removeEmployee,
    getExtendedProfile,
    canManageEmployees,
  };
}

/**
 * Create database adapter from dbClient
 */
export function createEmployeeDatabaseAdapter(dbClient: any): EmployeeServiceDatabase {
  return {
    async findUsers(where: any, select: any, orderBy?: any): Promise<User[]> {
      return dbClient.user.findMany({ where, select, orderBy });
    },

    async findRestaurantUsers(restaurantId: string): Promise<RestaurantUser[]> {
      return dbClient.restaurantUser.findMany({
        where: { restaurantId },
        include: { user: true, position: true, department: true },
      });
    },

    async findUserByEmail(email: string): Promise<{ id: string } | null> {
      return dbClient.user.findUnique({ where: { email } });
    },

    async findUserByNameAndPhone(firstName: string, lastName: string, phone: string | null) {
      return dbClient.user.findFirst({
        where: { firstName, lastName, phone, role: 'EMPLOYEE' },
      });
    },

    async createUser(data: any) {
      return dbClient.user.create({ data });
    },

    async findRestaurantUser(restaurantId: string, userId: string): Promise<RestaurantUser | null> {
      return dbClient.restaurantUser.findFirst({
        where: { restaurantId, userId },
        include: { user: true, position: true, department: true },
      });
    },

    async createRestaurantUser(data: any): Promise<RestaurantUser> {
      return dbClient.restaurantUser.create({
        data,
        include: { user: true, position: true, department: true },
      });
    },

    async updateRestaurantUser(id: string, data: any): Promise<RestaurantUser> {
      return dbClient.restaurantUser.update({
        where: { id },
        data,
        include: { user: true, position: true, department: true },
      });
    },

    async deleteRestaurantUser(id: string): Promise<void> {
      await dbClient.restaurantUser.delete({ where: { id } });
    },

    async updateUser(userId: string, data: any): Promise<void> {
      await dbClient.user.update({ where: { id: userId }, data });
    },

    async getRestaurantManagerId(restaurantId: string): Promise<string | null> {
      const restaurant = await dbClient.restaurant.findUnique({
        where: { id: restaurantId },
        select: { managerId: true },
      });
      return restaurant?.managerId ?? null;
    },

    async getUserById(userId: string) {
      return dbClient.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, firstName: true, lastName: true, phone: true, role: true, createdAt: true },
      });
    },

    async getWorkHistory(userId: string) {
      return dbClient.restaurantUser.findMany({
        where: { userId },
        include: { restaurant: true, position: true, department: true },
        orderBy: { createdAt: 'desc' },
      });
    },

    async getShifts(userId: string) {
      return dbClient.shift.findMany({
        where: { userId },
        select: { id: true, startTime: true, endTime: true, hours: true, restaurantId: true, isConfirmed: true },
      });
    },
  };
}

// Default instance
let defaultEmployeeService: IEmployeeService | null = null;

export function getEmployeeService(): IEmployeeService {
  if (!defaultEmployeeService) {
    const dbClient = require('../utils/db').default;
    const { getPermissionService } = require('./permissionService');
    const dbAdapter = createEmployeeDatabaseAdapter(dbClient);
    defaultEmployeeService = createEmployeeService(dbAdapter, getPermissionService());
  }
  return defaultEmployeeService;
}

export function setEmployeeService(service: IEmployeeService): void {
  defaultEmployeeService = service;
}

export function resetEmployeeService(): void {
  defaultEmployeeService = null;
}
