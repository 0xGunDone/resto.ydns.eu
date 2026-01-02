import { Router } from 'express';
import { body, query } from 'express-validator';
import * as shiftController from '../controllers/shiftController';
import { authenticate, requireRestaurantAccess } from '../middleware/auth';

const router = Router();

// Шаблоны смен теперь управляются через /api/shift-templates

// Все остальные маршруты требуют аутентификации
router.use(authenticate);

// Создание смены (только дата, тип, сотрудник)
router.post(
  '/',
  [
    body('restaurantId').notEmpty(),
    body('userId').notEmpty(),
    body('type').isIn(['FULL', 'MORNING', 'EVENING', 'PARTIAL']),
    body('date').isISO8601(), // Только дата, время вычисляется автоматически
  ],
  shiftController.createShift
);

// Получение смен
router.get(
  '/',
  [
    query('restaurantId').optional(),
    query('userId').optional(),
    query('startDate').optional().isISO8601(),
    query('endDate').optional().isISO8601(),
    query('type').optional().isIn(['FULL', 'MORNING', 'EVENING', 'PARTIAL']),
  ],
  shiftController.getShifts
);

// Специфичные маршруты ДО динамических маршрутов (/:id)
// Получение запросов на обмен сменами (для менеджеров)
router.get(
  '/swap-requests',
  [
    query('restaurantId').optional(),
  ],
  shiftController.getShiftSwapRequests
);

// Получение входящих запросов на обмен (для сотрудников, которым предложили обмен)
router.get(
  '/swap-requests/incoming',
  [
    query('restaurantId').optional(),
  ],
  shiftController.getIncomingSwapRequests
);

// Получение истории изменений графика (было swap-history)
router.get(
  '/change-history',
  [
    query('restaurantId').optional(),
    query('userId').optional(),
    query('status').optional().isIn(['REQUESTED', 'APPROVED', 'REJECTED', 'ACCEPTED_BY_EMPLOYEE', 'REJECTED_BY_EMPLOYEE', 'CREATED', 'UPDATED', 'DELETED']),
    query('changeType').optional().isIn(['SWAP', 'CREATE', 'UPDATE', 'DELETE', 'BATCH_CREATE', 'BATCH_DELETE']),
    query('startDate').optional().isISO8601(),
    query('endDate').optional().isISO8601(),
  ],
  shiftController.getShiftSwapHistory
);

// Обратная совместимость - старый маршрут
router.get(
  '/swap-history',
  [
    query('restaurantId').optional(),
    query('userId').optional(),
    query('status').optional().isIn(['REQUESTED', 'APPROVED', 'REJECTED', 'ACCEPTED_BY_EMPLOYEE', 'REJECTED_BY_EMPLOYEE', 'CREATED', 'UPDATED', 'DELETED']),
    query('changeType').optional().isIn(['SWAP', 'CREATE', 'UPDATE', 'DELETE', 'BATCH_CREATE', 'BATCH_DELETE']),
    query('startDate').optional().isISO8601(),
    query('endDate').optional().isISO8601(),
  ],
  shiftController.getShiftSwapHistory
);

// Массовое создание смен (мультивыбор)
router.post(
  '/batch',
  [
    body('restaurantId').notEmpty(),
    body('shifts').isArray(),
    body('shifts.*.userId').notEmpty(),
    body('shifts.*.type').notEmpty(), // ID шаблона или название типа
    body('shifts.*.date').notEmpty(), // Дата в формате YYYY-MM-DD или ISO
  ],
  shiftController.createShiftsBatch
);

// Копирование графика
router.post(
  '/copy',
  [
    body('restaurantId').notEmpty(),
    body('fromDate').isISO8601(),
    body('toDate').isISO8601(),
    body('period').isIn(['week', 'month']),
  ],
  shiftController.copySchedule
);

// Массовое удаление смен по выбранным ячейкам
router.post(
  '/batch/delete',
  [
    body('restaurantId').notEmpty(),
    body('cellKeys').isArray(),
    body('cellKeys.*').isString(),
  ],
  shiftController.deleteShiftsBatch
);

// Удаление всех смен сотрудника за период
router.post(
  '/delete-employee',
  [
    body('restaurantId').notEmpty(),
    body('userId').notEmpty(),
    body('startDate').isISO8601(),
    body('endDate').isISO8601(),
  ],
  shiftController.deleteEmployeeShifts
);

// Получение одной смены
router.get('/:id', shiftController.getShift);

// Обновление смены (валидация внутри контроллера)
router.put('/:id', shiftController.updateShift);

// Удаление смены
router.delete('/:id', shiftController.deleteShift);

// Запрос на обмен сменой
router.post(
  '/:id/swap',
  [
    body('swapRequestedTo').notEmpty(),
  ],
  shiftController.requestShiftSwap
);

// Ответ сотрудника на запрос обмена (принять/отклонить)
router.post(
  '/:id/swap/respond',
  [
    body('accepted').isBoolean(),
  ],
  shiftController.respondToSwapRequest
);

// Подтверждение/отклонение обмена менеджером (финальное одобрение)
router.post(
  '/:id/swap/approve',
  [
    body('approved').isBoolean(),
  ],
  shiftController.approveShiftSwap
);

export default router;

