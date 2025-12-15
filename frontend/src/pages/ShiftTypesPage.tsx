import { useState, useEffect } from 'react';
import api from '../utils/api';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/authStore';
import Navbar from '../components/Navbar';
import { Plus, Edit2, Trash2, Save, X } from 'lucide-react';

interface ShiftTemplate {
  id: string;
  restaurantId?: string;
  name: string;
  startHour: number;
  endHour: number;
  color?: string;
  rate?: number;
  isActive: boolean;
}

export default function ShiftTypesPage() {
  const { user } = useAuthStore();
  const [templates, setTemplates] = useState<ShiftTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [restaurants, setRestaurants] = useState<any[]>([]);
  const [selectedRestaurant, setSelectedRestaurant] = useState<string>('');

  useEffect(() => {
    loadRestaurants();
    loadTemplates();
  }, [selectedRestaurant]);

  const loadRestaurants = async () => {
    try {
      const response = await api.get('/restaurants');
      setRestaurants(response.data.restaurants || []);
      if (response.data.restaurants?.length > 0 && !selectedRestaurant) {
        setSelectedRestaurant(response.data.restaurants[0].id);
      }
    } catch (error) {
      console.error('Ошибка загрузки ресторанов:', error);
    }
  };

  const loadTemplates = async () => {
    try {
      setLoading(true);
      const params: any = {};
      if (selectedRestaurant) {
        params.restaurantId = selectedRestaurant;
      }
      const response = await api.get('/shift-templates', { params });
      setTemplates(response.data.templates || []);
    } catch (error: any) {
      toast.error('Ошибка загрузки типов смен');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Удалить этот тип смены?')) {
      return;
    }

    try {
      await api.delete(`/shift-templates/${id}`);
      toast.success('Тип смены удален');
      loadTemplates();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Ошибка удаления');
    }
  };

  const canEdit = user?.role === 'MANAGER' || user?.role === 'OWNER' || user?.role === 'ADMIN';

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

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 transition-colors">
      <Navbar />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4 sm:mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Типы смен</h1>
          {canEdit && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="btn-primary flex items-center gap-2 w-full sm:w-auto justify-center"
            >
              <Plus className="w-4 h-4" />
              Добавить тип смены
            </button>
          )}
        </div>

        {/* Фильтр ресторана */}
        {restaurants.length > 0 && (
          <div className="card p-4 sm:p-6 mb-4 sm:mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Ресторан (для фильтрации типов)
            </label>
            <select
              value={selectedRestaurant}
              onChange={(e) => setSelectedRestaurant(e.target.value)}
              className="select max-w-xs"
            >
              <option value="">Все рестораны (общие шаблоны)</option>
              {restaurants.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Список типов смен */}
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Название
                  </th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden sm:table-cell">
                    Время
                  </th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden lg:table-cell">
                    Продолжительность
                  </th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">
                    Ставка (₽)
                  </th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Цвет
                  </th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">
                    Статус
                  </th>
                  {canEdit && (
                    <th className="px-4 sm:px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Действия
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
              {templates.map((template) => (
                <ShiftTemplateRow
                  key={template.id}
                  template={template}
                  onUpdate={loadTemplates}
                  onDelete={handleDelete}
                  canEdit={canEdit}
                  editingId={editingId}
                  setEditingId={setEditingId}
                />
              ))}
              {templates.length === 0 && (
                <tr>
                  <td colSpan={canEdit ? 7 : 6} className="px-6 py-8 text-center text-gray-500">
                    Нет типов смен. {canEdit && 'Создайте первый тип смены.'}
                  </td>
                </tr>
              )}
            </tbody>
            </table>
          </div>
        </div>
      </div>

      {showCreateModal && (
        <CreateShiftTemplateModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            loadTemplates();
            setShowCreateModal(false);
          }}
          restaurantId={selectedRestaurant || undefined}
        />
      )}
    </div>
  );
}

function ShiftTemplateRow({
  template,
  onUpdate,
  onDelete,
  canEdit,
  editingId,
  setEditingId,
}: {
  template: ShiftTemplate;
  onUpdate: () => void;
  onDelete: (id: string) => void;
  canEdit: boolean;
  editingId: string | null;
  setEditingId: (id: string | null) => void;
}) {
  const [formData, setFormData] = useState({
    name: template.name,
    startHour: template.startHour,
    endHour: template.endHour,
    color: template.color || '',
    rate: template.rate || 0,
    isActive: template.isActive,
  });
  const [loading, setLoading] = useState(false);
  const isEditing = editingId === template.id;

  const handleSave = async () => {
    try {
      setLoading(true);
      await api.put(`/shift-templates/${template.id}`, formData);
      toast.success('Тип смены обновлен');
      setEditingId(null);
      onUpdate();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Ошибка обновления');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setFormData({
      name: template.name,
      startHour: template.startHour,
      endHour: template.endHour,
      color: template.color || '',
      rate: template.rate || 0,
      isActive: template.isActive,
    });
    setEditingId(null);
  };

  const duration = template.endHour >= template.startHour
    ? template.endHour - template.startHour
    : (24 - template.startHour) + template.endHour;

  const timeDisplay = `${String(template.startHour).padStart(2, '0')}:00 - ${String(template.endHour).padStart(2, '0')}:00`;

  if (isEditing) {
    return (
      <tr className="bg-primary-50/50">
        <td className="px-4 sm:px-6 py-4">
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="input"
          />
        </td>
        <td className="px-4 sm:px-6 py-4 hidden sm:table-cell">
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="0"
              max="23"
              value={formData.startHour}
              onChange={(e) => setFormData({ ...formData, startHour: parseInt(e.target.value) })}
              className="input w-16"
            />
            <span>-</span>
            <input
              type="number"
              min="0"
              max="23"
              value={formData.endHour}
              onChange={(e) => setFormData({ ...formData, endHour: parseInt(e.target.value) })}
              className="input w-16"
            />
          </div>
        </td>
        <td className="px-4 sm:px-6 py-4 text-sm text-gray-500 hidden lg:table-cell">
          {duration} ч
        </td>
        <td className="px-4 sm:px-6 py-4 hidden md:table-cell">
          <input
            type="number"
            step="0.01"
            min="0"
            value={formData.rate}
            onChange={(e) => setFormData({ ...formData, rate: parseFloat(e.target.value) || 0 })}
            className="input w-24"
            placeholder="0"
          />
        </td>
        <td className="px-4 sm:px-6 py-4">
          <input
            type="color"
            value={formData.color || '#3b82f6'}
            onChange={(e) => setFormData({ ...formData, color: e.target.value })}
            className="w-12 h-8 border border-gray-300 rounded-lg cursor-pointer"
          />
        </td>
        <td className="px-4 sm:px-6 py-4 hidden md:table-cell">
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={formData.isActive}
              onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
              className="rounded"
            />
            <span className="ml-2 text-sm">{formData.isActive ? 'Активен' : 'Неактивен'}</span>
          </label>
        </td>
        <td className="px-4 sm:px-6 py-4 text-right text-sm font-medium">
          <div className="flex justify-end gap-2">
            <button
              onClick={handleSave}
              disabled={loading}
              className="p-1.5 text-green-600 hover:text-green-900 hover:bg-green-50 rounded transition-colors"
            >
              <Save className="w-5 h-5" />
            </button>
            <button
              onClick={handleCancel}
              className="p-1.5 text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="hover:bg-gray-50 transition-colors">
      <td className="px-4 sm:px-6 py-4 text-sm font-medium text-gray-900">
        <div className="flex flex-col">
          <span>{template.name}</span>
          <span className="sm:hidden text-xs text-gray-500 mt-1">{timeDisplay} • {duration}ч</span>
        </div>
      </td>
      <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-500 hidden sm:table-cell">
        {timeDisplay}
      </td>
      <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-500 hidden lg:table-cell">
        {duration} часов
      </td>
      <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-900 hidden md:table-cell">
        {template.rate || 0} ₽
      </td>
      <td className="px-4 sm:px-6 py-4 whitespace-nowrap">
        <div
          className="w-8 h-8 rounded-lg shadow-sm"
          style={{ backgroundColor: template.color || '#3b82f6' }}
        />
      </td>
      <td className="px-4 sm:px-6 py-4 whitespace-nowrap hidden md:table-cell">
        <span
          className={`px-2 py-1 text-xs rounded-full font-medium ${
            template.isActive
              ? 'bg-green-100 text-green-800'
              : 'bg-gray-100 text-gray-800'
          }`}
        >
          {template.isActive ? 'Активен' : 'Неактивен'}
        </span>
      </td>
      {canEdit && (
        <td className="px-4 sm:px-6 py-4 text-right text-sm font-medium">
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setEditingId(template.id)}
              className="p-1.5 text-blue-600 hover:text-blue-900 hover:bg-blue-50 rounded transition-colors"
            >
              <Edit2 className="w-5 h-5" />
            </button>
            <button
              onClick={() => onDelete(template.id)}
              className="p-1.5 text-red-600 hover:text-red-900 hover:bg-red-50 rounded transition-colors"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          </div>
        </td>
      )}
    </tr>
  );
}

function CreateShiftTemplateModal({
  onClose,
  onSuccess,
  restaurantId,
}: {
  onClose: () => void;
  onSuccess: () => void;
  restaurantId?: string;
}) {
  const [formData, setFormData] = useState({
    name: '',
    startHour: 9,
    endHour: 18,
    color: '#3b82f6',
    rate: 0,
    restaurantId: restaurantId || '',
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      await api.post('/shift-templates', {
        ...formData,
        restaurantId: formData.restaurantId || null,
      });
      toast.success('Тип смены создан');
      onSuccess();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Ошибка создания типа смены');
    } finally {
      setLoading(false);
    }
  };

  const duration = formData.endHour >= formData.startHour
    ? formData.endHour - formData.startHour
    : (24 - formData.startHour) + formData.endHour;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="card p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold mb-6">Добавить тип смены</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Название типа смены
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Например: Полная смена"
              className="input"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Время начала (час)
            </label>
            <input
              type="number"
              min="0"
              max="23"
              value={formData.startHour}
              onChange={(e) => setFormData({ ...formData, startHour: parseInt(e.target.value) || 0 })}
              className="input"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Время окончания (час)
            </label>
            <input
              type="number"
              min="0"
              max="23"
              value={formData.endHour}
              onChange={(e) => setFormData({ ...formData, endHour: parseInt(e.target.value) || 0 })}
              className="input"
              required
            />
            <p className="mt-1 text-xs text-gray-500">
              Продолжительность: {duration} часов
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Ставка за смену (₽)
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={formData.rate}
              onChange={(e) => setFormData({ ...formData, rate: parseFloat(e.target.value) || 0 })}
              className="input"
              placeholder="0.00"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Цвет для отображения
            </label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={formData.color}
                onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                className="w-16 h-10 border border-gray-300 rounded cursor-pointer"
              />
              <input
                type="text"
                value={formData.color}
                onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md"
                placeholder="#3b82f6"
              />
            </div>
          </div>

          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={loading}
              className="btn-primary"
            >
              {loading ? 'Создание...' : 'Создать'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

