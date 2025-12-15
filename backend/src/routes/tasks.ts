import { Router } from 'express';
import { body, query } from 'express-validator';
import * as taskController from '../controllers/taskController';
import { authenticate } from '../middleware/auth';
import { upload } from '../utils/multer';

const router = Router();

router.use(authenticate);

// Получение списка задач
router.get(
  '/',
  [
    query('restaurantId').optional(),
    query('status').optional().isIn(['NEW', 'IN_PROGRESS', 'DONE']),
    query('category').optional(),
    query('assignedToId').optional(),
    query('createdById').optional(),
    query('search').optional(),
  ],
  taskController.getTasks
);

// Получение задачи по ID
router.get('/:id', taskController.getTask);

// Создание задачи
router.post(
  '/',
  [
    body('restaurantId').notEmpty(),
    body('title').trim().notEmpty(),
    body('description').optional(),
    body('category').optional().isIn(['KITCHEN', 'HALL', 'BAR', 'ADMIN', 'SERVICE']),
    body('status').optional().isIn(['NEW', 'IN_PROGRESS', 'DONE']),
    body('assignedToId').optional(),
    body('dueDate').optional().isISO8601(),
    body('isRecurring').optional().isBoolean(),
    body('recurringRule').optional(),
  ],
  taskController.createTask
);

// Обновление задачи
router.put(
  '/:id',
  [
    body('title').optional().trim().notEmpty(),
    body('description').optional(),
    body('category').optional().isIn(['KITCHEN', 'HALL', 'BAR', 'ADMIN', 'SERVICE']),
    body('status').optional().isIn(['NEW', 'IN_PROGRESS', 'DONE']),
    body('assignedToId').optional(),
    body('dueDate').optional().isISO8601(),
    body('isRecurring').optional().isBoolean(),
    body('recurringRule').optional(),
  ],
  taskController.updateTask
);

// Удаление задачи
router.delete('/:id', taskController.deleteTask);

// Загрузка файла
router.post('/:taskId/attachments', upload.single('file'), taskController.uploadAttachment);

// Удаление файла
router.delete('/attachments/:attachmentId', taskController.deleteAttachment);

export default router;

