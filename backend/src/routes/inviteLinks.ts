import { Router } from 'express';
import { body, query } from 'express-validator';
import * as inviteLinkController from '../controllers/inviteLinkController';
import { authenticate } from '../middleware/auth';

const router = Router();

// Создание пригласительной ссылки (требует аутентификации)
router.post(
  '/',
  authenticate,
  [
    body('restaurantId').notEmpty().withMessage('restaurantId is required'),
    body('positionId').optional().isString(),
    body('departmentId').optional().isString(),
    body('expiresAt').optional().isISO8601(),
    body('maxUses').optional().isInt({ min: 1 }),
  ],
  inviteLinkController.createInviteLink
);

// Получение списка пригласительных ссылок (требует аутентификации)
router.get(
  '/',
  authenticate,
  [
    query('restaurantId').optional().isString(),
  ],
  inviteLinkController.getInviteLinks
);

// Получение информации о ссылке по токену (для бота, без аутентификации)
router.get('/token/:token', inviteLinkController.getInviteLinkByToken as any);

// Деактивация пригласительной ссылки (требует аутентификации)
router.put('/:id/deactivate', authenticate, inviteLinkController.deactivateInviteLink);

// Использование пригласительной ссылки (для бота, без аутентификации)
router.post('/use', [
  body('token').notEmpty().withMessage('token is required'),
], inviteLinkController.useInviteLink as any);

// Создание ссылки для привязки Telegram (требует аутентификации)
router.post('/bind-telegram', authenticate, inviteLinkController.createTelegramBindLink);

export default router;

