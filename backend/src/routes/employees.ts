import { Router } from 'express';
import { body } from 'express-validator';
import * as employeeController from '../controllers/employeeController';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/users', employeeController.getUsers);
router.get('/profile/:userId', employeeController.getEmployeeExtendedProfile);
router.get('/:restaurantId', employeeController.getEmployees);
router.post(
  '/:restaurantId',
  [
    body('firstName').trim().notEmpty(),
    body('lastName').trim().notEmpty(),
    body('positionId').notEmpty(),
    body('email').optional().trim(),
    body('password').optional(),
    body('phone').optional(),
    body('departmentId').optional(),
  ],
  employeeController.createEmployee
);
router.put(
  '/:restaurantId/:employeeId',
  [
    body('positionId').notEmpty(),
    body('departmentId').optional(),
    body('isActive').optional().isBoolean(),
    body('email').optional().trim(),
    body('password')
      .optional({ checkFalsy: true })
      .custom((value) => {
        // Если значение передано, проверяем длину пароля
        if (value && typeof value === 'string' && value.trim()) {
          if (value.trim().length < 6) {
            throw new Error('Пароль должен быть не менее 6 символов');
          }
        }
        return true;
      }),
  ],
  employeeController.updateEmployee
);
router.delete('/:restaurantId/:employeeId', employeeController.removeEmployee);

export default router;

