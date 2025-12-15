// Константы прав доступа
export const PERMISSIONS = {
  // Рестораны
  VIEW_RESTAURANTS: 'VIEW_RESTAURANTS',
  EDIT_RESTAURANTS: 'EDIT_RESTAURANTS',
  
  // График работы (всегда показывает график всех сотрудников ресторана)
  VIEW_SCHEDULE: 'VIEW_SCHEDULE',
  EDIT_SCHEDULE: 'EDIT_SCHEDULE',
  
  // Типы смен
  VIEW_SHIFT_TYPES: 'VIEW_SHIFT_TYPES',
  EDIT_SHIFT_TYPES: 'EDIT_SHIFT_TYPES',
  
  // Задачи (разделены на "только свои" и "все")
  VIEW_OWN_TASKS: 'VIEW_OWN_TASKS', // Только свои задачи
  VIEW_ALL_TASKS: 'VIEW_ALL_TASKS', // Все задачи ресторана
  EDIT_TASKS: 'EDIT_TASKS',
  
  // Табели (разделены на "только свои" и "все")
  VIEW_OWN_TIMESHEETS: 'VIEW_OWN_TIMESHEETS', // Только свои табели/зарплата
  VIEW_ALL_TIMESHEETS: 'VIEW_ALL_TIMESHEETS', // Все табели ресторана
  EDIT_TIMESHEETS: 'EDIT_TIMESHEETS',
  
  // Сотрудники
  VIEW_EMPLOYEES: 'VIEW_EMPLOYEES',
  EDIT_EMPLOYEES: 'EDIT_EMPLOYEES',
  
  // Должности
  VIEW_POSITIONS: 'VIEW_POSITIONS',
  EDIT_POSITIONS: 'EDIT_POSITIONS',
  
  // Отделы
  VIEW_DEPARTMENTS: 'VIEW_DEPARTMENTS',
  EDIT_DEPARTMENTS: 'EDIT_DEPARTMENTS',
} as const;

export type PermissionCode = typeof PERMISSIONS[keyof typeof PERMISSIONS];

// Права, которые менеджер ресторана имеет автоматически
export const MANAGER_AUTO_PERMISSIONS: PermissionCode[] = [
  PERMISSIONS.VIEW_SCHEDULE,
  PERMISSIONS.EDIT_SCHEDULE,
  PERMISSIONS.VIEW_SHIFT_TYPES,
  PERMISSIONS.EDIT_SHIFT_TYPES,
  PERMISSIONS.VIEW_ALL_TASKS,
  PERMISSIONS.EDIT_TASKS,
  PERMISSIONS.VIEW_ALL_TIMESHEETS,
  PERMISSIONS.EDIT_TIMESHEETS,
  PERMISSIONS.VIEW_EMPLOYEES,
  PERMISSIONS.EDIT_EMPLOYEES,
  PERMISSIONS.VIEW_POSITIONS,
  PERMISSIONS.EDIT_POSITIONS,
  PERMISSIONS.VIEW_DEPARTMENTS,
  PERMISSIONS.EDIT_DEPARTMENTS,
];

// Минимальные права для сотрудников без должности
export const DEFAULT_EMPLOYEE_PERMISSIONS: PermissionCode[] = [
  PERMISSIONS.VIEW_SCHEDULE, // Может видеть график всех сотрудников ресторана (чтобы знать кто на сменах)
  PERMISSIONS.VIEW_OWN_TASKS, // Может видеть только свои задачи
  PERMISSIONS.VIEW_OWN_TIMESHEETS, // Может видеть только свои табели и зарплату
];

