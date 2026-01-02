/**
 * Test fixtures for common entities
 */

export const testUser = {
  id: 'user-test-001',
  email: 'test@example.com',
  password: 'hashedpassword123',
  firstName: 'Test',
  lastName: 'User',
  phone: '+1234567890',
  role: 'EMPLOYEE' as const,
  isActive: true,
  telegramId: null,
  twoFactorSecret: null,
  twoFactorEnabled: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

export const testOwner = {
  ...testUser,
  id: 'user-owner-001',
  email: 'owner@example.com',
  role: 'OWNER' as const,
};

export const testAdmin = {
  ...testUser,
  id: 'user-admin-001',
  email: 'admin@example.com',
  role: 'ADMIN' as const,
};

export const testManager = {
  ...testUser,
  id: 'user-manager-001',
  email: 'manager@example.com',
  role: 'MANAGER' as const,
};

export const testRestaurant = {
  id: 'restaurant-test-001',
  name: 'Test Restaurant',
  address: '123 Test Street',
  phone: '+1234567890',
  managerId: 'user-manager-001',
  isActive: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

export const testRestaurantUser = {
  id: 'ru-test-001',
  userId: 'user-test-001',
  restaurantId: 'restaurant-test-001',
  positionId: 'position-test-001',
  departmentId: null,
  hourlyRate: 15.0,
  hireDate: new Date().toISOString(),
  isActive: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

export const testPosition = {
  id: 'position-test-001',
  restaurantId: 'restaurant-test-001',
  name: 'Waiter',
  description: 'Serves customers',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

export const testTask = {
  id: 'task-test-001',
  restaurantId: 'restaurant-test-001',
  title: 'Test Task',
  description: 'A test task description',
  status: 'PENDING' as const,
  priority: 'MEDIUM' as const,
  category: 'General',
  assignedToId: 'user-test-001',
  createdById: 'user-manager-001',
  dueDate: null,
  completedAt: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};
