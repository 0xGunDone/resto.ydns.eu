# Реализация Telegram бота - Итоги

## ✅ Что реализовано

### 1. База данных
- ✅ Добавлено поле `telegramId` в модель User
- ✅ Создана модель `InviteLink` для пригласительных ссылок
- ✅ Миграция применена

### 2. API для управления пригласительными ссылками
- ✅ `POST /api/invite-links` - Создание ссылки
- ✅ `GET /api/invite-links` - Список ссылок
- ✅ `GET /api/invite-links/token/:token` - Информация о ссылке (для бота)
- ✅ `POST /api/invite-links/use` - Использование ссылки
- ✅ `PUT /api/invite-links/:id/deactivate` - Деактивация ссылки

### 3. Telegram бот
- ✅ Установлен telegraf
- ✅ Базовая структура бота создана
- ✅ Регистрация через пригласительные ссылки
- ✅ Автоматическое определение существующих пользователей
- ✅ Добавление в несколько ресторанов

## Как работает регистрация в несколько ресторанов

### Схема работы:

```
Пользователь Иван:
├── User (1 запись)
│   ├── telegramId: "123456789"
│   ├── email: "ivan.petrov@resto.local"
│   └── ...
│
└── RestaurantUser (несколько записей - по одной на ресторан)
    ├── RestaurantUser 1
    │   ├── userId: "ivan_id"
    │   ├── restaurantId: "moscow"
    │   └── positionId: "waiter"
    │
    └── RestaurantUser 2
        ├── userId: "ivan_id"
        ├── restaurantId: "spb"
        └── positionId: "senior_waiter"
```

### Процесс:

1. **Первый ресторан:**
   - Менеджер создает ссылку для "Москва"
   - Иван регистрируется → User + RestaurantUser(Москва)

2. **Второй ресторан:**
   - Менеджер создает ссылку для "СПб"
   - Иван переходит по ссылке
   - Бот определяет по telegramId, что пользователь уже есть
   - Создается RestaurantUser(СПб) для существующего User

**Результат:** Один User, но несколько RestaurantUser - один для каждого ресторана!

## Использование

### Создание пригласительной ссылки:

```typescript
POST /api/invite-links
Headers: { Authorization: "Bearer TOKEN" }
Body: {
  "restaurantId": "restaurant_id",
  "positionId": "position_id", // опционально
  "departmentId": "department_id", // опционально
  "maxUses": 10, // опционально
  "expiresAt": "2025-12-31T23:59:59Z" // опционально
}

Response: {
  "inviteLink": {
    "url": "https://t.me/your_bot?start=abc123...",
    ...
  }
}
```

### Регистрация через бота:

1. Менеджер отправляет ссылку сотруднику
2. Сотрудник нажимает на ссылку
3. Бот запрашивает данные (ФИО, телефон)
4. Регистрация завершена!

## Следующие шаги

1. ⏳ Реализовать уведомления о сменах
2. ⏳ Добавить команду /schedule для просмотра графика
3. ⏳ Создать UI в личном кабинете для управления ссылками
4. ⏳ Тестирование полного цикла

## Запуск

1. Добавьте переменные в `.env`:
```env
TELEGRAM_BOT_TOKEN=8326442574:AAGy2mIZaMrx5E1h63vuSvCKoWdNw3L2kTY
TELEGRAM_BOT_USERNAME=your_bot_username
```

2. Запустите сервер:
```bash
npm run dev
```

Бот запустится автоматически!

