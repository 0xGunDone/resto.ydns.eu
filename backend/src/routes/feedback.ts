import { Router } from 'express';
import { body, query } from 'express-validator';
import * as feedbackController from '../controllers/feedbackController';
import { authenticate } from '../middleware/auth';
import { upload } from '../utils/multer';

const router = Router();

// Создание обратной связи (публичный, но с опциональной аутентификацией)
router.post(
  '/',
  [
    body('restaurantId').notEmpty(),
    body('message').trim().notEmpty(),
    body('type').optional().isIn(['COMPLAINT', 'IDEA', 'MENU_SUGGESTION']),
    body('isAnonymous').optional().isBoolean(),
    body('email').optional().trim(),
    body('phone').optional(),
  ],
  feedbackController.createFeedback
);

// Все остальные маршруты требуют аутентификации
router.use(authenticate);

// Получение обратной связи
router.get(
  '/',
  [
    query('restaurantId').optional(),
    query('status').optional().isIn(['PENDING', 'IN_WORK', 'RESOLVED', 'REJECTED']),
    query('type').optional(),
  ],
  feedbackController.getFeedback
);

// Обновление статуса
router.put(
  '/:id/status',
  [
    body('status').isIn(['PENDING', 'IN_WORK', 'RESOLVED', 'REJECTED']),
    body('response').optional(),
  ],
  feedbackController.updateFeedbackStatus
);

// Загрузка вложения
router.post('/:feedbackId/attachments', upload.single('file'), feedbackController.uploadAttachment);

export default router;

