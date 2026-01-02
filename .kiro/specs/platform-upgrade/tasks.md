# Implementation Plan: Platform Upgrade

## Overview

Реализация комплексного обновления платформы: обмен сменами, расширение прав, поддержка PostgreSQL, Telegram уведомления.

## Tasks

### ЧАСТЬ 1: Расширение прав доступа

- [x] 1. Добавить новые права в систему
  - [x] 1.1 Обновить PERMISSIONS в permissions.ts
    - Добавить REQUEST_SHIFT_SWAP, APPROVE_SHIFT_SWAP
    - Добавить SEND_ANNOUNCEMENTS, VIEW_ANNOUNCEMENTS
    - Добавить VIEW_REPORTS, EXPORT_REPORTS
    - _Requirements: 6.1, 6.2, 7.1, 7.2, 8.1, 8.2_

  - [x] 1.2 Обновить DEFAULT_EMPLOYEE_PERMISSIONS
    - Добавить REQUEST_SHIFT_SWAP
    - Добавить VIEW_ANNOUNCEMENTS
    - _Requirements: 6.3, 7.3_

  - [x] 1.3 Обновить MANAGER_AUTO_PERMISSIONS
    - Добавить APPROVE_SHIFT_SWAP
    - Добавить SEND_ANNOUNCEMENTS, VIEW_ANNOUNCEMENTS
    - Добавить VIEW_REPORTS, EXPORT_REPORTS
    - _Requirements: 6.2, 7.1, 8.1, 8.2_

  - [x] 1.4 Написать property test для новых прав
    - **Property 8: New permissions exist**
    - **Validates: Requirements 6.1, 6.2, 7.1, 7.2, 8.1, 8.2**

- [x] 2. Предустановленные должности
  - [x] 2.1 Создать конфигурацию PRESET_POSITIONS
    - Официант, Повар, Бармен, Старший смены, Администратор
    - Назначить права каждой должности
    - _Requirements: 9.1, 9.2_

  - [x] 2.2 Обновить создание ресторана
    - Автоматически создавать предустановленные должности
    - Назначать права должностям
    - _Requirements: 9.1, 9.2_

  - [x] 2.3 Написать property test для предустановленных должностей
    - **Property 10: Preset positions created with restaurant**
    - **Validates: Requirements 9.1**

- [x] 3. Checkpoint - Права доступа
  - Запустить все тесты (npm test --prefix backend)
  - Проверить что новые права работают в UI

---

### ЧАСТЬ 2: Система обмена сменами

- [x] 4. Создать модель SwapRequest
  - [x] 4.1 Добавить таблицу SwapRequest в initDb.ts
    - id, shiftId, fromUserId, toUserId, status
    - requestedAt, respondedAt, approvedAt, approvedById, expiresAt
    - Индексы для поиска
    - _Requirements: 1.2_

  - [x] 4.2 Добавить SwapRequest в dbClient
    - findMany, findUnique, create, update методы
    - Include для связей (shift, fromUser, toUser)
    - _Requirements: 1.2, 5.1_

- [x] 5. Создать SwapController
  - [x] 5.1 Реализовать createSwapRequest
    - Валидация: смена не в прошлом
    - Валидация: нет активного запроса
    - Создание запроса со статусом PENDING
    - Установка expiresAt (48 часов)
    - _Requirements: 1.2, 1.4, 1.5_

  - [x] 5.2 Написать property test для создания запроса
    - **Property 2: Past shifts cannot be swapped**
    - **Property 3: No duplicate active swap requests**
    - **Validates: Requirements 1.4, 1.5**

  - [x] 5.3 Реализовать respondToSwap
    - Изменение статуса на ACCEPTED или REJECTED
    - Установка respondedAt
    - _Requirements: 2.2, 2.3_

  - [x] 5.4 Написать property test для ответа на запрос
    - **Property 4: Status transitions are valid**
    - **Validates: Requirements 2.2, 2.3**

  - [x] 5.5 Реализовать approveSwap
    - Проверка права APPROVE_SHIFT_SWAP
    - Изменение статуса на APPROVED или MANAGER_REJECTED
    - Выполнение обмена (смена userId в Shift)
    - Создание записи в истории
    - _Requirements: 3.2, 3.3, 4.1, 4.2_

  - [x] 5.6 Написать property test для одобрения
    - **Property 5: Approved swap exchanges user IDs**
    - **Property 6: Swap history is created**
    - **Validates: Requirements 3.2, 4.1, 4.2**

  - [x] 5.7 Реализовать getSwapRequests
    - Фильтрация по статусу, периоду, сотруднику
    - Include связей для отображения
    - _Requirements: 5.1, 5.2, 5.3_

- [x] 6. Создать роуты для обмена
  - [x] 6.1 Добавить routes/swaps.ts
    - POST /api/swaps - создать запрос
    - GET /api/swaps - список запросов
    - POST /api/swaps/:id/respond - ответить
    - POST /api/swaps/:id/approve - одобрить
    - _Requirements: 1.1, 2.1, 3.1_

- [x] 7. Автоматическое истечение запросов
  - [x] 7.1 Создать job для проверки истекших запросов
    - Запускать каждый час
    - Менять статус на EXPIRED для просроченных
    - _Requirements: 2.5_

- [x] 8. Checkpoint - Backend обмена сменами
  - Запустить все тесты (npm test --prefix backend)
  - Протестировать API через Postman/curl

---

### ЧАСТЬ 3: Frontend для обмена сменами

- [x] 9. Компонент запроса обмена
  - [x] 9.1 Создать SwapRequestModal
    - Выбор сотрудника для обмена
    - Отображение деталей смены
    - Кнопка отправки запроса
    - _Requirements: 1.1_

  - [x] 9.2 Добавить кнопку "Запросить обмен" в график
    - Показывать только при наличии права REQUEST_SHIFT_SWAP
    - Открывать SwapRequestModal
    - _Requirements: 1.1, 6.4_

- [x] 10. Страница управления обменами
  - [x] 10.1 Создать SwapRequestsPage
    - Список входящих запросов
    - Список исходящих запросов
    - Кнопки принять/отклонить
    - _Requirements: 2.1, 5.1_

  - [x] 10.2 Добавить вкладку для менеджера
    - Список запросов на одобрение
    - Кнопки одобрить/отклонить
    - _Requirements: 3.1_

- [-] 11. Checkpoint - Frontend обмена сменами
  - Протестировать полный flow в браузере

---

### ЧАСТЬ 4: Telegram уведомления

- [ ] 12. Расширить NotificationService
  - [ ] 12.1 Добавить методы для уведомлений о сменах
    - notifyShiftAssigned
    - notifyShiftChanged
    - notifyShiftReminder
    - _Requirements: 13.1, 13.2, 13.3, 13.4_

  - [ ] 12.2 Написать property test для уведомлений о сменах
    - **Property 12: Shift assignment triggers notification**
    - **Validates: Requirements 13.1**

  - [ ] 12.3 Добавить методы для уведомлений об обменах
    - notifySwapRequested (с кнопками)
    - notifySwapResponded
    - notifySwapApproved
    - _Requirements: 14.1, 14.2, 14.3_

  - [ ] 12.4 Написать property test для уведомлений об обменах
    - **Property 13: Swap request triggers interactive notification**
    - **Validates: Requirements 14.1**

- [ ] 13. Новые команды бота
  - [ ] 13.1 Реализовать /today
    - Показать смены на сегодня
    - _Requirements: 17.1_

  - [ ] 13.2 Реализовать /week
    - Показать смены на неделю
    - _Requirements: 17.2_

  - [ ] 13.3 Реализовать /swaps
    - Показать активные запросы обмена
    - _Requirements: 17.3_

  - [ ] 13.4 Реализовать /tasks
    - Показать мои задачи
    - _Requirements: 15.3_

  - [ ] 13.5 Реализовать /settings
    - Настройки уведомлений
    - _Requirements: 17.4_

- [ ] 14. Callback handlers для кнопок
  - [ ] 14.1 Обработчик swap_accept
    - Принять запрос обмена
    - _Requirements: 14.2_

  - [ ] 14.2 Обработчик swap_reject
    - Отклонить запрос обмена
    - _Requirements: 14.2_

- [ ] 15. Настройки уведомлений
  - [ ] 15.1 Расширить NotificationSettings
    - enableSwapNotifications
    - enableReminders
    - reminderHoursBefore
    - _Requirements: 16.1, 16.2, 16.3, 16.4_

  - [ ] 15.2 Написать property test для настроек
    - **Property 14: Notification settings are respected**
    - **Validates: Requirements 16.1, 16.2, 16.3**

- [ ] 16. Scheduler для напоминаний
  - [ ] 16.1 Создать job для напоминаний о сменах
    - Проверять смены на ближайшие 12/2 часа
    - Отправлять напоминания
    - _Requirements: 13.3, 13.4_

- [ ] 17. Checkpoint - Telegram уведомления
  - Запустить все тесты (npm test --prefix backend)
  - Протестировать все команды бота
  - Протестировать уведомления

---

### ЧАСТЬ 5: Поддержка PostgreSQL

- [ ] 18. Абстракция базы данных
  - [ ] 18.1 Создать DatabaseAdapter интерфейс
    - query, queryOne, execute, transaction методы
    - _Requirements: 10.3_

  - [ ] 18.2 Реализовать SQLiteAdapter
    - Обертка над текущим better-sqlite3
    - _Requirements: 10.2_

  - [ ] 18.3 Реализовать PostgreSQLAdapter
    - Использовать pg библиотеку
    - Connection pooling
    - _Requirements: 10.1, 12.3_

  - [ ] 18.4 Написать property test для совместимости
    - **Property 11: Database adapter compatibility**
    - **Validates: Requirements 10.2, 10.3**

- [ ] 19. PostgreSQL схема
  - [ ] 19.1 Создать SQL скрипт для PostgreSQL
    - Все таблицы с правильными типами
    - UUID вместо TEXT для id
    - TIMESTAMPTZ для дат
    - _Requirements: 11.1_

  - [ ] 19.2 Создать скрипт миграции данных
    - Экспорт из SQLite
    - Импорт в PostgreSQL
    - Валидация целостности
    - _Requirements: 11.2, 11.3_

- [ ] 20. Обновить dbClient
  - [ ] 20.1 Рефакторинг для использования адаптера
    - Заменить прямые вызовы SQLite на адаптер
    - _Requirements: 10.3_

- [ ] 21. Checkpoint - PostgreSQL
  - Запустить все тесты (npm test --prefix backend)
  - Протестировать с SQLite (dev)
  - Протестировать с PostgreSQL (если доступен)

---

### ЧАСТЬ 6: Финальная интеграция

- [ ] 22. Интеграция компонентов
  - [ ] 22.1 Связать обмен сменами с уведомлениями
    - Отправлять уведомления при создании/ответе/одобрении
    - _Requirements: 1.3, 2.4, 3.4_

  - [ ] 22.2 Обновить навигацию
    - Добавить пункт "Обмен сменами"
    - Проверка прав для отображения
    - _Requirements: 6.4_

- [ ] 23. Документация
  - [ ] 23.1 Обновить README
    - Описание новых функций
    - Настройка PostgreSQL
    - _Requirements: N/A_

  - [ ] 23.2 Обновить docs/
    - Обновить permissions-architecture.md
    - Добавить shift-swap-guide.md
    - _Requirements: N/A_

- [ ] 24. Final Checkpoint
  - Запустить все тесты (npm test --prefix backend)
  - Полный E2E тест обмена сменами
  - Проверка Telegram бота

## Notes

- Тесты пишутся вместе с кодом, запускаются на чекпоинтах
- Каждый checkpoint - точка для ревью и запуска тестов
- PostgreSQL можно тестировать локально через Docker
- Telegram бот требует TELEGRAM_BOT_TOKEN в .env
