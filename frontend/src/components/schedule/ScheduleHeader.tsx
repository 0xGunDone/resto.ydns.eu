import { format, startOfMonth, endOfMonth } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Calendar, Building2, Copy } from 'lucide-react';

interface ScheduleHeaderProps {
  period: 'week' | 'month' | 'custom';
  startDate: Date;
  selectedRestaurant: string;
  restaurants: any[];
  selectedDepartment: string;
  departments: any[];
  selectedPosition: string;
  positions: any[];
  viewMode: 'table' | 'calendar';
  setViewMode: (mode: 'table' | 'calendar') => void;
  navigatePeriod: (dir: 'prev' | 'next') => void;
  setPeriod: (p: 'week' | 'month' | 'custom') => void;
  setStartDate: (d: Date) => void;
  setEndDate: (d: Date) => void;
  hasEditSchedule: boolean;
  handleCopySchedule: () => void;
  setShowSaveTemplateModal: (v: boolean) => void;
  setShowApplyTemplateModal: (v: boolean) => void;
  setEditingHoliday: (v: any) => void;
  setShowHolidayModal: (v: boolean) => void;
}

export default function ScheduleHeader({
  period,
  startDate,
  selectedRestaurant,
  restaurants,
  selectedDepartment,
  departments,
  selectedPosition,
  positions,
  viewMode,
  setViewMode,
  navigatePeriod,
  setPeriod,
  setStartDate,
  setEndDate,
  hasEditSchedule,
  handleCopySchedule,
  setShowSaveTemplateModal,
  setShowApplyTemplateModal,
  setEditingHoliday,
  setShowHolidayModal,
}: ScheduleHeaderProps) {
  return (
    <div className="mb-4 sm:mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
      <div className="flex flex-col gap-2 w-full">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">
          График работы - {format(startDate, 'LLLL yyyy', { locale: ru })}
        </h1>
        <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-gray-400" />
            <span>{period === 'week' ? 'Неделя' : period === 'month' ? 'Месяц' : 'Произвольно'}</span>
          </div>
          {selectedRestaurant && (
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-gray-400" />
              <span>{restaurants.find((r) => r.id === selectedRestaurant)?.name || 'Ресторан'}</span>
            </div>
          )}
          {selectedDepartment && (
            <div className="flex items-center gap-2">
              <span className="text-gray-500">•</span>
              <span>{departments.find((d) => d.id === selectedDepartment)?.name || 'Отдел'}</span>
            </div>
          )}
          {selectedPosition && (
            <div className="flex items-center gap-2">
              <span className="text-gray-500">•</span>
              <span>{positions.find((p) => p.id === selectedPosition)?.name || 'Должность'}</span>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3 w-full sm:w-auto">
        <div className="flex flex-wrap gap-2 sm:hidden">
          <button
            onClick={() => setViewMode('table')}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              viewMode === 'table'
                ? 'bg-blue-500 text-white'
                : 'bg-gray-200 dark:bg-slate-800 text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-slate-700'
            }`}
          >
            Таблица
          </button>
          <button
            onClick={() => setViewMode('calendar')}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              viewMode === 'calendar'
                ? 'bg-blue-500 text-white'
                : 'bg-gray-200 dark:bg-slate-800 text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-slate-700'
            }`}
          >
            Календарь
          </button>
          <button
            onClick={() => navigatePeriod('prev')}
            className="px-3 py-2 rounded-lg text-sm font-medium border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-700"
          >
            ← Назад
          </button>
          <button
            onClick={() => navigatePeriod('next')}
            className="px-3 py-2 rounded-lg text-sm font-medium border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-700"
          >
            Вперёд →
          </button>
          <button
            onClick={() => {
              setPeriod('month');
              setStartDate(startOfMonth(new Date()));
              setEndDate(endOfMonth(new Date()));
            }}
            className="px-3 py-2 rounded-lg text-sm font-medium border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-700"
          >
            Сегодня
          </button>
        </div>

        <div className="hidden sm:flex items-center gap-2">
          <button
            onClick={() => setViewMode('table')}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              viewMode === 'table'
                ? 'bg-blue-500 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Таблица
          </button>
          <button
            onClick={() => setViewMode('calendar')}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              viewMode === 'calendar'
                ? 'bg-blue-500 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Календарь
          </button>
        </div>

        {hasEditSchedule && (
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={handleCopySchedule}
              className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors text-sm flex items-center gap-2"
              title={`Скопировать график на ${period === 'week' ? 'следующую неделю' : 'следующий месяц'}`}
            >
              <Copy className="w-4 h-4" />
              Копировать график
            </button>
            <button
              onClick={() => setShowSaveTemplateModal(true)}
              className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors text-sm"
            >
              Сохранить как шаблон
            </button>
            <button
              onClick={() => setShowApplyTemplateModal(true)}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm"
            >
              Применить шаблон
            </button>
            <button
              onClick={() => {
                setEditingHoliday(null);
                setShowHolidayModal(true);
              }}
              className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors text-sm flex items-center gap-2"
            >
              <Calendar className="w-4 h-4" />
              Праздники/Выходные
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

