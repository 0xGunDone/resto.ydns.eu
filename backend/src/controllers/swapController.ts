/**
 * Swap Controller
 * 
 * Handles shift swap requests between employees.
 * Implements the Shift Swap System from the platform-upgrade spec.
 */

import { Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import dbClient from '../utils/db';
import { logAction } from '../utils/actionLog';
import { AuthRequest } from '../middleware/auth';
import { logger } from '../services/loggerService';
import { PERMISSIONS } from '../utils/permissions';
import { checkPermission } from '../utils/checkPermissions';

// Swap status types
export type SwapStatus = 
  | 'PENDING'           // Ожидает ответа сотрудника
  | 'ACCEPTED'          // Принят сотрудником, ждет менеджера
  | 'REJECTED'          // Отклонен сотрудником
  | 'APPROVED'          // Одобрен менеджером, обмен выполнен
  | 'MANAGER_REJECTED'  // Отклонен менеджером
  | 'EXPIRED';          // Истек срок ответа

// Valid status transitions
const VALID_TRANSITIONS: Record<SwapStatus, SwapStatus[]> = {
  'PENDING': ['ACCEPTED', 'REJECTED', 'EXPIRED'],
  'ACCEPTED': ['APPROVED', 'MANAGER_REJECTED'],
  'REJECTED': [],
  'APPROVED': [],
  'MANAGER_REJECTED': [],
  'EXPIRED': [],
};

/**
 * Check if a status transition is valid
 */
export function isValidTransition(from: SwapStatus, to: SwapStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Create a new swap request
 * POST /api/swaps
 * 
 * Requirements: 1.2, 1.4, 1.5
 * - Validates shift is not in the past
 * - Validates no active request exists for this shift
 * - Creates request with PENDING status
 * - Sets expiresAt to 48 hours from now
 */
export const createSwapRequest = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn('Validation errors in createSwapRequest', { errors: errors.array(), body: req.body });
      res.status(400).json({ errors: errors.array() });
      return;
    }

    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { shiftId, toUserId } = req.body;

    // Get the shift
    const shift = await dbClient.shift.findUnique({
      where: { id: shiftId },
      include: {
        restaurant: true,
      },
    });

    if (!shift) {
      res.status(404).json({ error: 'SHIFT_NOT_FOUND', message: 'Смена не найдена' });
      return;
    }

    // Verify the shift belongs to the requesting user
    if (shift.userId !== req.user.id) {
      res.status(403).json({ error: 'NOT_AUTHORIZED', message: 'Вы можете запросить обмен только для своих смен' });
      return;
    }

    // Check permission to request swap
    const isOwnerOrAdmin = req.user.role === 'OWNER' || req.user.role === 'ADMIN';
    const hasSwapPermission = isOwnerOrAdmin || await checkPermission(req.user.id, shift.restaurantId, PERMISSIONS.REQUEST_SHIFT_SWAP);
    
    if (!hasSwapPermission) {
      res.status(403).json({ error: 'NOT_AUTHORIZED', message: 'Недостаточно прав для запроса обмена сменами' });
      return;
    }

    // Validate: shift is not in the past (Requirement 1.4)
    const now = new Date();
    if (new Date(shift.startTime) < now) {
      res.status(400).json({ error: 'SHIFT_IN_PAST', message: 'Нельзя обменять смену в прошлом' });
      return;
    }

    // Validate: no active swap request exists for this shift (Requirement 1.5)
    const existingRequest = await dbClient.swapRequest.findFirst({
      where: {
        shiftId,
        status: { in: ['PENDING', 'ACCEPTED'] },
      },
    });

    if (existingRequest) {
      res.status(400).json({ error: 'SWAP_ALREADY_EXISTS', message: 'Уже есть активный запрос на обмен для этой смены' });
      return;
    }

    // Verify target user exists and is in the same restaurant
    const targetUser = await dbClient.user.findUnique({
      where: { id: toUserId },
    });

    if (!targetUser) {
      res.status(404).json({ error: 'USER_NOT_FOUND', message: 'Пользователь не найден' });
      return;
    }

    // Check target user is a member of the same restaurant
    const targetMembership = await dbClient.restaurantUser.findFirst({
      where: {
        userId: toUserId,
        restaurantId: shift.restaurantId,
        isActive: true,
      },
    });

    if (!targetMembership) {
      res.status(400).json({ error: 'USER_NOT_IN_RESTAURANT', message: 'Пользователь не является сотрудником этого ресторана' });
      return;
    }

    // Cannot swap with yourself
    if (toUserId === req.user.id) {
      res.status(400).json({ error: 'CANNOT_SWAP_WITH_SELF', message: 'Нельзя обменяться сменой с самим собой' });
      return;
    }

    // Calculate expiresAt (48 hours from now)
    const expiresAt = new Date(now.getTime() + 48 * 60 * 60 * 1000);

    // Create the swap request
    const swapRequest = await dbClient.swapRequest.create({
      data: {
        shiftId,
        fromUserId: req.user.id,
        toUserId,
        status: 'PENDING',
        expiresAt,
      },
      include: {
        shift: true,
        fromUser: true,
        toUser: true,
      },
    });

    await logAction({
      userId: req.user.id,
      type: 'CREATE',
      entityType: 'SwapRequest',
      entityId: swapRequest.id,
      description: `Created swap request for shift ${shiftId} to user ${toUserId}`,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    logger.info('Swap request created', { 
      swapRequestId: swapRequest.id, 
      shiftId, 
      fromUserId: req.user.id, 
      toUserId 
    });

    res.status(201).json({ swapRequest });
  } catch (error) {
    next(error);
  }
};


/**
 * Respond to a swap request (accept or reject)
 * POST /api/swaps/:id/respond
 * 
 * Requirements: 2.2, 2.3
 * - Changes status to ACCEPTED or REJECTED
 * - Sets respondedAt timestamp
 */
export const respondToSwap = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn('Validation errors in respondToSwap', { errors: errors.array(), body: req.body });
      res.status(400).json({ errors: errors.array() });
      return;
    }

    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { id } = req.params;
    const { accept } = req.body; // boolean: true = accept, false = reject

    // Get the swap request
    const swapRequest = await dbClient.swapRequest.findUnique({
      where: { id },
      include: {
        shift: true,
        fromUser: true,
        toUser: true,
      },
    });

    if (!swapRequest) {
      res.status(404).json({ error: 'SWAP_NOT_FOUND', message: 'Запрос на обмен не найден' });
      return;
    }

    // Verify the request is addressed to the current user
    if (swapRequest.toUserId !== req.user.id) {
      res.status(403).json({ error: 'NOT_AUTHORIZED', message: 'Этот запрос адресован не вам' });
      return;
    }

    // Verify the request is in PENDING status
    if (swapRequest.status !== 'PENDING') {
      res.status(400).json({ 
        error: 'INVALID_STATUS_TRANSITION', 
        message: `Невозможно ответить на запрос со статусом ${swapRequest.status}` 
      });
      return;
    }

    // Validate the transition
    const newStatus: SwapStatus = accept ? 'ACCEPTED' : 'REJECTED';
    if (!isValidTransition(swapRequest.status as SwapStatus, newStatus)) {
      res.status(400).json({ 
        error: 'INVALID_STATUS_TRANSITION', 
        message: `Недопустимый переход статуса: ${swapRequest.status} -> ${newStatus}` 
      });
      return;
    }

    // Update the swap request
    const updatedSwapRequest = await dbClient.swapRequest.update({
      where: { id },
      data: {
        status: newStatus,
        respondedAt: new Date(),
      },
      include: {
        shift: true,
        fromUser: true,
        toUser: true,
      },
    });

    await logAction({
      userId: req.user.id,
      type: 'UPDATE',
      entityType: 'SwapRequest',
      entityId: id,
      description: `${accept ? 'Accepted' : 'Rejected'} swap request`,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    logger.info('Swap request responded', { 
      swapRequestId: id, 
      newStatus, 
      respondedBy: req.user.id 
    });

    res.json({ swapRequest: updatedSwapRequest });
  } catch (error) {
    next(error);
  }
};


/**
 * Approve or reject a swap request (manager action)
 * POST /api/swaps/:id/approve
 * 
 * Requirements: 3.2, 3.3, 4.1, 4.2
 * - Checks APPROVE_SHIFT_SWAP permission
 * - Changes status to APPROVED or MANAGER_REJECTED
 * - If approved, executes the swap (changes userId in Shift)
 * - Creates history record
 */
export const approveSwap = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn('Validation errors in approveSwap', { errors: errors.array(), body: req.body });
      res.status(400).json({ errors: errors.array() });
      return;
    }

    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { id } = req.params;
    const { approve } = req.body; // boolean: true = approve, false = reject

    // Get the swap request with shift details
    const swapRequest = await dbClient.swapRequest.findUnique({
      where: { id },
      include: {
        shift: true,
        fromUser: true,
        toUser: true,
      },
    });

    if (!swapRequest) {
      res.status(404).json({ error: 'SWAP_NOT_FOUND', message: 'Запрос на обмен не найден' });
      return;
    }

    // Check permission to approve swaps
    const isOwnerOrAdmin = req.user.role === 'OWNER' || req.user.role === 'ADMIN';
    const hasApprovePermission = isOwnerOrAdmin || await checkPermission(
      req.user.id, 
      swapRequest.shift.restaurantId, 
      PERMISSIONS.APPROVE_SHIFT_SWAP
    );
    
    if (!hasApprovePermission) {
      res.status(403).json({ error: 'NOT_AUTHORIZED', message: 'Недостаточно прав для одобрения обмена сменами' });
      return;
    }

    // Verify the request is in ACCEPTED status
    if (swapRequest.status !== 'ACCEPTED') {
      res.status(400).json({ 
        error: 'INVALID_STATUS_TRANSITION', 
        message: `Невозможно одобрить запрос со статусом ${swapRequest.status}. Требуется статус ACCEPTED.` 
      });
      return;
    }

    // Validate the transition
    const newStatus: SwapStatus = approve ? 'APPROVED' : 'MANAGER_REJECTED';
    if (!isValidTransition(swapRequest.status as SwapStatus, newStatus)) {
      res.status(400).json({ 
        error: 'INVALID_STATUS_TRANSITION', 
        message: `Недопустимый переход статуса: ${swapRequest.status} -> ${newStatus}` 
      });
      return;
    }

    const now = new Date();

    if (approve) {
      // Execute the swap: change userId in the shift
      // Store original userId for history
      const originalUserId = swapRequest.shift.userId;
      const newUserId = swapRequest.toUserId;

      try {
        // Update the shift with new user
        await dbClient.shift.update({
          where: { id: swapRequest.shiftId },
          data: {
            userId: newUserId,
          },
        });

        // Update the swap request status
        const updatedSwapRequest = await dbClient.swapRequest.update({
          where: { id },
          data: {
            status: 'APPROVED',
            approvedAt: now,
            approvedById: req.user.id,
          },
          include: {
            shift: true,
            fromUser: true,
            toUser: true,
            approvedBy: true,
          },
        });

        // Create history record (Requirement 4.2)
        const shiftDate = new Date(swapRequest.shift.startTime);
        shiftDate.setHours(0, 0, 0, 0);

        await dbClient.shiftSwapHistory.create({
          data: {
            shiftId: swapRequest.shiftId,
            restaurantId: swapRequest.shift.restaurantId,
            fromUserId: originalUserId,
            toUserId: newUserId,
            status: 'APPROVED',
            shiftDate,
            shiftStartTime: swapRequest.shift.startTime,
            shiftEndTime: swapRequest.shift.endTime,
            shiftType: swapRequest.shift.type,
            approvedById: req.user.id,
            approvedAt: now,
            notes: 'Обмен сменами одобрен',
            changeType: 'SWAP_APPROVED',
          },
        });

        await logAction({
          userId: req.user.id,
          type: 'UPDATE',
          entityType: 'SwapRequest',
          entityId: id,
          description: `Approved swap request, shift transferred from ${originalUserId} to ${newUserId}`,
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),
        });

        logger.info('Swap request approved and executed', { 
          swapRequestId: id, 
          shiftId: swapRequest.shiftId,
          fromUserId: originalUserId,
          toUserId: newUserId,
          approvedBy: req.user.id 
        });

        res.json({ swapRequest: updatedSwapRequest });
      } catch (error) {
        // Rollback on error - the shift update failed
        logger.error('Failed to execute swap', { 
          swapRequestId: id, 
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
        res.status(500).json({ error: 'SWAP_EXECUTION_FAILED', message: 'Ошибка при выполнении обмена' });
        return;
      }
    } else {
      // Manager rejected the swap
      const updatedSwapRequest = await dbClient.swapRequest.update({
        where: { id },
        data: {
          status: 'MANAGER_REJECTED',
          approvedAt: now,
          approvedById: req.user.id,
        },
        include: {
          shift: true,
          fromUser: true,
          toUser: true,
          approvedBy: true,
        },
      });

      // Create history record for rejection
      const shiftDate = new Date(swapRequest.shift.startTime);
      shiftDate.setHours(0, 0, 0, 0);

      await dbClient.shiftSwapHistory.create({
        data: {
          shiftId: swapRequest.shiftId,
          restaurantId: swapRequest.shift.restaurantId,
          fromUserId: swapRequest.fromUserId,
          toUserId: swapRequest.toUserId,
          status: 'MANAGER_REJECTED',
          shiftDate,
          shiftStartTime: swapRequest.shift.startTime,
          shiftEndTime: swapRequest.shift.endTime,
          shiftType: swapRequest.shift.type,
          approvedById: req.user.id,
          approvedAt: now,
          notes: 'Обмен сменами отклонен менеджером',
          changeType: 'SWAP_REJECTED',
        },
      });

      await logAction({
        userId: req.user.id,
        type: 'UPDATE',
        entityType: 'SwapRequest',
        entityId: id,
        description: `Rejected swap request`,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });

      logger.info('Swap request rejected by manager', { 
        swapRequestId: id, 
        rejectedBy: req.user.id 
      });

      res.json({ swapRequest: updatedSwapRequest });
    }
  } catch (error) {
    next(error);
  }
};


/**
 * Get swap requests with filtering
 * GET /api/swaps
 * 
 * Requirements: 5.1, 5.2, 5.3
 * - Filter by status, period, employee
 * - Include relations for display
 */
export const getSwapRequests = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { 
      restaurantId, 
      status, 
      fromUserId, 
      toUserId, 
      startDate, 
      endDate,
      includeExpired 
    } = req.query;

    // Build where clause
    const where: any = {};

    // Filter by status
    if (status) {
      where.status = status as string;
    } else if (!includeExpired || includeExpired === 'false') {
      // By default, exclude expired requests unless explicitly requested
      where.status = { in: ['PENDING', 'ACCEPTED', 'REJECTED', 'APPROVED', 'MANAGER_REJECTED'] };
    }

    // Filter by fromUserId (requester)
    if (fromUserId) {
      where.fromUserId = fromUserId as string;
    }

    // Filter by toUserId (target employee)
    if (toUserId) {
      where.toUserId = toUserId as string;
    }

    // Filter by date range (based on shift startTime)
    // This requires a join with Shift table, so we'll filter after fetching
    let dateFilter: { startDate?: Date; endDate?: Date } | null = null;
    if (startDate || endDate) {
      dateFilter = {};
      if (startDate) {
        dateFilter.startDate = new Date(startDate as string);
      }
      if (endDate) {
        dateFilter.endDate = new Date(endDate as string);
      }
    }

    // Get swap requests
    let swapRequests = await dbClient.swapRequest.findMany({
      where,
      include: {
        shift: true,
        fromUser: true,
        toUser: true,
        approvedBy: true,
      },
      orderBy: { requestedAt: 'desc' },
    });

    // Filter by restaurant if specified
    if (restaurantId) {
      swapRequests = swapRequests.filter(sr => sr.shift?.restaurantId === restaurantId);
    }

    // Filter by date range if specified
    if (dateFilter) {
      swapRequests = swapRequests.filter(sr => {
        if (!sr.shift) return false;
        const shiftStart = new Date(sr.shift.startTime);
        if (dateFilter!.startDate && shiftStart < dateFilter!.startDate) return false;
        if (dateFilter!.endDate && shiftStart > dateFilter!.endDate) return false;
        return true;
      });
    }

    // Access control: users can only see requests they're involved in,
    // unless they have APPROVE_SHIFT_SWAP permission or are OWNER/ADMIN
    const isOwnerOrAdmin = req.user.role === 'OWNER' || req.user.role === 'ADMIN';
    
    if (!isOwnerOrAdmin) {
      // Check if user has approve permission for any restaurant
      const userRestaurants = await dbClient.restaurantUser.findMany({
        where: { userId: req.user.id, isActive: true },
        select: { restaurantId: true },
      });
      
      const restaurantIds = userRestaurants.map(ru => ru.restaurantId);
      
      // Check permissions for each restaurant
      const hasApprovePermission: string[] = [];
      for (const restId of restaurantIds) {
        const canApprove = await checkPermission(req.user.id, restId, PERMISSIONS.APPROVE_SHIFT_SWAP);
        if (canApprove) {
          hasApprovePermission.push(restId);
        }
      }

      // Filter requests: user can see requests where they are involved OR
      // they have approve permission for the restaurant
      swapRequests = swapRequests.filter(sr => {
        // User is the requester or target
        if (sr.fromUserId === req.user!.id || sr.toUserId === req.user!.id) {
          return true;
        }
        // User has approve permission for this restaurant
        if (sr.shift && hasApprovePermission.includes(sr.shift.restaurantId)) {
          return true;
        }
        return false;
      });
    }

    logger.debug('getSwapRequests', { 
      userId: req.user.id,
      filters: { restaurantId, status, fromUserId, toUserId, startDate, endDate },
      count: swapRequests.length 
    });

    res.json({ swapRequests });
  } catch (error) {
    next(error);
  }
};

/**
 * Get a single swap request by ID
 * GET /api/swaps/:id
 */
export const getSwapRequest = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { id } = req.params;

    const swapRequest = await dbClient.swapRequest.findUnique({
      where: { id },
      include: {
        shift: true,
        fromUser: true,
        toUser: true,
        approvedBy: true,
      },
    });

    if (!swapRequest) {
      res.status(404).json({ error: 'SWAP_NOT_FOUND', message: 'Запрос на обмен не найден' });
      return;
    }

    // Access control
    const isOwnerOrAdmin = req.user.role === 'OWNER' || req.user.role === 'ADMIN';
    const isInvolved = swapRequest.fromUserId === req.user.id || swapRequest.toUserId === req.user.id;
    
    if (!isOwnerOrAdmin && !isInvolved) {
      // Check if user has approve permission for this restaurant
      const hasApprovePermission = swapRequest.shift 
        ? await checkPermission(req.user.id, swapRequest.shift.restaurantId, PERMISSIONS.APPROVE_SHIFT_SWAP)
        : false;
      
      if (!hasApprovePermission) {
        res.status(403).json({ error: 'NOT_AUTHORIZED', message: 'Нет доступа к этому запросу' });
        return;
      }
    }

    res.json({ swapRequest });
  } catch (error) {
    next(error);
  }
};

/**
 * Get incoming swap requests for the current user
 * GET /api/swaps/incoming
 */
export const getIncomingSwapRequests = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { restaurantId } = req.query;

    const where: any = {
      toUserId: req.user.id,
      status: 'PENDING',
    };

    let swapRequests = await dbClient.swapRequest.findMany({
      where,
      include: {
        shift: true,
        fromUser: true,
        toUser: true,
      },
      orderBy: { requestedAt: 'desc' },
    });

    // Filter by restaurant if specified
    if (restaurantId) {
      swapRequests = swapRequests.filter(sr => sr.shift?.restaurantId === restaurantId);
    }

    res.json({ swapRequests });
  } catch (error) {
    next(error);
  }
};

/**
 * Get outgoing swap requests for the current user
 * GET /api/swaps/outgoing
 */
export const getOutgoingSwapRequests = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { restaurantId, status } = req.query;

    const where: any = {
      fromUserId: req.user.id,
    };

    if (status) {
      where.status = status as string;
    }

    let swapRequests = await dbClient.swapRequest.findMany({
      where,
      include: {
        shift: true,
        fromUser: true,
        toUser: true,
        approvedBy: true,
      },
      orderBy: { requestedAt: 'desc' },
    });

    // Filter by restaurant if specified
    if (restaurantId) {
      swapRequests = swapRequests.filter(sr => sr.shift?.restaurantId === restaurantId);
    }

    res.json({ swapRequests });
  } catch (error) {
    next(error);
  }
};

/**
 * Get swap requests pending manager approval
 * GET /api/swaps/pending-approval
 */
export const getPendingApprovalSwapRequests = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { restaurantId } = req.query;

    // Get requests in ACCEPTED status (waiting for manager approval)
    let swapRequests = await dbClient.swapRequest.findMany({
      where: {
        status: 'ACCEPTED',
      },
      include: {
        shift: true,
        fromUser: true,
        toUser: true,
      },
      orderBy: { respondedAt: 'desc' },
    });

    // Filter by restaurant if specified
    if (restaurantId) {
      swapRequests = swapRequests.filter(sr => sr.shift?.restaurantId === restaurantId);
    }

    // Access control: only show requests for restaurants where user has approve permission
    const isOwnerOrAdmin = req.user.role === 'OWNER' || req.user.role === 'ADMIN';
    
    if (!isOwnerOrAdmin) {
      const filteredRequests = [];
      for (const sr of swapRequests) {
        if (sr.shift) {
          const hasApprovePermission = await checkPermission(
            req.user.id, 
            sr.shift.restaurantId, 
            PERMISSIONS.APPROVE_SHIFT_SWAP
          );
          if (hasApprovePermission) {
            filteredRequests.push(sr);
          }
        }
      }
      swapRequests = filteredRequests;
    }

    res.json({ swapRequests });
  } catch (error) {
    next(error);
  }
};
