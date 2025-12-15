import express from 'express';
import { body, query, param } from 'express-validator';
import { authenticate } from '../middleware/auth';
import {
  getHolidays,
  createHoliday,
  updateHoliday,
  deleteHoliday,
} from '../controllers/holidayController';

const router = express.Router();

// Все маршруты требуют аутентификации
router.use(authenticate);

// Получение списка праздников
router.get(
  '/',
  [
    query('restaurantId').notEmpty().withMessage('restaurantId обязателен'),
    query('startDate').optional().isISO8601().withMessage('Неверный формат даты начала'),
    query('endDate').optional().isISO8601().withMessage('Неверный формат даты окончания'),
  ],
  getHolidays
);

// Создание праздника
router.post(
  '/',
  [
    body('restaurantId').notEmpty().withMessage('restaurantId обязателен'),
    body('name').trim().notEmpty().withMessage('Название праздника обязательно'),
    body('date').isISO8601().withMessage('Неверный формат даты'),
    body('type').optional().isIn(['HOLIDAY', 'WEEKEND']).withMessage('Тип должен быть HOLIDAY или WEEKEND'),
    body('isRecurring').optional().isBoolean().withMessage('isRecurring должен быть булевым значением'),
  ],
  createHoliday
);

// Обновление праздника
router.put(
  '/:id',
  [
    param('id').notEmpty().withMessage('ID праздника обязателен'),
    body('name').optional().trim().notEmpty().withMessage('Название праздника не может быть пустым'),
    body('date').optional().isISO8601().withMessage('Неверный формат даты'),
    body('type').optional().isIn(['HOLIDAY', 'WEEKEND']).withMessage('Тип должен быть HOLIDAY или WEEKEND'),
    body('isRecurring').optional().isBoolean().withMessage('isRecurring должен быть булевым значением'),
  ],
  updateHoliday
);

// Удаление праздника
router.delete(
  '/:id',
  [
    param('id').notEmpty().withMessage('ID праздника обязателен'),
  ],
  deleteHoliday
);

export default router;

