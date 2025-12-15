import { Router } from 'express';
import * as pushSubscriptionController from '../controllers/pushSubscriptionController';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.post('/subscribe', pushSubscriptionController.subscribe);
router.post('/unsubscribe', pushSubscriptionController.unsubscribe);
router.get('/', pushSubscriptionController.getSubscriptions);

export default router;

