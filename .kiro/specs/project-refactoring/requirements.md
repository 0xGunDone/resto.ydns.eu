# Requirements Document

## Introduction

Комплексный рефакторинг системы управления ресторанами. Проект имеет критические проблемы с архитектурой прав доступа, качеством кода, Telegram-ботом и общей стабильностью. Цель — устранить баги, упростить логику, улучшить стек и обеспечить корректную работу всех функций.

## Glossary

- **Permission_System**: Система прав доступа на основе должностей (Position) и ролей (Role)
- **Restaurant_User**: Связь пользователя с рестораном через таблицу RestaurantUser
- **Auth_Middleware**: Middleware для проверки аутентификации и авторизации
- **Telegram_Bot**: Бот для регистрации сотрудников и уведомлений
- **Timesheet**: Табель учёта рабочего времени
- **Shift**: Смена в расписании
- **Position**: Должность сотрудника с набором прав

## Requirements

### Requirement 1: Унификация системы прав доступа

**User Story:** As a developer, I want a consistent permission system, so that access control works predictably across all endpoints.

#### Acceptance Criteria

1. WHEN a request requires permission check, THE Auth_Middleware SHALL use a single centralized permission validation function
2. WHEN checking permissions, THE Permission_System SHALL validate user's restaurant membership before checking specific permissions
3. WHEN a user has OWNER or ADMIN role, THE Permission_System SHALL grant all permissions without additional database queries
4. WHEN a user is a restaurant manager, THE Permission_System SHALL automatically grant MANAGER_AUTO_PERMISSIONS for that restaurant
5. IF a permission check fails, THEN THE Permission_System SHALL return a consistent error response with status 403
6. WHEN permissions are checked, THE Permission_System SHALL log the check result for audit purposes

### Requirement 2: Исправление TypeScript типизации

**User Story:** As a developer, I want proper TypeScript types, so that the codebase is type-safe and maintainable.

#### Acceptance Criteria

1. THE Database_Client SHALL have complete TypeScript type definitions for all tables and operations
2. WHEN database queries return data, THE Database_Client SHALL return properly typed objects without manual casting
3. THE Codebase SHALL NOT contain @ts-ignore comments except with documented justification
4. WHEN handling errors, THE Controllers SHALL use typed error objects instead of 'any' type
5. WHEN boolean fields are stored in SQLite, THE Database_Client SHALL automatically convert 0/1 to true/false with proper typing

### Requirement 3: Рефакторинг Telegram-бота

**User Story:** As a system administrator, I want a reliable Telegram bot, so that employee registration and notifications work correctly.

#### Acceptance Criteria

1. WHEN the bot starts, THE Telegram_Bot SHALL load session data from persistent storage (database)
2. WHEN a user starts registration, THE Telegram_Bot SHALL validate the invite token before proceeding
3. IF registration fails at any step, THEN THE Telegram_Bot SHALL provide a clear error message and allow retry
4. WHEN the server restarts, THE Telegram_Bot SHALL restore all active sessions from persistent storage
5. WHEN processing commands, THE Telegram_Bot SHALL implement rate limiting to prevent abuse
6. WHEN an error occurs, THE Telegram_Bot SHALL log detailed error information for debugging

### Requirement 4: Консолидация проверок доступа в контроллерах

**User Story:** As a developer, I want DRY permission checks in controllers, so that the code is maintainable and consistent.

#### Acceptance Criteria

1. WHEN a controller needs to check permissions, THE Controller SHALL use the requirePermission middleware
2. THE Controllers SHALL NOT duplicate permission checking logic inline
3. WHEN filtering data by user permissions, THE Controller SHALL use a shared utility function
4. WHEN a user requests their own data (tasks, timesheets), THE Controller SHALL allow access with VIEW_OWN_* permission
5. WHEN a user requests all data, THE Controller SHALL require VIEW_ALL_* permission

### Requirement 5: Улучшение валидации входных данных

**User Story:** As a system, I want validated input data, so that invalid requests are rejected early.

#### Acceptance Criteria

1. WHEN a request contains restaurantId, THE Validator SHALL verify the restaurant exists before processing
2. WHEN a request contains userId, THE Validator SHALL verify the user exists and is active
3. WHEN creating or updating entities, THE Validator SHALL check all required fields are present
4. IF validation fails, THEN THE Validator SHALL return status 400 with detailed error messages
5. WHEN date parameters are provided, THE Validator SHALL verify they are valid dates in expected format

### Requirement 6: Исправление работы с базой данных

**User Story:** As a developer, I want a reliable database layer, so that queries work correctly and efficiently.

#### Acceptance Criteria

1. WHEN building WHERE clauses with OR conditions, THE Database_Client SHALL correctly combine conditions
2. WHEN multiple related entities are needed, THE Database_Client SHALL use efficient JOIN queries
3. WHEN transactions are needed, THE Database_Client SHALL provide transaction support
4. THE Database_Client SHALL NOT call convertBooleanFields multiple times for the same row
5. WHEN queries fail, THE Database_Client SHALL provide meaningful error messages

### Requirement 7: Удаление отладочного кода

**User Story:** As a developer, I want clean production code, so that logs are meaningful and performance is optimal.

#### Acceptance Criteria

1. THE Codebase SHALL NOT contain console.log statements for debugging purposes
2. WHEN logging is needed, THE Application SHALL use a structured logging library
3. THE Logging_System SHALL support different log levels (error, warn, info, debug)
4. WHEN in production mode, THE Logging_System SHALL only output error and warn levels by default

### Requirement 8: Улучшение обработки ошибок

**User Story:** As a user, I want consistent error responses, so that I understand what went wrong.

#### Acceptance Criteria

1. WHEN an error occurs, THE API SHALL return a consistent error response format
2. THE Error_Response SHALL include: status code, error message, and optional error code
3. IF an internal error occurs, THEN THE API SHALL NOT expose stack traces in production
4. WHEN validation fails, THE API SHALL return status 400 with field-specific errors
5. WHEN authentication fails, THE API SHALL return status 401 with appropriate message
6. WHEN authorization fails, THE API SHALL return status 403 with appropriate message

### Requirement 9: Оптимизация фронтенд хуков

**User Story:** As a user, I want fast permission loading, so that the UI responds quickly.

#### Acceptance Criteria

1. WHEN permissions are loaded, THE usePermissions_Hook SHALL cache results for the session
2. WHEN restaurantId changes, THE usePermissions_Hook SHALL invalidate cache and reload
3. THE useGlobalPermissions_Hook SHALL load permissions for all restaurants in parallel
4. WHEN API calls fail, THE Hooks SHALL implement retry logic with exponential backoff
5. WHEN user logs out, THE Hooks SHALL clear all cached permissions

### Requirement 10: Рефакторинг для читаемости и модульности

**User Story:** As a developer, I want readable and modular code, so that the codebase is easy to understand and maintain.

#### Acceptance Criteria

1. WHEN a file exceeds 300 lines, THE File SHALL be split into smaller, focused modules
2. THE Controllers SHALL contain only request handling logic, delegating business logic to services
3. WHEN business logic is complex, THE Service_Layer SHALL encapsulate it in dedicated service files
4. THE Database_Client (db.ts) SHALL be split into separate modules: query builder, type converters, and table-specific operations
5. WHEN utility functions are related, THE Utils SHALL be grouped in dedicated files by domain
6. THE Codebase SHALL follow consistent naming conventions for files and exports
7. WHEN a function exceeds 50 lines, THE Function SHALL be refactored into smaller helper functions
8. THE Imports SHALL be organized: external packages first, then internal modules, then relative imports

### Requirement 11: Миграция на более надёжный стек (опционально)

**User Story:** As a system administrator, I want a production-ready stack, so that deployment is straightforward.

#### Acceptance Criteria

1. WHERE PostgreSQL is chosen, THE Database_Layer SHALL use Prisma ORM for type-safe queries
2. WHERE the current stack is kept, THE Database_Layer SHALL have comprehensive type definitions
3. WHEN deploying, THE Application SHALL support environment-based configuration
4. THE Application SHALL provide health check endpoints for monitoring
5. WHEN dependencies are updated, THE Application SHALL use stable, well-maintained packages
