import { Router } from 'express';
import * as notificationSettingsController from '../controllers/notificationSettingsController';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/', notificationSettingsController.getSettings);
router.put('/', notificationSettingsController.updateSettings);

export default router;

