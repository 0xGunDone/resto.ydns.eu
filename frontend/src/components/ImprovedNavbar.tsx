import { Link, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import toast from 'react-hot-toast';
import { Menu, X, LogOut, User, ChevronDown, ChevronRight } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useGlobalPermissions } from '../hooks/usePermissions';
import NotificationCenter from './NotificationCenter';
import RestaurantSelector from './RestaurantSelector';
import { getFilteredNavigation } from '../config/navigation';

export default function ImprovedNavbar() {
  const { user, logout } = useAuthStore();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [selectedRestaurantId, setSelectedRestaurantId] = useState<string | null>(null);
  const { hasAnyPermission, loading: permissionsLoading } = useGlobalPermissions();

  useEffect(() => {
    // Загружаем выбранный ресторан из localStorage
    const savedRestaurantId = localStorage.getItem('selectedRestaurantId');
    if (savedRestaurantId) {
      setSelectedRestaurantId(savedRestaurantId);
    }
  }, []);

  // Получаем отфильтрованную навигацию
  const navigationCategories = getFilteredNavigation(
    user?.role,
    hasAnyPermission,
    selectedRestaurantId,
    permissionsLoading
  );

  const handleLogout = () => {
    logout();
    toast.success('Выход выполнен');
    setMobileMenuOpen(false);
  };

  const toggleCategory = (categoryId: string) => {
    setExpandedCategories((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(categoryId)) {
        newSet.delete(categoryId);
      } else {
        newSet.add(categoryId);
      }
      return newSet;
    });
  };

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
                <User className="w-6 h-6 text-white" />
              </div>
              <span className="text-xl font-bold bg-gradient-to-r from-primary-600 to-primary-700 bg-clip-text text-transparent">
                Resto
              </span>
            </Link>

            {/* Десктоп навигация с группировкой */}
            <div className="hidden lg:flex lg:ml-6 lg:items-center lg:space-x-1 flex-1">
              {navigationCategories.map((category) => (
                <div key={category.id} className="relative group">
                  {/* Основные пункты меню */}
                  {category.items.map((item) => {
                    // Для элементов с дочерними элементами - выпадающее меню
                    if (item.children && item.children.length > 0) {
                      return (
                        <div key={item.id} className="relative group/item">
                          <button
                            className={`flex items-center space-x-1 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                              isActive(item.href)
                                ? 'bg-primary-50 text-primary-700'
                                : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                            }`}
                          >
                            <item.icon className="w-4 h-4" />
                            <span>{item.name}</span>
                            <ChevronDown className="w-3 h-3" />
                          </button>
                          <div className="absolute left-0 top-full mt-1 w-56 bg-white border border-gray-200 rounded-lg shadow-lg opacity-0 invisible group-hover/item:opacity-100 group-hover/item:visible transition-all duration-200 z-50">
                            {item.children.map((child) => (
                              <Link
                                key={child.id}
                                to={child.href}
                                className={`block px-4 py-2 text-sm hover:bg-gray-50 transition-colors ${
                                  isActive(child.href)
                                    ? 'bg-blue-50 text-blue-700 font-medium'
                                    : 'text-gray-700'
                                }`}
                              >
                                <div className="flex items-center space-x-2">
                                  <child.icon className="w-4 h-4" />
                                  <span>{child.name}</span>
                                </div>
                              </Link>
                            ))}
                          </div>
                        </div>
                      );
                    }

                    // Обычные пункты меню
                    return (
                      <Link
                        key={item.id}
                        to={item.href}
                        className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                          isActive(item.href)
                            ? 'bg-primary-50 text-primary-700'
                            : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                        }`}
                      >
                        <item.icon className="w-4 h-4" />
                        <span>{item.name}</span>
                      </Link>
                    );
                  })}
                </div>
              ))}

              {/* Селектор ресторана (если нужно) */}
              {selectedRestaurantId && (
                <div className="ml-4">
                  <RestaurantSelector />
                </div>
              )}
            </div>
          </div>

          {/* Правая часть: пользователь и меню */}
          <div className="flex items-center space-x-4">
            {/* Информация о пользователе (десктоп) */}
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

            {/* Мобильное меню кнопка */}
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
            {navigationCategories.map((category) => (
              <div key={category.id} className="space-y-1">
                {category.name && (
                  <div className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    {category.name}
                  </div>
                )}
                {category.items.map((item) => {
                  if (item.children && item.children.length > 0) {
                    const isExpanded = expandedCategories.has(item.id);
                    return (
                      <div key={item.id}>
                        <button
                          onClick={() => toggleCategory(item.id)}
                          className={`w-full flex items-center justify-between px-4 py-3 rounded-lg text-base font-medium transition-all duration-200 ${
                            isActive(item.href)
                              ? 'bg-primary-50 text-primary-700'
                              : 'text-gray-700 hover:bg-gray-50'
                          }`}
                        >
                          <div className="flex items-center space-x-3">
                            <item.icon className="w-5 h-5" />
                            <span>{item.name}</span>
                          </div>
                          {isExpanded ? (
                            <ChevronDown className="w-5 h-5" />
                          ) : (
                            <ChevronRight className="w-5 h-5" />
                          )}
                        </button>
                        {isExpanded && (
                          <div className="ml-4 mt-1 space-y-1">
                            {item.children.map((child) => (
                              <Link
                                key={child.id}
                                to={child.href}
                                onClick={() => setMobileMenuOpen(false)}
                                className={`flex items-center space-x-3 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                                  isActive(child.href)
                                    ? 'bg-blue-50 text-blue-700'
                                    : 'text-gray-700 hover:bg-gray-50'
                                }`}
                              >
                                <child.icon className="w-4 h-4" />
                                <span>{child.name}</span>
                              </Link>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  }

                  return (
                    <Link
                      key={item.id}
                      to={item.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center space-x-3 px-4 py-3 rounded-lg text-base font-medium transition-all duration-200 ${
                        isActive(item.href)
                          ? 'bg-primary-50 text-primary-700'
                          : 'text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <item.icon className="w-5 h-5" />
                      <span>{item.name}</span>
                    </Link>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Мобильная информация о пользователе */}
          <div className="px-4 py-4 border-t border-gray-200">
            <div className="mb-3">
              <NotificationCenter />
            </div>
            {selectedRestaurantId && (
              <div className="mb-3">
                <RestaurantSelector />
              </div>
            )}
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

