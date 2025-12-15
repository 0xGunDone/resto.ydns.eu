import express from 'express';
import { body, query, param } from 'express-validator';
import { authenticate } from '../middleware/auth';
import {
  getPenalties,
  createPenalty,
  updatePenalty,
  deletePenalty,
} from '../controllers/bonusPenaltyController';

const router = express.Router();

// Все маршруты требуют аутентификации
router.use(authenticate);

// Получение списка штрафов
router.get(
  '/',
  [
    query('restaurantId').optional(),
    query('userId').optional(),
    query('timesheetId').optional(),
    query('month').optional().isInt(),
    query('year').optional().isInt(),
    query('startDate').optional().isISO8601(),
    query('endDate').optional().isISO8601(),
  ],
  getPenalties
);

// Создание штрафа
router.post(
  '/',
  [
    body('restaurantId').notEmpty().withMessage('restaurantId обязателен'),
    body('userId').notEmpty().withMessage('userId обязателен'),
    body('amount').isFloat({ min: 0 }).withMessage('Сумма штрафа должна быть положительным числом'),
    body('comment').optional().trim(),
    body('timesheetId').optional(),
    body('month').optional().isInt({ min: 1, max: 12 }),
    body('year').optional().isInt({ min: 2000 }),
  ],
  createPenalty
);

// Обновление штрафа
router.put(
  '/:id',
  [
    param('id').notEmpty().withMessage('ID штрафа обязателен'),
    body('amount').optional().isFloat({ min: 0 }).withMessage('Сумма штрафа должна быть положительным числом'),
    body('comment').optional().trim(),
  ],
  updatePenalty
);

// Удаление штрафа
router.delete(
  '/:id',
  [
    param('id').notEmpty().withMessage('ID штрафа обязателен'),
  ],
  deletePenalty
);

export default router;

