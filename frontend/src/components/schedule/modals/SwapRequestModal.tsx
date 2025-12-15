import { useState } from 'react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import toast from 'react-hot-toast';
import { Shift, ShiftTemplate } from '../types';

interface SwapRequestModalProps {
  shift: Shift;
  employees: any[];
  templates: ShiftTemplate[];
  onClose: () => void;
  onRequest: (shiftId: string, swapTargetId: string) => void;
}

export default function SwapRequestModal({
  shift,
  employees,
  templates,
  onClose,
  onRequest,
}: SwapRequestModalProps) {
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const shiftTemplate = templates.find((t) => t.id === shift.type || t.name === shift.type);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmployeeId) {
      toast.error('Выберите сотрудника для обмена');
      return;
    }

    setLoading(true);
    await onRequest(shift.id, selectedEmployeeId);
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Запрос обмена сменой</h2>
          
          <div className="mb-4 p-4 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-600 mb-1">Ваша смена:</p>
            <p className="font-medium text-gray-900">
              {format(new Date(shift.startTime), 'dd.MM.yyyy', { locale: ru })}
            </p>
            <p className="text-sm text-gray-600">
              {shiftTemplate?.name || shift.type}:{' '}
              {format(new Date(shift.startTime), 'HH:mm', { locale: ru })} -{' '}
              {format(new Date(shift.endTime), 'HH:mm', { locale: ru })}
            </p>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Обменяться с:
              </label>
              <select
                value={selectedEmployeeId}
                onChange={(e) => setSelectedEmployeeId(e.target.value)}
                className="select w-full"
                required
              >
                <option value="">Выберите сотрудника</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.firstName} {emp.lastName}
                    {emp.positionName && ` (${emp.positionName})`}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                disabled={loading}
              >
                Отмена
              </button>
              <button
                type="submit"
                className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
                disabled={loading || !selectedEmployeeId}
              >
                {loading ? 'Отправка...' : 'Отправить запрос'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

