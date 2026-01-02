import React, { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Shift, ShiftTemplate } from './types';
import { Trash2, ArrowLeftRight } from 'lucide-react';

interface EmployeeRow {
  id: string;
  firstName: string;
  lastName: string;
  position: string | null;
}

interface ScheduleTableProps {
  days: Date[];
  employees: Record<string, Record<string, EmployeeRow[]>>;
  positions: any[];
  templates: ShiftTemplate[];
  selectedCells: Set<string>;
  employeesFlat?: { id: string; firstName: string; lastName: string; position?: string | null }[];
  user: any;
  hasEditSchedule: boolean;
  hasRequestShiftSwap: boolean;
  handleCellClick: (employeeId: string, day: Date, shift: Shift | null, e?: React.MouseEvent) => void;
  getShiftForCell: (employeeId: string, day: Date) => Shift | null;
  onDeleteEmployeeShifts: (employeeId: string) => void;
  isHoliday: (date: Date) => any;
  onQuickUpdateShift: (shiftId: string, data: { userId?: string; type?: string }) => Promise<void>;
  onQuickSwap: (shift: Shift) => void;
}

const shiftTypeColors: Record<string, string> = {
  FULL: 'bg-blue-500',
  MORNING: 'bg-green-500',
  EVENING: 'bg-orange-500',
  PARTIAL: 'bg-purple-500',
};

const shiftTypeLabels: Record<string, string> = {
  FULL: 'П',
  MORNING: 'У',
  EVENING: 'В',
  PARTIAL: 'Ч',
};

export default function ScheduleTable({
  days,
  employees,
  positions,
  templates,
  selectedCells,
  employeesFlat = [],
  user,
  hasEditSchedule,
  hasRequestShiftSwap,
  handleCellClick,
  getShiftForCell,
  onDeleteEmployeeShifts,
  isHoliday,
  onQuickUpdateShift,
  onQuickSwap,
}: ScheduleTableProps) {
  const [inlineEditKey, setInlineEditKey] = useState<string | null>(null);
  const [inlineType, setInlineType] = useState<string>('');
  const [inlineUser, setInlineUser] = useState<string>('');
  const [saving, setSaving] = useState(false);

  const handleStartInline = (cellKey: string, shift: Shift) => {
    setInlineEditKey(cellKey);
    setInlineType(shift.type);
    setInlineUser(shift.userId);
  };

  const handleSaveInline = async (shift: Shift) => {
    try {
      setSaving(true);
      await onQuickUpdateShift(shift.id, { type: inlineType, userId: inlineUser });
      setInlineEditKey(null);
    } finally {
      setSaving(false);
    }
  };

  const employeeOptions = useMemo(
    () =>
      employeesFlat.map((e) => ({
        id: e.id,
        label: `${e.firstName} ${e.lastName}${e.position ? ` (${e.position})` : ''}`,
      })),
    [employeesFlat]
  );

  return (
    <div className="card overflow-x-auto -mx-4 sm:mx-0">
      <div className="inline-block min-w-full align-middle">
        <table className="min-w-full divide-y divide-gray-200 text-sm sm:text-base">
          <thead className="bg-gray-50 sticky top-0 z-10">
            <tr>
              <th className="px-3 sm:px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sticky left-0 bg-gray-50 z-20 min-w-[140px] sm:min-w-[200px]">
                Сотрудник
              </th>
              {days.map((day) => {
                const holiday = isHoliday(day);
                const isWeekend = [0, 6].includes(day.getDay());
                return (
                  <th
                    key={day.toISOString()}
                    className={`px-1 sm:px-2 py-3 text-center text-xs font-medium uppercase tracking-wider min-w-[60px] sm:min-w-[80px] ${
                      holiday
                        ? holiday.type === 'HOLIDAY'
                          ? 'bg-red-50 text-red-700'
                          : 'bg-orange-50 text-orange-700'
                        : isWeekend
                        ? 'bg-red-50 text-red-700'
                        : ''
                    }`}
                    title={holiday ? holiday.name : ''}
                  >
                    <div className="hidden sm:block">{format(day, 'EEE', { locale: ru })}</div>
                    <div
                      className={`font-semibold ${
                        holiday
                          ? holiday.type === 'HOLIDAY'
                            ? 'text-red-700'
                            : 'text-orange-700'
                          : isWeekend
                          ? 'text-red-700'
                          : 'text-gray-900'
                      }`}
                    >
                      {format(day, 'd')}
                    </div>
                    <div className="sm:hidden text-[10px]">{format(day, 'EEE', { locale: ru }).slice(0, 1)}</div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {positions.map((position) => (
              <React.Fragment key={position.id}>
                <tr className="bg-gray-100">
                  <td
                    colSpan={days.length + 1}
                    className="px-3 sm:px-4 py-2 text-left text-xs sm:text-sm font-semibold text-gray-700 uppercase tracking-wide"
                  >
                    {position.name}
                  </td>
                </tr>
                {Object.values(employees[position.id] || {})
                  .flatMap((empArr: EmployeeRow[]) => empArr)
                  .map((employee: EmployeeRow) => (
                    <tr key={employee.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-3 sm:px-4 py-3 whitespace-nowrap text-sm text-gray-900 flex items-center justify-between gap-2 sticky left-0 bg-white z-10">
                        <div className="flex flex-col">
                          <span className="font-medium">
                            {employee.firstName} {employee.lastName}
                          </span>
                          <span className="text-xs text-gray-500">{position.name}</span>
                        </div>
                        {hasEditSchedule && (
                          <button
                            onClick={() => onDeleteEmployeeShifts(employee.id)}
                            className="text-red-500 hover:text-red-700 transition-colors flex items-center gap-1 text-xs"
                            title="Удалить все смены сотрудника за период"
                          >
                            <Trash2 className="w-4 h-4" />
                            Удалить
                          </button>
                        )}
                      </td>
                      {days.map((day) => {
                        const shift = getShiftForCell(employee.id, day);
                        const cellKey = `${employee.id}|${format(day, 'yyyy-MM-dd')}`;
                        const isSelected = selectedCells.has(cellKey);
                        const shiftTemplate = shift ? templates.find((t) => t.id === shift.type || t.name === shift.type) : null;
                        const isOwnShift = shift && shift.userId === user?.id;
                        const canInline = shift && (hasEditSchedule || (isOwnShift && hasRequestShiftSwap));
                        const isInline = inlineEditKey === cellKey;

                        return (
                          <td
                            key={day.toISOString()}
                            className={`px-1 sm:px-2 py-2 sm:py-3 text-center border border-gray-100 ${
                              hasEditSchedule || (shift && shift.userId === user?.id && hasRequestShiftSwap)
                                ? 'cursor-pointer hover:bg-blue-50 active:bg-blue-100'
                                : ''
                            } ${isSelected ? 'bg-blue-200 ring-2 ring-blue-500' : ''}`}
                            onClick={(e) => handleCellClick(employee.id, day, shift, e)}
                            onDoubleClick={(e) => {
                              if (shift && canInline) {
                                e.stopPropagation();
                                handleStartInline(cellKey, shift);
                              }
                            }}
                          >
                            {shift ? (
                              <div className="flex flex-col items-center gap-1 relative group">
                                {!isInline && (
                                  <>
                                    <span
                                      className="inline-block px-2 py-1 rounded text-xs text-white font-medium select-none"
                                      style={{
                                        backgroundColor: shiftTemplate?.color || shiftTypeColors[shift.type] || '#gray',
                                      }}
                                      title={shiftTemplate?.name || shift.type}
                                    >
                                      {shiftTemplate ? shiftTemplate.name.substring(0, 1).toUpperCase() : shiftTypeLabels[shift.type] || shift.type}
                                      {shift.swapRequested && ' ⚠️'}
                                    </span>
                                    {/* Кнопка обмена для своих смен */}
                                    {isOwnShift && hasRequestShiftSwap && !hasEditSchedule && (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          onQuickSwap(shift);
                                        }}
                                        className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-1 -right-1 p-1 bg-blue-500 text-white rounded-full shadow-md hover:bg-blue-600"
                                        title="Запросить обмен"
                                      >
                                        <ArrowLeftRight className="w-3 h-3" />
                                      </button>
                                    )}
                                  </>
                                )}

                                {isInline && canInline && (
                                  <div
                                    className="w-full bg-white border border-gray-200 rounded-lg p-2 shadow-lg"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <div className="flex flex-col gap-2">
                                      <select
                                        value={inlineType}
                                        onChange={(e) => setInlineType(e.target.value)}
                                        className="select select-sm w-full"
                                      >
                                        {templates.map((t) => (
                                          <option key={t.id} value={t.id}>
                                            {t.name}
                                          </option>
                                        ))}
                                      </select>
                                      {hasEditSchedule && (
                                        <select
                                          value={inlineUser}
                                          onChange={(e) => setInlineUser(e.target.value)}
                                          className="select select-sm w-full"
                                        >
                                          {employeeOptions.map((opt) => (
                                            <option key={opt.id} value={opt.id}>
                                              {opt.label}
                                            </option>
                                          ))}
                                        </select>
                                      )}
                                      <div className="flex gap-2">
                                        <button
                                          onClick={() => handleSaveInline(shift)}
                                          disabled={saving}
                                          className="flex-1 btn-primary btn-sm"
                                        >
                                          {saving ? 'Сохраняю...' : 'Сохранить'}
                                        </button>
                                        <button
                                          onClick={() => setInlineEditKey(null)}
                                          className="btn-secondary btn-sm"
                                        >
                                          Отмена
                                        </button>
                                      </div>
                                      {isOwnShift && hasRequestShiftSwap && (
                                        <button
                                          onClick={() => {
                                            onQuickSwap(shift);
                                            setInlineEditKey(null);
                                          }}
                                          className="btn-secondary btn-sm"
                                        >
                                          Обменяться
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="text-gray-300">—</div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

