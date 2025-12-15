import { RefreshCw } from 'lucide-react';
import { FixedSizeList } from 'react-window';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

interface SwapRequestsBlockProps {
  show: boolean;
  requests: any[];
  onToggle: () => void;
  onApprove: (requestId: string, approve: boolean) => void;
}

export default function SwapRequestsBlock({
  show,
  requests,
  onToggle,
  onApprove,
}: SwapRequestsBlockProps) {
  const safeRequests = Array.isArray(requests) ? requests : Object.values(requests || {});
  const countLabel = safeRequests.length > 0 ? `(${safeRequests.length})` : '';
  const ITEM_HEIGHT = 150;
  const useVirtual = safeRequests.length > 30;

  const safeFormat = (value: string | Date | undefined | null, pattern: string) => {
    if (!value) return '—';
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return format(d, pattern, { locale: ru });
  };

  const renderItem = (request: any) => (
    <div className="p-4 border border-gray-200 rounded-lg">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex-1">
          <p className="text-sm text-gray-600">
            {request?.user ? (
              <>
                <span className="font-medium">
                  {request.user.firstName} {request.user.lastName}
                </span>{' '}
                хочет обменяться сменой
              </>
            ) : (
              'Сотрудник хочет обменяться сменой'
            )}
          </p>
          {request.swapTarget && (
            <p className="text-sm text-gray-500">
              с{' '}
              <span className="font-medium">
                {request.swapTarget.firstName} {request.swapTarget.lastName}
              </span>
            </p>
          )}
          {request.employeeResponse && (
            <p className="text-sm mt-1">
              <span
                className={`px-2 py-1 rounded text-xs font-medium ${
                  request.employeeResponse === 'ACCEPTED'
                    ? 'bg-green-100 text-green-800'
                    : request.employeeResponse === 'REJECTED'
                    ? 'bg-red-100 text-red-800'
                    : 'bg-yellow-100 text-yellow-800'
                }`}
              >
                {request.employeeResponse === 'ACCEPTED'
                  ? '✅ Сотрудник принял'
                  : request.employeeResponse === 'REJECTED'
                  ? '❌ Сотрудник отклонил'
                  : '⏳ Ожидает ответа сотрудника'}
              </span>
            </p>
          )}
          <p className="text-sm text-gray-500 mt-1">
            {safeFormat(request?.startTime, 'dd.MM.yyyy HH:mm')} - {safeFormat(request?.endTime, 'HH:mm')}
          </p>
          <p className="text-sm text-gray-500">Ресторан: {request?.restaurant?.name || '—'}</p>
        </div>
        <div className="flex flex-col gap-2">
          {request.employeeResponse === 'ACCEPTED' ? (
            <>
              <button
                onClick={() => onApprove(request.id, true)}
                className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
              >
                Одобрить
              </button>
              <button
                onClick={() => onApprove(request.id, false)}
                className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
              >
                Отклонить
              </button>
            </>
          ) : request.employeeResponse === 'REJECTED' ? (
            <p className="text-sm text-red-600 font-medium">Сотрудник отклонил запрос</p>
          ) : (
            <p className="text-sm text-yellow-600 font-medium">Ожидает ответа сотрудника</p>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="mt-4 card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-gray-900">Запросы на обмен сменами</h3>
        <button
          onClick={onToggle}
          className="px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 transition-colors flex items-center gap-2 text-sm"
        >
          <RefreshCw className="w-4 h-4" />
          {show ? 'Скрыть' : `Показать ${countLabel}`}
        </button>
      </div>

      {show ? (
        requests.length === 0 ? (
          <p className="text-gray-500">Нет запросов на обмен</p>
        ) : (
          <div className="space-y-4">
            {useVirtual ? (
              <FixedSizeList
                height={Math.min(safeRequests.length * ITEM_HEIGHT, 600)}
                itemCount={safeRequests.length}
                itemSize={ITEM_HEIGHT}
                width="100%"
                itemKey={(index) => safeRequests[index]?.id ?? index}
              >
                {({ index, style }) => (
                  <div style={style} key={safeRequests[index]?.id ?? index}>
                    {renderItem(safeRequests[index])}
                  </div>
                )}
              </FixedSizeList>
            ) : (
              safeRequests.map((request: any, idx) => (
                <div key={request?.id ?? idx}>{renderItem(request)}</div>
              ))
            )}
          </div>
        )
      ) : null}
    </div>
  );
}

