import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

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
app.use('/api/timesheets', timesheetRoutes);
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
import { getVapidPublicKey } from './utils/pushNotifications';
app.get('/api/vapid-public-key', (req, res) => {
  const key = getVapidPublicKey();
  if (key) {
    res.json({ publicKey: key });
  } else {
    res.status(503).json({ error: 'Push notifications not configured' });
  }
});

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

// Запуск Telegram бота
import { startBot } from './telegram/bot';

app.listen(PORT, async () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  
  // Запускаем Telegram бота
  if (process.env.TELEGRAM_BOT_ENABLED !== 'false' && process.env.TELEGRAM_BOT_TOKEN) {
    await startBot();
  }
});

