# Использование системы прав доступа

## API Endpoints

### Получить все права
```
GET /api/permissions
```
Возвращает все доступные права, сгруппированные по категориям.

### Получить права должности
```
GET /api/permissions/position/:positionId
```
Возвращает список прав, назначенных конкретной должности.

### Обновить права должности
```
PUT /api/permissions/position/:positionId
Body: {
  "permissionIds": ["perm1", "perm2", ...]
}
```
Назначает права должности. Переданный массив заменяет все существующие права.

## Использование в контроллерах

### Пример 1: Проверка прав в контроллере

```typescript
import { requirePermission } from '../middleware/auth';
import { PERMISSIONS } from '../utils/permissions';

// В роуте
router.get(
  '/schedule',
  authenticate,
  requireRestaurantAccess,
  requirePermission(PERMISSIONS.VIEW_SCHEDULE),
  scheduleController.getSchedule
);
```

### Пример 2: Проверка нескольких прав

```typescript
router.post(
  '/schedule',
  authenticate,
  requireRestaurantAccess,
  requirePermission([PERMISSIONS.VIEW_SCHEDULE, PERMISSIONS.EDIT_SCHEDULE]),
  scheduleController.createShift
);
```

### Пример 3: Проверка прав программно

```typescript
import { checkPermission } from '../utils/checkPermissions';
import { PERMISSIONS } from '../utils/permissions';

export const someController = async (req: AuthRequest, res: Response) => {
  const hasPermission = await checkPermission(
    req.user!.id,
    req.body.restaurantId,
    PERMISSIONS.EDIT_SCHEDULE
  );

  if (!hasPermission) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  // Продолжаем работу...
};
```

## Иерархия прав

1. **OWNER/ADMIN** - имеют все права автоматически
2. **MANAGER** - имеют все права в своем ресторане автоматически
3. **EMPLOYEE** - права определяются должностью в ресторане

## Мульти-ресторанность

При проверке прав всегда указывается `restaurantId`. Права проверяются для конкретного ресторана:
- В ресторане А: права должности в ресторане А
- В ресторане Б: права должности в ресторане Б
- Права не объединяются между ресторанами

