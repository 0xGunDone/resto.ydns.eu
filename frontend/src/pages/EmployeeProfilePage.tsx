import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../utils/api';
import toast from 'react-hot-toast';
import Navbar from '../components/Navbar';
import { ArrowLeft, Calendar, Clock, Building2, Briefcase, TrendingUp, BarChart3 } from 'lucide-react';

interface WorkHistoryItem {
  id: string;
  restaurant: {
    id: string;
    name: string;
    address?: string;
  };
  position: {
    id: string;
    name: string;
  };
  department: {
    id: string;
    name: string;
  } | null;
  isActive: boolean;
  startDate: string;
  endDate: string | null;
}

interface MonthlyStat {
  month: number;
  year: number;
  shifts: number;
  hours: number;
}

interface EmployeeProfileData {
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    phone?: string;
    role: string;
    createdAt: string;
  };
  workHistory: WorkHistoryItem[];
  shiftStats: {
    totalShifts: number;
    totalHours: number;
    averageHoursPerShift: number;
    monthlyStats: MonthlyStat[];
  };
}

export default function EmployeeProfilePage() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [profileData, setProfileData] = useState<EmployeeProfileData | null>(null);
  const [selectedRestaurantId, setSelectedRestaurantId] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const restaurantId = params.get('restaurantId');
    if (restaurantId) {
      setSelectedRestaurantId(restaurantId);
    }
  }, []);

  useEffect(() => {
    if (userId) {
      loadProfile();
    }
  }, [userId, selectedRestaurantId]);

  const loadProfile = async () => {
    if (!userId) return;

    try {
      setLoading(true);
      const params: any = {};
      if (selectedRestaurantId) {
        params.restaurantId = selectedRestaurantId;
      }
      const response = await api.get(`/employees/profile/${userId}`, { params });
      setProfileData(response.data);
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Ошибка загрузки профиля сотрудника');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('ru-RU', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const getMonthName = (month: number) => {
    const months = [
      'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
      'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
    ];
    return months[month - 1];
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 transition-colors">
        <Navbar />
        <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
          <div className="text-gray-500">Загрузка...</div>
        </div>
      </div>
    );
  }

  if (!profileData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 transition-colors">
        <Navbar />
        <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
          <div className="text-gray-500">Профиль не найден</div>
        </div>
      </div>
    );
  }

  const { user, workHistory, shiftStats } = profileData;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 transition-colors">
      <Navbar />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="mb-6">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeft className="w-5 h-5" />
            Назад
          </button>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">
            Профиль сотрудника
          </h1>
          <p className="text-gray-600">
            {user.firstName} {user.lastName}
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Основная информация */}
          <div className="lg:col-span-1">
            <div className="card p-6">
              <h2 className="text-xl font-semibold mb-4">Основная информация</h2>
              <div className="space-y-4">
                <div>
                  <div className="text-sm text-gray-500">Имя</div>
                  <div className="font-medium">{user.firstName} {user.lastName}</div>
                </div>
                {user.phone && (
                  <div>
                    <div className="text-sm text-gray-500">Телефон</div>
                    <div className="font-medium">{user.phone}</div>
                  </div>
                )}
                <div>
                  <div className="text-sm text-gray-500">Роль</div>
                  <div className="font-medium">
                    {user.role === 'EMPLOYEE' ? 'Сотрудник' :
                     user.role === 'MANAGER' ? 'Менеджер' :
                     user.role === 'ADMIN' ? 'Администратор' :
                     user.role === 'OWNER' ? 'Владелец' : user.role}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-500">Дата регистрации</div>
                  <div className="font-medium">{formatDate(user.createdAt)}</div>
                </div>
              </div>
            </div>
          </div>

          {/* История работы и статистика */}
          <div className="lg:col-span-2 space-y-6">
            {/* История работы */}
            <div className="card p-6">
              <div className="flex items-center gap-2 mb-4">
                <Building2 className="w-5 h-5 text-blue-600" />
                <h2 className="text-xl font-semibold">История работы</h2>
              </div>
              {workHistory.length === 0 ? (
                <div className="text-gray-500 text-center py-8">
                  Нет истории работы
                </div>
              ) : (
                <div className="space-y-4">
                  {workHistory.map((item) => (
                    <div
                      key={item.id}
                      className="border rounded-lg p-4 hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <div className="font-semibold text-lg">{item.restaurant.name}</div>
                          {item.restaurant.address && (
                            <div className="text-sm text-gray-500">{item.restaurant.address}</div>
                          )}
                        </div>
                        <span
                          className={`px-3 py-1 rounded-full text-sm font-medium ${
                            item.isActive
                              ? 'bg-green-100 text-green-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {item.isActive ? 'Активен' : 'Неактивен'}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-4 mt-3">
                        <div>
                          <div className="text-sm text-gray-500">Должность</div>
                          <div className="font-medium">{item.position.name}</div>
                        </div>
                        {item.department && (
                          <div>
                            <div className="text-sm text-gray-500">Отдел</div>
                            <div className="font-medium">{item.department.name}</div>
                          </div>
                        )}
                      </div>
                      <div className="flex gap-4 mt-3 text-sm text-gray-600">
                        <div className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          <span>Начало: {formatDate(item.startDate)}</span>
                        </div>
                        {item.endDate && (
                          <div className="flex items-center gap-1">
                            <Calendar className="w-4 h-4" />
                            <span>Окончание: {formatDate(item.endDate)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Статистика по сменам */}
            <div className="card p-6">
              <div className="flex items-center gap-2 mb-4">
                <BarChart3 className="w-5 h-5 text-green-600" />
                <h2 className="text-xl font-semibold">Статистика по сменам</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                <div className="bg-blue-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="w-5 h-5 text-blue-600" />
                    <div className="text-sm text-gray-600">Всего смен</div>
                  </div>
                  <div className="text-2xl font-bold text-blue-600">{shiftStats.totalShifts}</div>
                </div>
                <div className="bg-green-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="w-5 h-5 text-green-600" />
                    <div className="text-sm text-gray-600">Всего часов</div>
                  </div>
                  <div className="text-2xl font-bold text-green-600">{shiftStats.totalHours.toFixed(1)}</div>
                </div>
                <div className="bg-purple-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Briefcase className="w-5 h-5 text-purple-600" />
                    <div className="text-sm text-gray-600">Средняя нагрузка</div>
                  </div>
                  <div className="text-2xl font-bold text-purple-600">
                    {shiftStats.averageHoursPerShift.toFixed(1)} ч/смена
                  </div>
                </div>
              </div>

              {/* Статистика по месяцам */}
              {shiftStats.monthlyStats.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold mb-4">Статистика по месяцам</h3>
                  <div className="space-y-2">
                    {shiftStats.monthlyStats.map((stat, index) => (
                      <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div className="font-medium">
                          {getMonthName(stat.month)} {stat.year}
                        </div>
                        <div className="flex gap-4 text-sm">
                          <span className="text-gray-600">
                            {stat.shifts} смен
                          </span>
                          <span className="text-gray-800 font-medium">
                            {stat.hours.toFixed(1)} часов
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

