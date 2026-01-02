import { Router } from 'express';
import { body, query } from 'express-validator';
import * as timesheetController from '../controllers/timesheetController';
import { authenticate } from '../middleware/auth';
import { logger } from '../services/loggerService';

const router = Router();

router.use(authenticate);

// Расчет табеля
router.post(
  '/calculate',
  [
    body('restaurantId').notEmpty(),
    body('userId').notEmpty(),
    body('month').isInt({ min: 1, max: 12 }),
    body('year').isInt({ min: 2020, max: 2100 }),
  ],
  timesheetController.calculateTimesheet
);

// ВАЖНО: Специфичные маршруты должны быть ПЕРЕД общими маршрутами
// Получение табеля с расчетом заработка по типам смен
router.get(
  '/earnings',
  (req, res, next) => {
    logger.debug('Earnings route hit', { method: req.method, path: req.path, query: req.query, url: req.url });
    next();
  },
  timesheetController.getTimesheetWithEarnings
);

// Получение сводки табелей по всем сотрудникам
router.get(
  '/summary',
  [
    query('restaurantId').notEmpty().withMessage('restaurantId is required'),
    query('month').toInt().isInt({ min: 1, max: 12 }).withMessage('month must be between 1 and 12'),
    query('year').toInt().isInt({ min: 2020, max: 2100 }).withMessage('year must be between 2020 and 2100'),
  ],
  timesheetController.getTimesheetSummary
);

// Получение табелей
router.get(
  '/',
  [
    query('restaurantId').optional(),
    query('userId').optional(),
    query('month').optional().isInt({ min: 1, max: 12 }),
    query('year').optional().isInt({ min: 2020, max: 2100 }),
  ],
  timesheetController.getTimesheets
);

// Обновление табеля
router.put(
  '/:id',
  [
    body('totalHours').optional().isFloat(),
    body('overtimeHours').optional().isFloat(),
    body('lateCount').optional().isInt(),
    body('sickDays').optional().isInt(),
    body('vacationDays').optional().isInt(),
    body('notes').optional(),
  ],
  timesheetController.updateTimesheet
);

// Одобрение табеля
router.post('/:id/approve', timesheetController.approveTimesheet);

// Экспорт
router.get('/export/excel', timesheetController.exportToExcel);
router.get('/export/pdf', timesheetController.exportToPDF);

export default router;

