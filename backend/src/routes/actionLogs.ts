import { Router } from 'express';
import { query } from 'express-validator';
import * as actionLogController from '../controllers/actionLogController';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);

// Получение журнала действий
router.get(
  '/',
  [
    query('userId').optional(),
    query('entityType').optional(),
    query('entityId').optional(),
    query('type').optional(),
    query('startDate').optional().isISO8601(),
    query('endDate').optional().isISO8601(),
    query('limit').optional().isInt({ min: 1, max: 1000 }),
  ],
  actionLogController.getActionLogs
);

export default router;

