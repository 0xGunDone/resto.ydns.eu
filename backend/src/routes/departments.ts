import { Router } from 'express';
import { body } from 'express-validator';
import * as departmentController from '../controllers/departmentController';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/:restaurantId', departmentController.getDepartments);
router.post(
  '/:restaurantId',
  [
    body('name').trim().notEmpty().withMessage('Name is required'),
  ],
  departmentController.createDepartment
);
router.put(
  '/:id',
  [
    body('name').optional().trim().notEmpty(),
    body('isActive').optional().isBoolean(),
  ],
  departmentController.updateDepartment
);
router.delete('/:id', departmentController.deleteDepartment);

export default router;

