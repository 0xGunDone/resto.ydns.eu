import { Calendar as BigCalendar, View } from 'react-big-calendar';
import moment from 'moment';
import { Shift } from './types';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, MoveRight } from 'lucide-react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

interface ScheduleCalendarViewProps {
  calendarStyle: string;
  calendarEvents: any[];
  localizer: any;
  calendarView: View;
  onViewChange: (view: View) => void;
  calendarDate: Date;
  onNavigate: (newDate: Date) => void;
  isHoliday: (date: Date) => any;
  user: any;
  hasEditSchedule: boolean;
  onEditShift: (shift: Shift) => void;
  onRequestSwap: (shift: Shift) => void;
}

export default function ScheduleCalendarView({
  calendarStyle,
  calendarEvents,
  localizer,
  calendarView,
  onViewChange,
  calendarDate,
  onNavigate,
  isHoliday,
  user,
  hasEditSchedule,
  onEditShift,
  onRequestSwap,
}: ScheduleCalendarViewProps) {
  const titleLabel = format(calendarDate, calendarView === 'month' ? 'LLLL yyyy' : 'd MMM, yyyy', { locale: ru });

  return (
    <>
      <style>{calendarStyle}</style>
      <div className="card p-4 sm:p-6 shadow-lg">
        <div className="mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => {
                const newDate = new Date(calendarDate);
                if (calendarView === 'month') {
                  newDate.setMonth(newDate.getMonth() - 1);
                } else if (calendarView === 'week') {
                  newDate.setDate(newDate.getDate() - 7);
                } else {
                  newDate.setDate(newDate.getDate() - 1);
                }
                onNavigate(newDate);
              }}
              className="px-3 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 hover:border-gray-400 transition-all shadow-sm font-medium inline-flex items-center gap-1"
              title="Предыдущий период"
            >
              <ChevronLeft className="w-4 h-4" />
              Назад
            </button>
            <button
              onClick={() => onNavigate(new Date())}
              className="px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all shadow-sm font-medium inline-flex items-center gap-1"
            >
              <CalendarIcon className="w-4 h-4" />
              Сегодня
            </button>
            <button
              onClick={() => {
                const newDate = new Date(calendarDate);
                if (calendarView === 'month') {
                  newDate.setMonth(newDate.getMonth() + 1);
                } else if (calendarView === 'week') {
                  newDate.setDate(newDate.getDate() + 7);
                } else {
                  newDate.setDate(newDate.getDate() + 1);
                }
                onNavigate(newDate);
              }}
              className="px-3 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 hover:border-gray-400 transition-all shadow-sm font-medium inline-flex items-center gap-1"
              title="Следующий период"
            >
              Вперёд
              <ChevronRight className="w-4 h-4" />
            </button>
            <div className="hidden sm:flex items-center gap-2 text-sm text-gray-600 ml-2">
              <MoveRight className="w-4 h-4 text-gray-400" />
              <span>{titleLabel}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => onViewChange('month')}
              className={`px-3 py-2 rounded-md text-sm font-medium border ${
                calendarView === 'month'
                  ? 'bg-blue-500 text-white border-blue-500'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              Месяц
            </button>
            <button
              onClick={() => onViewChange('week')}
              className={`px-3 py-2 rounded-md text-sm font-medium border ${
                calendarView === 'week'
                  ? 'bg-blue-500 text-white border-blue-500'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              Неделя
            </button>
            <button
              onClick={() => onViewChange('day')}
              className={`px-3 py-2 rounded-md text-sm font-medium border ${
                calendarView === 'day'
                  ? 'bg-blue-500 text-white border-blue-500'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              День
            </button>
          </div>
        </div>

        <div style={{ height: '700px', minHeight: '500px' }} className="rounded-lg overflow-hidden border border-gray-200">
          <BigCalendar
            localizer={localizer}
            events={calendarEvents}
            startAccessor="start"
            endAccessor="end"
            view={calendarView}
            views={['month', 'week', 'day']}
            dayPropGetter={(date) => {
              const holiday = isHoliday(date);
              if (holiday) {
                return {
                  className: holiday.type === 'HOLIDAY' ? 'rbc-day-bg-holiday' : 'rbc-day-bg-weekend',
                  style: {
                    backgroundColor: holiday.type === 'HOLIDAY' ? '#fee2e2' : '#fed7aa',
                  },
                };
              }
              return {};
            }}
            onView={onViewChange}
            date={calendarDate}
            onNavigate={onNavigate}
            culture="ru"
            messages={{
              next: 'Вперед',
              previous: 'Назад',
              today: 'Сегодня',
              month: 'Месяц',
              week: 'Неделя',
              day: 'День',
              agenda: 'Повестка',
              date: 'Дата',
              time: 'Время',
              event: 'Событие',
              noEventsInRange: 'Нет смен в этом диапазоне',
              showMore: (total) => `+${total} еще`,
            }}
            formats={{
              dayFormat: 'D',
              weekdayFormat: 'ddd',
              monthHeaderFormat: 'MMMM YYYY',
              dayHeaderFormat: 'dddd, D MMMM',
              dayRangeHeaderFormat: ({ start, end }) => `${moment(start).format('D MMMM')} - ${moment(end).format('D MMMM')}`,
              timeGutterFormat: 'HH:mm',
              eventTimeRangeFormat: ({ start, end }) => `${moment(start).format('HH:mm')} - ${moment(end).format('HH:mm')}`,
            }}
            eventPropGetter={(event) => ({
              style: event.style,
            })}
            onSelectEvent={(event) => {
              const shift = event.resource as Shift;
              if (shift) {
                const isMyShift = shift.userId === user?.id;
                if (hasEditSchedule) {
                  onEditShift(shift);
                } else if (isMyShift) {
                  onRequestSwap(shift);
                }
              }
            }}
            popup
            popupOffset={{ x: 10, y: 10 }}
          />
        </div>
      </div>
    </>
  );
}

