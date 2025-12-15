import { Router } from 'express';
import { body } from 'express-validator';
import * as restaurantController from '../controllers/restaurantController';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/', restaurantController.getRestaurants);
router.post(
  '/',
  [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('address').optional(),
    body('phone').optional(),
    body('email').optional().trim(),
    body('managerId').optional(),
  ],
  restaurantController.createRestaurant
);
router.put(
  '/:id',
  [
    body('name').optional().trim().notEmpty(),
    body('address').optional(),
    body('phone').optional(),
    body('email').optional().trim(),
    body('managerId').optional(),
    body('isActive').optional().isBoolean(),
  ],
  restaurantController.updateRestaurant
);
router.delete('/:id', restaurantController.deleteRestaurant);
router.get('/:restaurantId/employees', restaurantController.getRestaurantEmployees);
router.get('/:restaurantId/users-for-manager', restaurantController.getRestaurantUsersForManager);

export default router;

