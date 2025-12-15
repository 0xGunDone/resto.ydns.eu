import express from 'express';
import { body, query, param } from 'express-validator';
import { authenticate } from '../middleware/auth';
import {
  getBonuses,
  createBonus,
  updateBonus,
  deleteBonus,
} from '../controllers/bonusPenaltyController';

const router = express.Router();

// Все маршруты требуют аутентификации
router.use(authenticate);

// Получение списка премий
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
  getBonuses
);

// Создание премии
router.post(
  '/',
  [
    body('restaurantId').notEmpty().withMessage('restaurantId обязателен'),
    body('userId').notEmpty().withMessage('userId обязателен'),
    body('amount').isFloat({ min: 0 }).withMessage('Сумма премии должна быть положительным числом'),
    body('comment').optional().trim(),
    body('timesheetId').optional(),
    body('month').optional().isInt({ min: 1, max: 12 }),
    body('year').optional().isInt({ min: 2000 }),
  ],
  createBonus
);

// Обновление премии
router.put(
  '/:id',
  [
    param('id').notEmpty().withMessage('ID премии обязателен'),
    body('amount').optional().isFloat({ min: 0 }).withMessage('Сумма премии должна быть положительным числом'),
    body('comment').optional().trim(),
  ],
  updateBonus
);

// Удаление премии
router.delete(
  '/:id',
  [
    param('id').notEmpty().withMessage('ID премии обязателен'),
  ],
  deleteBonus
);

export default router;

