import { Router } from 'express';
import { body, query } from 'express-validator';
import * as shiftTemplateController from '../controllers/shiftTemplateController';
import { authenticate } from '../middleware/auth';

const router = Router();

// Получение шаблонов (публичный, но с аутентификацией для фильтрации)
router.get(
  '/',
  [
    query('restaurantId').optional(),
  ],
  authenticate,
  shiftTemplateController.getShiftTemplates
);

// Создание шаблона
router.post(
  '/',
  authenticate,
  [
    body('name').trim().notEmpty(),
    body('startHour').isInt({ min: 0, max: 23 }),
    body('endHour').isInt({ min: 0, max: 23 }),
    body('color').optional().isString(),
    body('rate').optional().isFloat({ min: 0 }),
    body('restaurantId').optional(),
  ],
  shiftTemplateController.createShiftTemplate
);

// Обновление шаблона
router.put(
  '/:id',
  authenticate,
  [
    body('name').optional().trim().notEmpty(),
    body('startHour').optional().isInt({ min: 0, max: 23 }),
    body('endHour').optional().isInt({ min: 0, max: 23 }),
    body('color').optional().isString(),
    body('rate').optional().isFloat({ min: 0 }),
    body('isActive').optional().isBoolean(),
  ],
  shiftTemplateController.updateShiftTemplate
);

// Удаление шаблона
router.delete(
  '/:id',
  authenticate,
  shiftTemplateController.deleteShiftTemplate
);

export default router;

