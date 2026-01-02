/**
 * Database Types Module
 * TypeScript interfaces for all database tables
 * Requirements: 2.1, 2.2
 */

// User roles
export type UserRole = 'OWNER' | 'ADMIN' | 'MANAGER' | 'EMPLOYEE';

// Task statuses and priorities
export type TaskStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

// Feedback types
export type FeedbackType = 'SUGGESTION' | 'COMPLAINT' | 'PRAISE' | 'OTHER';
export type FeedbackStatus = 'PENDING' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';

// Notification types
export type NotificationType = 'SHIFT_ASSIGNED' | 'SHIFT_CHANGED' | 'TASK_ASSIGNED' | 'TASK_UPDATED' | 'GENERAL';

// Swap request statuses
export type SwapRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

/**
 * User entity
 */
export interface User {
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
  createdAt: string;
  updatedAt: string;
}

/**
 * Restaurant entity
 */
export interface Restaurant {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  managerId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * RestaurantUser - links users to restaurants with positions
 */
export interface RestaurantUser {
  id: string;
  userId: string;
  restaurantId: string;
  positionId: string;
  departmentId: string | null;
  hourlyRate: number | null;
  hireDate: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}


/**
 * Department entity
 */
export interface Department {
  id: string;
  restaurantId: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Position entity - job positions with associated permissions
 */
export interface Position {
  id: string;
  restaurantId: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Permission entity
 */
export interface Permission {
  id: string;
  code: string;
  name: string;
  description: string | null;
}

/**
 * PositionPermission - links positions to permissions
 */
export interface PositionPermission {
  id: string;
  positionId: string;
  permissionId: string;
}

/**
 * ShiftTemplate entity
 */
export interface ShiftTemplate {
  id: string;
  restaurantId: string;
  name: string;
  startTime: string;
  endTime: string;
  color: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * ScheduleTemplate entity
 */
export interface ScheduleTemplate {
  id: string;
  restaurantId: string;
  name: string;
  description: string | null;
  templateData: string; // JSON string
  createdAt: string;
  updatedAt: string;
}

/**
 * Shift entity
 */
export interface Shift {
  id: string;
  restaurantId: string;
  userId: string;
  shiftTypeId: string | null;
  startTime: string;
  endTime: string;
  hours: number;
  isConfirmed: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Task entity
 */
export interface Task {
  id: string;
  restaurantId: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  category: string | null;
  assignedToId: string | null;
  createdById: string;
  dueDate: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * TaskAttachment entity
 */
export interface TaskAttachment {
  id: string;
  taskId: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  createdAt: string;
}

/**
 * Timesheet entity
 */
export interface Timesheet {
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
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Feedback entity
 */
export interface Feedback {
  id: string;
  restaurantId: string;
  userId: string;
  type: FeedbackType;
  title: string;
  description: string;
  status: FeedbackStatus;
  isAnonymous: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * FeedbackAttachment entity
 */
export interface FeedbackAttachment {
  id: string;
  feedbackId: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  createdAt: string;
}

/**
 * ActionLog entity - audit log for user actions
 */
export interface ActionLog {
  id: string;
  userId: string;
  restaurantId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  details: string | null; // JSON string
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

/**
 * InviteLink entity
 */
export interface InviteLink {
  id: string;
  restaurantId: string;
  token: string;
  positionId: string;
  departmentId: string | null;
  createdById: string;
  expiresAt: string;
  maxUses: number | null;
  usedCount: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * ShiftSwapHistory entity
 */
export interface ShiftSwapHistory {
  id: string;
  shiftId: string;
  requesterId: string;
  targetUserId: string;
  status: SwapRequestStatus;
  requestedAt: string;
  respondedAt: string | null;
  notes: string | null;
}

/**
 * Holiday entity
 */
export interface Holiday {
  id: string;
  restaurantId: string;
  userId: string;
  startDate: string;
  endDate: string;
  type: string;
  status: string;
  notes: string | null;
  approvedById: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Bonus entity
 */
export interface Bonus {
  id: string;
  restaurantId: string;
  userId: string;
  amount: number;
  reason: string;
  date: string;
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Penalty entity
 */
export interface Penalty {
  id: string;
  restaurantId: string;
  userId: string;
  amount: number;
  reason: string;
  date: string;
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Notification entity
 */
export interface Notification {
  id: string;
  userId: string;
  restaurantId: string | null;
  type: NotificationType;
  title: string;
  message: string;
  isRead: boolean;
  data: string | null; // JSON string
  createdAt: string;
}

/**
 * PushSubscription entity
 */
export interface PushSubscription {
  id: string;
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * NotificationSettings entity
 */
export interface NotificationSettings {
  id: string;
  userId: string;
  emailNotifications: boolean;
  pushNotifications: boolean;
  shiftReminders: boolean;
  taskNotifications: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * TelegramSession entity (for bot session persistence)
 */
export interface TelegramSession {
  id: string;
  telegramUserId: string;
  step: TelegramStep;
  inviteToken: string | null;
  registrationData: string | null; // JSON string
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
}

export type TelegramStep =
  | 'idle'
  | 'awaiting_first_name'
  | 'awaiting_last_name'
  | 'awaiting_phone'
  | 'confirming_registration';

// ============================================
// Extended types with relations (for includes)
// ============================================

export interface UserWithRelations extends User {
  restaurants?: RestaurantUserWithRelations[];
  managedRestaurants?: Restaurant[];
  actionLogs?: ActionLog[];
  pushSubscriptions?: PushSubscription[];
  NotificationSettings?: NotificationSettings;
}

export interface RestaurantWithRelations extends Restaurant {
  manager?: User;
  departments?: Department[];
  employees?: RestaurantUser[];
  positions?: Position[];
}

export interface RestaurantUserWithRelations extends RestaurantUser {
  user?: User;
  restaurant?: Restaurant;
  position?: PositionWithRelations;
  department?: Department;
}

export interface PositionWithRelations extends Position {
  permissions?: PositionPermissionWithRelations[];
}

export interface PositionPermissionWithRelations extends PositionPermission {
  permission?: Permission;
}

export interface ShiftWithRelations extends Shift {
  user?: User;
  restaurant?: Restaurant;
  shiftType?: ShiftTemplate;
}

export interface TaskWithRelations extends Task {
  user?: User;
  restaurant?: Restaurant;
  createdBy?: User;
  assignedTo?: User;
  attachments?: TaskAttachment[];
}

export interface TimesheetWithRelations extends Timesheet {
  user?: User;
  restaurant?: Restaurant;
  approvedBy?: User;
}

export interface FeedbackWithRelations extends Feedback {
  user?: User;
  restaurant?: Restaurant;
  attachments?: FeedbackAttachment[];
}

export interface InviteLinkWithRelations extends InviteLink {
  restaurant?: Restaurant;
  position?: Position;
  department?: Department;
  createdBy?: User;
}

// ============================================
// Database row types (raw from SQLite)
// ============================================

/**
 * Raw database row type - boolean fields are 0/1
 */
export interface RawDatabaseRow {
  [key: string]: unknown;
}

/**
 * Boolean field names that need conversion
 */
export const BOOLEAN_FIELD_PREFIXES = ['is', 'has'] as const;

// Note: isBooleanFieldName function is defined in typeConverters.ts to avoid duplication
