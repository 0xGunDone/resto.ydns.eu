/**
 * Swap Routes
 * 
 * API routes for shift swap requests.
 * Requirements: 1.1, 2.1, 3.1
 */

import { Router } from 'express';
import { body, query, param } from 'express-validator';
import * as swapController from '../controllers/swapController';
import { authenticate } from '../middleware/auth';

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * POST /api/swaps - Create a new swap request
 * Requirements: 1.1
 */
router.post(
  '/',
  [
    body('shiftId').notEmpty().withMessage('shiftId is required'),
    body('toUserId').notEmpty().withMessage('toUserId is required'),
  ],
  swapController.createSwapRequest
);

/**
 * GET /api/swaps - Get swap requests with filtering
 * Requirements: 5.1, 5.2, 5.3
 */
router.get(
  '/',
  [
    query('restaurantId').optional().isString(),
    query('status').optional().isIn(['PENDING', 'ACCEPTED', 'REJECTED', 'APPROVED', 'MANAGER_REJECTED', 'EXPIRED']),
    query('fromUserId').optional().isString(),
    query('toUserId').optional().isString(),
    query('startDate').optional().isISO8601(),
    query('endDate').optional().isISO8601(),
    query('includeExpired').optional().isBoolean(),
  ],
  swapController.getSwapRequests
);

/**
 * GET /api/swaps/incoming - Get incoming swap requests for current user
 */
router.get(
  '/incoming',
  [
    query('restaurantId').optional().isString(),
  ],
  swapController.getIncomingSwapRequests
);

/**
 * GET /api/swaps/outgoing - Get outgoing swap requests for current user
 */
router.get(
  '/outgoing',
  [
    query('restaurantId').optional().isString(),
    query('status').optional().isIn(['PENDING', 'ACCEPTED', 'REJECTED', 'APPROVED', 'MANAGER_REJECTED', 'EXPIRED']),
  ],
  swapController.getOutgoingSwapRequests
);

/**
 * GET /api/swaps/pending-approval - Get swap requests pending manager approval
 */
router.get(
  '/pending-approval',
  [
    query('restaurantId').optional().isString(),
  ],
  swapController.getPendingApprovalSwapRequests
);

/**
 * GET /api/swaps/:id - Get a single swap request by ID
 */
router.get(
  '/:id',
  [
    param('id').notEmpty().withMessage('Swap request ID is required'),
  ],
  swapController.getSwapRequest
);

/**
 * POST /api/swaps/:id/respond - Respond to a swap request (accept/reject)
 * Requirements: 2.1
 */
router.post(
  '/:id/respond',
  [
    param('id').notEmpty().withMessage('Swap request ID is required'),
    body('accept').isBoolean().withMessage('accept must be a boolean'),
  ],
  swapController.respondToSwap
);

/**
 * POST /api/swaps/:id/approve - Approve or reject a swap request (manager action)
 * Requirements: 3.1
 */
router.post(
  '/:id/approve',
  [
    param('id').notEmpty().withMessage('Swap request ID is required'),
    body('approve').isBoolean().withMessage('approve must be a boolean'),
  ],
  swapController.approveSwap
);

export default router;
