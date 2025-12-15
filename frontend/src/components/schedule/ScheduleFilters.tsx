import { format } from 'date-fns';

interface ScheduleFiltersProps {
  restaurants: any[];
  selectedRestaurant: string;
  setSelectedRestaurant: (id: string) => void;
  departments: any[];
  selectedDepartment: string;
  setSelectedDepartment: (id: string) => void;
  positions: any[];
  selectedPosition: string;
  setSelectedPosition: (id: string) => void;
  period: 'week' | 'month' | 'custom';
  handlePeriodChange: (p: 'week' | 'month' | 'custom') => void;
  startDate: Date;
  endDate: Date;
  setStartDate: (d: Date) => void;
  setEndDate: (d: Date) => void;
  navigatePeriod: (dir: 'prev' | 'next') => void;
  showOnlyMyShifts: boolean;
  setShowOnlyMyShifts: (v: boolean) => void;
}

export default function ScheduleFilters({
  restaurants,
  selectedRestaurant,
  setSelectedRestaurant,
  departments,
  selectedDepartment,
  setSelectedDepartment,
  positions,
  selectedPosition,
  setSelectedPosition,
  period,
  handlePeriodChange,
  startDate,
  endDate,
  setStartDate,
  setEndDate,
  navigatePeriod,
  showOnlyMyShifts,
  setShowOnlyMyShifts,
}: ScheduleFiltersProps) {
  return (
    <div className="card p-4 sm:p-6 mb-4 sm:mb-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Ресторан</label>
          <select
            value={selectedRestaurant}
            onChange={(e) => {
              setSelectedRestaurant(e.target.value);
              setSelectedDepartment('');
              setSelectedPosition('');
            }}
            className="select"
          >
            {restaurants.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Отдел</label>
          <select
            value={selectedDepartment}
            onChange={(e) => setSelectedDepartment(e.target.value)}
            className="select"
          >
            <option value="">Все отделы</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Должность</label>
          <select
            value={selectedPosition}
            onChange={(e) => setSelectedPosition(e.target.value)}
            className="select"
          >
            <option value="">Все должности</option>
            {positions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Период</label>
          <select
            value={period}
            onChange={(e) => handlePeriodChange(e.target.value as any)}
            className="select"
          >
            <option value="week">Неделя</option>
            <option value="month">Месяц</option>
            <option value="custom">Интервал</option>
          </select>
        </div>

        {period === 'custom' && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">С</label>
              <input
                type="date"
                value={format(startDate, 'yyyy-MM-dd')}
                onChange={(e) => setStartDate(new Date(e.target.value))}
                className="input"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">По</label>
              <input
                type="date"
                value={format(endDate, 'yyyy-MM-dd')}
                onChange={(e) => setEndDate(new Date(e.target.value))}
                className="input"
              />
            </div>
          </>
        )}

        {(period === 'week' || period === 'month') && (
          <div className="flex items-end gap-2">
            <button onClick={() => navigatePeriod('prev')} className="px-3 py-2 border border-gray-300 rounded-md hover:bg-gray-50">
              ←
            </button>
            <button onClick={() => navigatePeriod('next')} className="px-3 py-2 border border-gray-300 rounded-md hover:bg-gray-50">
              →
            </button>
          </div>
        )}
      </div>

      <div className="mt-3 flex items-center gap-3 text-sm text-gray-700 dark:text-gray-200">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={showOnlyMyShifts}
            onChange={(e) => setShowOnlyMyShifts(e.target.checked)}
            className="checkbox"
          />
          Только мои смены
        </label>
      </div>
    </div>
  );
}

