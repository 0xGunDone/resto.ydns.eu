import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useDashboardStore } from '../store/dashboardStore';
import api from '../utils/api';
import Navbar from '../components/Navbar';
import DashboardWidget from '../components/DashboardWidget';
import {
  Calendar,
  CheckSquare,
  FileText,
  Users,
  Clock,
  Building2,
  Bell,
  Copy,
  PlusCircle,
  ShieldCheck,
  FileDown,
} from 'lucide-react';

export default function DashboardPage() {
  const { user, logout } = useAuthStore();
  const {
    widgets,
    resetToDefault,
    setWidgetVisibility,
    setWidgetCollapsed,
    setWidgetOrder,
  } = useDashboardStore();
  const [stats, setStats] = useState({
    totalEmployees: 0,
    tasksInProgress: 0,
  });
  const [defaultRestaurantId, setDefaultRestaurantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showWidgetSettings, setShowWidgetSettings] = useState(false);

  // Инициализация виджетов при первой загрузке
  useEffect(() => {
    if (user && widgets.length === 0) {
      resetToDefault(user.role);
    }
  }, [user, widgets.length, resetToDefault]);

  const sortedWidgets = useMemo(
    () => [...widgets].sort((a, b) => a.order - b.order),
    [widgets]
  );

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        await api.get('/auth/me');
        loadStats();
        loadDefaultRestaurant();
      } catch (error: any) {
        if (error.response?.status === 401) {
          logout();
        }
      }
    };

    fetchUserData();
  }, [logout]);

  const loadStats = async () => {
    try {
      setLoading(true);
      const response = await api.get('/dashboard/stats');
      setStats(response.data);
    } catch (error: any) {
      console.error('Ошибка загрузки статистики:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadDefaultRestaurant = async () => {
    try {
      const res = await api.get('/restaurants');
      const list = res.data.restaurants || [];
      if (list.length > 0) {
        setDefaultRestaurantId(list[0].id);
      }
    } catch (e) {
      // noop
    }
  };

  const quickActions = useMemo(() => {
    const base = [
      {
        name: 'График работы',
        href: '/schedule',
        icon: Calendar,
        description: 'Таблица графика смен по сотрудникам',
        color: 'from-blue-500 to-blue-600',
      },
      {
        name: 'Задачи',
        href: '/tasks',
        icon: CheckSquare,
        description: 'Поставить и отследить задачи',
        color: 'from-green-500 to-green-600',
      },
      {
        name: 'Табели',
        href: '/timesheets',
        icon: FileText,
        description: 'Учет времени и зарплаты',
        color: 'from-yellow-500 to-yellow-600',
      },
      {
        name: 'Уведомления',
        href: '/notifications',
        icon: Bell,
        description: 'События и алерты',
        color: 'from-amber-500 to-amber-600',
      },
    ];

    const manager = [
      {
        name: 'Создать смену',
        href: '/schedule?view=table&action=new',
        icon: PlusCircle,
        description: 'Быстро добавить смену',
        color: 'from-indigo-500 to-indigo-600',
      },
      {
        name: 'Копировать график',
        href: '/schedule?view=table&action=copy',
        icon: Copy,
        description: 'Перенести смены на новый период',
        color: 'from-cyan-500 to-cyan-600',
      },
      {
        name: 'Шаблоны графика',
        href: '/schedule?view=table&action=templates',
        icon: Clock,
        description: 'Сохранить или применить шаблон',
        color: 'from-purple-500 to-purple-600',
      },
      {
        name: 'Экспорт табеля',
        href: '/timesheets?export=1',
        icon: FileDown,
        description: 'Экспорт в Excel/PDF',
        color: 'from-emerald-500 to-emerald-600',
      },
    ];

    const ownerAdmin = [
      {
        name: 'Рестораны',
        href: '/restaurants',
        icon: Building2,
        description: 'Управление ресторанами и доступами',
        color: 'from-orange-500 to-orange-600',
      },
      {
        name: 'Права и роли',
        href: defaultRestaurantId ? `/restaurants/${defaultRestaurantId}/manage?tab=permissions` : '/restaurants',
        icon: ShieldCheck,
        description: 'Настройка должностей и разрешений',
        color: 'from-slate-500 to-slate-600',
      },
    ];

    const employeeExtras = [
      {
        name: 'Мои смены сегодня',
        href: '/schedule?view=day&mine=1',
        icon: Users,
        description: 'Быстрый просмотр личных смен',
        color: 'from-teal-500 to-teal-600',
      },
    ];

    if (user?.role === 'OWNER' || user?.role === 'ADMIN') {
      return [...base, ...manager, ...ownerAdmin];
    }
    if (user?.role === 'MANAGER') {
      return [...base, ...manager];
    }
    return [...base, ...employeeExtras];
  }, [user, defaultRestaurantId]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 transition-colors">
      <Navbar />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* Приветствие */}
        <div className="mb-6 sm:mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            Добро пожаловать, {user?.firstName}! 👋
          </h1>
          <p className="text-gray-600 dark:text-gray-400">Управляйте рестораном эффективно</p>
        </div>

        {/* Панель настройки виджетов */}
        <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Персонализация дашборда</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">Выберите, какие виджеты показывать, порядок и сворачивание.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowWidgetSettings((prev) => !prev)}
              className="btn-secondary"
            >
              Настроить виджеты
            </button>
            <button
              onClick={() => user && resetToDefault(user.role)}
              className="btn-secondary"
            >
              Сбросить по умолчанию
            </button>
          </div>
        </div>

        {showWidgetSettings && (
          <div className="card p-4 mb-6">
            <div className="space-y-3">
              {sortedWidgets.map((widget, index) => (
                <div key={widget.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <div className="font-medium text-gray-900 dark:text-gray-100">{widget.title}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">{widget.type}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        if (index === 0) return;
                        const reordered = [...sortedWidgets];
                        [reordered[index - 1], reordered[index]] = [reordered[index], reordered[index - 1]];
                        setWidgetOrder(reordered.map((w) => w.id));
                      }}
                      disabled={index === 0}
                      className="px-3 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
                      title="Выше"
                    >
                      ↑
                    </button>
                    <button
                      onClick={() => {
                        if (index === sortedWidgets.length - 1) return;
                        const reordered = [...sortedWidgets];
                        [reordered[index], reordered[index + 1]] = [reordered[index + 1], reordered[index]];
                        setWidgetOrder(reordered.map((w) => w.id));
                      }}
                      disabled={index === sortedWidgets.length - 1}
                      className="px-3 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
                      title="Ниже"
                    >
                      ↓
                    </button>
                    <button
                      onClick={() => setWidgetCollapsed(widget.id, !widget.collapsed)}
                      className="px-3 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                      {widget.collapsed ? 'Развернуть' : 'Свернуть'}
                    </button>
                    <button
                      onClick={() => setWidgetVisibility(widget.id, !widget.visible)}
                      className={`px-3 py-1 text-sm rounded border ${
                        widget.visible
                          ? 'border-green-500 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/30'
                          : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                      }`}
                    >
                      {widget.visible ? 'Скрыть' : 'Показать'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Персонализированные виджеты */}
        <div className="space-y-6">
          {/* Виджет быстрых действий */}
          {widgets.find(w => w.id === 'quickActions' && w.visible) && (
            <DashboardWidget widgetId="quickActions" title="Быстрые действия">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                {quickActions.map((action) => {
                  const Icon = action.icon;
                  return (
                    <Link
                      key={action.name}
                      to={action.href}
                      className="card p-6 hover:scale-[1.02] transition-transform duration-200 group"
                    >
                      <div className={`inline-flex p-3 bg-gradient-to-r ${action.color} rounded-xl mb-4 group-hover:scale-110 transition-transform duration-200`}>
                        <Icon className="w-6 h-6 text-white" />
                      </div>
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">{action.name}</h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">{action.description}</p>
                    </Link>
                  );
                })}
              </div>
            </DashboardWidget>
          )}

          {/* Виджет статистики */}
          {widgets.find(w => w.id === 'stats' && w.visible) && (
            <DashboardWidget widgetId="stats" title="Статистика">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                <div className="card p-4 sm:p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Всего сотрудников</p>
                      <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                        {loading ? '...' : stats.totalEmployees}
                      </p>
                    </div>
                    <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                      <Users className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                    </div>
                  </div>
                </div>

                <div className="card p-4 sm:p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Задач в работе</p>
                      <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                        {loading ? '...' : stats.tasksInProgress}
                      </p>
                    </div>
                    <div className="p-3 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                      <CheckSquare className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                    </div>
                  </div>
                </div>
              </div>
            </DashboardWidget>
          )}

          {/* Виджет ближайших смен (плейсхолдер) */}
          {widgets.find(w => w.id === 'upcomingShifts' && w.visible) && (
            <DashboardWidget widgetId="upcomingShifts" title="Ближайшие смены">
              <div className="text-sm text-gray-600 dark:text-gray-400">
                Виджет ближайших смен скоро будет доступен.
              </div>
            </DashboardWidget>
          )}

          {/* Виджет последних задач (плейсхолдер) */}
          {widgets.find(w => w.id === 'recentTasks' && w.visible) && (
            <DashboardWidget widgetId="recentTasks" title="Последние задачи">
              <div className="text-sm text-gray-600 dark:text-gray-400">
                Виджет последних задач скоро будет доступен.
              </div>
            </DashboardWidget>
          )}
        </div>
      </main>
    </div>
  );
}
