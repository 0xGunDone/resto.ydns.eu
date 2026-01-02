# Design Document

## Overview

Комплексное обновление платформы включает четыре основных компонента:
1. **Shift Swap System** - система обмена сменами между сотрудниками
2. **Extended Permissions** - расширенная система прав доступа
3. **PostgreSQL Migration** - миграция на PostgreSQL с сохранением совместимости с SQLite
4. **Telegram Notifications** - система уведомлений через Telegram бот

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Frontend (React)                        │
├─────────────────────────────────────────────────────────────┤
│  SwapRequestModal │ PermissionsPage │ NotificationSettings  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Backend (Express)                         │
├──────────────┬──────────────┬──────────────┬────────────────┤
│ SwapController│PermController│NotifyService │ DatabaseLayer  │
└──────────────┴──────────────┴──────────────┴────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
        ┌──────────┐   ┌──────────┐   ┌──────────────┐
        │ SQLite   │   │PostgreSQL│   │ Telegram API │
        │ (dev)    │   │ (prod)   │   │              │
        └──────────┘   └──────────┘   └──────────────┘
```

## Components and Interfaces

### 1. Shift Swap System

#### SwapRequest Model
```typescript
interface SwapRequest {
  id: string;
  shiftId: string;           // Смена инициатора
  fromUserId: string;        // Инициатор
  toUserId: string;          // Получатель запроса
  status: SwapStatus;
  requestedAt: Date;
  respondedAt?: Date;
  approvedAt?: Date;
  approvedById?: string;
  expiresAt: Date;           // Автоотклонение через 48ч
}

type SwapStatus = 
  | 'PENDING'           // Ожидает ответа сотрудника
  | 'ACCEPTED'          // Принят сотрудником, ждет менеджера
  | 'REJECTED'          // Отклонен сотрудником
  | 'APPROVED'          // Одобрен менеджером, обмен выполнен
  | 'MANAGER_REJECTED'  // Отклонен менеджером
  | 'EXPIRED';          // Истек срок ответа
```

#### SwapController API
```typescript
// POST /api/swaps - создать запрос
createSwapRequest(shiftId: string, toUserId: string): SwapRequest

// GET /api/swaps - список запросов
getSwapRequests(filters: SwapFilters): SwapRequest[]

// POST /api/swaps/:id/respond - ответить на запрос
respondToSwap(id: string, accept: boolean): SwapRequest

// POST /api/swaps/:id/approve - одобрить менеджером
approveSwap(id: string, approve: boolean): SwapRequest
```

#### Swap Flow
```
┌──────────┐    create    ┌─────────┐   accept   ┌──────────┐   approve   ┌──────────┐
│ INITIAL  │ ──────────▶  │ PENDING │ ─────────▶ │ ACCEPTED │ ──────────▶ │ APPROVED │
└──────────┘              └─────────┘            └──────────┘             └──────────┘
                               │                      │
                               │ reject               │ manager reject
                               ▼                      ▼
                          ┌──────────┐         ┌────────────────┐
                          │ REJECTED │         │MANAGER_REJECTED│
                          └──────────┘         └────────────────┘
                               │
                               │ timeout (48h)
                               ▼
                          ┌─────────┐
                          │ EXPIRED │
                          └─────────┘
```

### 2. Extended Permissions

#### New Permission Codes
```typescript
// backend/src/utils/permissions.ts
export const PERMISSIONS = {
  // ... existing permissions ...
  
  // Обмен сменами
  REQUEST_SHIFT_SWAP: 'REQUEST_SHIFT_SWAP',
  APPROVE_SHIFT_SWAP: 'APPROVE_SHIFT_SWAP',
  
  // Объявления
  SEND_ANNOUNCEMENTS: 'SEND_ANNOUNCEMENTS',
  VIEW_ANNOUNCEMENTS: 'VIEW_ANNOUNCEMENTS',
  
  // Отчеты
  VIEW_REPORTS: 'VIEW_REPORTS',
  EXPORT_REPORTS: 'EXPORT_REPORTS',
} as const;

// Обновленные права по умолчанию
export const DEFAULT_EMPLOYEE_PERMISSIONS = [
  PERMISSIONS.VIEW_SCHEDULE,
  PERMISSIONS.VIEW_OWN_TASKS,
  PERMISSIONS.VIEW_OWN_TIMESHEETS,
  PERMISSIONS.REQUEST_SHIFT_SWAP,      // NEW
  PERMISSIONS.VIEW_ANNOUNCEMENTS,      // NEW
];
```

#### Preset Positions
```typescript
const PRESET_POSITIONS = {
  'Официант': [
    'VIEW_SCHEDULE', 'VIEW_OWN_TASKS', 'VIEW_OWN_TIMESHEETS',
    'REQUEST_SHIFT_SWAP', 'VIEW_ANNOUNCEMENTS'
  ],
  'Повар': [
    'VIEW_SCHEDULE', 'VIEW_OWN_TASKS', 'VIEW_OWN_TIMESHEETS',
    'REQUEST_SHIFT_SWAP', 'VIEW_ANNOUNCEMENTS'
  ],
  'Бармен': [
    'VIEW_SCHEDULE', 'VIEW_OWN_TASKS', 'VIEW_OWN_TIMESHEETS',
    'REQUEST_SHIFT_SWAP', 'VIEW_ANNOUNCEMENTS'
  ],
  'Старший смены': [
    'VIEW_SCHEDULE', 'VIEW_ALL_TASKS', 'EDIT_TASKS',
    'VIEW_OWN_TIMESHEETS', 'VIEW_EMPLOYEES',
    'REQUEST_SHIFT_SWAP', 'APPROVE_SHIFT_SWAP',
    'VIEW_ANNOUNCEMENTS', 'SEND_ANNOUNCEMENTS'
  ],
  'Администратор': [
    'VIEW_SCHEDULE', 'EDIT_SCHEDULE',
    'VIEW_ALL_TASKS', 'EDIT_TASKS',
    'VIEW_ALL_TIMESHEETS', 'EDIT_TIMESHEETS',
    'VIEW_EMPLOYEES', 'VIEW_POSITIONS', 'VIEW_DEPARTMENTS',
    'REQUEST_SHIFT_SWAP', 'APPROVE_SHIFT_SWAP',
    'VIEW_ANNOUNCEMENTS', 'SEND_ANNOUNCEMENTS',
    'VIEW_REPORTS'
  ]
};
```

### 3. Database Layer

#### Unified Database Interface
```typescript
// backend/src/utils/database.ts
interface DatabaseAdapter {
  query<T>(sql: string, params?: any[]): Promise<T[]>;
  queryOne<T>(sql: string, params?: any[]): Promise<T | null>;
  execute(sql: string, params?: any[]): Promise<{ changes: number }>;
  transaction<T>(fn: () => Promise<T>): Promise<T>;
}

class SQLiteAdapter implements DatabaseAdapter { ... }
class PostgreSQLAdapter implements DatabaseAdapter { ... }

// Factory
function createDatabaseAdapter(): DatabaseAdapter {
  const dbUrl = process.env.DATABASE_URL;
  if (dbUrl?.startsWith('postgresql://')) {
    return new PostgreSQLAdapter(dbUrl);
  }
  return new SQLiteAdapter(dbUrl || 'file:./dev.db');
}
```

#### PostgreSQL Schema
```sql
-- SwapRequest table
CREATE TABLE "SwapRequest" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "shiftId" UUID NOT NULL REFERENCES "Shift"("id") ON DELETE CASCADE,
  "fromUserId" UUID NOT NULL REFERENCES "User"("id"),
  "toUserId" UUID NOT NULL REFERENCES "User"("id"),
  "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  "requestedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "respondedAt" TIMESTAMPTZ,
  "approvedAt" TIMESTAMPTZ,
  "approvedById" UUID REFERENCES "User"("id"),
  "expiresAt" TIMESTAMPTZ NOT NULL
);

CREATE INDEX "SwapRequest_shiftId_idx" ON "SwapRequest"("shiftId");
CREATE INDEX "SwapRequest_fromUserId_idx" ON "SwapRequest"("fromUserId");
CREATE INDEX "SwapRequest_toUserId_idx" ON "SwapRequest"("toUserId");
CREATE INDEX "SwapRequest_status_idx" ON "SwapRequest"("status");
```

### 4. Notification System

#### NotificationService
```typescript
interface NotificationService {
  // Уведомления о сменах
  notifyShiftAssigned(userId: string, shift: Shift): Promise<void>;
  notifyShiftChanged(userId: string, shift: Shift): Promise<void>;
  notifyShiftReminder(userId: string, shift: Shift, hoursUntil: number): Promise<void>;
  
  // Уведомления об обменах
  notifySwapRequested(toUserId: string, swap: SwapRequest): Promise<void>;
  notifySwapResponded(fromUserId: string, swap: SwapRequest): Promise<void>;
  notifySwapApproved(userIds: string[], swap: SwapRequest): Promise<void>;
  
  // Уведомления о задачах
  notifyTaskAssigned(userId: string, task: Task): Promise<void>;
  notifyTaskDueSoon(userId: string, task: Task): Promise<void>;
}
```

#### Telegram Bot Commands
```typescript
// Новые команды
bot.command('today', handleTodayCommand);    // Смены на сегодня
bot.command('week', handleWeekCommand);      // Смены на неделю
bot.command('swaps', handleSwapsCommand);    // Активные запросы обмена
bot.command('tasks', handleTasksCommand);    // Мои задачи
bot.command('settings', handleSettingsCommand); // Настройки уведомлений

// Callback handlers для кнопок
bot.action(/swap_accept_(.+)/, handleSwapAccept);
bot.action(/swap_reject_(.+)/, handleSwapReject);
```

#### Notification Settings Model
```typescript
interface NotificationSettings {
  userId: string;
  enableShiftNotifications: boolean;      // Уведомления о сменах
  enableSwapNotifications: boolean;       // Уведомления об обменах
  enableTaskNotifications: boolean;       // Уведомления о задачах
  enableReminders: boolean;               // Напоминания
  reminderHoursBefore: number;            // За сколько часов напоминать (default: 12)
}
```

## Data Models

### SwapRequest Table (SQLite)
```sql
CREATE TABLE "SwapRequest" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "shiftId" TEXT NOT NULL,
  "fromUserId" TEXT NOT NULL,
  "toUserId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "requestedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "respondedAt" DATETIME,
  "approvedAt" DATETIME,
  "approvedById" TEXT,
  "expiresAt" DATETIME NOT NULL,
  CONSTRAINT "SwapRequest_shiftId_fkey" FOREIGN KEY ("shiftId") 
    REFERENCES "Shift" ("id") ON DELETE CASCADE,
  CONSTRAINT "SwapRequest_fromUserId_fkey" FOREIGN KEY ("fromUserId") 
    REFERENCES "User" ("id"),
  CONSTRAINT "SwapRequest_toUserId_fkey" FOREIGN KEY ("toUserId") 
    REFERENCES "User" ("id"),
  CONSTRAINT "SwapRequest_approvedById_fkey" FOREIGN KEY ("approvedById") 
    REFERENCES "User" ("id")
);
```

### NotificationSettings Table
```sql
CREATE TABLE "NotificationSettings" (
  -- Уже существует, добавляем поля:
  "enableSwapNotifications" BOOLEAN NOT NULL DEFAULT true,
  "enableReminders" BOOLEAN NOT NULL DEFAULT true,
  "reminderHoursBefore" INTEGER NOT NULL DEFAULT 12
);
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do.*

### Property 1: Swap request creates PENDING status
*For any* valid shift and target employee, creating a swap request SHALL result in a SwapRequest with status PENDING
**Validates: Requirements 1.2**

### Property 2: Past shifts cannot be swapped
*For any* shift with startTime in the past, attempting to create a swap request SHALL be rejected
**Validates: Requirements 1.4**

### Property 3: No duplicate active swap requests
*For any* shift with an existing PENDING or ACCEPTED swap request, creating another request SHALL be rejected
**Validates: Requirements 1.5**

### Property 4: Status transitions are valid
*For any* SwapRequest, status can only transition: PENDING→ACCEPTED, PENDING→REJECTED, PENDING→EXPIRED, ACCEPTED→APPROVED, ACCEPTED→MANAGER_REJECTED
**Validates: Requirements 2.2, 2.3, 2.5, 3.2, 3.3**

### Property 5: Approved swap exchanges user IDs
*For any* SwapRequest that transitions to APPROVED, the shift's userId SHALL be changed to toUserId
**Validates: Requirements 3.2, 4.1**

### Property 6: Swap history is created
*For any* SwapRequest that transitions to APPROVED, a history record SHALL be created
**Validates: Requirements 4.2**

### Property 7: Failed swap rollback
*For any* swap execution that fails, the shift's userId SHALL remain unchanged
**Validates: Requirements 4.3**

### Property 8: New permissions exist
*For all* new permission codes (REQUEST_SHIFT_SWAP, APPROVE_SHIFT_SWAP, SEND_ANNOUNCEMENTS, VIEW_ANNOUNCEMENTS, VIEW_REPORTS, EXPORT_REPORTS), they SHALL exist in PERMISSIONS constant
**Validates: Requirements 6.1, 6.2, 7.1, 7.2, 8.1, 8.2**

### Property 9: Default permissions include swap
*For any* new employee without position, they SHALL have REQUEST_SHIFT_SWAP permission
**Validates: Requirements 6.3**

### Property 10: Preset positions created with restaurant
*For any* newly created restaurant, preset positions (Официант, Повар, Бармен, Старший смены, Администратор) SHALL be created
**Validates: Requirements 9.1**

### Property 11: Database adapter compatibility
*For any* CRUD operation, both SQLite and PostgreSQL adapters SHALL produce equivalent results
**Validates: Requirements 10.2, 10.3**

### Property 12: Shift assignment triggers notification
*For any* shift assignment to a user with Telegram linked, a notification SHALL be sent
**Validates: Requirements 13.1**

### Property 13: Swap request triggers interactive notification
*For any* swap request creation, the target employee SHALL receive a Telegram message with accept/reject buttons
**Validates: Requirements 14.1**

### Property 14: Notification settings are respected
*For any* notification event, if the user has disabled that notification type, no message SHALL be sent
**Validates: Requirements 16.1, 16.2, 16.3**

## Error Handling

### Swap Errors
- `SHIFT_NOT_FOUND` - смена не найдена
- `SHIFT_IN_PAST` - смена в прошлом
- `SWAP_ALREADY_EXISTS` - уже есть активный запрос
- `SWAP_NOT_FOUND` - запрос не найден
- `INVALID_STATUS_TRANSITION` - недопустимый переход статуса
- `NOT_AUTHORIZED` - нет прав на действие

### Database Errors
- `CONNECTION_FAILED` - ошибка подключения к БД
- `MIGRATION_FAILED` - ошибка миграции
- `TRANSACTION_FAILED` - ошибка транзакции

### Notification Errors
- `TELEGRAM_NOT_LINKED` - Telegram не привязан
- `NOTIFICATION_FAILED` - ошибка отправки уведомления

## Testing Strategy

### Unit Tests
- SwapController: создание, ответ, одобрение запросов
- PermissionService: проверка новых прав
- NotificationService: формирование сообщений
- DatabaseAdapter: CRUD операции

### Property-Based Tests
- Используем fast-check для TypeScript
- Минимум 100 итераций на свойство
- Генераторы для SwapRequest, Shift, User

### Integration Tests
- Полный flow обмена сменами
- Telegram bot callbacks
- Миграция SQLite → PostgreSQL
