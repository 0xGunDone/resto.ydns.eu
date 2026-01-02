import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { seedDatabase } from './seedDb';
import { logger } from '../services/loggerService';

const dbPath = process.env.DATABASE_URL?.replace('file:', '') || path.join(__dirname, '../../dev.db');
const db = new Database(dbPath);

// Включаем foreign keys
db.pragma('foreign_keys = ON');

// Функция для проверки существования таблицы
function tableExists(tableName: string): boolean {
  const result = db.prepare(`
    SELECT name FROM sqlite_master 
    WHERE type='table' AND name=?
  `).get(tableName);
  return !!result;
}

// Функция для выполнения SQL из файла
function executeMigration(sql: string) {
  const statements = sql.split(';').filter(s => s.trim().length > 0);
  const transaction = db.transaction(() => {
    for (const statement of statements) {
      const trimmed = statement.trim();
      if (trimmed && !trimmed.startsWith('--') && !trimmed.startsWith('/*')) {
        try {
          db.exec(trimmed);
        } catch (error: any) {
          // Игнорируем ошибки если таблица уже существует или индекс уже существует
          if (!error.message.includes('already exists') && !error.message.includes('duplicate')) {
            logger.warn(`Warning executing SQL: ${trimmed.substring(0, 50)}...`, { error: error.message });
          }
        }
      }
    }
  });
  transaction();
}

export async function initDatabase() {
  logger.info('Initializing database...');

  // Если таблица User уже существует, считаем что БД инициализирована
  if (tableExists('User')) {
    logger.info('Database already initialized');
    return;
  }

  logger.info('Creating tables...');

  // Создаем все таблицы базы данных
  const schema = `
    -- User table
    CREATE TABLE IF NOT EXISTS "User" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "email" TEXT NOT NULL,
      "passwordHash" TEXT NOT NULL,
      "firstName" TEXT NOT NULL,
      "lastName" TEXT NOT NULL,
      "phone" TEXT,
      "telegramId" TEXT,
      "role" TEXT NOT NULL DEFAULT 'EMPLOYEE',
      "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
      "twoFactorSecret" TEXT,
      "isActive" BOOLEAN NOT NULL DEFAULT true,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");
    CREATE INDEX IF NOT EXISTS "User_email_idx" ON "User"("email");
    CREATE INDEX IF NOT EXISTS "User_role_idx" ON "User"("role");
    CREATE UNIQUE INDEX IF NOT EXISTS "User_telegramId_key" ON "User"("telegramId");
    CREATE INDEX IF NOT EXISTS "User_telegramId_idx" ON "User"("telegramId");

    -- Restaurant table
    CREATE TABLE IF NOT EXISTS "Restaurant" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "name" TEXT NOT NULL,
      "address" TEXT,
      "phone" TEXT,
      "email" TEXT,
      "isActive" BOOLEAN NOT NULL DEFAULT true,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "managerId" TEXT,
      CONSTRAINT "Restaurant_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
    );

    CREATE INDEX IF NOT EXISTS "Restaurant_managerId_idx" ON "Restaurant"("managerId");

    -- Department table
    CREATE TABLE IF NOT EXISTS "Department" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "restaurantId" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "isActive" BOOLEAN NOT NULL DEFAULT true,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "Department_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    );

    CREATE INDEX IF NOT EXISTS "Department_restaurantId_idx" ON "Department"("restaurantId");

    -- Position table
    CREATE TABLE IF NOT EXISTS "Position" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "restaurantId" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "isActive" BOOLEAN NOT NULL DEFAULT true,
      "bonusPerShift" REAL NOT NULL DEFAULT 0,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "Position_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    );

    CREATE INDEX IF NOT EXISTS "Position_restaurantId_idx" ON "Position"("restaurantId");

    -- Permission table
    CREATE TABLE IF NOT EXISTS "Permission" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "code" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "description" TEXT,
      "category" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE UNIQUE INDEX IF NOT EXISTS "Permission_code_key" ON "Permission"("code");
    CREATE INDEX IF NOT EXISTS "Permission_code_idx" ON "Permission"("code");
    CREATE INDEX IF NOT EXISTS "Permission_category_idx" ON "Permission"("category");

    -- PositionPermission table
    CREATE TABLE IF NOT EXISTS "PositionPermission" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "positionId" TEXT NOT NULL,
      "permissionId" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "PositionPermission_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "PositionPermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    );

    CREATE INDEX IF NOT EXISTS "PositionPermission_positionId_idx" ON "PositionPermission"("positionId");
    CREATE INDEX IF NOT EXISTS "PositionPermission_permissionId_idx" ON "PositionPermission"("permissionId");
    CREATE UNIQUE INDEX IF NOT EXISTS "PositionPermission_positionId_permissionId_key" ON "PositionPermission"("positionId", "permissionId");

    -- RestaurantUser table
    CREATE TABLE IF NOT EXISTS "RestaurantUser" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "restaurantId" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "positionId" TEXT NOT NULL,
      "departmentId" TEXT,
      "isActive" BOOLEAN NOT NULL DEFAULT true,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "RestaurantUser_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "RestaurantUser_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "RestaurantUser_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "RestaurantUser_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE SET NULL ON UPDATE CASCADE
    );

    CREATE INDEX IF NOT EXISTS "RestaurantUser_restaurantId_idx" ON "RestaurantUser"("restaurantId");
    CREATE INDEX IF NOT EXISTS "RestaurantUser_userId_idx" ON "RestaurantUser"("userId");
    CREATE INDEX IF NOT EXISTS "RestaurantUser_positionId_idx" ON "RestaurantUser"("positionId");
    CREATE INDEX IF NOT EXISTS "RestaurantUser_departmentId_idx" ON "RestaurantUser"("departmentId");
    CREATE UNIQUE INDEX IF NOT EXISTS "RestaurantUser_restaurantId_userId_key" ON "RestaurantUser"("restaurantId", "userId");

    -- ShiftTemplate table
    CREATE TABLE IF NOT EXISTS "ShiftTemplate" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "restaurantId" TEXT,
      "name" TEXT NOT NULL,
      "startHour" INTEGER NOT NULL,
      "endHour" INTEGER NOT NULL,
      "color" TEXT,
      "rate" REAL NOT NULL DEFAULT 0,
      "isActive" BOOLEAN NOT NULL DEFAULT true,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ShiftTemplate_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    );

    CREATE INDEX IF NOT EXISTS "ShiftTemplate_restaurantId_idx" ON "ShiftTemplate"("restaurantId");
    CREATE UNIQUE INDEX IF NOT EXISTS "ShiftTemplate_restaurantId_name_key" ON "ShiftTemplate"("restaurantId", "name");

    -- ScheduleTemplate table
    CREATE TABLE IF NOT EXISTS "ScheduleTemplate" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "restaurantId" TEXT NOT NULL,
      "createdById" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "description" TEXT,
      "periodType" TEXT NOT NULL DEFAULT 'week',
      "shiftsData" TEXT NOT NULL,
      "isActive" BOOLEAN NOT NULL DEFAULT true,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ScheduleTemplate_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "ScheduleTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    );

    CREATE INDEX IF NOT EXISTS "ScheduleTemplate_restaurantId_idx" ON "ScheduleTemplate"("restaurantId");
    CREATE INDEX IF NOT EXISTS "ScheduleTemplate_createdById_idx" ON "ScheduleTemplate"("createdById");
    CREATE INDEX IF NOT EXISTS "ScheduleTemplate_periodType_idx" ON "ScheduleTemplate"("periodType");

    -- Shift table
    CREATE TABLE IF NOT EXISTS "Shift" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "restaurantId" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "type" TEXT NOT NULL,
      "startTime" DATETIME NOT NULL,
      "endTime" DATETIME NOT NULL,
      "hours" REAL NOT NULL,
      "isConfirmed" BOOLEAN NOT NULL DEFAULT false,
      "isCompleted" BOOLEAN NOT NULL DEFAULT false,
      "notes" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "swapRequested" BOOLEAN NOT NULL DEFAULT false,
      "swapRequestedTo" TEXT,
      "employeeResponse" TEXT,
      "swapApproved" BOOLEAN,
      CONSTRAINT "Shift_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "Shift_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    );

    CREATE INDEX IF NOT EXISTS "Shift_restaurantId_idx" ON "Shift"("restaurantId");
    CREATE INDEX IF NOT EXISTS "Shift_userId_idx" ON "Shift"("userId");
    CREATE INDEX IF NOT EXISTS "Shift_startTime_idx" ON "Shift"("startTime");
    CREATE INDEX IF NOT EXISTS "Shift_isConfirmed_idx" ON "Shift"("isConfirmed");

    -- Task table
    CREATE TABLE IF NOT EXISTS "Task" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "restaurantId" TEXT NOT NULL,
      "createdById" TEXT NOT NULL,
      "assignedToId" TEXT,
      "title" TEXT NOT NULL,
      "description" TEXT,
      "category" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'NEW',
      "dueDate" DATETIME,
      "isRecurring" BOOLEAN NOT NULL DEFAULT false,
      "recurringRule" TEXT,
      "qrCode" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "completedAt" DATETIME,
      CONSTRAINT "Task_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "Task_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT "Task_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
    );

    CREATE INDEX IF NOT EXISTS "Task_restaurantId_idx" ON "Task"("restaurantId");
    CREATE INDEX IF NOT EXISTS "Task_assignedToId_idx" ON "Task"("assignedToId");
    CREATE INDEX IF NOT EXISTS "Task_status_idx" ON "Task"("status");
    CREATE INDEX IF NOT EXISTS "Task_category_idx" ON "Task"("category");

    -- TaskAttachment table
    CREATE TABLE IF NOT EXISTS "TaskAttachment" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "taskId" TEXT NOT NULL,
      "fileName" TEXT NOT NULL,
      "filePath" TEXT NOT NULL,
      "fileSize" INTEGER NOT NULL,
      "mimeType" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "TaskAttachment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    );

    CREATE INDEX IF NOT EXISTS "TaskAttachment_taskId_idx" ON "TaskAttachment"("taskId");

    -- Timesheet table
    CREATE TABLE IF NOT EXISTS "Timesheet" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "restaurantId" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "month" INTEGER NOT NULL,
      "year" INTEGER NOT NULL,
      "totalHours" REAL NOT NULL DEFAULT 0,
      "overtimeHours" REAL NOT NULL DEFAULT 0,
      "lateCount" INTEGER NOT NULL DEFAULT 0,
      "sickDays" INTEGER NOT NULL DEFAULT 0,
      "vacationDays" INTEGER NOT NULL DEFAULT 0,
      "isApproved" BOOLEAN NOT NULL DEFAULT false,
      "approvedById" TEXT,
      "approvedAt" DATETIME,
      "notes" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "Timesheet_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "Timesheet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    );

    CREATE INDEX IF NOT EXISTS "Timesheet_restaurantId_idx" ON "Timesheet"("restaurantId");
    CREATE INDEX IF NOT EXISTS "Timesheet_userId_idx" ON "Timesheet"("userId");
    CREATE INDEX IF NOT EXISTS "Timesheet_year_month_idx" ON "Timesheet"("year", "month");
    CREATE UNIQUE INDEX IF NOT EXISTS "Timesheet_restaurantId_userId_month_year_key" ON "Timesheet"("restaurantId", "userId", "month", "year");

    -- Feedback table
    CREATE TABLE IF NOT EXISTS "Feedback" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "restaurantId" TEXT NOT NULL,
      "userId" TEXT,
      "type" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'PENDING',
      "title" TEXT NOT NULL,
      "message" TEXT NOT NULL,
      "isAnonymous" BOOLEAN NOT NULL DEFAULT false,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "resolvedAt" DATETIME,
      CONSTRAINT "Feedback_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "Feedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
    );

    CREATE INDEX IF NOT EXISTS "Feedback_restaurantId_idx" ON "Feedback"("restaurantId");
    CREATE INDEX IF NOT EXISTS "Feedback_status_idx" ON "Feedback"("status");
    CREATE INDEX IF NOT EXISTS "Feedback_type_idx" ON "Feedback"("type");

    -- FeedbackAttachment table
    CREATE TABLE IF NOT EXISTS "FeedbackAttachment" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "feedbackId" TEXT NOT NULL,
      "fileName" TEXT NOT NULL,
      "filePath" TEXT NOT NULL,
      "fileSize" INTEGER NOT NULL,
      "mimeType" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "FeedbackAttachment_feedbackId_fkey" FOREIGN KEY ("feedbackId") REFERENCES "Feedback" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    );

    CREATE INDEX IF NOT EXISTS "FeedbackAttachment_feedbackId_idx" ON "FeedbackAttachment"("feedbackId");

    -- ActionLog table
    CREATE TABLE IF NOT EXISTS "ActionLog" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "userId" TEXT NOT NULL,
      "type" TEXT NOT NULL,
      "entityType" TEXT NOT NULL,
      "entityId" TEXT,
      "description" TEXT NOT NULL,
      "metadata" TEXT,
      "ipAddress" TEXT,
      "userAgent" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "taskId" TEXT,
      CONSTRAINT "ActionLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "ActionLog_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE SET NULL ON UPDATE CASCADE
    );

    CREATE INDEX IF NOT EXISTS "ActionLog_userId_idx" ON "ActionLog"("userId");
    CREATE INDEX IF NOT EXISTS "ActionLog_entityType_entityId_idx" ON "ActionLog"("entityType", "entityId");
    CREATE INDEX IF NOT EXISTS "ActionLog_createdAt_idx" ON "ActionLog"("createdAt");
    CREATE INDEX IF NOT EXISTS "ActionLog_type_idx" ON "ActionLog"("type");

    -- InviteLink table
    CREATE TABLE IF NOT EXISTS "InviteLink" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "token" TEXT NOT NULL,
      "restaurantId" TEXT,
      "positionId" TEXT,
      "departmentId" TEXT,
      "createdById" TEXT NOT NULL,
      "expiresAt" DATETIME,
      "maxUses" INTEGER NOT NULL DEFAULT 1,
      "usedCount" INTEGER NOT NULL DEFAULT 0,
      "isActive" BOOLEAN NOT NULL DEFAULT true,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "InviteLink_token_key" UNIQUE ("token"),
      CONSTRAINT "InviteLink_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "InviteLink_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
      CONSTRAINT "InviteLink_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
      CONSTRAINT "InviteLink_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    );

    CREATE INDEX IF NOT EXISTS "InviteLink_token_idx" ON "InviteLink"("token");
    CREATE INDEX IF NOT EXISTS "InviteLink_restaurantId_idx" ON "InviteLink"("restaurantId");
    CREATE INDEX IF NOT EXISTS "InviteLink_createdById_idx" ON "InviteLink"("createdById");
    CREATE INDEX IF NOT EXISTS "InviteLink_isActive_idx" ON "InviteLink"("isActive");

    -- ShiftSwapHistory table
    CREATE TABLE IF NOT EXISTS "ShiftSwapHistory" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "shiftId" TEXT,
      "restaurantId" TEXT NOT NULL,
      "fromUserId" TEXT NOT NULL,
      "toUserId" TEXT,
      "status" TEXT NOT NULL DEFAULT 'REQUESTED',
      "shiftDate" DATETIME NOT NULL,
      "shiftStartTime" DATETIME,
      "shiftEndTime" DATETIME,
      "shiftType" TEXT,
      "requestedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "approvedAt" DATETIME,
      "approvedById" TEXT,
      "notes" TEXT,
      "changeType" TEXT,
      CONSTRAINT "ShiftSwapHistory_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "ShiftSwapHistory_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "ShiftSwapHistory_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
      CONSTRAINT "ShiftSwapHistory_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
    );

    CREATE INDEX IF NOT EXISTS "ShiftSwapHistory_restaurantId_idx" ON "ShiftSwapHistory"("restaurantId");
    CREATE INDEX IF NOT EXISTS "ShiftSwapHistory_fromUserId_idx" ON "ShiftSwapHistory"("fromUserId");
    CREATE INDEX IF NOT EXISTS "ShiftSwapHistory_toUserId_idx" ON "ShiftSwapHistory"("toUserId");
    CREATE INDEX IF NOT EXISTS "ShiftSwapHistory_status_idx" ON "ShiftSwapHistory"("status");
    CREATE INDEX IF NOT EXISTS "ShiftSwapHistory_shiftDate_idx" ON "ShiftSwapHistory"("shiftDate");
    CREATE INDEX IF NOT EXISTS "ShiftSwapHistory_requestedAt_idx" ON "ShiftSwapHistory"("requestedAt");
    CREATE INDEX IF NOT EXISTS "ShiftSwapHistory_changeType_idx" ON "ShiftSwapHistory"("changeType");

    -- Holiday table
    CREATE TABLE IF NOT EXISTS "Holiday" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "restaurantId" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "date" DATETIME NOT NULL,
      "type" TEXT NOT NULL DEFAULT 'HOLIDAY',
      "isRecurring" BOOLEAN NOT NULL DEFAULT false,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "Holiday_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    );

    CREATE UNIQUE INDEX IF NOT EXISTS "Holiday_restaurantId_date_key" ON "Holiday"("restaurantId", "date");
    CREATE INDEX IF NOT EXISTS "Holiday_restaurantId_idx" ON "Holiday"("restaurantId");
    CREATE INDEX IF NOT EXISTS "Holiday_date_idx" ON "Holiday"("date");
    CREATE INDEX IF NOT EXISTS "Holiday_type_idx" ON "Holiday"("type");

    -- Bonus table
    CREATE TABLE IF NOT EXISTS "Bonus" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "restaurantId" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "timesheetId" TEXT,
      "amount" REAL NOT NULL,
      "comment" TEXT,
      "month" INTEGER,
      "year" INTEGER,
      "createdById" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "Bonus_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "Bonus_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "Bonus_timesheetId_fkey" FOREIGN KEY ("timesheetId") REFERENCES "Timesheet" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
      CONSTRAINT "Bonus_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    );

    CREATE INDEX IF NOT EXISTS "Bonus_restaurantId_idx" ON "Bonus"("restaurantId");
    CREATE INDEX IF NOT EXISTS "Bonus_userId_idx" ON "Bonus"("userId");
    CREATE INDEX IF NOT EXISTS "Bonus_timesheetId_idx" ON "Bonus"("timesheetId");
    CREATE INDEX IF NOT EXISTS "Bonus_year_month_idx" ON "Bonus"("year", "month");
    CREATE INDEX IF NOT EXISTS "Bonus_createdAt_idx" ON "Bonus"("createdAt");

    -- Penalty table
    CREATE TABLE IF NOT EXISTS "Penalty" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "restaurantId" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "timesheetId" TEXT,
      "amount" REAL NOT NULL,
      "comment" TEXT,
      "month" INTEGER,
      "year" INTEGER,
      "createdById" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "Penalty_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "Penalty_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "Penalty_timesheetId_fkey" FOREIGN KEY ("timesheetId") REFERENCES "Timesheet" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
      CONSTRAINT "Penalty_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    );

    CREATE INDEX IF NOT EXISTS "Penalty_restaurantId_idx" ON "Penalty"("restaurantId");
    CREATE INDEX IF NOT EXISTS "Penalty_userId_idx" ON "Penalty"("userId");
    CREATE INDEX IF NOT EXISTS "Penalty_timesheetId_idx" ON "Penalty"("timesheetId");
    CREATE INDEX IF NOT EXISTS "Penalty_year_month_idx" ON "Penalty"("year", "month");
    CREATE INDEX IF NOT EXISTS "Penalty_createdAt_idx" ON "Penalty"("createdAt");

    -- Notification table
    CREATE TABLE IF NOT EXISTS "Notification" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "userId" TEXT NOT NULL,
      "type" TEXT NOT NULL,
      "title" TEXT NOT NULL,
      "message" TEXT NOT NULL,
      "link" TEXT,
      "isRead" BOOLEAN NOT NULL DEFAULT false,
      "metadata" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "readAt" DATETIME,
      CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    );

    CREATE INDEX IF NOT EXISTS "Notification_userId_idx" ON "Notification"("userId");
    CREATE INDEX IF NOT EXISTS "Notification_isRead_idx" ON "Notification"("isRead");
    CREATE INDEX IF NOT EXISTS "Notification_createdAt_idx" ON "Notification"("createdAt");
    CREATE INDEX IF NOT EXISTS "Notification_type_idx" ON "Notification"("type");

    -- PushSubscription table
    CREATE TABLE IF NOT EXISTS "PushSubscription" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "userId" TEXT NOT NULL,
      "endpoint" TEXT NOT NULL,
      "p256dh" TEXT NOT NULL,
      "auth" TEXT NOT NULL,
      "userAgent" TEXT,
      "isActive" BOOLEAN NOT NULL DEFAULT true,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "PushSubscription_endpoint_key" UNIQUE ("endpoint"),
      CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    );

    CREATE INDEX IF NOT EXISTS "PushSubscription_userId_idx" ON "PushSubscription"("userId");
    CREATE INDEX IF NOT EXISTS "PushSubscription_isActive_idx" ON "PushSubscription"("isActive");

    -- NotificationSettings table
    CREATE TABLE IF NOT EXISTS "NotificationSettings" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "userId" TEXT NOT NULL,
      "enablePushNotifications" BOOLEAN NOT NULL DEFAULT true,
      "enableTaskNotifications" BOOLEAN NOT NULL DEFAULT true,
      "enableShiftNotifications" BOOLEAN NOT NULL DEFAULT true,
      "enableSwapNotifications" BOOLEAN NOT NULL DEFAULT true,
      "enableTimesheetNotifications" BOOLEAN NOT NULL DEFAULT true,
      "enableInAppNotifications" BOOLEAN NOT NULL DEFAULT true,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "NotificationSettings_userId_key" UNIQUE ("userId"),
      CONSTRAINT "NotificationSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    );

    CREATE INDEX IF NOT EXISTS "NotificationSettings_userId_idx" ON "NotificationSettings"("userId");

    -- TelegramSession table (for bot session persistence)
    CREATE TABLE IF NOT EXISTS "TelegramSession" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "telegram_user_id" TEXT NOT NULL,
      "step" TEXT NOT NULL DEFAULT 'idle',
      "invite_token" TEXT,
      "registration_data" TEXT,
      "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "expires_at" DATETIME NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS "TelegramSession_telegram_user_id_key" ON "TelegramSession"("telegram_user_id");
    CREATE INDEX IF NOT EXISTS "TelegramSession_telegram_user_id_idx" ON "TelegramSession"("telegram_user_id");
    CREATE INDEX IF NOT EXISTS "TelegramSession_expires_at_idx" ON "TelegramSession"("expires_at");
  `;

  executeMigration(schema);
  logger.info('Database successfully initialized');
  
  // Заполняем базу данных начальными данными
  await seedDatabase();
}

