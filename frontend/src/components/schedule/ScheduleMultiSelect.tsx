import { ShiftTemplate } from './types';
import { Trash2 } from 'lucide-react';

interface ScheduleMultiSelectProps {
  hasEditSchedule: boolean;
  selectedCells: Set<string>;
  setSelectedCells: (s: Set<string>) => void;
  selectedShiftType: string;
  setSelectedShiftType: (v: string) => void;
  templates: ShiftTemplate[];
  handleBatchAssign: () => void;
  handleBatchDelete: () => void;
  handleCopySelection: () => void;
  clipboardShifts: any[];
  pasteDate: string;
  setPasteDate: (v: string) => void;
  handlePasteSelection: () => void;
}

export default function ScheduleMultiSelect({
  hasEditSchedule,
  selectedCells,
  setSelectedCells,
  selectedShiftType,
  setSelectedShiftType,
  templates,
  handleBatchAssign,
  handleBatchDelete,
  handleCopySelection,
  clipboardShifts,
  pasteDate,
  setPasteDate,
  handlePasteSelection,
}: ScheduleMultiSelectProps) {
  if (!hasEditSchedule) return null;

  return (
    <div className="card p-4 sm:p-6 mb-4 sm:mb-6">
      <div className="mb-3 text-xs text-gray-500">
        💡 Совет: Зажмите Ctrl/Cmd и кликайте по ячейкам для выбора нескольких (включая ячейки со сменами для удаления)
      </div>
      <div className="flex flex-col sm:flex-row sm:items-end gap-4">
        <div className="flex-1">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Тип смены для назначения
          </label>
          <select
            value={selectedShiftType}
            onChange={(e) => setSelectedShiftType(e.target.value)}
            className="select"
          >
            <option value="">Выберите тип смены</option>
            {templates.length === 0 && <option value="" disabled>Нет доступных типов смен</option>}
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({String(t.startHour).padStart(2, '0')}:00 - {String(t.endHour).padStart(2, '0')}:00)
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-2">
          <span className="text-sm text-gray-600 py-2">
            Выбрано: {selectedCells.size} ячеек
          </span>
          <button
            onClick={handleBatchAssign}
            disabled={selectedCells.size === 0 || !selectedShiftType}
            className="btn-primary whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Назначить смены
          </button>
          {selectedCells.size > 0 && (
            <>
              <button
                onClick={() => setSelectedCells(new Set())}
                className="btn-secondary whitespace-nowrap"
              >
                Очистить
              </button>
              <button
                onClick={handleBatchDelete}
                className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-all text-sm font-medium flex items-center gap-2 whitespace-nowrap shadow-sm hover:shadow"
                title="Удалить выбранные смены (Ctrl/Cmd + клик для выбора нескольких)"
              >
                <Trash2 className="w-4 h-4" />
                Удалить выбранные ({selectedCells.size})
              </button>
              <>
                <button
                  onClick={handleCopySelection}
                  className="btn-secondary whitespace-nowrap"
                  title="Копировать выбранные смены"
                >
                  Копировать
                </button>
                {clipboardShifts.length > 0 && (
                  <>
                    <input
                      type="date"
                      value={pasteDate}
                      onChange={(e) => setPasteDate(e.target.value)}
                      className="input input-sm"
                    />
                    <button
                      onClick={handlePasteSelection}
                      className="btn-primary whitespace-nowrap"
                      title="Вставить скопированные смены на выбранную дату"
                    >
                      Вставить
                    </button>
                  </>
                )}
              </>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

