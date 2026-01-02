// Загружаем переменные окружения ПЕРВЫМ делом, до всех импортов
import dotenv from 'dotenv';
import path from 'path';

// Загружаем .env файл (пробуем несколько возможных путей)
const envPaths = [
  path.join(process.cwd(), '.env'),           // Из корня проекта
  path.join(__dirname, '../.env'),           // Относительно dist/
  path.join(__dirname, '../../.env'),         // Относительно src/
];

for (const envPath of envPaths) {
  const result = dotenv.config({ path: envPath });
  if (!result.error) {
    break; // Успешно загрузили
  }
}

import express from 'express';
import cors from 'cors';
import { logger } from './services/loggerService';
import { errorHandler } from './middleware/errorHandler';

// Инициализация БД
import { initDatabase } from './utils/initDb';
initDatabase();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Статические файлы для загрузок
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
import authRoutes from './routes/auth';
import shiftRoutes from './routes/shifts';
import restaurantRoutes from './routes/restaurants';
import shiftTemplateRoutes from './routes/shiftTemplates';
import scheduleTemplateRoutes from './routes/scheduleTemplates';
import taskRoutes from './routes/tasks';
import timesheetRoutes from './routes/timesheets';
import feedbackRoutes from './routes/feedback';
import actionLogRoutes from './routes/actionLogs';
import analyticsRoutes from './routes/analytics';
import departmentRoutes from './routes/departments';
import positionRoutes from './routes/positions';
import employeeRoutes from './routes/employees';
import dashboardRoutes from './routes/dashboard';
import permissionRoutes from './routes/permissions';
import inviteLinkRoutes from './routes/inviteLinks';
import holidayRoutes from './routes/holidays';
import bonusRoutes from './routes/bonuses';
import penaltyRoutes from './routes/penalties';
import notificationRoutes from './routes/notifications';
import pushSubscriptionRoutes from './routes/pushSubscriptions';
import notificationSettingsRoutes from './routes/notificationSettings';

app.use('/api/auth', authRoutes);
app.use('/api/shifts', shiftRoutes);
app.use('/api/shift-templates', shiftTemplateRoutes);
app.use('/api/schedule-templates', scheduleTemplateRoutes);
app.use('/api/restaurants', restaurantRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/timesheets', (req, res, next) => {
  logger.debug('Timesheets route accessed', { method: req.method, path: req.path, url: req.url });
  next();
}, timesheetRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/action-logs', actionLogRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/positions', positionRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/permissions', permissionRoutes);
app.use('/api/invite-links', inviteLinkRoutes);
app.use('/api/holidays', holidayRoutes);
app.use('/api/bonuses', bonusRoutes);
app.use('/api/penalties', penaltyRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/push-subscriptions', pushSubscriptionRoutes);
app.use('/api/notification-settings', notificationSettingsRoutes);

// Endpoint для получения VAPID публичного ключа
import { getVapidPublicKey, initializeVapid } from './utils/pushNotifications';

// Инициализируем VAPID ключи после загрузки .env
initializeVapid();

app.get('/api/vapid-public-key', (req, res) => {
  const key = getVapidPublicKey();
  if (key) {
    res.json({ publicKey: key });
  } else {
    res.status(503).json({ error: 'Push notifications not configured' });
  }
});

// Error handling middleware (centralized, consistent format)
// Requirements: 8.1 - Consistent error response format
app.use(errorHandler);

// Запуск Telegram бота
import { startBot } from './telegram/bot';
import { getTelegramSessionService } from './services/telegramSessionService';

app.listen(PORT, async () => {
  logger.info(`Server running on http://localhost:${PORT}`);
  
  // Запускаем Telegram бота
  // Requirements: 3.1 - Load sessions from persistent storage at startup
  if (process.env.TELEGRAM_BOT_ENABLED !== 'false' && process.env.TELEGRAM_BOT_TOKEN) {
    // Initialize session service and clean expired sessions before starting bot
    const sessionService = getTelegramSessionService();
    const cleanedCount = await sessionService.cleanExpiredSessions();
    if (cleanedCount > 0) {
      logger.info('Cleaned expired Telegram sessions at startup', { count: cleanedCount });
    }
    
    await startBot();
  }
});

