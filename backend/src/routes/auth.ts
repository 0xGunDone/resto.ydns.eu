import { Router } from 'express';
import { body } from 'express-validator';
import * as authController from '../controllers/authController';
import { authenticate } from '../middleware/auth';

const router = Router();

// Регистрация
router.post(
  '/register',
  [
    body('email').trim().notEmpty(),
    body('password').isLength({ min: 8 }),
    body('firstName').trim().notEmpty(),
    body('lastName').trim().notEmpty(),
  ],
  authController.register
);

// Вход
router.post(
  '/login',
  [
    body('email').trim().notEmpty(),
    body('password').notEmpty(),
  ],
  authController.login
);

// Обновление токена
router.post('/refresh', authController.refreshToken);

// Выход
router.post('/logout', authenticate, authController.logout);

// Генерация секрета для 2FA
router.post('/2fa/generate', authenticate, authController.generate2FA);

// Включение 2FA
router.post(
  '/2fa/enable',
  authenticate,
  [
    body('token').isLength({ min: 6, max: 6 }).isNumeric(),
  ],
  authController.enable2FA
);

// Отключение 2FA
router.post('/2fa/disable', authenticate, authController.disable2FA);

// Проверка 2FA при входе
router.post(
  '/2fa/verify',
  [
    body('email').trim().notEmpty(),
    body('token').isLength({ min: 6, max: 6 }).isNumeric(),
  ],
  authController.verify2FA
);

// Получение текущего пользователя
router.get('/me', authenticate, authController.getMe);

// Обновление профиля
router.put(
  '/profile',
  authenticate,
  [
    body('email').optional().trim().notEmpty(),
    body('password').optional(),
    body('firstName').optional().trim().notEmpty(),
    body('lastName').optional().trim().notEmpty(),
    body('phone').optional(),
  ],
  authController.updateProfile
);

export default router;

