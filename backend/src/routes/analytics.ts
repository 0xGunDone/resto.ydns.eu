import { Router } from 'express';
import { query } from 'express-validator';
import * as analyticsController from '../controllers/analyticsController';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);

// KPI
router.get(
  '/kpis',
  [
    query('restaurantId').notEmpty(),
    query('startDate').optional().isISO8601(),
    query('endDate').optional().isISO8601(),
  ],
  analyticsController.getKPIs
);

// Статистика по сотрудникам
router.get(
  '/employees',
  [
    query('restaurantId').notEmpty(),
    query('userId').optional(),
    query('month').optional().isInt({ min: 1, max: 12 }),
    query('year').optional().isInt({ min: 2020, max: 2100 }),
  ],
  analyticsController.getEmployeeStats
);

export default router;

