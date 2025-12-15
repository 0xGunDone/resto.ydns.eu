import { History } from 'lucide-react';
import { FixedSizeList } from 'react-window';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

interface ChangeHistoryBlockProps {
  show: boolean;
  history: any[];
  onToggle: () => void;
}

export default function ChangeHistoryBlock({ show, history, onToggle }: ChangeHistoryBlockProps) {
  const ITEM_HEIGHT = 170;
  const safeHistory = Array.isArray(history) ? history : Object.values(history || {});
  const useVirtual = safeHistory.length > 30;

  const safeFormat = (value: string | Date | undefined | null, pattern: string) => {
    if (!value) return '—';
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return format(d, pattern, { locale: ru });
  };

  const renderItem = (record: any) => (
    <div className="p-4 border border-gray-200 rounded-lg">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <span
              className={`px-2 py-1 rounded text-xs font-medium ${
                record.status === 'APPROVED'
                  ? 'bg-green-100 text-green-800'
                  : record.status === 'REJECTED'
                  ? 'bg-red-100 text-red-800'
                  : record.status === 'ACCEPTED_BY_EMPLOYEE'
                  ? 'bg-blue-100 text-blue-800'
                  : record.status === 'REJECTED_BY_EMPLOYEE'
                  ? 'bg-orange-100 text-orange-800'
                  : record.status === 'CREATED'
                  ? 'bg-green-100 text-green-800'
                  : record.status === 'UPDATED'
                  ? 'bg-blue-100 text-blue-800'
                  : record.status === 'DELETED'
                  ? 'bg-red-100 text-red-800'
                  : 'bg-yellow-100 text-yellow-800'
              }`}
            >
              {record.status === 'APPROVED'
                ? '✓ Одобрено менеджером'
                : record.status === 'REJECTED'
                ? '✗ Отклонено менеджером'
                : record.status === 'ACCEPTED_BY_EMPLOYEE'
                ? '✓ Принято сотрудником'
                : record.status === 'REJECTED_BY_EMPLOYEE'
                ? '✗ Отклонено сотрудником'
                : record.status === 'CREATED'
                ? '✓ Создано'
                : record.status === 'UPDATED'
                ? '✓ Обновлено'
                : record.status === 'DELETED'
                ? '✗ Удалено'
                : '⏳ Ожидает'}
            </span>
            {record.changeType && (
              <span className="ml-2 px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-700">
                {record.changeType === 'SWAP'
                  ? 'Обмен'
                  : record.changeType === 'CREATE'
                  ? 'Создание'
                  : record.changeType === 'UPDATE'
                  ? 'Обновление'
                  : record.changeType === 'DELETE'
                  ? 'Удаление'
                  : record.changeType === 'BATCH_CREATE'
                  ? 'Массовое создание'
                  : record.changeType === 'BATCH_DELETE'
                  ? 'Массовое удаление'
                  : record.changeType}
              </span>
            )}
          </div>
          <p className="text-sm text-gray-600 mb-1">
            <span className="font-medium">
              {record.fromUser?.firstName} {record.fromUser?.lastName}
            </span>
            {' → '}
            <span className="font-medium">
              {record.toUser?.firstName} {record.toUser?.lastName}
            </span>
          </p>
          <p className="text-sm text-gray-500">
            {safeFormat(record.shiftStartTime, 'dd.MM.yyyy HH:mm')} - {safeFormat(record.shiftEndTime, 'HH:mm')}
          </p>
          <p className="text-sm text-gray-500">Тип смены: {record.shiftType}</p>
          <p className="text-sm text-gray-500">Ресторан: {record.restaurant?.name}</p>
          <p className="text-sm text-gray-500">
            Запрошено: {safeFormat(record.requestedAt, 'dd.MM.yyyy HH:mm')}
          </p>
          {record.approvedAt && (
            <p className="text-sm text-gray-500">
              {record.status === 'APPROVED' ? 'Одобрено' : 'Отклонено'}: {safeFormat(record.approvedAt, 'dd.MM.yyyy HH:mm')}
              {record.approvedBy && (
                <> менеджером {record.approvedBy.firstName} {record.approvedBy.lastName}</>
              )}
            </p>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="mt-4 card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-gray-900">История изменений графика</h3>
        <button
          onClick={onToggle}
          className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors flex items-center gap-2 text-sm"
        >
          <History className="w-4 h-4" />
          {show ? 'Скрыть' : 'Показать'}
        </button>
      </div>

      {show ? (
        safeHistory.length === 0 ? (
          <p className="text-gray-500">Нет записей в истории изменений</p>
        ) : (
          <div className="space-y-4">
            {useVirtual ? (
              <FixedSizeList
                height={Math.min(safeHistory.length * ITEM_HEIGHT, 640)}
                itemCount={safeHistory.length}
                itemSize={ITEM_HEIGHT}
                width="100%"
                itemKey={(index) => safeHistory[index]?.id ?? index}
              >
                {({ index, style }) => (
                  <div style={style} key={safeHistory[index]?.id ?? index}>
                    {renderItem(safeHistory[index])}
                  </div>
                )}
              </FixedSizeList>
            ) : (
              safeHistory.map((record: any, idx) => (
                <div key={record?.id ?? idx}>{renderItem(record)}</div>
              ))
            )}
          </div>
        )
      ) : null}
    </div>
  );
}

