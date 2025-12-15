import {
  BarChart3,
  Calendar,
  CheckSquare,
  FileText,
  Building2,
  Settings,
  Users,
  Briefcase,
  FolderTree,
  Clock,
} from 'lucide-react';
import { MenuItem, MenuCategory } from '../types/navigation';

/**
 * Конфигурация навигации приложения
 * Учитывает роли, права доступа и контекст
 */

// Основные категории навигации
export const navigationCategories: MenuCategory[] = [
  {
    id: 'main',
    name: 'Основное',
    items: [
      {
        id: 'dashboard',
        name: 'Главная',
        href: '/dashboard',
        icon: BarChart3,
        requiredPermissions: [],
      },
      {
        id: 'restaurants',
        name: 'Рестораны',
        href: '/restaurants',
        icon: Building2,
        requiredPermissions: ['VIEW_RESTAURANTS'],
        requireRole: ['OWNER', 'ADMIN'],
      },
    ],
  },
  {
    id: 'work',
    name: 'Рабочие разделы',
    requireContext: 'restaurant',
    items: [
      {
        id: 'schedule',
        name: 'График',
        href: '/schedule',
        icon: Calendar,
        requiredPermissions: ['VIEW_SCHEDULE', 'EDIT_SCHEDULE'],
        requireContext: 'restaurant',
      },
      {
        id: 'tasks',
        name: 'Задачи',
        href: '/tasks',
        icon: CheckSquare,
        requiredPermissions: ['VIEW_OWN_TASKS', 'VIEW_ALL_TASKS', 'EDIT_TASKS'],
        requireContext: 'restaurant',
      },
      {
        id: 'timesheets',
        name: 'Табели',
        href: '/timesheets',
        icon: FileText,
        requiredPermissions: ['VIEW_OWN_TIMESHEETS', 'VIEW_ALL_TIMESHEETS', 'EDIT_TIMESHEETS'],
        requireContext: 'restaurant',
      },
    ],
  },
  {
    id: 'management',
    name: 'Управление',
    requireContext: 'restaurant',
    collapsible: true,
    items: [
      {
        id: 'shift-types',
        name: 'Типы смен',
        href: '/shift-types',
        icon: Clock,
        requiredPermissions: ['VIEW_SHIFT_TYPES', 'EDIT_SHIFT_TYPES'],
        requireContext: 'restaurant',
      },
      {
        id: 'restaurant-manage',
        name: 'Управление рестораном',
        href: '', // Динамический, зависит от выбранного ресторана
        icon: Settings,
        requiredPermissions: ['VIEW_EMPLOYEES', 'EDIT_EMPLOYEES'],
        requireContext: 'restaurant',
        children: [
          {
            id: 'employees',
            name: 'Сотрудники',
            href: '', // Динамический
            icon: Users,
            requiredPermissions: ['VIEW_EMPLOYEES', 'EDIT_EMPLOYEES'],
          },
          {
            id: 'positions',
            name: 'Должности',
            href: '', // Динамический
            icon: Briefcase,
            requiredPermissions: ['VIEW_POSITIONS', 'EDIT_POSITIONS'],
          },
          {
            id: 'departments',
            name: 'Отделы',
            href: '', // Динамический
            icon: FolderTree,
            requiredPermissions: ['VIEW_DEPARTMENTS', 'EDIT_DEPARTMENTS'],
          },
        ],
      },
    ],
  },
];

/**
 * Получить отфильтрованные категории меню для пользователя
 */
export function getFilteredNavigation(
  userRole: string | undefined,
  hasAnyPermission: (perms: string[]) => boolean,
  selectedRestaurantId: string | null = null,
  permissionsLoading: boolean = false
): MenuCategory[] {
  if (!userRole || permissionsLoading) {
    // Пока загружаются права, показываем только главную
    return [
      {
        id: 'main',
        name: 'Основное',
        items: [
          {
            id: 'dashboard',
            name: 'Главная',
            href: '/dashboard',
            icon: BarChart3,
            requiredPermissions: [],
          },
        ],
      },
    ];
  }

  const isOwnerOrAdmin = userRole === 'OWNER' || userRole === 'ADMIN';
  const hasRestaurantContext = selectedRestaurantId !== null;

  return navigationCategories
    .map((category) => {
      // Проверяем, требуется ли контекст ресторана
      if (category.requireContext === 'restaurant' && !hasRestaurantContext) {
        return null; // Пропускаем категорию без контекста
      }

      // Фильтруем элементы категории
      const filteredItems = category.items
        .map((item) => {
          // Проверяем роль, если требуется
          if (item.requireRole && !item.requireRole.includes(userRole)) {
            return null;
          }

          // Проверяем контекст ресторана
          if (item.requireContext === 'restaurant' && !hasRestaurantContext) {
            return null;
          }

          // OWNER и ADMIN имеют все права
          if (isOwnerOrAdmin) {
            return item;
          }

          // Проверяем права доступа
          if (item.requiredPermissions && item.requiredPermissions.length > 0) {
            if (!hasAnyPermission(item.requiredPermissions)) {
              return null;
            }
          }

          // Обрабатываем дочерние элементы
          if (item.children) {
            const filteredChildren = item.children
              .filter((child) => {
                if (child.requireRole && !child.requireRole.includes(userRole)) {
                  return false;
                }
                if (isOwnerOrAdmin) {
                  return true;
                }
                if (child.requiredPermissions && child.requiredPermissions.length > 0) {
                  return hasAnyPermission(child.requiredPermissions);
                }
                return true;
              })
              .map((child) => ({
                ...child,
                href: child.href || item.href, // Наследуем href от родителя
              }));

            if (filteredChildren.length === 0) {
              return null;
            }

            return {
              ...item,
              children: filteredChildren,
            };
          }

          // Обновляем href для динамических ссылок
          if (item.href === '' && selectedRestaurantId) {
            // Логика для динамических ссылок
            if (item.id === 'restaurant-manage') {
              return {
                ...item,
                href: `/restaurants/${selectedRestaurantId}/manage`,
              };
            }
            if (item.id === 'employees') {
              return {
                ...item,
                href: `/restaurants/${selectedRestaurantId}/manage?tab=employees`,
              };
            }
            if (item.id === 'positions') {
              return {
                ...item,
                href: `/restaurants/${selectedRestaurantId}/manage?tab=positions`,
              };
            }
            if (item.id === 'departments') {
              return {
                ...item,
                href: `/restaurants/${selectedRestaurantId}/manage?tab=departments`,
              };
            }
          }

          return item;
        })
        .filter((item): item is MenuItem => item !== null);

      // Если после фильтрации не осталось элементов, категория не показывается
      if (filteredItems.length === 0) {
        return null;
      }

      return {
        ...category,
        items: filteredItems,
      };
    })
    .filter((category): category is MenuCategory => category !== null);
}

/**
 * Получить упрощенный список навигации (для мобильной версии или простого меню)
 */
export function getSimpleNavigation(
  userRole: string | undefined,
  hasAnyPermission: (perms: string[]) => boolean,
  selectedRestaurantId: string | null = null
): MenuItem[] {
  const categories = getFilteredNavigation(userRole, hasAnyPermission, selectedRestaurantId);
  const items: MenuItem[] = [];

  categories.forEach((category) => {
    category.items.forEach((item) => {
      items.push(item);
      // Добавляем дочерние элементы в плоский список
      if (item.children) {
        items.push(...item.children);
      }
    });
  });

  return items;
}

