import { Link, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import toast from 'react-hot-toast';
import {
  Menu,
  X,
  Calendar,
  Settings,
  CheckSquare,
  FileText,
  BarChart3,
  LogOut,
  User,
  Building2,
  Clock,
  ChevronDown,
} from 'lucide-react';
import { useState } from 'react';
import { useGlobalPermissions } from '../hooks/usePermissions';
import NotificationCenter from './NotificationCenter';

interface MenuGroup {
  name?: string;
  items: MenuItem[];
}

interface MenuItem {
  name: string;
  href: string;
  icon: any;
  requiredPermissions?: string[];
  requireRole?: string[];
  children?: MenuItem[];
}

export default function GroupedNavbar() {
  const { user, logout } = useAuthStore();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [expandedDropdown, setExpandedDropdown] = useState<string | null>(null);
  const { hasAnyPermission, loading: permissionsLoading } = useGlobalPermissions();

  const handleLogout = () => {
    logout();
    toast.success('Выход выполнен');
    setMobileMenuOpen(false);
  };

  // Определяем группы меню
  const menuGroups: MenuGroup[] = [
    {
      name: undefined, // Основное - без названия группы
      items: [
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
      ],
    },
    {
      name: undefined, // Рабочие разделы
      items: [
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
      ],
    },
    {
      name: 'Управление',
      items: [
        {
          name: 'Управление',
          href: '', // Динамический, будет формироваться на основе restaurantId
          icon: Settings,
          requiredPermissions: ['VIEW_EMPLOYEES', 'EDIT_EMPLOYEES'],
          children: [
            {
              name: 'Типы смен',
              href: '/shift-types',
              icon: Clock,
              requiredPermissions: ['VIEW_SHIFT_TYPES', 'EDIT_SHIFT_TYPES']
            },
          ],
        },
      ],
    },
  ];

  // Фильтруем меню по правам
  const filteredGroups = menuGroups.map((group) => ({
    ...group,
    items: group.items
      .map((item) => {
        // Проверка роли
        if (item.requireRole && user && !item.requireRole.includes(user.role)) {
          return null;
        }

        // OWNER и ADMIN имеют все права
        if (user?.role === 'OWNER' || user?.role === 'ADMIN') {
          // Фильтруем дочерние элементы
          if (item.children) {
            return {
              ...item,
              children: item.children.filter((child) => {
                if (child.requireRole && user && !child.requireRole.includes(user.role)) {
                  return false;
                }
                return true;
              }),
            };
          }
          return item;
        }

        // Проверка прав
        if (item.requiredPermissions && item.requiredPermissions.length > 0) {
          if (permissionsLoading) {
            return null;
          }
          if (!hasAnyPermission(item.requiredPermissions)) {
            return null;
          }
        }

        // Фильтруем дочерние элементы
        if (item.children) {
          const filteredChildren = item.children.filter((child) => {
            if (child.requireRole && user && !child.requireRole.includes(user.role)) {
              return false;
            }
            if (child.requiredPermissions && child.requiredPermissions.length > 0) {
              if (!hasAnyPermission(child.requiredPermissions)) {
                return false;
              }
            }
            return true;
          });
          
          if (filteredChildren.length === 0) {
            return null;
          }
          
          return {
            ...item,
            children: filteredChildren,
          };
        }

        return item;
      })
      .filter((item): item is MenuItem => item !== null),
  })).filter((group) => group.items.length > 0);

  // Плоский список для простой навигации (десктоп)
  const flatMenuItems = filteredGroups.flatMap((group) => group.items);

  const isActive = (path: string) => {
    if (path.includes('?')) {
      const [basePath] = path.split('?');
      return location.pathname === basePath;
    }
    return location.pathname === path;
  };

  return (
    <nav className="bg-white shadow-lg border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          {/* Логотип и десктоп навигация */}
          <div className="flex items-center flex-1">
            <Link to="/dashboard" className="flex items-center space-x-2 flex-shrink-0">
              <div className="bg-gradient-to-r from-primary-600 to-primary-700 p-2 rounded-lg">
                <Calendar className="w-6 h-6 text-white" />
              </div>
              <span className="text-xl font-bold bg-gradient-to-r from-primary-600 to-primary-700 bg-clip-text text-transparent">
                Resto
              </span>
            </Link>
            
            {/* Десктоп навигация */}
            <div className="hidden md:flex md:ml-6 md:items-center md:space-x-1 flex-1">
              {flatMenuItems.map((item) => {
                const Icon = item.icon;
                
                // Элемент с дочерними элементами - выпадающее меню
                if (item.children && item.children.length > 0) {
                  return (
                    <div 
                      key={item.name}
                      className="relative group"
                      onMouseEnter={() => setExpandedDropdown(item.name)}
                      onMouseLeave={() => setExpandedDropdown(null)}
                    >
                      <button
                        className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                          isActive(item.href) || expandedDropdown === item.name
                            ? 'bg-primary-50 text-primary-700'
                            : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        <span>{item.name}</span>
                        <ChevronDown className="w-3 h-3" />
                      </button>
                      
                      {expandedDropdown === item.name && (
                        <div className="absolute left-0 top-full mt-1 w-56 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
                          {item.children.map((child) => {
                            const ChildIcon = child.icon;
                            return (
                              <Link
                                key={child.name}
                                to={child.href}
                                className={`flex items-center space-x-2 px-4 py-2 text-sm hover:bg-gray-50 transition-colors ${
                                  isActive(child.href)
                                    ? 'bg-blue-50 text-blue-700 font-medium'
                                    : 'text-gray-700'
                                }`}
                                onClick={() => setExpandedDropdown(null)}
                              >
                                <ChildIcon className="w-4 h-4" />
                                <span>{child.name}</span>
                              </Link>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                }

                // Обычный пункт меню
                return (
                  <Link
                    key={item.name}
                    to={item.href}
                    className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                      isActive(item.href)
                        ? 'bg-primary-50 text-primary-700'
                        : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.name}</span>
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Правая часть */}
          <div className="flex items-center space-x-4">
            <div className="hidden md:flex md:items-center md:space-x-3">
              <NotificationCenter />
              <Link
                to="/profile"
                className="flex items-center space-x-2 px-3 py-2 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <div className="w-8 h-8 bg-gradient-to-r from-primary-500 to-primary-600 rounded-full flex items-center justify-center">
                  <User className="w-4 h-4 text-white" />
                </div>
                <div className="text-sm">
                  <div className="font-medium text-gray-900">
                    {user?.firstName} {user?.lastName}
                  </div>
                  <div className="text-xs text-gray-500">{user?.role}</div>
                </div>
              </Link>
              <button
                onClick={handleLogout}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                title="Выйти"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>

            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Мобильное меню */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-gray-200 bg-white">
          <div className="px-4 pt-2 pb-3 space-y-1">
            {filteredGroups.map((group, groupIdx) => (
              <div key={groupIdx}>
                {group.name && (
                  <div className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    {group.name}
                  </div>
                )}
                {group.items.map((item) => {
                  const Icon = item.icon;
                  
                  if (item.children && item.children.length > 0) {
                    const isExpanded = expandedDropdown === item.name;
                    return (
                      <div key={item.name}>
                        <button
                          onClick={() => setExpandedDropdown(isExpanded ? null : item.name)}
                          className={`w-full flex items-center justify-between px-4 py-3 rounded-lg text-base font-medium transition-all duration-200 ${
                            isActive(item.href)
                              ? 'bg-primary-50 text-primary-700'
                              : 'text-gray-700 hover:bg-gray-50'
                          }`}
                        >
                          <div className="flex items-center space-x-3">
                            <Icon className="w-5 h-5" />
                            <span>{item.name}</span>
                          </div>
                          <ChevronDown className={`w-5 h-5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                        </button>
                        {isExpanded && (
                          <div className="ml-4 mt-1 space-y-1">
                            {item.children.map((child) => {
                              const ChildIcon = child.icon;
                              return (
                                <Link
                                  key={child.name}
                                  to={child.href}
                                  onClick={() => {
                                    setMobileMenuOpen(false);
                                    setExpandedDropdown(null);
                                  }}
                                  className={`flex items-center space-x-3 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                                    isActive(child.href)
                                      ? 'bg-blue-50 text-blue-700'
                                      : 'text-gray-700 hover:bg-gray-50'
                                  }`}
                                >
                                  <ChildIcon className="w-4 h-4" />
                                  <span>{child.name}</span>
                                </Link>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  }

                  return (
                    <Link
                      key={item.name}
                      to={item.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center space-x-3 px-4 py-3 rounded-lg text-base font-medium transition-all duration-200 ${
                        isActive(item.href)
                          ? 'bg-primary-50 text-primary-700'
                          : 'text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                      <span>{item.name}</span>
                    </Link>
                  );
                })}
              </div>
            ))}
          </div>
          
          <div className="px-4 py-4 border-t border-gray-200">
            <div className="mb-3">
              <NotificationCenter />
            </div>
            <Link
              to="/profile"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center space-x-3 mb-3 p-2 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <div className="w-10 h-10 bg-gradient-to-r from-primary-500 to-primary-600 rounded-full flex items-center justify-center">
                <User className="w-5 h-5 text-white" />
              </div>
              <div>
                <div className="font-medium text-gray-900">
                  {user?.firstName} {user?.lastName}
                </div>
                <div className="text-sm text-gray-500">{user?.role}</div>
              </div>
            </Link>
            <button
              onClick={handleLogout}
              className="w-full flex items-center justify-center space-x-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium transition-colors"
            >
              <LogOut className="w-5 h-5" />
              <span>Выйти</span>
            </button>
          </div>
        </div>
      )}
    </nav>
  );
}

