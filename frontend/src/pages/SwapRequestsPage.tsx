import { useState, useEffect, useMemo } from 'react';
import api from '../utils/api';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/authStore';
import Navbar from '../components/Navbar';
import FloatingActionButton from '../components/FloatingActionButton';
import { RefreshCw, ArrowLeftRight, Check, X, Clock, ChevronsUp, Filter, ChevronDown, ChevronUp } from 'lucide-react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

interface SwapRequest {
  id: string;
  shiftId: string;
  fromUserId: string;
  toUserId: string;
  status: string;
  employeeResponse?: string;
  requestedAt: string;
  respondedAt?: string;
  approvedAt?: string;
  approvedById?: string;
  expiresAt: string;
  startTime?: string;
  endTime?: string;
  type?: string;
  user?: {
    id: string;
    firstName: string;
    lastName: string;
    phone?: string;
  };
  swapTarget?: {
    id: string;
    firstName: string;
    lastName: string;
  };
  restaurant?: {
    id: string;
    name: string;
  };
  shift?: {
    id: string;
    startTime: string;
    endTime: string;
    type: string;
  };
}

type TabType = 'incoming' | 'outgoing' | 'manager';

const statusLabels: Record<string, string> = {
  PENDING: 'Ожидает ответа',
  ACCEPTED: 'Принят сотрудником',
  REJECTED: 'Отклонен сотрудником',
  APPROVED: 'Одобрен менеджером',
  MANAGER_REJECTED: 'Отклонен менеджером',
  EXPIRED: 'Истек срок',
};

const statusColors: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200',
  ACCEPTED: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200',
  REJECTED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200',
  APPROVED: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200',
  MANAGER_REJECTED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200',
  EXPIRED: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
};

export default function SwapRequestsPage() {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<TabType>('incoming');
  const [restaurants, setRestaurants] = useState<any[]>([]);
  const [selectedRestaurant, setSelectedRestaurant] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [incomingRequests, setIncomingRequests] = useState<SwapRequest[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<SwapRequest[]>([]);
  const [managerRequests, setManagerRequests] = useState<SwapRequest[]>([]);
  const [userPermissions, setUserPermissions] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('');

  const handleScrollTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });

  const fabActions = [
    {
      name: 'Обновить',
      icon: RefreshCw,
      onClick: () => loadAllRequests(),
    },
    {
      name: showFilters ? 'Скрыть фильтры' : 'Показать фильтры',
      icon: Filter,
      onClick: () => setShowFilters((v) => !v),
    },
    {
      name: 'Наверх',
      icon: ChevronsUp,
      onClick: handleScrollTop,
    },
  ];

  // Check if user can approve swaps (manager permission)
  const hasApprovePermission = useMemo(() => {
    if (!user || !selectedRestaurant) return false;
    if (user.role === 'OWNER' || user.role === 'ADMIN') return true;
    return userPermissions.includes('APPROVE_SHIFT_SWAP');
  }, [user, selectedRestaurant, userPermissions]);

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    if (selectedRestaurant) {
      loadUserPermissions();
      loadAllRequests();
    }
  }, [selectedRestaurant]);

  const loadInitialData = async () => {
    try {
      setLoading(true);
      const restaurantsRes = await api.get('/restaurants');
      const restaurantsData = restaurantsRes.data.restaurants || [];
      setRestaurants(restaurantsData);
      if (restaurantsData.length > 0) {
        setSelectedRestaurant(restaurantsData[0].id);
      }
    } catch (error: any) {
      toast.error('Ошибка загрузки данных');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const loadUserPermissions = async () => {
    try {
      if (!selectedRestaurant || !user) return;
      
      if (user.role === 'OWNER' || user.role === 'ADMIN') {
        setUserPermissions(['APPROVE_SHIFT_SWAP', 'REQUEST_SHIFT_SWAP']);
        return;
      }

      const response = await api.get(`/permissions/user/${user.id}`, {
        params: { restaurantId: selectedRestaurant },
      });
      setUserPermissions(response.data.permissions || []);
    } catch (error: any) {
      console.error('Ошибка загрузки прав:', error);
      setUserPermissions([]);
    }
  };

  const loadAllRequests = async () => {
    await Promise.all([
      loadIncomingRequests(),
      loadOutgoingRequests(),
      loadManagerRequests(),
    ]);
  };


  const loadIncomingRequests = async () => {
    try {
      const res = await api.get('/shifts/swap-requests/incoming', {
        params: { restaurantId: selectedRestaurant },
      });
      const data = res.data.requests || res.data.incoming || res.data.data || [];
      setIncomingRequests(Array.isArray(data) ? data : []);
    } catch (error: any) {
      console.error('Ошибка загрузки входящих запросов:', error);
    }
  };

  const loadOutgoingRequests = async () => {
    try {
      // Use the swaps API for outgoing requests
      const res = await api.get('/swaps/outgoing', {
        params: { restaurantId: selectedRestaurant },
      });
      const data = res.data.swapRequests || res.data.requests || res.data.outgoing || res.data.data || [];
      setOutgoingRequests(Array.isArray(data) ? data : []);
    } catch (error: any) {
      console.error('Ошибка загрузки исходящих запросов:', error);
    }
  };

  const loadManagerRequests = async () => {
    try {
      if (!hasApprovePermission) return;
      const res = await api.get('/shifts/swap-requests', {
        params: { restaurantId: selectedRestaurant },
      });
      const data = res.data.requests || res.data.swapRequests || res.data.data || [];
      setManagerRequests(Array.isArray(data) ? data : []);
    } catch (error: any) {
      console.error('Ошибка загрузки запросов для менеджера:', error);
    }
  };

  const handleRespondToSwap = async (requestId: string, accept: boolean) => {
    try {
      await api.post(`/shifts/swap-requests/${requestId}/respond`, { accept });
      toast.success(accept ? 'Вы приняли запрос на обмен' : 'Вы отклонили запрос на обмен');
      loadAllRequests();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Ошибка ответа на запрос');
    }
  };

  const handleApproveSwap = async (requestId: string, approve: boolean) => {
    try {
      await api.post(`/shifts/swap-requests/${requestId}/approve`, { approve });
      toast.success(approve ? 'Обмен одобрен' : 'Обмен отклонен');
      loadAllRequests();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Ошибка подтверждения обмена');
    }
  };

  const safeFormat = (value: string | Date | undefined | null, pattern: string) => {
    if (!value) return '—';
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return format(d, pattern, { locale: ru });
  };

  const filterRequests = (requests: SwapRequest[]) => {
    if (!statusFilter) return requests;
    return requests.filter((r) => r.status === statusFilter || r.employeeResponse === statusFilter);
  };

  const getTabCount = (tab: TabType) => {
    switch (tab) {
      case 'incoming':
        return incomingRequests.filter((r) => 
          r.employeeResponse === null || r.employeeResponse === 'PENDING'
        ).length;
      case 'outgoing':
        return outgoingRequests.length;
      case 'manager':
        return managerRequests.filter((r) => r.employeeResponse === 'ACCEPTED').length;
      default:
        return 0;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 transition-colors">
        <Navbar />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center text-gray-500 dark:text-gray-400">Загрузка...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 transition-colors">
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
        {/* Header */}
        <div className="mb-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-3">
              <ArrowLeftRight className="w-8 h-8 text-blue-500" />
              Обмен сменами
            </h1>
            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
              <select
                value={selectedRestaurant}
                onChange={(e) => setSelectedRestaurant(e.target.value)}
                className="select"
              >
                {restaurants.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
              <button
                onClick={() => loadAllRequests()}
                className="btn-secondary flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Обновить
              </button>
            </div>
          </div>

          {/* Filters */}
          {showFilters && (
            <div className="card p-4 mb-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Статус
                  </label>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="select"
                  >
                    <option value="">Все статусы</option>
                    {Object.entries(statusLabels).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-end">
                  <button
                    onClick={() => setStatusFilter('')}
                    className="btn-secondary w-full"
                  >
                    Сбросить фильтры
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Tabs */}
          <div className="flex flex-wrap gap-2 mb-6 border-b border-gray-200 dark:border-gray-700">
            <button
              onClick={() => setActiveTab('incoming')}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                activeTab === 'incoming'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              Входящие
              {getTabCount('incoming') > 0 && (
                <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-orange-500 text-white">
                  {getTabCount('incoming')}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('outgoing')}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                activeTab === 'outgoing'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              Исходящие
              {outgoingRequests.length > 0 && (
                <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-gray-500 text-white">
                  {outgoingRequests.length}
                </span>
              )}
            </button>
            {hasApprovePermission && (
              <button
                onClick={() => setActiveTab('manager')}
                className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                  activeTab === 'manager'
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                На одобрение
                {getTabCount('manager') > 0 && (
                  <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-green-500 text-white">
                    {getTabCount('manager')}
                  </span>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="space-y-4">
          {activeTab === 'incoming' && (
            <IncomingRequestsList
              requests={filterRequests(incomingRequests)}
              onRespond={handleRespondToSwap}
              safeFormat={safeFormat}
            />
          )}
          {activeTab === 'outgoing' && (
            <OutgoingRequestsList
              requests={filterRequests(outgoingRequests)}
              safeFormat={safeFormat}
            />
          )}
          {activeTab === 'manager' && hasApprovePermission && (
            <ManagerRequestsList
              requests={filterRequests(managerRequests)}
              onApprove={handleApproveSwap}
              safeFormat={safeFormat}
            />
          )}
        </div>
      </div>

      <FloatingActionButton actions={fabActions} position="bottom-right" />
    </div>
  );
}


// Incoming requests component - requests where user is the target
function IncomingRequestsList({
  requests,
  onRespond,
  safeFormat,
}: {
  requests: SwapRequest[];
  onRespond: (id: string, accept: boolean) => void;
  safeFormat: (value: string | Date | undefined | null, pattern: string) => string;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (requests.length === 0) {
    return (
      <div className="card p-8 text-center">
        <ArrowLeftRight className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
        <p className="text-gray-500 dark:text-gray-400 text-lg">Нет входящих запросов на обмен</p>
        <p className="text-gray-400 dark:text-gray-500 text-sm mt-2">
          Когда коллеги захотят обменяться с вами сменами, запросы появятся здесь
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {requests.map((request) => {
        const isPending = request.employeeResponse === null || request.employeeResponse === 'PENDING';
        const isExpanded = expandedId === request.id;

        return (
          <div
            key={request.id}
            className={`card p-4 border-l-4 ${
              isPending
                ? 'border-l-orange-500 bg-orange-50 dark:bg-orange-900/10'
                : request.employeeResponse === 'ACCEPTED'
                ? 'border-l-green-500'
                : 'border-l-red-500'
            }`}
          >
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    {request.user?.firstName} {request.user?.lastName}
                  </span>
                  <span className="text-gray-500 dark:text-gray-400">хочет обменяться с вами</span>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-gray-600 dark:text-gray-300">
                  <div>
                    <span className="font-medium">Смена:</span>{' '}
                    {safeFormat(request.startTime || request.shift?.startTime, 'dd.MM.yyyy HH:mm')} -{' '}
                    {safeFormat(request.endTime || request.shift?.endTime, 'HH:mm')}
                  </div>
                  <div>
                    <span className="font-medium">Тип:</span>{' '}
                    {request.type || request.shift?.type || '—'}
                  </div>
                  <div>
                    <span className="font-medium">Ресторан:</span>{' '}
                    {request.restaurant?.name || '—'}
                  </div>
                  <div>
                    <span className="font-medium">Запрошено:</span>{' '}
                    {safeFormat(request.requestedAt, 'dd.MM.yyyy HH:mm')}
                  </div>
                </div>

                {isExpanded && (
                  <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 text-sm">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-gray-600 dark:text-gray-300">
                      {request.user?.phone && (
                        <div>
                          <span className="font-medium">Телефон:</span> {request.user.phone}
                        </div>
                      )}
                      <div>
                        <span className="font-medium">Истекает:</span>{' '}
                        {safeFormat(request.expiresAt, 'dd.MM.yyyy HH:mm')}
                      </div>
                    </div>
                  </div>
                )}

                <button
                  onClick={() => setExpandedId(isExpanded ? null : request.id)}
                  className="mt-2 text-sm text-blue-500 hover:text-blue-600 flex items-center gap-1"
                >
                  {isExpanded ? (
                    <>
                      <ChevronUp className="w-4 h-4" /> Скрыть детали
                    </>
                  ) : (
                    <>
                      <ChevronDown className="w-4 h-4" /> Показать детали
                    </>
                  )}
                </button>
              </div>

              <div className="flex flex-col gap-2 min-w-[140px]">
                {isPending ? (
                  <>
                    <div className="flex items-center gap-1 text-orange-600 dark:text-orange-400 text-sm mb-2">
                      <Clock className="w-4 h-4" />
                      Ожидает ответа
                    </div>
                    <button
                      onClick={() => onRespond(request.id, true)}
                      className="btn-primary flex items-center justify-center gap-2"
                    >
                      <Check className="w-4 h-4" />
                      Принять
                    </button>
                    <button
                      onClick={() => onRespond(request.id, false)}
                      className="btn-secondary flex items-center justify-center gap-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                    >
                      <X className="w-4 h-4" />
                      Отклонить
                    </button>
                  </>
                ) : (
                  <span
                    className={`px-3 py-1 rounded-full text-sm font-medium text-center ${
                      statusColors[request.employeeResponse || request.status] || statusColors.PENDING
                    }`}
                  >
                    {request.employeeResponse === 'ACCEPTED'
                      ? 'Вы приняли'
                      : request.employeeResponse === 'REJECTED'
                      ? 'Вы отклонили'
                      : statusLabels[request.status] || request.status}
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Outgoing requests component - requests initiated by the user
function OutgoingRequestsList({
  requests,
  safeFormat,
}: {
  requests: SwapRequest[];
  safeFormat: (value: string | Date | undefined | null, pattern: string) => string;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (requests.length === 0) {
    return (
      <div className="card p-8 text-center">
        <ArrowLeftRight className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
        <p className="text-gray-500 dark:text-gray-400 text-lg">Нет исходящих запросов</p>
        <p className="text-gray-400 dark:text-gray-500 text-sm mt-2">
          Вы можете запросить обмен сменой на странице графика
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {requests.map((request) => {
        const isExpanded = expandedId === request.id;

        return (
          <div key={request.id} className="card p-4">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-gray-500 dark:text-gray-400">Запрос к</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    {request.swapTarget?.firstName} {request.swapTarget?.lastName}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-gray-600 dark:text-gray-300">
                  <div>
                    <span className="font-medium">Смена:</span>{' '}
                    {safeFormat(request.startTime || request.shift?.startTime, 'dd.MM.yyyy HH:mm')} -{' '}
                    {safeFormat(request.endTime || request.shift?.endTime, 'HH:mm')}
                  </div>
                  <div>
                    <span className="font-medium">Тип:</span>{' '}
                    {request.type || request.shift?.type || '—'}
                  </div>
                  <div>
                    <span className="font-medium">Ресторан:</span>{' '}
                    {request.restaurant?.name || '—'}
                  </div>
                  <div>
                    <span className="font-medium">Запрошено:</span>{' '}
                    {safeFormat(request.requestedAt, 'dd.MM.yyyy HH:mm')}
                  </div>
                </div>

                {isExpanded && (
                  <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 text-sm">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-gray-600 dark:text-gray-300">
                      <div>
                        <span className="font-medium">Истекает:</span>{' '}
                        {safeFormat(request.expiresAt, 'dd.MM.yyyy HH:mm')}
                      </div>
                      {request.respondedAt && (
                        <div>
                          <span className="font-medium">Ответ получен:</span>{' '}
                          {safeFormat(request.respondedAt, 'dd.MM.yyyy HH:mm')}
                        </div>
                      )}
                      {request.approvedAt && (
                        <div>
                          <span className="font-medium">Одобрено:</span>{' '}
                          {safeFormat(request.approvedAt, 'dd.MM.yyyy HH:mm')}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <button
                  onClick={() => setExpandedId(isExpanded ? null : request.id)}
                  className="mt-2 text-sm text-blue-500 hover:text-blue-600 flex items-center gap-1"
                >
                  {isExpanded ? (
                    <>
                      <ChevronUp className="w-4 h-4" /> Скрыть детали
                    </>
                  ) : (
                    <>
                      <ChevronDown className="w-4 h-4" /> Показать детали
                    </>
                  )}
                </button>
              </div>

              <div className="flex flex-col gap-2 min-w-[160px]">
                <span
                  className={`px-3 py-1 rounded-full text-sm font-medium text-center ${
                    statusColors[request.employeeResponse || request.status] || statusColors.PENDING
                  }`}
                >
                  {request.employeeResponse
                    ? request.employeeResponse === 'ACCEPTED'
                      ? 'Принят сотрудником'
                      : request.employeeResponse === 'REJECTED'
                      ? 'Отклонен сотрудником'
                      : statusLabels[request.employeeResponse]
                    : statusLabels[request.status] || request.status}
                </span>
                {request.status === 'APPROVED' && (
                  <span className="text-green-600 dark:text-green-400 text-sm text-center font-medium">
                    ✓ Обмен выполнен
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}


// Manager requests component - requests awaiting manager approval
function ManagerRequestsList({
  requests,
  onApprove,
  safeFormat,
}: {
  requests: SwapRequest[];
  onApprove: (id: string, approve: boolean) => void;
  safeFormat: (value: string | Date | undefined | null, pattern: string) => string;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Filter to show only requests that need manager action (accepted by employee)
  const pendingApproval = requests.filter((r) => r.employeeResponse === 'ACCEPTED');
  const otherRequests = requests.filter((r) => r.employeeResponse !== 'ACCEPTED');

  if (requests.length === 0) {
    return (
      <div className="card p-8 text-center">
        <ArrowLeftRight className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
        <p className="text-gray-500 dark:text-gray-400 text-lg">Нет запросов на одобрение</p>
        <p className="text-gray-400 dark:text-gray-500 text-sm mt-2">
          Когда сотрудники согласуют обмен между собой, запросы появятся здесь для вашего одобрения
        </p>
      </div>
    );
  }

  const renderRequest = (request: SwapRequest) => {
    const isExpanded = expandedId === request.id;
    const needsApproval = request.employeeResponse === 'ACCEPTED';

    return (
      <div
        key={request.id}
        className={`card p-4 border-l-4 ${
          needsApproval
            ? 'border-l-green-500 bg-green-50 dark:bg-green-900/10'
            : request.status === 'APPROVED'
            ? 'border-l-blue-500'
            : request.status === 'MANAGER_REJECTED'
            ? 'border-l-red-500'
            : 'border-l-gray-300'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="font-medium text-gray-900 dark:text-gray-100">
                {request.user?.firstName} {request.user?.lastName}
              </span>
              <span className="text-gray-500 dark:text-gray-400">↔</span>
              <span className="font-medium text-gray-900 dark:text-gray-100">
                {request.swapTarget?.firstName} {request.swapTarget?.lastName}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-gray-600 dark:text-gray-300">
              <div>
                <span className="font-medium">Смена:</span>{' '}
                {safeFormat(request.startTime || request.shift?.startTime, 'dd.MM.yyyy HH:mm')} -{' '}
                {safeFormat(request.endTime || request.shift?.endTime, 'HH:mm')}
              </div>
              <div>
                <span className="font-medium">Тип:</span>{' '}
                {request.type || request.shift?.type || '—'}
              </div>
              <div>
                <span className="font-medium">Ресторан:</span>{' '}
                {request.restaurant?.name || '—'}
              </div>
              <div>
                <span className="font-medium">Запрошено:</span>{' '}
                {safeFormat(request.requestedAt, 'dd.MM.yyyy HH:mm')}
              </div>
            </div>

            {needsApproval && (
              <div className="mt-2 flex items-center gap-2 text-green-600 dark:text-green-400 text-sm">
                <Check className="w-4 h-4" />
                Сотрудник принял запрос
              </div>
            )}

            {isExpanded && (
              <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 text-sm">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-gray-600 dark:text-gray-300">
                  <div>
                    <span className="font-medium">Истекает:</span>{' '}
                    {safeFormat(request.expiresAt, 'dd.MM.yyyy HH:mm')}
                  </div>
                  {request.respondedAt && (
                    <div>
                      <span className="font-medium">Ответ сотрудника:</span>{' '}
                      {safeFormat(request.respondedAt, 'dd.MM.yyyy HH:mm')}
                    </div>
                  )}
                  {request.approvedAt && (
                    <div>
                      <span className="font-medium">Решение менеджера:</span>{' '}
                      {safeFormat(request.approvedAt, 'dd.MM.yyyy HH:mm')}
                    </div>
                  )}
                </div>
              </div>
            )}

            <button
              onClick={() => setExpandedId(isExpanded ? null : request.id)}
              className="mt-2 text-sm text-blue-500 hover:text-blue-600 flex items-center gap-1"
            >
              {isExpanded ? (
                <>
                  <ChevronUp className="w-4 h-4" /> Скрыть детали
                </>
              ) : (
                <>
                  <ChevronDown className="w-4 h-4" /> Показать детали
                </>
              )}
            </button>
          </div>

          <div className="flex flex-col gap-2 min-w-[140px]">
            {needsApproval ? (
              <>
                <button
                  onClick={() => onApprove(request.id, true)}
                  className="btn-primary flex items-center justify-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  Одобрить
                </button>
                <button
                  onClick={() => onApprove(request.id, false)}
                  className="btn-secondary flex items-center justify-center gap-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                >
                  <X className="w-4 h-4" />
                  Отклонить
                </button>
              </>
            ) : (
              <span
                className={`px-3 py-1 rounded-full text-sm font-medium text-center ${
                  statusColors[request.status] || statusColors.PENDING
                }`}
              >
                {statusLabels[request.status] || request.status}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {pendingApproval.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5 text-green-500" />
            Ожидают одобрения ({pendingApproval.length})
          </h3>
          <div className="space-y-4">{pendingApproval.map(renderRequest)}</div>
        </div>
      )}

      {otherRequests.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Все запросы ({otherRequests.length})
          </h3>
          <div className="space-y-4">{otherRequests.map(renderRequest)}</div>
        </div>
      )}
    </div>
  );
}
