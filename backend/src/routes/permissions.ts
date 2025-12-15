import { Router } from 'express';
import { body, query } from 'express-validator';
import * as permissionController from '../controllers/permissionController';
import { authenticate } from '../middleware/auth';

const router = Router();

// Все маршруты требуют аутентификации
router.use(authenticate);

// Получение всех прав
router.get('/', permissionController.getPermissions);

// Получение прав должности
router.get('/position/:positionId', permissionController.getPositionPermissions);

// Обновление прав должности
router.put(
  '/position/:positionId',
  [
    body('permissionIds').isArray().withMessage('permissionIds must be an array'),
    body('permissionIds.*').isString().withMessage('Each permissionId must be a string'),
  ],
  permissionController.updatePositionPermissions
);

// Получение прав пользователя в ресторане
router.get(
  '/user/:userId',
  [
    query('restaurantId').notEmpty(),
  ],
  permissionController.getUserPermissions
);

export default router;

