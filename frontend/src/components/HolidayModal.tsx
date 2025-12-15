import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { X, Trash2 } from 'lucide-react';

interface Holiday {
  id: string;
  name: string;
  date: string;
  type: string;
  isRecurring: boolean;
}

interface HolidayModalProps {
  holiday: Holiday | null;
  holidays: Holiday[];
  onClose: () => void;
  onSave: (data: { name: string; date: string; type: string; isRecurring: boolean }) => void;
  onDelete: (id: string) => void;
  onEdit?: (holiday: Holiday) => void;
}

export default function HolidayModal({ holiday, holidays, onClose, onSave, onDelete, onEdit }: HolidayModalProps) {
  const [name, setName] = useState(holiday?.name || '');
  const [date, setDate] = useState(holiday ? format(new Date(holiday.date), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'));
  const [type, setType] = useState(holiday?.type || 'HOLIDAY');
  const [isRecurring, setIsRecurring] = useState(holiday?.isRecurring || false);

  useEffect(() => {
    if (holiday) {
      setName(holiday.name);
      setDate(format(new Date(holiday.date), 'yyyy-MM-dd'));
      setType(holiday.type);
      setIsRecurring(holiday.isRecurring);
    }
  }, [holiday]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      return;
    }
    onSave({ name: name.trim(), date, type, isRecurring });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-900">
              {holiday ? 'Редактировать праздник/выходной' : 'Добавить праздник/выходной'}
            </h2>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="mb-6">
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Название *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input w-full"
                placeholder="Например: Новый год"
                required
              />
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Дата *
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="input w-full"
                required
              />
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Тип *
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="select w-full"
              >
                <option value="HOLIDAY">Праздник</option>
                <option value="WEEKEND">Выходной</option>
              </select>
            </div>

            <div className="mb-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isRecurring}
                  onChange={(e) => setIsRecurring(e.target.checked)}
                  className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                />
                <span className="text-sm text-gray-700">
                  Повторяющийся ежегодно
                </span>
              </label>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
              >
                Отмена
              </button>
              {holiday && (
                <button
                  type="button"
                  onClick={() => {
                    if (confirm('Удалить этот праздник/выходной?')) {
                      onDelete(holiday.id);
                      onClose();
                    }
                  }}
                  className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors flex items-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  Удалить
                </button>
              )}
              <button
                type="submit"
                className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
              >
                {holiday ? 'Сохранить' : 'Создать'}
              </button>
            </div>
          </form>

          {/* Список существующих праздников */}
          <div className="border-t pt-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Существующие праздники и выходные</h3>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {holidays.length === 0 ? (
                <p className="text-sm text-gray-500">Нет праздников и выходных</p>
              ) : (
                holidays.map((h) => (
                  <div
                    key={h.id}
                    className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          h.type === 'HOLIDAY' ? 'bg-red-100 text-red-800' : 'bg-orange-100 text-orange-800'
                        }`}>
                          {h.type === 'HOLIDAY' ? 'Праздник' : 'Выходной'}
                        </span>
                        {h.isRecurring && (
                          <span className="text-xs text-gray-500">🔄 Ежегодно</span>
                        )}
                      </div>
                      <div className="text-sm font-medium text-gray-900 mt-1">{h.name}</div>
                      <div className="text-xs text-gray-500">{format(new Date(h.date), 'dd.MM.yyyy', { locale: require('date-fns/locale/ru') })}</div>
                    </div>
                    <button
                      onClick={() => {
                        if (onEdit) {
                          onEdit(h);
                          onClose();
                        }
                      }}
                      className="p-2 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded transition-colors"
                      title="Редактировать"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

