import { Router } from 'express';
import { body } from 'express-validator';
import * as positionController from '../controllers/positionController';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/:restaurantId', positionController.getPositions);
router.post(
  '/:restaurantId',
  [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('bonusPerShift').optional().isFloat({ min: 0 }),
  ],
  positionController.createPosition
);
router.put(
  '/:id',
  [
    body('name').optional().trim().notEmpty(),
    body('bonusPerShift').optional().isFloat({ min: 0 }),
    body('isActive').optional().isBoolean(),
  ],
  positionController.updatePosition
);
router.delete('/:id', positionController.deletePosition);

export default router;

