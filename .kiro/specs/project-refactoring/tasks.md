# Implementation Plan: Project Refactoring

## Overview

Поэтапный рефакторинг системы управления ресторанами. Задачи организованы так, чтобы каждый этап был независимо тестируемым и не ломал существующую функциональность.

## Tasks

- [x] 1. Настройка инфраструктуры тестирования
  - [x] 1.1 Установить Vitest и fast-check в backend
    - Добавить vitest, @vitest/coverage-v8, fast-check, supertest в devDependencies
    - Создать vitest.config.ts
    - Добавить скрипты test и test:coverage в package.json
    - _Requirements: Testing Strategy_

  - [x] 1.2 Создать структуру папок для тестов
    - Создать backend/tests/unit/, backend/tests/integration/, backend/tests/properties/
    - Создать базовые хелперы для тестов (test utils, fixtures)
    - _Requirements: Testing Strategy_

- [x] 2. Создание базовой инфраструктуры
  - [x] 2.1 Создать Logger Service
    - Создать backend/src/services/loggerService.ts
    - Реализовать интерфейс ILogger с уровнями error, warn, info, debug
    - Добавить фильтрацию по NODE_ENV (production показывает только error, warn)
    - _Requirements: 7.2, 7.3, 7.4_

  - [x] 2.2 Создать Error Handler Middleware
    - Создать backend/src/middleware/errorHandler.ts
    - Реализовать класс AppError
    - Реализовать middleware errorHandler с единым форматом ответов
    - Скрывать stack trace в production
    - _Requirements: 8.1, 8.2, 8.3_

  - [x] 2.3 Написать property test для Error Response Format
    - **Property 15: Error Response Format Consistency**
    - **Validates: Requirements 8.1, 8.2**

  - [x] 2.4 Написать property test для Production Stack Trace Hiding
    - **Property 16: Production Stack Trace Hiding**
    - **Validates: Requirements 8.3**

- [x] 3. Рефакторинг слоя базы данных
  - [x] 3.1 Создать модуль типов базы данных
    - Создать backend/src/database/types.ts
    - Определить TypeScript интерфейсы для всех таблиц (User, Restaurant, RestaurantUser, etc.)
    - Экспортировать все типы
    - _Requirements: 2.1, 2.2_

  - [x] 3.2 Создать модуль конвертации типов
    - Создать backend/src/database/typeConverters.ts
    - Вынести convertBooleanFields из db.ts
    - Оптимизировать чтобы не вызывался многократно
    - Добавить конвертацию дат
    - _Requirements: 2.5, 6.4_

  - [x] 3.3 Написать property test для Boolean Field Conversion
    - **Property 5: Boolean Field Conversion**
    - **Validates: Requirements 2.5**

  - [x] 3.4 Создать модуль Query Builder
    - Создать backend/src/database/queryBuilder.ts
    - Вынести buildWhereClause из db.ts
    - Исправить логику OR условий
    - Добавить типизацию
    - _Requirements: 6.1_

  - [x] 3.5 Написать property test для OR Condition Query Correctness
    - **Property 13: OR Condition Query Correctness**
    - **Validates: Requirements 6.1**

  - [x] 3.6 Добавить поддержку транзакций
    - Добавить метод transaction() в database layer
    - Реализовать rollback при ошибке
    - _Requirements: 6.3_

  - [x] 3.7 Написать property test для Transaction Atomicity
    - **Property 14: Transaction Atomicity**
    - **Validates: Requirements 6.3**

  - [x] 3.8 Создать репозитории для основных сущностей
    - Создать backend/src/database/repositories/userRepository.ts
    - Создать backend/src/database/repositories/restaurantRepository.ts
    - Создать backend/src/database/repositories/restaurantUserRepository.ts
    - Использовать типы из types.ts
    - _Requirements: 10.4_

- [x] 4. Checkpoint - База данных
  - Запустить все тесты: `npm test`
  - Проверить property tests 5, 13, 14 (Boolean conversion, OR conditions, Transactions)
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Создание Permission Service
  - [x] 5.1 Создать Permission Service
    - Создать backend/src/services/permissionService.ts
    - Реализовать checkPermission, checkAnyPermission, getUserPermissions
    - Реализовать checkRestaurantAccess, isDataOwner
    - Добавить логирование проверок
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.6_

  - [x] 5.2 Написать property test для OWNER/ADMIN Permission Bypass
    - **Property 1: OWNER/ADMIN Permission Bypass**
    - **Validates: Requirements 1.3**

  - [x] 5.3 Написать property test для Restaurant Membership Prerequisite
    - **Property 2: Restaurant Membership Prerequisite**
    - **Validates: Requirements 1.2**

  - [x] 5.4 Написать property test для Manager Auto-Permissions
    - **Property 3: Manager Auto-Permissions**
    - **Validates: Requirements 1.4**

  - [x] 5.5 Обновить middleware requirePermission
    - Обновить backend/src/middleware/auth.ts
    - Использовать новый Permission Service
    - Возвращать единый формат ошибки 403
    - _Requirements: 1.5, 4.1_

  - [x] 5.6 Написать property test для Permission Denial Response Format
    - **Property 4: Permission Denial Response Format**
    - **Validates: Requirements 1.5, 8.6**

  - [x] 5.7 Написать property test для Authentication Failure Response
    - **Property 17: Authentication Failure Response**
    - **Validates: Requirements 8.5**

- [x] 6. Checkpoint - Permissions
  - Запустить все тесты: `npm test`
  - Проверить property tests 1, 2, 3, 4, 15, 16, 17 (Permissions, Error responses)
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Создание Validation Service
  - [x] 7.1 Создать Validation Service
    - Создать backend/src/services/validationService.ts
    - Реализовать validateRestaurantExists, validateUserExists
    - Реализовать validateRestaurantMembership, validateDateRange
    - _Requirements: 5.1, 5.2, 5.3, 5.5_

  - [x] 7.2 Написать property test для Entity Existence Validation
    - **Property 10: Entity Existence Validation**
    - **Validates: Requirements 5.1, 5.2**

  - [x] 7.3 Написать property test для Required Fields Validation
    - **Property 11: Required Fields Validation**
    - **Validates: Requirements 5.3, 5.4, 8.4**

  - [x] 7.4 Написать property test для Date Format Validation
    - **Property 12: Date Format Validation**
    - **Validates: Requirements 5.5**

  - [x] 7.5 Создать validation middleware
    - Создать backend/src/middleware/validation.ts
    - Интегрировать с Validation Service
    - Возвращать 400 с детальными ошибками
    - _Requirements: 5.4_

- [x] 8. Checkpoint - Validation
  - Запустить все тесты: `npm test`
  - Проверить property tests 10, 11, 12 (Entity validation, Required fields, Date format)
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Рефакторинг Telegram бота
  - [x] 9.1 Создать таблицу telegram_sessions
    - Добавить миграцию в initDb.ts
    - Создать таблицу с полями: id, telegram_user_id, step, invite_token, registration_data, created_at, updated_at, expires_at
    - _Requirements: 3.1, 3.4_

  - [x] 9.2 Создать Telegram Session Repository
    - Создать backend/src/database/repositories/telegramSessionRepository.ts
    - Реализовать CRUD операции для сессий
    - Добавить метод cleanExpiredSessions
    - _Requirements: 3.1, 3.4_

  - [x] 9.3 Создать Telegram Session Service
    - Создать backend/src/services/telegramSessionService.ts
    - Реализовать getSession, createSession, updateSession, deleteSession
    - Добавить автоматическую очистку истёкших сессий
    - _Requirements: 3.1, 3.4_

  - [x] 9.4 Написать property test для Telegram Session Persistence Round-Trip
    - **Property 6: Telegram Session Persistence Round-Trip**
    - **Validates: Requirements 3.4**

  - [x] 9.5 Рефакторинг bot.ts - убрать in-memory сессии
    - Заменить Map sessions на TelegramSessionService
    - Убрать @ts-ignore комментарии
    - Добавить типизацию
    - _Requirements: 3.1, 3.4, 2.3_

  - [x] 9.6 Добавить валидацию invite token
    - Проверять токен до начала сбора данных
    - Возвращать понятные ошибки
    - _Requirements: 3.2, 3.3_

  - [x] 9.7 Написать property test для Invalid Invite Token Rejection
    - **Property 7: Invalid Invite Token Rejection**
    - **Validates: Requirements 3.2**

  - [x] 9.8 Добавить rate limiting для бота
    - Реализовать простой rate limiter (N команд за T секунд)
    - Хранить счётчики в памяти (достаточно для одного инстанса)
    - _Requirements: 3.5_

  - [x] 9.9 Написать property test для Rate Limiting Enforcement
    - **Property 8: Rate Limiting Enforcement**
    - **Validates: Requirements 3.5**

- [x] 10. Checkpoint - Telegram Bot
  - Запустить все тесты: `npm test`
  - Проверить property tests 6, 7, 8 (Session persistence, Token validation, Rate limiting)
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Рефакторинг контроллеров
  - [x] 11.1 Создать Task Service
    - Создать backend/src/services/taskService.ts
    - Вынести бизнес-логику из taskController.ts
    - Использовать Permission Service для фильтрации
    - _Requirements: 4.2, 4.3, 4.4, 4.5, 10.2_

  - [x] 11.2 Написать property test для VIEW_OWN vs VIEW_ALL Permission Filtering
    - **Property 9: VIEW_OWN vs VIEW_ALL Permission Filtering**
    - **Validates: Requirements 4.4, 4.5**

  - [x] 11.3 Рефакторинг taskController.ts
    - Оставить только HTTP логику
    - Делегировать в Task Service
    - Использовать Validation Service
    - _Requirements: 4.1, 4.2, 10.2_

  - [x] 11.4 Создать Timesheet Service
    - Создать backend/src/services/timesheetService.ts
    - Вынести бизнес-логику из timesheetController.ts
    - Убрать дублирование проверок прав
    - _Requirements: 4.2, 4.3, 10.2_

  - [x] 11.5 Рефакторинг timesheetController.ts
    - Оставить только HTTP логику
    - Делегировать в Timesheet Service
    - _Requirements: 4.1, 4.2, 10.2_

  - [x] 11.6 Создать Employee Service
    - Создать backend/src/services/employeeService.ts
    - Вынести бизнес-логику из employeeController.ts
    - _Requirements: 10.2_

  - [x] 11.7 Рефакторинг employeeController.ts
    - Оставить только HTTP логику
    - Убрать console.log для отладки
    - _Requirements: 7.1, 10.2_

- [x] 12. Checkpoint - Controllers
  - Запустить все тесты: `npm test`
  - Проверить property test 9 (VIEW_OWN vs VIEW_ALL filtering)
  - Ensure all tests pass, ask the user if questions arise.

- [-] 13. Рефакторинг фронтенд хуков
  - [-] 13.1 Добавить кэширование в usePermissions
    - Добавить Map для кэша по restaurantId
    - Инвалидировать при смене restaurantId
    - _Requirements: 9.1, 9.2_

  - [ ] 13.2 Написать property test для Permission Cache Invalidation
    - **Property 18: Permission Cache Invalidation**
    - **Validates: Requirements 9.1, 9.2**

  - [ ] 13.3 Добавить очистку кэша при logout
    - Очищать кэш в usePermissions при logout
    - Очищать кэш в useGlobalPermissions при logout
    - _Requirements: 9.5_

  - [ ] 13.4 Написать property test для Logout Cache Clearing
    - **Property 19: Logout Cache Clearing**
    - **Validates: Requirements 9.5**

  - [ ] 13.5 Оптимизировать useGlobalPermissions
    - Загружать права для всех ресторанов параллельно (Promise.all)
    - _Requirements: 9.3_

- [ ] 14. Удаление отладочного кода
  - [ ] 14.1 Удалить console.log из backend
    - Найти и удалить все console.log для отладки
    - Заменить на logger где нужно логирование
    - _Requirements: 7.1_

  - [ ] 14.2 Удалить @ts-ignore комментарии
    - Исправить типы вместо игнорирования
    - Документировать если @ts-ignore необходим
    - _Requirements: 2.3_

  - [ ] 14.3 Заменить 'any' на конкретные типы
    - Найти использования 'any' в error handlers
    - Заменить на типизированные ошибки
    - _Requirements: 2.4_

- [ ] 15. Интеграция и подключение
  - [ ] 15.1 Подключить Error Handler в index.ts
    - Заменить текущий error handler на новый
    - Убрать дублирование логики ошибок
    - _Requirements: 8.1_

  - [ ] 15.2 Подключить Logger во все сервисы
    - Заменить console.log на logger
    - Добавить контекст (userId, restaurantId) в логи
    - _Requirements: 7.2_

  - [ ] 15.3 Обновить index.ts для загрузки сессий бота
    - Загружать сессии из БД при старте бота
    - Запускать очистку истёкших сессий по расписанию
    - _Requirements: 3.1_

- [ ] 16. Final Checkpoint
  - Ensure all tests pass, ask the user if questions arise.
  - Проверить что все 19 property tests проходят
  - Проверить coverage >= 80% для критических модулей

## Notes

- Тесты пишутся вместе с кодом, но проверяются только на checkpoint'ах
- Each task references specific requirements for traceability
- Checkpoints запускают `npm test` и проверяют все property tests
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
