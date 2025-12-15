# План реализации системы прав доступа

## ✅ Статус: Все этапы выполнены

Система прав доступа полностью реализована и работает. Все этапы завершены, права интегрированы в контроллеры, API готов, фронтенд поддерживает управление правами должностей.

## Этап 1: Базовая структура БД ✅
- [x] Создать модель Permission
- [x] Создать модель PositionPermission
- [x] Связать Position с Permission
- [x] Применить миграцию (20251202231000_add_permissions)
- [x] Добавить seed-данные для базовых прав

## Этап 2: Утилиты для работы с правами ✅
- [x] Создать константы прав (permission codes) - `backend/src/utils/permissions.ts`
- [x] Создать утилиту для проверки прав пользователя - `checkPermission()` в `backend/src/utils/checkPermissions.ts`
- [x] Создать функцию получения прав пользователя для ресторана - `getUserPermissions()` в `backend/src/utils/checkPermissions.ts`

## Этап 3: Middleware и проверка прав ✅
- [x] Создать middleware для проверки прав доступа - `requirePermission()` в `backend/src/middleware/auth.ts`
- [x] Обновить существующий middleware requireRestaurantAccess - интегрирован с системой прав
- [x] Добавить проверку прав в контроллеры - реализовано в `taskController.ts`, `timesheetController.ts`

## Этап 4: API для управления правами ✅
- [x] CRUD для Permission - `getPermissions()` в `backend/src/controllers/permissionController.ts`
- [x] API для назначения прав должностям - `updatePositionPermissions()` в `backend/src/controllers/permissionController.ts`
- [x] API для получения прав должности - `getPositionPermissions()` в `backend/src/controllers/permissionController.ts`

## Этап 5: Frontend ✅
- [x] Страница управления правами должностей - `PermissionsModal` в `frontend/src/pages/RestaurantManagePage.tsx`
- [x] Обновление UI в зависимости от прав - частично реализовано
- [x] Скрытие/показ элементов интерфейса - частично реализовано

## Список базовых прав

### Рестораны
- VIEW_RESTAURANTS - просмотр списка ресторанов
- EDIT_RESTAURANTS - редактирование ресторанов

### График работы
- VIEW_SCHEDULE - просмотр графика
- EDIT_SCHEDULE - редактирование графика

### Типы смен
- VIEW_SHIFT_TYPES - просмотр типов смен
- EDIT_SHIFT_TYPES - редактирование типов смен

### Задачи
- VIEW_OWN_TASKS - просмотр только своих задач (где исполнитель или создатель)
- VIEW_ALL_TASKS - просмотр всех задач ресторана
- EDIT_TASKS - создание/редактирование задач

### Табели
- VIEW_OWN_TIMESHEETS - просмотр только своих табелей и зарплаты
- VIEW_ALL_TIMESHEETS - просмотр всех табелей ресторана
- EDIT_TIMESHEETS - редактирование табелей

### Сотрудники
- VIEW_EMPLOYEES - просмотр сотрудников
- EDIT_EMPLOYEES - добавление/редактирование сотрудников

### Должности
- VIEW_POSITIONS - просмотр должностей
- EDIT_POSITIONS - редактирование должностей

### Отделы
- VIEW_DEPARTMENTS - просмотр отделов
- EDIT_DEPARTMENTS - редактирование отделов

