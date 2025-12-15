import { RefreshCw } from 'lucide-react';
import { FixedSizeList, ListChildComponentProps } from 'react-window';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

interface IncomingSwapRequestsBlockProps {
  show: boolean;
  requests: any[];
  onToggle: () => void;
  onRespond: (requestId: string, accept: boolean) => void;
}

export default function IncomingSwapRequestsBlock({
  show,
  requests,
  onToggle,
  onRespond,
}: IncomingSwapRequestsBlockProps) {
  const countLabel = requests.length > 0 ? ` (${requests.length})` : '';
  const ITEM_HEIGHT = 150;
  const useVirtual = requests.length > 30;

  const renderItem = (request: any) => (
    <div className="p-4 border border-orange-200 rounded-lg bg-orange-50">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex-1">
          <p className="text-sm text-gray-700 mb-2">
            <span className="font-medium">
              {request.user?.firstName} {request.user?.lastName}
            </span>{' '}
            хочет обменяться с вами сменой
          </p>
          <p className="text-sm text-gray-600 mb-1">
            <span className="font-medium">Смена:</span>{' '}
            {format(new Date(request.startTime), 'dd.MM.yyyy HH:mm', { locale: ru })} -{' '}
            {format(new Date(request.endTime), 'HH:mm', { locale: ru })}
          </p>
          <p className="text-sm text-gray-600">
            <span className="font-medium">Тип смены:</span> {request.type}
          </p>
          <p className="text-sm text-gray-600">
            <span className="font-medium">Ресторан:</span> {request.restaurant?.name}
          </p>
          {request.user?.phone && (
            <p className="text-sm text-gray-600 mt-2">
              <span className="font-medium">Телефон:</span> {request.user.phone}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-2">
          {request.employeeResponse === null || request.employeeResponse === 'PENDING' ? (
            <>
              <p className="text-xs text-orange-600 mb-2 font-medium">Ожидает вашего ответа</p>
              <div className="flex gap-2">
                <button
                  onClick={() => onRespond(request.id, true)}
                  className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors text-sm"
                >
                  Принять
                </button>
                <button
                  onClick={() => onRespond(request.id, false)}
                  className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors text-sm"
                >
                  Отклонить
                </button>
              </div>
            </>
          ) : request.employeeResponse === 'ACCEPTED' ? (
            <p className="text-xs text-green-600 font-medium">Вы приняли. Ожидается подтверждение менеджера</p>
          ) : (
            <p className="text-xs text-red-600 font-medium">Вы отклонили запрос</p>
          )}
        </div>
      </div>
    </div>
  );

  const VirtualRow = ({ index, style }: ListChildComponentProps) => (
    <div style={style}>{renderItem(requests[index])}</div>
  );

  return (
    <div className="mt-4 card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-gray-900">Входящие запросы на обмен</h3>
        <button
          onClick={onToggle}
          className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors flex items-center gap-2 text-sm"
        >
          <RefreshCw className="w-4 h-4" />
          {show ? 'Скрыть' : `Показать${countLabel}`}
        </button>
      </div>

      {show ? (
        requests.length > 0 ? (
          <div className="space-y-4">
            {useVirtual ? (
              <FixedSizeList
                height={Math.min(requests.length * ITEM_HEIGHT, 600)}
                itemCount={requests.length}
                itemSize={ITEM_HEIGHT}
                width="100%"
              >
                {VirtualRow}
              </FixedSizeList>
            ) : (
              requests.map((request: any) => renderItem(request))
            )}
          </div>
        ) : (
          <p className="text-gray-500 text-sm py-4">Нет входящих запросов на обмен</p>
        )
      ) : null}
    </div>
  );
}

