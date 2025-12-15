import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../utils/api';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/authStore';
import Navbar from '../components/Navbar';
import { Plus, Edit2, Users, Building2, Trash2 } from 'lucide-react';

interface Restaurant {
  id: string;
  name: string;
  address?: string;
  phone?: string;
  email?: string;
  isActive: boolean;
  manager?: {
    id: string;
    firstName: string;
    lastName: string;
  };
}

export default function RestaurantsPage() {
  const { user } = useAuthStore();
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingRestaurant, setEditingRestaurant] = useState<Restaurant | null>(null);
  const [deletingRestaurant, setDeletingRestaurant] = useState<Restaurant | null>(null);

  useEffect(() => {
    loadRestaurants();
  }, []);

  const loadRestaurants = async () => {
    try {
      setLoading(true);
      const response = await api.get('/restaurants');
      setRestaurants(response.data.restaurants || []);
    } catch (error: any) {
      toast.error('Ошибка загрузки ресторанов');
    } finally {
      setLoading(false);
    }
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

  const canManage = user?.role === 'OWNER' || user?.role === 'ADMIN';

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 transition-colors">
      <Navbar />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4 sm:mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Рестораны</h1>
          {canManage && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="btn-primary flex items-center gap-2 w-full sm:w-auto justify-center"
            >
              <Plus className="w-4 h-4" />
              Добавить ресторан
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {restaurants.map((restaurant) => (
            <div key={restaurant.id} className="card p-6 hover:scale-[1.02] transition-transform">
              <div className="flex items-start justify-between mb-4">
                <div className="p-3 bg-gradient-to-r from-primary-500 to-primary-600 rounded-lg">
                  <Building2 className="w-6 h-6 text-white" />
                </div>
                {canManage && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => setEditingRestaurant(restaurant)}
                      className="p-2 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setDeletingRestaurant(restaurant)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded transition-colors"
                      title="Удалить ресторан"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">{restaurant.name}</h3>
              {restaurant.address && (
                <p className="text-sm text-gray-600 mb-1">{restaurant.address}</p>
              )}
              {restaurant.phone && (
                <p className="text-sm text-gray-600 mb-1">{restaurant.phone}</p>
              )}
              {restaurant.manager && (
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
                    <Users className="w-4 h-4" />
                    <span>
                      {restaurant.manager.firstName} {restaurant.manager.lastName}
                    </span>
                  </div>
                </div>
              )}
              {/* Показываем кнопку "Управление" только если ресторан есть в списке (значит есть доступ) */}
              {/* Для OWNER/ADMIN - все рестораны доступны */}
              {/* Для MANAGER - только свои рестораны */}
              {/* Для EMPLOYEE - только рестораны где является сотрудником */}
              <div className="mt-4 pt-4 border-t border-gray-200">
                <Link
                  to={`/restaurants/${restaurant.id}/manage`}
                  className="block w-full text-center px-4 py-2 bg-primary-50 text-primary-700 rounded-lg hover:bg-primary-100 transition-colors text-sm font-medium"
                >
                  Управление
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>

      {showCreateModal && (
        <RestaurantModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            loadRestaurants();
            setShowCreateModal(false);
          }}
        />
      )}

      {editingRestaurant && (
        <RestaurantModal
          key={editingRestaurant.id}
          restaurant={editingRestaurant}
          onClose={() => setEditingRestaurant(null)}
          onSuccess={() => {
            loadRestaurants();
            setEditingRestaurant(null);
          }}
        />
      )}

      {deletingRestaurant && (
        <DeleteRestaurantModal
          restaurant={deletingRestaurant}
          onClose={() => setDeletingRestaurant(null)}
          onSuccess={() => {
            loadRestaurants();
            setDeletingRestaurant(null);
          }}
        />
      )}
    </div>
  );
}

function RestaurantModal({
  restaurant,
  onClose,
  onSuccess,
}: {
  restaurant?: Restaurant;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [formData, setFormData] = useState({
    name: restaurant?.name || '',
    address: restaurant?.address || '',
    phone: restaurant?.phone || '',
    email: restaurant?.email || '',
    managerId: restaurant?.manager?.id || '',
  });
  const [loading, setLoading] = useState(false);
  const [managers, setManagers] = useState<any[]>([]);

  useEffect(() => {
    if (restaurant?.id) {
      loadRestaurantUsers();
    } else {
      loadAllManagers();
    }
  }, [restaurant?.id]);

  const loadRestaurantUsers = async () => {
    try {
      // Если редактируем существующий ресторан, получаем сотрудников этого ресторана
      if (!restaurant?.id) return;
      const response = await api.get(`/restaurants/${restaurant.id}/users-for-manager`);
      setManagers(response.data.users || []);
    } catch (error) {
      console.error('Ошибка загрузки сотрудников ресторана:', error);
      loadAllManagers();
    }
  };

  const loadAllManagers = async () => {
    try {
      // Для нового ресторана получаем всех менеджеров и админов
      const response = await api.get('/employees/users', { params: { role: 'MANAGER' } });
      const managers = response.data.users || [];
      const adminResponse = await api.get('/employees/users', { params: { role: 'ADMIN' } });
      const admins = adminResponse.data.users || [];
      setManagers([...managers, ...admins]);
    } catch (error) {
      console.error('Ошибка загрузки управляющих:', error);
      setManagers([]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      if (restaurant) {
        await api.put(`/restaurants/${restaurant.id}`, formData);
        toast.success('Ресторан обновлен');
      } else {
        await api.post('/restaurants', formData);
        toast.success('Ресторан создан');
      }
      onSuccess();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Ошибка сохранения');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="card p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold mb-6">
          {restaurant ? 'Редактировать ресторан' : 'Добавить ресторан'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Название</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="input"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Адрес</label>
            <input
              type="text"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              className="input"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Телефон</label>
            <input
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              className="input"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="input"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Менеджер</label>
            <select
              value={formData.managerId}
              onChange={(e) => setFormData({ ...formData, managerId: e.target.value })}
              className="select"
            >
              <option value="">Не назначен</option>
              {managers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.firstName} {m.lastName} {m.role && `(${m.role === 'EMPLOYEE' ? 'Сотрудник' : m.role === 'MANAGER' ? 'Менеджер' : 'Админ'})`}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={onClose} className="btn-secondary">
              Отмена
            </button>
            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? 'Сохранение...' : 'Сохранить'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DeleteRestaurantModal({
  restaurant,
  onClose,
  onSuccess,
}: {
  restaurant: Restaurant;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [loading, setLoading] = useState(false);

  const handleDelete = async () => {
    if (!confirm(`Удалить ресторан "${restaurant.name}" и все связанные данные?`)) return;
    try {
      setLoading(true);
      await api.delete(`/restaurants/${restaurant.id}`);
      toast.success('Ресторан удален');
      onSuccess();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Ошибка удаления ресторана');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">
          Удалить ресторан?
        </h3>
        <p className="text-sm text-gray-700 dark:text-gray-300 mb-4">
          Действие необратимо: будут удалены все данные ресторана (смены, сотрудники связки, задачи, табели, праздники, истории обменов и т.д.).
        </p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="btn-secondary"
            disabled={loading}
          >
            Отмена
          </button>
          <button
            onClick={handleDelete}
            disabled={loading}
            className="btn-danger"
          >
            {loading ? 'Удаляю...' : 'Удалить'}
          </button>
        </div>
      </div>
    </div>
  );
}

