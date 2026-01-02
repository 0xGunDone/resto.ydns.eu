# Design Document: Project Refactoring

## Overview

Комплексный рефакторинг системы управления ресторанами для устранения архитектурных проблем, улучшения качества кода и обеспечения стабильной работы. Рефакторинг затрагивает: систему прав доступа, TypeScript типизацию, Telegram-бот, слой базы данных, обработку ошибок и модульность кода.

## Architecture

### Текущая архитектура (проблемы)

```
┌─────────────────────────────────────────────────────────────┐
│                      Frontend (React)                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ usePermissions│ │ authStore   │  │ Pages (монолитные)  │  │
│  │ (без кэша)   │ │ (zustand)   │  │                     │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      Backend (Express)                       │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ Controllers (1000+ строк, дублирование логики прав)     ││
│  └─────────────────────────────────────────────────────────┘│
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ auth.ts     │  │checkPermissions│ │ db.ts (1200+ строк)│  │
│  │ (базовый)   │  │ (разрозненный)│ │ (монолитный)       │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ Telegram Bot (сессии в памяти, @ts-ignore)              ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    SQLite (better-sqlite3)                   │
└─────────────────────────────────────────────────────────────┘
```

### Целевая архитектура

```
┌─────────────────────────────────────────────────────────────┐
│                      Frontend (React)                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ usePermissions│ │ authStore   │  │ Pages (компактные)  │  │
│  │ (с кэшем)   │  │ (zustand)   │  │                     │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      Backend (Express)                       │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ Controllers (тонкие, только HTTP логика)                ││
│  └─────────────────────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────────────────────┐│
│  │ Services (бизнес-логика)                                ││
│  └─────────────────────────────────────────────────────────┘│
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │PermissionSvc│  │ Validators  │  │ Logger (winston)    │  │
│  │ (единый)    │  │ (централиз.)│  │                     │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ Database Layer (модульный, типизированный)              ││
│  │  ├── queryBuilder.ts                                    ││
│  │  ├── typeConverters.ts                                  ││
│  │  └── repositories/*.ts                                  ││
│  └─────────────────────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────────────────────┐│
│  │ Telegram Bot (сессии в БД, типизированный)              ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    SQLite (better-sqlite3)                   │
│                    + TelegramSession table                   │
└─────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### 1. Permission Service (backend/src/services/permissionService.ts)

Централизованный сервис для всех проверок прав доступа.

```typescript
// Типы
interface PermissionCheckResult {
  allowed: boolean;
  reason?: string;
  permissions?: PermissionCode[];
}

interface PermissionContext {
  userId: string;
  restaurantId?: string;
  targetUserId?: string;
}

// Интерфейс сервиса
interface IPermissionService {
  // Проверка конкретного права
  checkPermission(
    ctx: PermissionContext,
    permission: PermissionCode
  ): Promise<PermissionCheckResult>;
  
  // Проверка любого из списка прав
  checkAnyPermission(
    ctx: PermissionContext,
    permissions: PermissionCode[]
  ): Promise<PermissionCheckResult>;
  
  // Получение всех прав пользователя в ресторане
  getUserPermissions(
    userId: string,
    restaurantId: string
  ): Promise<PermissionCode[]>;
  
  // Проверка доступа к ресторану
  checkRestaurantAccess(
    userId: string,
    restaurantId: string
  ): Promise<boolean>;
  
  // Проверка, является ли пользователь владельцем данных
  isDataOwner(
    userId: string,
    targetUserId: string
  ): boolean;
}
```

### 2. Validation Service (backend/src/services/validationService.ts)

Централизованная валидация входных данных.

```typescript
interface ValidationResult {
  valid: boolean;
  errors?: ValidationError[];
}

interface ValidationError {
  field: string;
  message: string;
  code: string;
}

interface IValidationService {
  // Валидация существования ресторана
  validateRestaurantExists(restaurantId: string): Promise<ValidationResult>;
  
  // Валидация существования пользователя
  validateUserExists(userId: string): Promise<ValidationResult>;
  
  // Валидация членства в ресторане
  validateRestaurantMembership(
    userId: string,
    restaurantId: string
  ): Promise<ValidationResult>;
  
  // Валидация дат
  validateDateRange(
    startDate: string,
    endDate: string
  ): ValidationResult;
}
```

### 3. Database Layer (модульная структура)

```
backend/src/database/
├── index.ts              # Экспорт всех модулей
├── connection.ts         # Подключение к БД
├── queryBuilder.ts       # Построение SQL запросов
├── typeConverters.ts     # Конвертация типов (boolean, date)
├── types.ts              # TypeScript типы для всех таблиц
└── repositories/
    ├── userRepository.ts
    ├── restaurantRepository.ts
    ├── shiftRepository.ts
    ├── taskRepository.ts
    ├── timesheetRepository.ts
    └── telegramSessionRepository.ts
```

### 4. Telegram Bot (рефакторинг)

```typescript
// Типы сессий
interface TelegramSession {
  id: string;
  telegramUserId: string;
  step: TelegramStep;
  inviteToken?: string;
  registrationData?: RegistrationData;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
}

type TelegramStep = 
  | 'idle'
  | 'awaiting_first_name'
  | 'awaiting_last_name'
  | 'awaiting_phone'
  | 'confirming_registration';

interface RegistrationData {
  firstName?: string;
  lastName?: string;
  phone?: string;
}

// Интерфейс сервиса сессий
interface ITelegramSessionService {
  getSession(telegramUserId: string): Promise<TelegramSession | null>;
  createSession(telegramUserId: string): Promise<TelegramSession>;
  updateSession(
    telegramUserId: string,
    data: Partial<TelegramSession>
  ): Promise<TelegramSession>;
  deleteSession(telegramUserId: string): Promise<void>;
  cleanExpiredSessions(): Promise<number>;
}
```

### 5. Logger Service (backend/src/services/loggerService.ts)

```typescript
type LogLevel = 'error' | 'warn' | 'info' | 'debug';

interface LogContext {
  userId?: string;
  restaurantId?: string;
  action?: string;
  [key: string]: any;
}

interface ILogger {
  error(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  debug(message: string, context?: LogContext): void;
}
```

### 6. Error Response Format

```typescript
interface ApiError {
  status: number;
  code: string;
  message: string;
  details?: Record<string, any>;
  timestamp: string;
}

// Коды ошибок
const ErrorCodes = {
  // Аутентификация
  AUTH_TOKEN_MISSING: 'AUTH_TOKEN_MISSING',
  AUTH_TOKEN_INVALID: 'AUTH_TOKEN_INVALID',
  AUTH_TOKEN_EXPIRED: 'AUTH_TOKEN_EXPIRED',
  AUTH_USER_INACTIVE: 'AUTH_USER_INACTIVE',
  
  // Авторизация
  FORBIDDEN_NO_PERMISSION: 'FORBIDDEN_NO_PERMISSION',
  FORBIDDEN_NO_RESTAURANT_ACCESS: 'FORBIDDEN_NO_RESTAURANT_ACCESS',
  
  // Валидация
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  RESTAURANT_NOT_FOUND: 'RESTAURANT_NOT_FOUND',
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  
  // Внутренние ошибки
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
} as const;
```

## Data Models

### Новая таблица: TelegramSession

```sql
CREATE TABLE telegram_sessions (
  id TEXT PRIMARY KEY,
  telegram_user_id TEXT NOT NULL UNIQUE,
  step TEXT NOT NULL DEFAULT 'idle',
  invite_token TEXT,
  registration_data TEXT, -- JSON
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX idx_telegram_sessions_user ON telegram_sessions(telegram_user_id);
CREATE INDEX idx_telegram_sessions_expires ON telegram_sessions(expires_at);
```

### TypeScript типы для существующих таблиц

```typescript
// backend/src/database/types.ts

interface User {
  id: string;
  email: string;
  password: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  role: UserRole;
  isActive: boolean;
  telegramId: string | null;
  twoFactorSecret: string | null;
  twoFactorEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

type UserRole = 'OWNER' | 'ADMIN' | 'MANAGER' | 'EMPLOYEE';

interface Restaurant {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  managerId: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface RestaurantUser {
  id: string;
  userId: string;
  restaurantId: string;
  positionId: string;
  departmentId: string | null;
  hourlyRate: number | null;
  hireDate: Date | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface Position {
  id: string;
  restaurantId: string;
  name: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface Permission {
  id: string;
  code: string;
  name: string;
  description: string | null;
}

interface PositionPermission {
  id: string;
  positionId: string;
  permissionId: string;
}

interface Shift {
  id: string;
  restaurantId: string;
  userId: string;
  shiftTypeId: string | null;
  startTime: Date;
  endTime: Date;
  hours: number;
  isConfirmed: boolean;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface Task {
  id: string;
  restaurantId: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  category: string | null;
  assignedToId: string | null;
  createdById: string;
  dueDate: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

type TaskStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

interface Timesheet {
  id: string;
  restaurantId: string;
  userId: string;
  month: number;
  year: number;
  totalHours: number;
  overtimeHours: number;
  lateCount: number;
  isApproved: boolean;
  approvedById: string | null;
  approvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
```



## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: OWNER/ADMIN Permission Bypass

*For any* user with OWNER or ADMIN role, and *for any* permission code, the permission check SHALL return `allowed: true`.

**Validates: Requirements 1.3**

### Property 2: Restaurant Membership Prerequisite

*For any* user without OWNER/ADMIN role, and *for any* restaurantId where the user is not a member (no active RestaurantUser record), permission checks SHALL return `allowed: false` regardless of the specific permission requested.

**Validates: Requirements 1.2**

### Property 3: Manager Auto-Permissions

*For any* user who is the manager of a restaurant (restaurant.managerId === userId), and *for any* permission in MANAGER_AUTO_PERMISSIONS, the permission check for that restaurant SHALL return `allowed: true`.

**Validates: Requirements 1.4**

### Property 4: Permission Denial Response Format

*For any* API request that fails permission check, the response SHALL have status 403 and body containing `{ status: 403, code: string, message: string, timestamp: string }`.

**Validates: Requirements 1.5, 8.6**

### Property 5: Boolean Field Conversion

*For any* database row containing boolean fields (fields starting with "is" or "has"), after type conversion, the field values SHALL be `true` or `false` (not 0 or 1).

**Validates: Requirements 2.5**

### Property 6: Telegram Session Persistence Round-Trip

*For any* Telegram session saved to the database, after server restart, loading the session by telegramUserId SHALL return an equivalent session object.

**Validates: Requirements 3.4**

### Property 7: Invalid Invite Token Rejection

*For any* registration attempt with an invalid or expired invite token, the Telegram bot SHALL reject the registration before collecting any user data.

**Validates: Requirements 3.2**

### Property 8: Rate Limiting Enforcement

*For any* Telegram user sending more than N commands within T seconds, subsequent commands SHALL be rejected with a rate limit message until the window expires.

**Validates: Requirements 3.5**

### Property 9: VIEW_OWN vs VIEW_ALL Permission Filtering

*For any* user with VIEW_OWN_TASKS but without VIEW_ALL_TASKS, requesting tasks SHALL return only tasks where `assignedToId === userId` or `createdById === userId`. *For any* user with VIEW_ALL_TASKS, requesting tasks SHALL return all tasks in the restaurant.

**Validates: Requirements 4.4, 4.5**

### Property 10: Entity Existence Validation

*For any* API request containing a restaurantId that does not exist in the database, the response SHALL have status 400 with error code `RESTAURANT_NOT_FOUND`. Similarly for userId with `USER_NOT_FOUND`.

**Validates: Requirements 5.1, 5.2**

### Property 11: Required Fields Validation

*For any* create or update request missing a required field, the response SHALL have status 400 with error details specifying which field is missing.

**Validates: Requirements 5.3, 5.4, 8.4**

### Property 12: Date Format Validation

*For any* request containing date parameters that are not valid ISO 8601 date strings, the response SHALL have status 400 with error details about the invalid date.

**Validates: Requirements 5.5**

### Property 13: OR Condition Query Correctness

*For any* query with OR conditions `[A, B]`, the result set SHALL equal the union of results from query with condition A and query with condition B.

**Validates: Requirements 6.1**

### Property 14: Transaction Atomicity

*For any* transaction containing multiple operations where one operation fails, all previous operations in the transaction SHALL be rolled back (no partial state).

**Validates: Requirements 6.3**

### Property 15: Error Response Format Consistency

*For any* API error response, the body SHALL contain at minimum: `status` (number), `message` (string), and `timestamp` (ISO 8601 string).

**Validates: Requirements 8.1, 8.2**

### Property 16: Production Stack Trace Hiding

*For any* 500 Internal Server Error in production mode, the response body SHALL NOT contain a `stack` field.

**Validates: Requirements 8.3**

### Property 17: Authentication Failure Response

*For any* request with missing, invalid, or expired authentication token, the response SHALL have status 401.

**Validates: Requirements 8.5**

### Property 18: Permission Cache Invalidation

*For any* change in restaurantId parameter to usePermissions hook, the cached permissions SHALL be invalidated and a new API request SHALL be made.

**Validates: Requirements 9.1, 9.2**

### Property 19: Logout Cache Clearing

*For any* logout action, all cached permissions in usePermissions and useGlobalPermissions hooks SHALL be cleared.

**Validates: Requirements 9.5**

## Error Handling

### Error Response Structure

Все API ошибки возвращаются в едином формате:

```typescript
interface ApiErrorResponse {
  status: number;        // HTTP статус код
  code: string;          // Машиночитаемый код ошибки
  message: string;       // Человекочитаемое сообщение
  details?: {            // Опциональные детали
    field?: string;      // Поле с ошибкой (для валидации)
    errors?: Array<{     // Список ошибок валидации
      field: string;
      message: string;
    }>;
  };
  timestamp: string;     // ISO 8601 timestamp
}
```

### Error Codes

| Code | Status | Description |
|------|--------|-------------|
| AUTH_TOKEN_MISSING | 401 | Токен не предоставлен |
| AUTH_TOKEN_INVALID | 401 | Токен невалиден |
| AUTH_TOKEN_EXPIRED | 401 | Токен истёк |
| AUTH_USER_INACTIVE | 401 | Пользователь деактивирован |
| FORBIDDEN_NO_PERMISSION | 403 | Нет требуемого права |
| FORBIDDEN_NO_RESTAURANT_ACCESS | 403 | Нет доступа к ресторану |
| VALIDATION_FAILED | 400 | Ошибка валидации |
| RESTAURANT_NOT_FOUND | 400 | Ресторан не найден |
| USER_NOT_FOUND | 400 | Пользователь не найден |
| POSITION_NOT_FOUND | 400 | Должность не найдена |
| INTERNAL_ERROR | 500 | Внутренняя ошибка |
| DATABASE_ERROR | 500 | Ошибка базы данных |
| RATE_LIMIT_EXCEEDED | 429 | Превышен лимит запросов |

### Error Handling Middleware

```typescript
// backend/src/middleware/errorHandler.ts

import { Request, Response, NextFunction } from 'express';
import { logger } from '../services/loggerService';

export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: Record<string, any>
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const timestamp = new Date().toISOString();
  
  if (err instanceof AppError) {
    logger.warn(`AppError: ${err.code}`, {
      status: err.status,
      message: err.message,
      path: req.path,
      userId: (req as any).user?.id,
    });
    
    return res.status(err.status).json({
      status: err.status,
      code: err.code,
      message: err.message,
      details: err.details,
      timestamp,
    });
  }
  
  // Unexpected error
  logger.error('Unexpected error', {
    error: err.message,
    stack: err.stack,
    path: req.path,
  });
  
  const isProduction = process.env.NODE_ENV === 'production';
  
  return res.status(500).json({
    status: 500,
    code: 'INTERNAL_ERROR',
    message: isProduction ? 'Internal server error' : err.message,
    timestamp,
    ...(isProduction ? {} : { stack: err.stack }),
  });
};
```

## Testing Strategy

### Dual Testing Approach

Проект использует комбинацию unit-тестов и property-based тестов:

- **Unit tests**: Проверка конкретных примеров, edge cases, интеграционных точек
- **Property tests**: Проверка универсальных свойств на множестве сгенерированных входных данных

### Testing Framework

- **Test Runner**: Vitest (совместим с Jest API, быстрый)
- **Property-Based Testing**: fast-check
- **HTTP Testing**: supertest
- **Mocking**: vitest built-in mocks

### Test Configuration

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['**/*.test.ts', '**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
});
```

### Property Test Structure

Каждый property test должен:
1. Запускаться минимум 100 раз (из-за рандомизации)
2. Ссылаться на property из дизайн-документа
3. Использовать формат тега: `**Feature: project-refactoring, Property N: {property_text}**`

```typescript
// Пример property test
import { fc } from 'fast-check';
import { describe, it, expect } from 'vitest';

describe('Permission Service', () => {
  // **Feature: project-refactoring, Property 1: OWNER/ADMIN Permission Bypass**
  it('should grant all permissions to OWNER/ADMIN users', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('OWNER', 'ADMIN'),
        fc.string(), // any permission code
        fc.uuid(), // any restaurant id
        async (role, permission, restaurantId) => {
          const result = await permissionService.checkPermission(
            { userId: ownerUserId, restaurantId },
            permission as PermissionCode
          );
          expect(result.allowed).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });
});
```

### Test File Organization

```
backend/
├── src/
│   └── ...
└── tests/
    ├── unit/
    │   ├── services/
    │   │   ├── permissionService.test.ts
    │   │   ├── validationService.test.ts
    │   │   └── telegramSessionService.test.ts
    │   └── database/
    │       ├── queryBuilder.test.ts
    │       └── typeConverters.test.ts
    ├── integration/
    │   ├── auth.test.ts
    │   ├── permissions.test.ts
    │   └── telegram.test.ts
    └── properties/
        ├── permission.properties.test.ts
        ├── validation.properties.test.ts
        ├── database.properties.test.ts
        └── errorHandling.properties.test.ts

frontend/
├── src/
│   └── ...
└── tests/
    ├── hooks/
    │   ├── usePermissions.test.ts
    │   └── usePermissions.properties.test.ts
    └── components/
        └── ...
```

### Coverage Requirements

- Минимальное покрытие: 80% для критических модулей (permissions, auth, validation)
- Property tests должны покрывать все 19 correctness properties
- Integration tests для основных user flows
