import express from 'express';
import { body } from 'express-validator';
import * as scheduleTemplateController from '../controllers/scheduleTemplateController';
import { authenticate } from '../middleware/auth';

const router = express.Router();

// Все маршруты требуют аутентификации
router.use(authenticate);

// Получение всех шаблонов графиков
router.get('/', scheduleTemplateController.getScheduleTemplates);

// Создание шаблона графика
router.post(
  '/',
  [
    body('restaurantId').notEmpty(),
    body('name').notEmpty().trim(),
    body('periodType').optional().isIn(['week', 'month']),
    body('startDate').notEmpty(),
    body('endDate').notEmpty(),
    body('description').optional().trim(),
  ],
  scheduleTemplateController.createScheduleTemplate
);

// Применение шаблона к новому периоду
router.post(
  '/:id/apply',
  [
    body('startDate').notEmpty(),
    body('replaceExisting').optional().isBoolean(),
  ],
  scheduleTemplateController.applyScheduleTemplate
);

// Удаление шаблона
router.delete('/:id', scheduleTemplateController.deleteScheduleTemplate);

export default router;

