interface ScheduleBulkHolidaysProps {
  hasEditSchedule: boolean;
  bulkHolidayStart: string;
  setBulkHolidayStart: (v: string) => void;
  bulkHolidayEnd: string;
  setBulkHolidayEnd: (v: string) => void;
  bulkHolidayType: 'HOLIDAY' | 'WEEKEND';
  setBulkHolidayType: (v: 'HOLIDAY' | 'WEEKEND') => void;
  bulkHolidayName: string;
  setBulkHolidayName: (v: string) => void;
  bulkHolidayLoading: boolean;
  handleBulkHolidays: () => void;
}

export default function ScheduleBulkHolidays({
  hasEditSchedule,
  bulkHolidayStart,
  setBulkHolidayStart,
  bulkHolidayEnd,
  setBulkHolidayEnd,
  bulkHolidayType,
  setBulkHolidayType,
  bulkHolidayName,
  setBulkHolidayName,
  bulkHolidayLoading,
  handleBulkHolidays,
}: ScheduleBulkHolidaysProps) {
  if (!hasEditSchedule) return null;

  return (
    <div className="card p-4 sm:p-6 mb-4 sm:mb-6">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">Массовое добавление праздников/выходных</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Дата начала</label>
          <input
            type="date"
            value={bulkHolidayStart}
            onChange={(e) => setBulkHolidayStart(e.target.value)}
            className="input"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Дата окончания</label>
          <input
            type="date"
            value={bulkHolidayEnd}
            onChange={(e) => setBulkHolidayEnd(e.target.value)}
            className="input"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Тип</label>
          <select
            value={bulkHolidayType}
            onChange={(e) => setBulkHolidayType(e.target.value as 'HOLIDAY' | 'WEEKEND')}
            className="select"
          >
            <option value="HOLIDAY">Праздничный день</option>
            <option value="WEEKEND">Выходной</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Название (необязательно)</label>
          <input
            type="text"
            value={bulkHolidayName}
            onChange={(e) => setBulkHolidayName(e.target.value)}
            className="input"
            placeholder="Например: Новый год"
          />
        </div>
        <div className="flex items-end">
          <button onClick={handleBulkHolidays} disabled={bulkHolidayLoading} className="btn-primary w-full">
            {bulkHolidayLoading ? 'Сохраняю...' : 'Добавить дни'}
          </button>
        </div>
      </div>
    </div>
  );
}

