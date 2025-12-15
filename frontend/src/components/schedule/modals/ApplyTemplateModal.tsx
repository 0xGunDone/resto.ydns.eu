import { useState } from 'react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

interface ApplyTemplateModalProps {
  templates: any[];
  onClose: () => void;
  onApply: (templateId: string, targetStartDate: Date, replaceExisting: boolean) => void;
  currentStartDate: Date;
}

export default function ApplyTemplateModal({
  templates,
  onClose,
  onApply,
  currentStartDate,
}: ApplyTemplateModalProps) {
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [targetDate, setTargetDate] = useState(format(currentStartDate, 'yyyy-MM-dd'));
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTemplateId) {
      toast.error('Выберите шаблон');
      return;
    }

    setLoading(true);
    const targetStartDate = new Date(targetDate + 'T00:00:00');
    await onApply(selectedTemplateId, targetStartDate, replaceExisting);
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Применить шаблон графика</h2>
          
          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Выберите шаблон *
              </label>
              <select
                value={selectedTemplateId}
                onChange={(e) => setSelectedTemplateId(e.target.value)}
                className="select w-full"
                required
              >
                <option value="">Выберите шаблон</option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name} ({template.periodType === 'week' ? 'Неделя' : 'Месяц'})
                    {template.description && ` - ${template.description}`}
                  </option>
                ))}
              </select>
              {templates.length === 0 && (
                <p className="text-sm text-gray-500 mt-2">Нет сохраненных шаблонов</p>
              )}
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Дата начала периода *
              </label>
              <input
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className="input w-full"
                required
              />
            </div>

            <div className="mb-4">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={replaceExisting}
                  onChange={(e) => setReplaceExisting(e.target.checked)}
                  className="w-4 h-4"
                />
                <span className="text-sm text-gray-700">
                  Заменить существующие смены в этом периоде
                </span>
              </label>
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
                disabled={loading || !selectedTemplateId}
              >
                {loading ? 'Применение...' : 'Применить'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

