import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import api from '../../../utils/api';
import toast from 'react-hot-toast';
import { Shift, ShiftTemplate } from '../types';

interface EditShiftModalProps {
  shift: Shift;
  employees: any[];
  templates: ShiftTemplate[];
  onClose: () => void;
  onSave: () => void;
  onDelete: () => void;
}

export default function EditShiftModal({
  shift,
  employees,
  templates,
  onClose,
  onSave,
  onDelete,
}: EditShiftModalProps) {
  const [formData, setFormData] = useState({
    userId: shift.userId,
    type: shift.type,
    startTime: format(new Date(shift.startTime), "yyyy-MM-dd'T'HH:mm"),
    endTime: format(new Date(shift.endTime), "yyyy-MM-dd'T'HH:mm"),
  });
  const [loading, setLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const selectedEmployee = useMemo(
    () => employees.find((e: any) => e.id === formData.userId),
    [employees, formData.userId]
  );
  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === formData.type || t.name === formData.type),
    [templates, formData.type]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      await api.put(`/shifts/${shift.id}`, formData);
      toast.success('Смена обновлена');
      onSave();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Ошибка при обновлении смены');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    try {
      setLoading(true);
      await api.delete(`/shifts/${shift.id}`);
      toast.success('Смена удалена');
      onDelete();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Ошибка при удалении смены');
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Редактирование смены</h2>

          {!showDeleteConfirm ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Сотрудник</label>
                <select
                  value={formData.userId}
                  onChange={(e) => setFormData({ ...formData, userId: e.target.value })}
                  className="select w-full"
                  required
                >
                  {employees.map((emp: any) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.firstName} {emp.lastName} {emp.position ? `(${emp.position})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Тип смены</label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                  className="select w-full"
                  required
                >
                  {templates.map((tpl) => (
                    <option key={tpl.id} value={tpl.id}>
                      {tpl.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Начало смены</label>
                  <input
                    type="datetime-local"
                    value={formData.startTime}
                    onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Конец смены</label>
                  <input
                    type="datetime-local"
                    value={formData.endTime}
                    onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Сохранение...' : 'Сохранить'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  disabled={loading}
                  className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Удалить
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  disabled={loading}
                  className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Отмена
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-4">
              <p className="text-lg font-medium text-gray-900">Вы уверены, что хотите удалить эту смену?</p>
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-sm text-gray-600">
                  <strong>Сотрудник:</strong> {selectedEmployee?.firstName} {selectedEmployee?.lastName}
                </p>
                <p className="text-sm text-gray-600">
                  <strong>Тип:</strong> {selectedTemplate?.name || formData.type}
                </p>
                <p className="text-sm text-gray-600">
                  <strong>Время:</strong>{' '}
                  {format(new Date(formData.startTime), 'dd.MM.yyyy HH:mm', { locale: ru })} -{' '}
                  {format(new Date(formData.endTime), 'HH:mm', { locale: ru })}
                </p>
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  onClick={handleDelete}
                  disabled={loading}
                  className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Удаление...' : 'Да, удалить'}
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={loading}
                  className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Отмена
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

