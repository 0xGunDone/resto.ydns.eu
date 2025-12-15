import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type WidgetType = 'stats' | 'quickActions' | 'recentTasks' | 'upcomingShifts';

export interface DashboardWidget {
  id: string;
  type: WidgetType;
  title: string;
  visible: boolean;
  collapsed: boolean;
  order: number;
}

interface DashboardState {
  widgets: DashboardWidget[];
  setWidgetVisibility: (widgetId: string, visible: boolean) => void;
  setWidgetCollapsed: (widgetId: string, collapsed: boolean) => void;
  setWidgetOrder: (widgetIds: string[]) => void;
  resetToDefault: (role: string) => void;
}

export const defaultWidgets = (role: string): DashboardWidget[] => {
  const base: DashboardWidget[] = [
    {
      id: 'quickActions',
      type: 'quickActions',
      title: 'Быстрые действия',
      visible: true,
      collapsed: false,
      order: 0,
    },
    {
      id: 'stats',
      type: 'stats',
      title: 'Статистика',
      visible: true,
      collapsed: false,
      order: 1,
    },
  ];

  // Добавляем дополнительные виджеты для разных ролей
  if (role === 'OWNER' || role === 'ADMIN' || role === 'MANAGER') {
    base.push(
      {
        id: 'recentTasks',
        type: 'recentTasks',
        title: 'Последние задачи',
        visible: false,
        collapsed: false,
        order: 2,
      },
      {
        id: 'upcomingShifts',
        type: 'upcomingShifts',
        title: 'Ближайшие смены',
        visible: false,
        collapsed: false,
        order: 3,
      }
    );
  }

  return base;
};

export const useDashboardStore = create<DashboardState>()(
  persist(
    (set) => ({
      widgets: [],
      setWidgetVisibility: (widgetId, visible) =>
        set((state) => ({
          widgets: state.widgets.map((w) =>
            w.id === widgetId ? { ...w, visible } : w
          ),
        })),
      setWidgetCollapsed: (widgetId, collapsed) =>
        set((state) => ({
          widgets: state.widgets.map((w) =>
            w.id === widgetId ? { ...w, collapsed } : w
          ),
        })),
      setWidgetOrder: (widgetIds) =>
        set((state) => {
          const widgetMap = new Map(state.widgets.map((w) => [w.id, w]));
          const reordered = widgetIds.map((id, index) => {
            const widget = widgetMap.get(id);
            return widget ? { ...widget, order: index } : null;
          }).filter(Boolean) as DashboardWidget[];
          
          // Добавляем виджеты, которых нет в списке
          const existingIds = new Set(widgetIds);
          const remaining = state.widgets
            .filter((w) => !existingIds.has(w.id))
            .map((w, index) => ({ ...w, order: widgetIds.length + index }));
          
          return { widgets: [...reordered, ...remaining].sort((a, b) => a.order - b.order) };
        }),
      resetToDefault: (role) =>
        set({ widgets: defaultWidgets(role) }),
    }),
    {
      name: 'dashboard-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ widgets: state.widgets }),
    }
  )
);

