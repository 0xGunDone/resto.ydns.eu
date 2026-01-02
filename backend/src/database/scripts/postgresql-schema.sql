-- PostgreSQL Schema for Restaurant Management Platform
-- This script creates all tables with proper PostgreSQL types
-- UUID for IDs, TIMESTAMPTZ for dates, proper constraints and indexes

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- User table
-- ============================================
CREATE TABLE IF NOT EXISTS "User" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "email" VARCHAR(255) NOT NULL,
  "passwordHash" VARCHAR(255) NOT NULL,
  "firstName" VARCHAR(100) NOT NULL,
  "lastName" VARCHAR(100) NOT NULL,
  "phone" VARCHAR(50),
  "telegramId" VARCHAR(100),
  "role" VARCHAR(50) NOT NULL DEFAULT 'EMPLOYEE',
  "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
  "twoFactorSecret" VARCHAR(255),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");
CREATE INDEX IF NOT EXISTS "User_email_idx" ON "User"("email");
CREATE INDEX IF NOT EXISTS "User_role_idx" ON "User"("role");
CREATE UNIQUE INDEX IF NOT EXISTS "User_telegramId_key" ON "User"("telegramId");
CREATE INDEX IF NOT EXISTS "User_telegramId_idx" ON "User"("telegramId");

-- ============================================
-- Restaurant table
-- ============================================
CREATE TABLE IF NOT EXISTS "Restaurant" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "name" VARCHAR(255) NOT NULL,
  "address" TEXT,
  "phone" VARCHAR(50),
  "email" VARCHAR(255),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "managerId" UUID,
  CONSTRAINT "Restaurant_managerId_fkey" FOREIGN KEY ("managerId") 
    REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "Restaurant_managerId_idx" ON "Restaurant"("managerId");

-- ============================================
-- Department table
-- ============================================
CREATE TABLE IF NOT EXISTS "Department" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "restaurantId" UUID NOT NULL,
  "name" VARCHAR(255) NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "Department_restaurantId_fkey" FOREIGN KEY ("restaurantId") 
    REFERENCES "Restaurant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "Department_restaurantId_idx" ON "Department"("restaurantId");


-- ============================================
-- Position table
-- ============================================
CREATE TABLE IF NOT EXISTS "Position" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "restaurantId" UUID NOT NULL,
  "name" VARCHAR(255) NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "bonusPerShift" DECIMAL(10, 2) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "Position_restaurantId_fkey" FOREIGN KEY ("restaurantId") 
    REFERENCES "Restaurant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "Position_restaurantId_idx" ON "Position"("restaurantId");

-- ============================================
-- Permission table
-- ============================================
CREATE TABLE IF NOT EXISTS "Permission" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "code" VARCHAR(100) NOT NULL,
  "name" VARCHAR(255) NOT NULL,
  "description" TEXT,
  "category" VARCHAR(100) NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS "Permission_code_key" ON "Permission"("code");
CREATE INDEX IF NOT EXISTS "Permission_code_idx" ON "Permission"("code");
CREATE INDEX IF NOT EXISTS "Permission_category_idx" ON "Permission"("category");

-- ============================================
-- PositionPermission table
-- ============================================
CREATE TABLE IF NOT EXISTS "PositionPermission" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "positionId" UUID NOT NULL,
  "permissionId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "PositionPermission_positionId_fkey" FOREIGN KEY ("positionId") 
    REFERENCES "Position" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PositionPermission_permissionId_fkey" FOREIGN KEY ("permissionId") 
    REFERENCES "Permission" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "PositionPermission_positionId_idx" ON "PositionPermission"("positionId");
CREATE INDEX IF NOT EXISTS "PositionPermission_permissionId_idx" ON "PositionPermission"("permissionId");
CREATE UNIQUE INDEX IF NOT EXISTS "PositionPermission_positionId_permissionId_key" 
  ON "PositionPermission"("positionId", "permissionId");

-- ============================================
-- RestaurantUser table
-- ============================================
CREATE TABLE IF NOT EXISTS "RestaurantUser" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "restaurantId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "positionId" UUID NOT NULL,
  "departmentId" UUID,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "RestaurantUser_restaurantId_fkey" FOREIGN KEY ("restaurantId") 
    REFERENCES "Restaurant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RestaurantUser_userId_fkey" FOREIGN KEY ("userId") 
    REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RestaurantUser_positionId_fkey" FOREIGN KEY ("positionId") 
    REFERENCES "Position" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RestaurantUser_departmentId_fkey" FOREIGN KEY ("departmentId") 
    REFERENCES "Department" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "RestaurantUser_restaurantId_idx" ON "RestaurantUser"("restaurantId");
CREATE INDEX IF NOT EXISTS "RestaurantUser_userId_idx" ON "RestaurantUser"("userId");
CREATE INDEX IF NOT EXISTS "RestaurantUser_positionId_idx" ON "RestaurantUser"("positionId");
CREATE INDEX IF NOT EXISTS "RestaurantUser_departmentId_idx" ON "RestaurantUser"("departmentId");
CREATE UNIQUE INDEX IF NOT EXISTS "RestaurantUser_restaurantId_userId_key" 
  ON "RestaurantUser"("restaurantId", "userId");

-- ============================================
-- ShiftTemplate table
-- ============================================
CREATE TABLE IF NOT EXISTS "ShiftTemplate" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "restaurantId" UUID,
  "name" VARCHAR(255) NOT NULL,
  "startHour" INTEGER NOT NULL,
  "endHour" INTEGER NOT NULL,
  "color" VARCHAR(50),
  "rate" DECIMAL(10, 2) NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "ShiftTemplate_restaurantId_fkey" FOREIGN KEY ("restaurantId") 
    REFERENCES "Restaurant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "ShiftTemplate_restaurantId_idx" ON "ShiftTemplate"("restaurantId");
CREATE UNIQUE INDEX IF NOT EXISTS "ShiftTemplate_restaurantId_name_key" 
  ON "ShiftTemplate"("restaurantId", "name");

-- ============================================
-- ScheduleTemplate table
-- ============================================
CREATE TABLE IF NOT EXISTS "ScheduleTemplate" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "restaurantId" UUID NOT NULL,
  "createdById" UUID NOT NULL,
  "name" VARCHAR(255) NOT NULL,
  "description" TEXT,
  "periodType" VARCHAR(50) NOT NULL DEFAULT 'week',
  "shiftsData" JSONB NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "ScheduleTemplate_restaurantId_fkey" FOREIGN KEY ("restaurantId") 
    REFERENCES "Restaurant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ScheduleTemplate_createdById_fkey" FOREIGN KEY ("createdById") 
    REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "ScheduleTemplate_restaurantId_idx" ON "ScheduleTemplate"("restaurantId");
CREATE INDEX IF NOT EXISTS "ScheduleTemplate_createdById_idx" ON "ScheduleTemplate"("createdById");
CREATE INDEX IF NOT EXISTS "ScheduleTemplate_periodType_idx" ON "ScheduleTemplate"("periodType");


-- ============================================
-- Shift table
-- ============================================
CREATE TABLE IF NOT EXISTS "Shift" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "restaurantId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "type" VARCHAR(100) NOT NULL,
  "startTime" TIMESTAMPTZ NOT NULL,
  "endTime" TIMESTAMPTZ NOT NULL,
  "hours" DECIMAL(5, 2) NOT NULL,
  "isConfirmed" BOOLEAN NOT NULL DEFAULT false,
  "isCompleted" BOOLEAN NOT NULL DEFAULT false,
  "notes" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "swapRequested" BOOLEAN NOT NULL DEFAULT false,
  "swapRequestedTo" UUID,
  "employeeResponse" VARCHAR(50),
  "swapApproved" BOOLEAN,
  CONSTRAINT "Shift_restaurantId_fkey" FOREIGN KEY ("restaurantId") 
    REFERENCES "Restaurant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Shift_userId_fkey" FOREIGN KEY ("userId") 
    REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "Shift_restaurantId_idx" ON "Shift"("restaurantId");
CREATE INDEX IF NOT EXISTS "Shift_userId_idx" ON "Shift"("userId");
CREATE INDEX IF NOT EXISTS "Shift_startTime_idx" ON "Shift"("startTime");
CREATE INDEX IF NOT EXISTS "Shift_isConfirmed_idx" ON "Shift"("isConfirmed");

-- ============================================
-- Task table
-- ============================================
CREATE TABLE IF NOT EXISTS "Task" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "restaurantId" UUID NOT NULL,
  "createdById" UUID NOT NULL,
  "assignedToId" UUID,
  "title" VARCHAR(255) NOT NULL,
  "description" TEXT,
  "category" VARCHAR(100) NOT NULL,
  "status" VARCHAR(50) NOT NULL DEFAULT 'NEW',
  "dueDate" TIMESTAMPTZ,
  "isRecurring" BOOLEAN NOT NULL DEFAULT false,
  "recurringRule" TEXT,
  "qrCode" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "completedAt" TIMESTAMPTZ,
  CONSTRAINT "Task_restaurantId_fkey" FOREIGN KEY ("restaurantId") 
    REFERENCES "Restaurant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Task_createdById_fkey" FOREIGN KEY ("createdById") 
    REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Task_assignedToId_fkey" FOREIGN KEY ("assignedToId") 
    REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "Task_restaurantId_idx" ON "Task"("restaurantId");
CREATE INDEX IF NOT EXISTS "Task_assignedToId_idx" ON "Task"("assignedToId");
CREATE INDEX IF NOT EXISTS "Task_status_idx" ON "Task"("status");
CREATE INDEX IF NOT EXISTS "Task_category_idx" ON "Task"("category");

-- ============================================
-- TaskAttachment table
-- ============================================
CREATE TABLE IF NOT EXISTS "TaskAttachment" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "taskId" UUID NOT NULL,
  "fileName" VARCHAR(255) NOT NULL,
  "filePath" TEXT NOT NULL,
  "fileSize" INTEGER NOT NULL,
  "mimeType" VARCHAR(100),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "TaskAttachment_taskId_fkey" FOREIGN KEY ("taskId") 
    REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "TaskAttachment_taskId_idx" ON "TaskAttachment"("taskId");

-- ============================================
-- Timesheet table
-- ============================================
CREATE TABLE IF NOT EXISTS "Timesheet" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "restaurantId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "month" INTEGER NOT NULL,
  "year" INTEGER NOT NULL,
  "totalHours" DECIMAL(8, 2) NOT NULL DEFAULT 0,
  "overtimeHours" DECIMAL(8, 2) NOT NULL DEFAULT 0,
  "lateCount" INTEGER NOT NULL DEFAULT 0,
  "sickDays" INTEGER NOT NULL DEFAULT 0,
  "vacationDays" INTEGER NOT NULL DEFAULT 0,
  "isApproved" BOOLEAN NOT NULL DEFAULT false,
  "approvedById" UUID,
  "approvedAt" TIMESTAMPTZ,
  "notes" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "Timesheet_restaurantId_fkey" FOREIGN KEY ("restaurantId") 
    REFERENCES "Restaurant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Timesheet_userId_fkey" FOREIGN KEY ("userId") 
    REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "Timesheet_restaurantId_idx" ON "Timesheet"("restaurantId");
CREATE INDEX IF NOT EXISTS "Timesheet_userId_idx" ON "Timesheet"("userId");
CREATE INDEX IF NOT EXISTS "Timesheet_year_month_idx" ON "Timesheet"("year", "month");
CREATE UNIQUE INDEX IF NOT EXISTS "Timesheet_restaurantId_userId_month_year_key" 
  ON "Timesheet"("restaurantId", "userId", "month", "year");


-- ============================================
-- Feedback table
-- ============================================
CREATE TABLE IF NOT EXISTS "Feedback" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "restaurantId" UUID NOT NULL,
  "userId" UUID,
  "type" VARCHAR(50) NOT NULL,
  "status" VARCHAR(50) NOT NULL DEFAULT 'PENDING',
  "title" VARCHAR(255) NOT NULL,
  "message" TEXT NOT NULL,
  "isAnonymous" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "resolvedAt" TIMESTAMPTZ,
  CONSTRAINT "Feedback_restaurantId_fkey" FOREIGN KEY ("restaurantId") 
    REFERENCES "Restaurant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Feedback_userId_fkey" FOREIGN KEY ("userId") 
    REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "Feedback_restaurantId_idx" ON "Feedback"("restaurantId");
CREATE INDEX IF NOT EXISTS "Feedback_status_idx" ON "Feedback"("status");
CREATE INDEX IF NOT EXISTS "Feedback_type_idx" ON "Feedback"("type");

-- ============================================
-- FeedbackAttachment table
-- ============================================
CREATE TABLE IF NOT EXISTS "FeedbackAttachment" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "feedbackId" UUID NOT NULL,
  "fileName" VARCHAR(255) NOT NULL,
  "filePath" TEXT NOT NULL,
  "fileSize" INTEGER NOT NULL,
  "mimeType" VARCHAR(100),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "FeedbackAttachment_feedbackId_fkey" FOREIGN KEY ("feedbackId") 
    REFERENCES "Feedback" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "FeedbackAttachment_feedbackId_idx" ON "FeedbackAttachment"("feedbackId");

-- ============================================
-- ActionLog table
-- ============================================
CREATE TABLE IF NOT EXISTS "ActionLog" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "userId" UUID NOT NULL,
  "type" VARCHAR(100) NOT NULL,
  "entityType" VARCHAR(100) NOT NULL,
  "entityId" UUID,
  "description" TEXT NOT NULL,
  "metadata" JSONB,
  "ipAddress" VARCHAR(50),
  "userAgent" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "taskId" UUID,
  CONSTRAINT "ActionLog_userId_fkey" FOREIGN KEY ("userId") 
    REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ActionLog_taskId_fkey" FOREIGN KEY ("taskId") 
    REFERENCES "Task" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "ActionLog_userId_idx" ON "ActionLog"("userId");
CREATE INDEX IF NOT EXISTS "ActionLog_entityType_entityId_idx" ON "ActionLog"("entityType", "entityId");
CREATE INDEX IF NOT EXISTS "ActionLog_createdAt_idx" ON "ActionLog"("createdAt");
CREATE INDEX IF NOT EXISTS "ActionLog_type_idx" ON "ActionLog"("type");

-- ============================================
-- InviteLink table
-- ============================================
CREATE TABLE IF NOT EXISTS "InviteLink" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "token" VARCHAR(255) NOT NULL,
  "restaurantId" UUID,
  "positionId" UUID,
  "departmentId" UUID,
  "createdById" UUID NOT NULL,
  "expiresAt" TIMESTAMPTZ,
  "maxUses" INTEGER NOT NULL DEFAULT 1,
  "usedCount" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "InviteLink_token_key" UNIQUE ("token"),
  CONSTRAINT "InviteLink_restaurantId_fkey" FOREIGN KEY ("restaurantId") 
    REFERENCES "Restaurant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "InviteLink_positionId_fkey" FOREIGN KEY ("positionId") 
    REFERENCES "Position" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "InviteLink_departmentId_fkey" FOREIGN KEY ("departmentId") 
    REFERENCES "Department" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "InviteLink_createdById_fkey" FOREIGN KEY ("createdById") 
    REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "InviteLink_token_idx" ON "InviteLink"("token");
CREATE INDEX IF NOT EXISTS "InviteLink_restaurantId_idx" ON "InviteLink"("restaurantId");
CREATE INDEX IF NOT EXISTS "InviteLink_createdById_idx" ON "InviteLink"("createdById");
CREATE INDEX IF NOT EXISTS "InviteLink_isActive_idx" ON "InviteLink"("isActive");


-- ============================================
-- ShiftSwapHistory table
-- ============================================
CREATE TABLE IF NOT EXISTS "ShiftSwapHistory" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "shiftId" UUID,
  "restaurantId" UUID NOT NULL,
  "fromUserId" UUID NOT NULL,
  "toUserId" UUID,
  "status" VARCHAR(50) NOT NULL DEFAULT 'REQUESTED',
  "shiftDate" TIMESTAMPTZ NOT NULL,
  "shiftStartTime" TIMESTAMPTZ,
  "shiftEndTime" TIMESTAMPTZ,
  "shiftType" VARCHAR(100),
  "requestedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "approvedAt" TIMESTAMPTZ,
  "approvedById" UUID,
  "notes" TEXT,
  "changeType" VARCHAR(50),
  CONSTRAINT "ShiftSwapHistory_restaurantId_fkey" FOREIGN KEY ("restaurantId") 
    REFERENCES "Restaurant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ShiftSwapHistory_fromUserId_fkey" FOREIGN KEY ("fromUserId") 
    REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ShiftSwapHistory_toUserId_fkey" FOREIGN KEY ("toUserId") 
    REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ShiftSwapHistory_approvedById_fkey" FOREIGN KEY ("approvedById") 
    REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "ShiftSwapHistory_restaurantId_idx" ON "ShiftSwapHistory"("restaurantId");
CREATE INDEX IF NOT EXISTS "ShiftSwapHistory_fromUserId_idx" ON "ShiftSwapHistory"("fromUserId");
CREATE INDEX IF NOT EXISTS "ShiftSwapHistory_toUserId_idx" ON "ShiftSwapHistory"("toUserId");
CREATE INDEX IF NOT EXISTS "ShiftSwapHistory_status_idx" ON "ShiftSwapHistory"("status");
CREATE INDEX IF NOT EXISTS "ShiftSwapHistory_shiftDate_idx" ON "ShiftSwapHistory"("shiftDate");
CREATE INDEX IF NOT EXISTS "ShiftSwapHistory_requestedAt_idx" ON "ShiftSwapHistory"("requestedAt");
CREATE INDEX IF NOT EXISTS "ShiftSwapHistory_changeType_idx" ON "ShiftSwapHistory"("changeType");

-- ============================================
-- Holiday table
-- ============================================
CREATE TABLE IF NOT EXISTS "Holiday" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "restaurantId" UUID NOT NULL,
  "name" VARCHAR(255) NOT NULL,
  "date" DATE NOT NULL,
  "type" VARCHAR(50) NOT NULL DEFAULT 'HOLIDAY',
  "isRecurring" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "Holiday_restaurantId_fkey" FOREIGN KEY ("restaurantId") 
    REFERENCES "Restaurant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "Holiday_restaurantId_date_key" ON "Holiday"("restaurantId", "date");
CREATE INDEX IF NOT EXISTS "Holiday_restaurantId_idx" ON "Holiday"("restaurantId");
CREATE INDEX IF NOT EXISTS "Holiday_date_idx" ON "Holiday"("date");
CREATE INDEX IF NOT EXISTS "Holiday_type_idx" ON "Holiday"("type");

-- ============================================
-- Bonus table
-- ============================================
CREATE TABLE IF NOT EXISTS "Bonus" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "restaurantId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "timesheetId" UUID,
  "amount" DECIMAL(10, 2) NOT NULL,
  "comment" TEXT,
  "month" INTEGER,
  "year" INTEGER,
  "createdById" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "Bonus_restaurantId_fkey" FOREIGN KEY ("restaurantId") 
    REFERENCES "Restaurant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Bonus_userId_fkey" FOREIGN KEY ("userId") 
    REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Bonus_timesheetId_fkey" FOREIGN KEY ("timesheetId") 
    REFERENCES "Timesheet" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "Bonus_createdById_fkey" FOREIGN KEY ("createdById") 
    REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "Bonus_restaurantId_idx" ON "Bonus"("restaurantId");
CREATE INDEX IF NOT EXISTS "Bonus_userId_idx" ON "Bonus"("userId");
CREATE INDEX IF NOT EXISTS "Bonus_timesheetId_idx" ON "Bonus"("timesheetId");
CREATE INDEX IF NOT EXISTS "Bonus_year_month_idx" ON "Bonus"("year", "month");
CREATE INDEX IF NOT EXISTS "Bonus_createdAt_idx" ON "Bonus"("createdAt");

-- ============================================
-- Penalty table
-- ============================================
CREATE TABLE IF NOT EXISTS "Penalty" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "restaurantId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "timesheetId" UUID,
  "amount" DECIMAL(10, 2) NOT NULL,
  "comment" TEXT,
  "month" INTEGER,
  "year" INTEGER,
  "createdById" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "Penalty_restaurantId_fkey" FOREIGN KEY ("restaurantId") 
    REFERENCES "Restaurant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Penalty_userId_fkey" FOREIGN KEY ("userId") 
    REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Penalty_timesheetId_fkey" FOREIGN KEY ("timesheetId") 
    REFERENCES "Timesheet" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "Penalty_createdById_fkey" FOREIGN KEY ("createdById") 
    REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "Penalty_restaurantId_idx" ON "Penalty"("restaurantId");
CREATE INDEX IF NOT EXISTS "Penalty_userId_idx" ON "Penalty"("userId");
CREATE INDEX IF NOT EXISTS "Penalty_timesheetId_idx" ON "Penalty"("timesheetId");
CREATE INDEX IF NOT EXISTS "Penalty_year_month_idx" ON "Penalty"("year", "month");
CREATE INDEX IF NOT EXISTS "Penalty_createdAt_idx" ON "Penalty"("createdAt");


-- ============================================
-- Notification table
-- ============================================
CREATE TABLE IF NOT EXISTS "Notification" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "userId" UUID NOT NULL,
  "type" VARCHAR(100) NOT NULL,
  "title" VARCHAR(255) NOT NULL,
  "message" TEXT NOT NULL,
  "link" TEXT,
  "isRead" BOOLEAN NOT NULL DEFAULT false,
  "metadata" JSONB,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "readAt" TIMESTAMPTZ,
  CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") 
    REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "Notification_userId_idx" ON "Notification"("userId");
CREATE INDEX IF NOT EXISTS "Notification_isRead_idx" ON "Notification"("isRead");
CREATE INDEX IF NOT EXISTS "Notification_createdAt_idx" ON "Notification"("createdAt");
CREATE INDEX IF NOT EXISTS "Notification_type_idx" ON "Notification"("type");

-- ============================================
-- PushSubscription table
-- ============================================
CREATE TABLE IF NOT EXISTS "PushSubscription" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "userId" UUID NOT NULL,
  "endpoint" TEXT NOT NULL,
  "p256dh" TEXT NOT NULL,
  "auth" TEXT NOT NULL,
  "userAgent" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "PushSubscription_endpoint_key" UNIQUE ("endpoint"),
  CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") 
    REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "PushSubscription_userId_idx" ON "PushSubscription"("userId");
CREATE INDEX IF NOT EXISTS "PushSubscription_isActive_idx" ON "PushSubscription"("isActive");

-- ============================================
-- NotificationSettings table
-- ============================================
CREATE TABLE IF NOT EXISTS "NotificationSettings" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "userId" UUID NOT NULL,
  "enablePushNotifications" BOOLEAN NOT NULL DEFAULT true,
  "enableTaskNotifications" BOOLEAN NOT NULL DEFAULT true,
  "enableShiftNotifications" BOOLEAN NOT NULL DEFAULT true,
  "enableSwapNotifications" BOOLEAN NOT NULL DEFAULT true,
  "enableTimesheetNotifications" BOOLEAN NOT NULL DEFAULT true,
  "enableInAppNotifications" BOOLEAN NOT NULL DEFAULT true,
  "enableReminders" BOOLEAN NOT NULL DEFAULT true,
  "reminderHoursBefore" INTEGER NOT NULL DEFAULT 12,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "NotificationSettings_userId_key" UNIQUE ("userId"),
  CONSTRAINT "NotificationSettings_userId_fkey" FOREIGN KEY ("userId") 
    REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "NotificationSettings_userId_idx" ON "NotificationSettings"("userId");

-- ============================================
-- TelegramSession table
-- ============================================
CREATE TABLE IF NOT EXISTS "TelegramSession" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "telegram_user_id" VARCHAR(100) NOT NULL,
  "step" VARCHAR(50) NOT NULL DEFAULT 'idle',
  "invite_token" VARCHAR(255),
  "registration_data" JSONB,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "expires_at" TIMESTAMPTZ NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "TelegramSession_telegram_user_id_key" ON "TelegramSession"("telegram_user_id");
CREATE INDEX IF NOT EXISTS "TelegramSession_telegram_user_id_idx" ON "TelegramSession"("telegram_user_id");
CREATE INDEX IF NOT EXISTS "TelegramSession_expires_at_idx" ON "TelegramSession"("expires_at");

-- ============================================
-- SwapRequest table
-- ============================================
CREATE TABLE IF NOT EXISTS "SwapRequest" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "shiftId" UUID NOT NULL,
  "fromUserId" UUID NOT NULL,
  "toUserId" UUID NOT NULL,
  "status" VARCHAR(50) NOT NULL DEFAULT 'PENDING',
  "requestedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "respondedAt" TIMESTAMPTZ,
  "approvedAt" TIMESTAMPTZ,
  "approvedById" UUID,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "SwapRequest_shiftId_fkey" FOREIGN KEY ("shiftId") 
    REFERENCES "Shift" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SwapRequest_fromUserId_fkey" FOREIGN KEY ("fromUserId") 
    REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SwapRequest_toUserId_fkey" FOREIGN KEY ("toUserId") 
    REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SwapRequest_approvedById_fkey" FOREIGN KEY ("approvedById") 
    REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "SwapRequest_shiftId_idx" ON "SwapRequest"("shiftId");
CREATE INDEX IF NOT EXISTS "SwapRequest_fromUserId_idx" ON "SwapRequest"("fromUserId");
CREATE INDEX IF NOT EXISTS "SwapRequest_toUserId_idx" ON "SwapRequest"("toUserId");
CREATE INDEX IF NOT EXISTS "SwapRequest_status_idx" ON "SwapRequest"("status");
CREATE INDEX IF NOT EXISTS "SwapRequest_expiresAt_idx" ON "SwapRequest"("expiresAt");

-- ============================================
-- Trigger function for updating updatedAt
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updatedAt" = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updatedAt triggers to all tables with updatedAt column
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN 
    SELECT table_name 
    FROM information_schema.columns 
    WHERE column_name = 'updatedAt' 
    AND table_schema = 'public'
  LOOP
    EXECUTE format('
      DROP TRIGGER IF EXISTS update_%I_updated_at ON %I;
      CREATE TRIGGER update_%I_updated_at
        BEFORE UPDATE ON %I
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    ', t, t, t, t);
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Comments for documentation
-- ============================================
COMMENT ON TABLE "User" IS 'User accounts for the restaurant management system';
COMMENT ON TABLE "Restaurant" IS 'Restaurant entities managed by the system';
COMMENT ON TABLE "Department" IS 'Departments within restaurants';
COMMENT ON TABLE "Position" IS 'Job positions within restaurants';
COMMENT ON TABLE "Permission" IS 'System permissions that can be assigned to positions';
COMMENT ON TABLE "PositionPermission" IS 'Many-to-many relationship between positions and permissions';
COMMENT ON TABLE "RestaurantUser" IS 'Association between users and restaurants with their position';
COMMENT ON TABLE "ShiftTemplate" IS 'Templates for shift types (morning, evening, etc.)';
COMMENT ON TABLE "ScheduleTemplate" IS 'Saved schedule templates for quick scheduling';
COMMENT ON TABLE "Shift" IS 'Individual shift assignments for employees';
COMMENT ON TABLE "Task" IS 'Tasks assigned to employees';
COMMENT ON TABLE "TaskAttachment" IS 'File attachments for tasks';
COMMENT ON TABLE "Timesheet" IS 'Monthly timesheet records for employees';
COMMENT ON TABLE "Feedback" IS 'Employee feedback and suggestions';
COMMENT ON TABLE "FeedbackAttachment" IS 'File attachments for feedback';
COMMENT ON TABLE "ActionLog" IS 'Audit log of user actions';
COMMENT ON TABLE "InviteLink" IS 'Invitation links for new employee registration';
COMMENT ON TABLE "ShiftSwapHistory" IS 'History of shift swap requests and changes';
COMMENT ON TABLE "Holiday" IS 'Restaurant holidays and special dates';
COMMENT ON TABLE "Bonus" IS 'Employee bonuses';
COMMENT ON TABLE "Penalty" IS 'Employee penalties';
COMMENT ON TABLE "Notification" IS 'In-app notifications for users';
COMMENT ON TABLE "PushSubscription" IS 'Web push notification subscriptions';
COMMENT ON TABLE "NotificationSettings" IS 'User notification preferences';
COMMENT ON TABLE "TelegramSession" IS 'Telegram bot session state';
COMMENT ON TABLE "SwapRequest" IS 'Shift swap requests between employees';
