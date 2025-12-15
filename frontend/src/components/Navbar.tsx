import { Link, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import toast from 'react-hot-toast';
import { Menu, X, Calendar, CheckSquare, FileText, BarChart3, LogOut, User, Building2, Bell, Copy, PlusCircle, ShieldCheck, FileDown, Users } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import { useGlobalPermissions } from '../hooks/usePermissions';
import NotificationCenter from './NotificationCenter';
import ThemeToggle from './ThemeToggle';
import CommandPalette, { CommandAction } from './CommandPalette';

interface MenuItem {
  name: string;
  href: string;
  icon: any;
  requiredPermissions?: string[];
  requireRole?: string[];
}

export default function Navbar() {
  const { user, logout } = useAuthStore();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const { hasAnyPermission, loading: permissionsLoading } = useGlobalPermissions();

  const handleLogout = () => {
    logout();
    toast.success('Выход выполнен');
    setMobileMenuOpen(false);
  };

  // Открытие палитры по Ctrl/Cmd+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      if ((isMac && e.metaKey && e.key.toLowerCase() === 'k') || (!isMac && e.ctrlKey && e.key.toLowerCase() === 'k')) {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Все возможные пункты меню с требуемыми правами
  const allNavigationItems: MenuItem[] = [
    { 
      name: 'Главная', 
      href: '/dashboard', 
      icon: BarChart3, 
      requiredPermissions: [] 
    },
    { 
      name: 'Рестораны', 
      href: '/restaurants', 
      icon: Building2, 
      requiredPermissions: ['VIEW_RESTAURANTS'],
      requireRole: ['OWNER', 'ADMIN']
    },
    { 
      name: 'График', 
      href: '/schedule', 
      icon: Calendar, 
      requiredPermissions: ['VIEW_SCHEDULE', 'EDIT_SCHEDULE'] 
    },
    { 
      name: 'Задачи', 
      href: '/tasks', 
      icon: CheckSquare, 
      requiredPermissions: ['VIEW_OWN_TASKS', 'VIEW_ALL_TASKS', 'EDIT_TASKS'] 
    },
    { 
      name: 'Табели', 
      href: '/timesheets', 
      icon: FileText, 
      requiredPermissions: ['VIEW_OWN_TIMESHEETS', 'VIEW_ALL_TIMESHEETS', 'EDIT_TIMESHEETS'] 
    },
  ];

  // Фильтруем пункты меню по правам доступа
  const navigation = allNavigationItems.filter((item) => {
    // Если требуется роль, проверяем её
    if (item.requireRole && user) {
      if (!item.requireRole.includes(user.role)) {
        return false;
      }
    }

    // Если нет требуемых прав, пункт доступен всем
    if (!item.requiredPermissions || item.requiredPermissions.length === 0) {
      return true;
    }

    // OWNER и ADMIN имеют все права автоматически
    if (user?.role === 'OWNER' || user?.role === 'ADMIN') {
      return true;
    }

    // Пока загружаются права, показываем только главную страницу
    if (permissionsLoading) {
      return item.href === '/dashboard';
    }

    // Проверяем наличие хотя бы одного из требуемых прав
    return hasAnyPermission(item.requiredPermissions);
  });

  const isActive = (path: string) => {
    return location.pathname === path;
  };

  const commandActions: CommandAction[] = useMemo(() => {
    const base: CommandAction[] = [
      { name: 'Главная', description: 'Дэшборд', href: '/dashboard', icon: BarChart3 },
      { name: 'График', description: 'Таблица смен и календарь', href: '/schedule', icon: Calendar },
      { name: 'Задачи', description: 'Задачи и канбан', href: '/tasks', icon: CheckSquare },
      { name: 'Табели', description: 'Учет рабочего времени', href: '/timesheets', icon: FileText },
      { name: 'Уведомления', description: 'Центр уведомлений', href: '/notifications', icon: Bell },
      { name: 'Профиль', description: 'Мои данные', href: '/profile', icon: User },
    ];

    const manager: CommandAction[] = [
      { name: 'Создать смену', description: 'Быстрое добавление смены', href: '/schedule?view=table&action=new', icon: PlusCircle },
      { name: 'Копировать график', description: 'Перенести смены на новый период', href: '/schedule?view=table&action=copy', icon: Copy },
      { name: 'Шаблоны графика', description: 'Сохранить / применить шаблон', href: '/schedule?view=table&action=templates', icon: Calendar },
      { name: 'Экспорт табеля', description: 'Excel / PDF', href: '/timesheets?export=1', icon: FileDown },
    ];

    const ownerAdmin: CommandAction[] = [
      { name: 'Рестораны', description: 'Управление ресторанами', href: '/restaurants', icon: Building2 },
      { name: 'Права и роли', description: 'Настройка должностей и разрешений', href: '/restaurants', icon: ShieldCheck },
    ];

    const employeeExtras: CommandAction[] = [
      { name: 'Мои смены сегодня', description: 'Быстрый просмотр личных смен', href: '/schedule?view=day&mine=1', icon: Users },
    ];

    if (user?.role === 'OWNER' || user?.role === 'ADMIN') {
      return [...base, ...manager, ...ownerAdmin];
    }
    if (user?.role === 'MANAGER') {
      return [...base, ...manager];
    }
    return [...base, ...employeeExtras];
  }, [user]);

  return (
    <nav className="bg-white dark:bg-gray-800 shadow-lg border-b border-gray-200 dark:border-gray-700 sticky top-0 z-50 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          {/* Логотип и десктоп навигация */}
          <div className="flex items-center">
            <Link to="/dashboard" className="flex items-center space-x-2">
              <div className="bg-gradient-to-r from-primary-600 to-primary-700 p-2 rounded-lg">
                <Calendar className="w-6 h-6 text-white" />
              </div>
              <span className="text-xl font-bold bg-gradient-to-r from-primary-600 to-primary-700 bg-clip-text text-transparent">
                Resto
              </span>
            </Link>
            
            {/* Десктоп навигация */}
            <div className="hidden md:flex md:ml-10 md:items-center md:space-x-1">
              {navigation.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.name}
                    to={item.href}
                    className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                      isActive(item.href)
                        ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-gray-100'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.name}</span>
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Правая часть: пользователь и меню */}
          <div className="flex items-center space-x-4">
            {/* Информация о пользователе (десктоп) */}
            <div className="hidden md:flex md:items-center md:space-x-3">
              <ThemeToggle />
              <NotificationCenter />
              <Link
                to="/profile"
                className="flex items-center space-x-2 px-3 py-2 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                <div className="w-8 h-8 bg-gradient-to-r from-primary-500 to-primary-600 rounded-full flex items-center justify-center">
                  <User className="w-4 h-4 text-white" />
                </div>
                <div className="text-sm">
                  <div className="font-medium text-gray-900 dark:text-gray-100">
                    {user?.firstName} {user?.lastName}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">{user?.role}</div>
                </div>
              </Link>
              <button
                onClick={handleLogout}
                className="p-2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                title="Выйти"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>

            {/* Мобильное меню кнопка */}
            <div className="md:hidden flex items-center space-x-2">
              <ThemeToggle />
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="p-2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              >
                {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Мобильное меню */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <div className="px-4 pt-2 pb-3 space-y-1">
            {navigation.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center space-x-3 px-4 py-3 rounded-lg text-base font-medium transition-all duration-200 ${
                    isActive(item.href)
                      ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </div>
          
          {/* Мобильная информация о пользователе */}
          <div className="px-4 py-4 border-t border-gray-200 dark:border-gray-700">
            <div className="mb-3">
              <NotificationCenter />
            </div>
            <Link
              to="/profile"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center space-x-3 mb-3 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              <div className="w-10 h-10 bg-gradient-to-r from-primary-500 to-primary-600 rounded-full flex items-center justify-center">
                <User className="w-5 h-5 text-white" />
              </div>
              <div>
                <div className="font-medium text-gray-900 dark:text-gray-100">
                  {user?.firstName} {user?.lastName}
                </div>
                <div className="text-sm text-gray-500 dark:text-gray-400">{user?.role}</div>
              </div>
            </Link>
            <button
              onClick={handleLogout}
              className="w-full flex items-center justify-center space-x-2 px-4 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-lg font-medium transition-colors"
            >
              <LogOut className="w-5 h-5" />
              <span>Выйти</span>
            </button>
          </div>
        </div>
      )}

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        actions={commandActions}
      />
    </nav>
  );
}
