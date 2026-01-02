/**
 * Timesheet Service
 * Business logic for timesheet management
 * 
 * Requirements: 4.2, 4.3, 10.2
 */

import { logger } from './loggerService';
import {
  getPermissionService,
  IPermissionService,
  PERMISSIONS,
} from './permissionService';
import { Timesheet, TimesheetWithRelations } from '../database/types';

/**
 * Timesheet filter options
 */
export interface TimesheetFilterOptions {
  restaurantId?: string;
  userId?: string;
  month?: number;
  year?: number;
}

/**
 * Timesheet calculation data
 */
export interface CalculateTimesheetData {
  restaurantId: string;
  userId: string;
  month: number;
  year: number;
}

/**
 * Timesheet update data
 */
export interface UpdateTimesheetData {
  totalHours?: number;
  overtimeHours?: number;
  lateCount?: number;
  sickDays?: number;
  vacationDays?: number;
  notes?: string;
}

/**
 * Timesheet permission check result
 */
export interface TimesheetPermissionResult {
  canView: boolean;
  canViewAll: boolean;
  canViewOwn: boolean;
  canEdit: boolean;
}

/**
 * Shift data for calculation
 */
export interface ShiftData {
  id: string;
  hours: number;
  startTime: Date;
  endTime: Date;
  type?: string;
}

/**
 * Database interface for Timesheet Service
 */
export interface TimesheetServiceDatabase {
  findTimesheets(where: Record<string, unknown>, include?: Record<string, boolean>): Promise<TimesheetWithRelations[]>;
  findTimesheetById(id: string, include?: Record<string, boolean>): Promise<TimesheetWithRelations | null>;
  findTimesheetByPeriod(restaurantId: string, userId: string, month: number, year: number): Promise<TimesheetWithRelations | null>;
  createTimesheet(data: {
    restaurantId: string;
    userId: string;
    month: number;
    year: number;
    totalHours: number;
    overtimeHours: number;
    lateCount: number;
    isApproved: boolean;
  }): Promise<TimesheetWithRelations>;
  updateTimesheet(id: string, data: UpdateTimesheetData): Promise<TimesheetWithRelations>;
  approveTimesheet(id: string, approvedById: string): Promise<TimesheetWithRelations>;
  getShiftsForPeriod(restaurantId: string, userId: string, startDate: Date, endDate: Date): Promise<ShiftData[]>;
}

/**
 * Timesheet Service Interface
 */
export interface ITimesheetService {
  /**
   * Get timesheets with permission-based filtering
   */
  getTimesheets(
    userId: string,
    userRole: string,
    filters: TimesheetFilterOptions
  ): Promise<TimesheetWithRelations[]>;

  /**
   * Check user's timesheet permissions for a restaurant
   */
  checkTimesheetPermissions(
    userId: string,
    userRole: string,
    restaurantId: string
  ): Promise<TimesheetPermissionResult>;

  /**
   * Check if user can view a specific timesheet
   */
  canViewTimesheet(
    timesheet: TimesheetWithRelations,
    userId: string,
    userRole: string,
    restaurantId: string
  ): Promise<boolean>;

  /**
   * Check if user can edit timesheets
   */
  canEditTimesheet(userRole: string): boolean;

  /**
   * Calculate timesheet from shifts
   */
  calculateTimesheet(data: CalculateTimesheetData): Promise<TimesheetWithRelations>;

  /**
   * Update a timesheet
   */
  updateTimesheet(id: string, data: UpdateTimesheetData): Promise<TimesheetWithRelations>;

  /**
   * Approve a timesheet
   */
  approveTimesheet(id: string, approvedById: string): Promise<TimesheetWithRelations>;
}

/**
 * Create a Timesheet Service instance
 */
export function createTimesheetService(
  db: TimesheetServiceDatabase,
  permissionService?: IPermissionService
): ITimesheetService {
  const permissions = permissionService || getPermissionService();

  /**
   * Check user's timesheet permissions for a restaurant
   */
  async function checkTimesheetPermissions(
    userId: string,
    userRole: string,
    restaurantId: string
  ): Promise<TimesheetPermissionResult> {
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
      permissions.checkPermission({ userId, restaurantId }, PERMISSIONS.VIEW_ALL_TIMESHEETS),
      permissions.checkPermission({ userId, restaurantId }, PERMISSIONS.VIEW_OWN_TIMESHEETS),
      permissions.checkPermission({ userId, restaurantId }, PERMISSIONS.EDIT_TIMESHEETS),
    ]);

    return {
      canView: viewAllResult.allowed || viewOwnResult.allowed,
      canViewAll: viewAllResult.allowed,
      canViewOwn: viewOwnResult.allowed,
      canEdit: editResult.allowed,
    };
  }

  /**
   * Check if user can view a specific timesheet
   */
  async function canViewTimesheet(
    timesheet: TimesheetWithRelations,
    userId: string,
    userRole: string,
    restaurantId: string
  ): Promise<boolean> {
    const perms = await checkTimesheetPermissions(userId, userRole, restaurantId);
    
    if (!perms.canView) {
      return false;
    }

    // If only VIEW_OWN, check if timesheet belongs to user
    if (!perms.canViewAll && perms.canViewOwn) {
      return timesheet.userId === userId;
    }

    return true;
  }

  /**
   * Check if user can edit timesheets
   */
  function canEditTimesheet(userRole: string): boolean {
    return ['OWNER', 'ADMIN', 'MANAGER'].includes(userRole);
  }

  /**
   * Get timesheets with permission-based filtering
   */
  async function getTimesheets(
    userId: string,
    userRole: string,
    filters: TimesheetFilterOptions
  ): Promise<TimesheetWithRelations[]> {
    const { restaurantId, userId: filterUserId, month, year } = filters;

    logger.debug('Getting timesheets', {
      userId,
      restaurantId,
      action: 'getTimesheets',
    });

    // Build where clause
    const where: Record<string, unknown> = {};

    if (restaurantId) {
      where.restaurantId = restaurantId;
    }

    if (filterUserId) {
      where.userId = filterUserId;
    }

    if (month !== undefined) {
      where.month = month;
    }

    if (year !== undefined) {
      where.year = year;
    }

    // Check permissions if restaurantId is provided
    if (restaurantId) {
      const timesheetPermissions = await checkTimesheetPermissions(userId, userRole, restaurantId);

      // If no view permissions at all, return empty array
      if (!timesheetPermissions.canView) {
        logger.debug('No timesheet view permissions', {
          userId,
          restaurantId,
          action: 'getTimesheets:denied',
        });
        return [];
      }

      // If only VIEW_OWN, filter to user's timesheets
      if (!timesheetPermissions.canViewAll && timesheetPermissions.canViewOwn) {
        where.userId = userId;
      }
    }

    // Fetch timesheets from database
    const timesheets = await db.findTimesheets(where, {
      user: true,
      restaurant: true,
    });

    logger.debug('Timesheets retrieved', {
      userId,
      restaurantId,
      count: timesheets.length,
      action: 'getTimesheets:success',
    });

    return timesheets;
  }

  /**
   * Calculate timesheet from shifts
   */
  async function calculateTimesheet(data: CalculateTimesheetData): Promise<TimesheetWithRelations> {
    const { restaurantId, userId, month, year } = data;

    logger.debug('Calculating timesheet', {
      userId,
      restaurantId,
      month,
      year,
      action: 'calculateTimesheet',
    });

    // Get date range for the month
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    // Get all shifts for the period
    const shifts = await db.getShiftsForPeriod(restaurantId, userId, startDate, endDate);

    // Calculate metrics
    let totalHours = 0;
    let overtimeHours = 0;
    let lateCount = 0;
    const standardHoursPerDay = 8;

    shifts.forEach((shift) => {
      totalHours += shift.hours;

      // Check for overtime
      if (shift.hours > standardHoursPerDay) {
        overtimeHours += shift.hours - standardHoursPerDay;
      }
    });

    // Check if timesheet exists
    const existing = await db.findTimesheetByPeriod(restaurantId, userId, month, year);

    let timesheet: TimesheetWithRelations;
    if (existing) {
      timesheet = await db.updateTimesheet(existing.id, {
        totalHours,
        overtimeHours,
        lateCount,
      });
    } else {
      timesheet = await db.createTimesheet({
        restaurantId,
        userId,
        month,
        year,
        totalHours,
        overtimeHours,
        lateCount,
        isApproved: false,
      });
    }

    logger.info('Timesheet calculated', {
      userId,
      restaurantId,
      month,
      year,
      totalHours,
      action: 'calculateTimesheet:success',
    });

    return timesheet;
  }

  /**
   * Update a timesheet
   */
  async function updateTimesheet(id: string, data: UpdateTimesheetData): Promise<TimesheetWithRelations> {
    logger.debug('Updating timesheet', {
      timesheetId: id,
      action: 'updateTimesheet',
    });

    const timesheet = await db.updateTimesheet(id, data);

    logger.info('Timesheet updated', {
      timesheetId: id,
      action: 'updateTimesheet:success',
    });

    return timesheet;
  }

  /**
   * Approve a timesheet
   */
  async function approveTimesheet(id: string, approvedById: string): Promise<TimesheetWithRelations> {
    logger.debug('Approving timesheet', {
      timesheetId: id,
      approvedById,
      action: 'approveTimesheet',
    });

    const timesheet = await db.approveTimesheet(id, approvedById);

    logger.info('Timesheet approved', {
      timesheetId: id,
      approvedById,
      action: 'approveTimesheet:success',
    });

    return timesheet;
  }

  return {
    getTimesheets,
    checkTimesheetPermissions,
    canViewTimesheet,
    canEditTimesheet,
    calculateTimesheet,
    updateTimesheet,
    approveTimesheet,
  };
}

/**
 * Create database adapter from dbClient
 */
export function createTimesheetDatabaseAdapter(dbClient: any): TimesheetServiceDatabase {
  return {
    async findTimesheets(where: Record<string, unknown>, include?: Record<string, boolean>): Promise<TimesheetWithRelations[]> {
      return dbClient.timesheet.findMany({
        where,
        include,
        orderBy: [
          { year: 'desc' },
          { month: 'desc' },
        ],
      });
    },

    async findTimesheetById(id: string, include?: Record<string, boolean>): Promise<TimesheetWithRelations | null> {
      return dbClient.timesheet.findUnique({
        where: { id },
        include,
      });
    },

    async findTimesheetByPeriod(restaurantId: string, userId: string, month: number, year: number): Promise<TimesheetWithRelations | null> {
      return dbClient.timesheet.findFirst({
        where: {
          restaurantId,
          userId,
          month,
          year,
        },
        include: {
          user: true,
        },
      });
    },

    async createTimesheet(data: {
      restaurantId: string;
      userId: string;
      month: number;
      year: number;
      totalHours: number;
      overtimeHours: number;
      lateCount: number;
      isApproved: boolean;
    }): Promise<TimesheetWithRelations> {
      return dbClient.timesheet.create({
        data,
        include: {
          user: true,
        },
      });
    },

    async updateTimesheet(id: string, data: UpdateTimesheetData): Promise<TimesheetWithRelations> {
      const updateData: Record<string, unknown> = {};
      
      if (data.totalHours !== undefined) updateData.totalHours = data.totalHours;
      if (data.overtimeHours !== undefined) updateData.overtimeHours = data.overtimeHours;
      if (data.lateCount !== undefined) updateData.lateCount = data.lateCount;
      if (data.sickDays !== undefined) updateData.sickDays = data.sickDays;
      if (data.vacationDays !== undefined) updateData.vacationDays = data.vacationDays;
      if (data.notes !== undefined) updateData.notes = data.notes;

      return dbClient.timesheet.update({
        where: { id },
        data: updateData,
        include: {
          user: true,
        },
      });
    },

    async approveTimesheet(id: string, approvedById: string): Promise<TimesheetWithRelations> {
      return dbClient.timesheet.update({
        where: { id },
        data: {
          isApproved: true,
          approvedById,
          approvedAt: new Date(),
        },
        include: {
          user: true,
        },
      });
    },

    async getShiftsForPeriod(restaurantId: string, userId: string, startDate: Date, endDate: Date): Promise<ShiftData[]> {
      return dbClient.shift.findMany({
        where: {
          restaurantId,
          userId,
          startTime: {
            gte: startDate,
            lte: endDate,
          },
        },
      });
    },
  };
}

// Default instance
let defaultTimesheetService: ITimesheetService | null = null;

/**
 * Get the default timesheet service instance
 */
export function getTimesheetService(): ITimesheetService {
  if (!defaultTimesheetService) {
    const dbClient = require('../utils/db').default;
    const dbAdapter = createTimesheetDatabaseAdapter(dbClient);
    defaultTimesheetService = createTimesheetService(dbAdapter);
  }
  return defaultTimesheetService;
}

/**
 * Set a custom timesheet service (useful for testing)
 */
export function setTimesheetService(service: ITimesheetService): void {
  defaultTimesheetService = service;
}

/**
 * Reset the timesheet service to default (useful for testing)
 */
export function resetTimesheetService(): void {
  defaultTimesheetService = null;
}
