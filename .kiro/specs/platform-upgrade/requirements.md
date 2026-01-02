# Requirements Document

## Introduction

Комплексное обновление платформы управления рестораном, включающее: систему обмена сменами между сотрудниками, расширение системы прав доступа, миграцию на PostgreSQL для масштабирования, и систему Telegram уведомлений.

## Glossary

- **Platform**: Система управления рестораном
- **Shift_Swap_System**: Подсистема обмена сменами
- **Swap_Request**: Запрос на обмен сменой
- **Requester**: Сотрудник, инициирующий обмен
- **Target_Employee**: Сотрудник, которому предлагается обмен
- **Permission_System**: Система управления правами доступа
- **Notification_System**: Система уведомлений через Telegram
- **Database_Layer**: Слой работы с базой данных

---

## ЧАСТЬ 1: Обмен сменами

### Requirement 1: Создание запроса на обмен

**User Story:** As a сотрудник, I want to запросить обмен своей сменой с коллегой, so that I can изменить свой график при необходимости.

#### Acceptance Criteria

1. WHEN сотрудник выбирает свою смену и нажимает "Запросить обмен", THE Shift_Swap_System SHALL отобразить список доступных сотрудников ресторана
2. WHEN сотрудник выбирает коллегу для обмена, THE Shift_Swap_System SHALL создать Swap_Request со статусом PENDING
3. WHEN Swap_Request создан, THE Shift_Swap_System SHALL отправить уведомление Target_Employee
4. THE Shift_Swap_System SHALL запретить создание запроса на обмен для смен в прошлом
5. THE Shift_Swap_System SHALL запретить создание запроса если у сотрудника уже есть активный запрос на эту смену

### Requirement 2: Ответ на запрос обмена

**User Story:** As a сотрудник, I want to принять или отклонить запрос на обмен, so that I can решить подходит ли мне предложение.

#### Acceptance Criteria

1. WHEN Target_Employee получает запрос, THE Shift_Swap_System SHALL отобразить детали смены (дата, время, тип)
2. WHEN Target_Employee принимает запрос, THE Shift_Swap_System SHALL изменить статус на ACCEPTED
3. WHEN Target_Employee отклоняет запрос, THE Shift_Swap_System SHALL изменить статус на REJECTED
4. WHEN статус изменяется, THE Shift_Swap_System SHALL уведомить Requester
5. THE Shift_Swap_System SHALL автоматически отклонять запросы без ответа через 48 часов

### Requirement 3: Одобрение менеджером

**User Story:** As a менеджер, I want to одобрять обмены сменами, so that I can контролировать изменения графика.

#### Acceptance Criteria

1. WHEN Swap_Request получает статус ACCEPTED, THE Shift_Swap_System SHALL уведомить менеджера
2. WHEN менеджер одобряет обмен, THE Shift_Swap_System SHALL выполнить обмен сменами
3. WHEN менеджер отклоняет обмен, THE Shift_Swap_System SHALL изменить статус на MANAGER_REJECTED
4. WHEN обмен одобрен или отклонен, THE Shift_Swap_System SHALL уведомить обоих сотрудников

### Requirement 4: Выполнение обмена

**User Story:** As a система, I want to автоматически обменивать смены после одобрения, so that график обновляется корректно.

#### Acceptance Criteria

1. WHEN Swap_Request одобрен, THE Shift_Swap_System SHALL поменять userId в обеих сменах
2. WHEN обмен выполнен, THE Shift_Swap_System SHALL создать запись в истории
3. IF при обмене возникает ошибка, THEN THE Shift_Swap_System SHALL откатить изменения

### Requirement 5: История обменов

**User Story:** As a менеджер, I want to просматривать историю обменов, so that I can отслеживать изменения.

#### Acceptance Criteria

1. THE Shift_Swap_System SHALL отображать список запросов с фильтрацией по статусу
2. THE Shift_Swap_System SHALL показывать детали: инициатор, получатель, даты, статус
3. THE Shift_Swap_System SHALL позволять фильтровать по периоду и сотруднику

---

## ЧАСТЬ 2: Расширение прав доступа

### Requirement 6: Новые права для обмена сменами

**User Story:** As a администратор, I want to управлять правами на обмен сменами, so that I can контролировать доступ к функционалу.

#### Acceptance Criteria

1. THE Permission_System SHALL добавить право REQUEST_SHIFT_SWAP для запроса обмена
2. THE Permission_System SHALL добавить право APPROVE_SHIFT_SWAP для одобрения обменов
3. THE Permission_System SHALL включить REQUEST_SHIFT_SWAP в права по умолчанию для сотрудников
4. WHEN у сотрудника нет права REQUEST_SHIFT_SWAP, THE Platform SHALL скрывать кнопку обмена

### Requirement 7: Права на уведомления

**User Story:** As a администратор, I want to управлять правами на отправку объявлений, so that I can контролировать коммуникации.

#### Acceptance Criteria

1. THE Permission_System SHALL добавить право SEND_ANNOUNCEMENTS для отправки объявлений
2. THE Permission_System SHALL добавить право VIEW_ANNOUNCEMENTS для просмотра объявлений
3. THE Permission_System SHALL включить VIEW_ANNOUNCEMENTS в права по умолчанию

### Requirement 8: Права на отчеты

**User Story:** As a администратор, I want to управлять доступом к отчетам, so that I can ограничить доступ к чувствительным данным.

#### Acceptance Criteria

1. THE Permission_System SHALL добавить право VIEW_REPORTS для просмотра отчетов
2. THE Permission_System SHALL добавить право EXPORT_REPORTS для экспорта данных
3. WHEN у пользователя нет права VIEW_REPORTS, THE Platform SHALL скрывать раздел отчетов

### Requirement 9: Предустановленные должности

**User Story:** As a владелец ресторана, I want to иметь готовые шаблоны должностей, so that I can быстро настроить права.

#### Acceptance Criteria

1. WHEN создается новый ресторан, THE Permission_System SHALL создать должности: Официант, Повар, Бармен, Старший смены, Администратор
2. THE Permission_System SHALL назначить каждой должности соответствующий набор прав
3. THE Permission_System SHALL позволять редактировать права предустановленных должностей

---

## ЧАСТЬ 3: Миграция на PostgreSQL

### Requirement 10: Совместимость с PostgreSQL

**User Story:** As a разработчик, I want to использовать PostgreSQL, so that I can масштабировать систему.

#### Acceptance Criteria

1. THE Database_Layer SHALL поддерживать подключение к PostgreSQL через переменную окружения
2. THE Database_Layer SHALL сохранять обратную совместимость с SQLite для разработки
3. THE Database_Layer SHALL использовать единый интерфейс для обоих типов БД

### Requirement 11: Миграция схемы

**User Story:** As a разработчик, I want to иметь скрипты миграции, so that I can обновить существующие базы данных.

#### Acceptance Criteria

1. THE Database_Layer SHALL предоставить SQL скрипты для создания схемы в PostgreSQL
2. THE Database_Layer SHALL предоставить скрипт миграции данных из SQLite в PostgreSQL
3. THE Database_Layer SHALL валидировать целостность данных после миграции

### Requirement 12: Оптимизация запросов

**User Story:** As a разработчик, I want to оптимизировать запросы для PostgreSQL, so that I can улучшить производительность.

#### Acceptance Criteria

1. THE Database_Layer SHALL использовать индексы для часто запрашиваемых полей
2. THE Database_Layer SHALL использовать транзакции для критических операций
3. THE Database_Layer SHALL поддерживать connection pooling

---

## ЧАСТЬ 4: Telegram уведомления

### Requirement 13: Уведомления о сменах

**User Story:** As a сотрудник, I want to получать уведомления о сменах в Telegram, so that I can не пропустить важные изменения.

#### Acceptance Criteria

1. WHEN сотруднику назначена новая смена, THE Notification_System SHALL отправить уведомление в Telegram
2. WHEN смена изменена или отменена, THE Notification_System SHALL уведомить сотрудника
3. THE Notification_System SHALL отправлять напоминание за 12 часов до смены
4. THE Notification_System SHALL отправлять напоминание за 2 часа до смены

### Requirement 14: Уведомления об обменах

**User Story:** As a сотрудник, I want to получать уведомления об обменах в Telegram, so that I can быстро реагировать.

#### Acceptance Criteria

1. WHEN создан запрос на обмен, THE Notification_System SHALL отправить сообщение с кнопками "Принять"/"Отклонить"
2. WHEN сотрудник нажимает кнопку, THE Notification_System SHALL обработать ответ
3. WHEN статус обмена меняется, THE Notification_System SHALL уведомить всех участников

### Requirement 15: Уведомления о задачах

**User Story:** As a сотрудник, I want to получать уведомления о задачах, so that I can не пропустить назначенные задания.

#### Acceptance Criteria

1. WHEN сотруднику назначена задача, THE Notification_System SHALL отправить уведомление
2. WHEN приближается срок задачи, THE Notification_System SHALL отправить напоминание
3. THE Notification_System SHALL предоставить команду /tasks для просмотра задач

### Requirement 16: Настройки уведомлений

**User Story:** As a сотрудник, I want to настраивать уведомления, so that I can получать только нужные мне.

#### Acceptance Criteria

1. THE Notification_System SHALL позволять включать/выключать уведомления о сменах
2. THE Notification_System SHALL позволять включать/выключать уведомления о задачах
3. THE Notification_System SHALL позволять включать/выключать напоминания
4. THE Notification_System SHALL сохранять настройки в профиле пользователя

### Requirement 17: Команды бота

**User Story:** As a сотрудник, I want to использовать команды бота, so that I can получать информацию быстро.

#### Acceptance Criteria

1. THE Notification_System SHALL предоставить команду /today для смен на сегодня
2. THE Notification_System SHALL предоставить команду /week для смен на неделю
3. THE Notification_System SHALL предоставить команду /swaps для активных запросов обмена
4. THE Notification_System SHALL предоставить команду /settings для настройки уведомлений
