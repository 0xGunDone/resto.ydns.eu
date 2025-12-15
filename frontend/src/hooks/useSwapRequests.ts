import { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../utils/api';

interface UseSwapRequestsParams {
  selectedRestaurant: string;
  loadShifts: () => void;
}

export function useSwapRequests({ selectedRestaurant, loadShifts }: UseSwapRequestsParams) {
  const [swapRequests, setSwapRequests] = useState<any[]>([]);
  const [incomingSwapRequests, setIncomingSwapRequests] = useState<any[]>([]);
  const [swapHistory, setSwapHistory] = useState<any[]>([]);
  const cacheRef = useRef<{
    swap?: { data: any[]; ts: number };
    incoming?: { data: any[]; ts: number };
    history?: { data: any[]; ts: number };
  }>({});

  const shouldUseCache = (ts?: number, ttlMs = 60_000) => ts && Date.now() - ts < ttlMs;

  const pickList = (data: any, keys: string[]) => {
    if (Array.isArray(data)) return data;
    for (const k of keys) {
      if (Array.isArray(data?.[k])) return data[k];
    }
    return [];
  };

  const loadSwapRequests = async () => {
    try {
      if (shouldUseCache(cacheRef.current.swap?.ts)) {
        setSwapRequests(cacheRef.current.swap?.data || []);
      }
      const res = await api.get('/shifts/swap-requests', {
        params: { restaurantId: selectedRestaurant },
      });
      const data = pickList(res.data, ['requests', 'swapRequests', 'data']);
      cacheRef.current.swap = { data, ts: Date.now() };
      setSwapRequests(data);
    } catch (error: any) {
      console.error('Ошибка загрузки запросов на обмен:', error);
      toast.error('Ошибка загрузки запросов на обмен');
    }
  };

  const loadIncomingSwapRequests = async () => {
    try {
      if (shouldUseCache(cacheRef.current.incoming?.ts)) {
        setIncomingSwapRequests(cacheRef.current.incoming?.data || []);
      }
      const res = await api.get('/shifts/swap-requests/incoming', {
        params: { restaurantId: selectedRestaurant },
      });
      const data = pickList(res.data, ['requests', 'incoming', 'data']);
      cacheRef.current.incoming = { data, ts: Date.now() };
      setIncomingSwapRequests(data);
    } catch (error: any) {
      console.error('Ошибка загрузки входящих запросов на обмен:', error);
      toast.error('Ошибка загрузки входящих запросов');
    }
  };

  const loadSwapHistory = async () => {
    try {
      if (shouldUseCache(cacheRef.current.history?.ts, 120_000)) {
        setSwapHistory(cacheRef.current.history?.data || []);
      }
      const res = await api.get('/shifts/swap-history', {
        params: { restaurantId: selectedRestaurant },
      });
      const data = pickList(res.data, ['history', 'records', 'data']);
      cacheRef.current.history = { data, ts: Date.now() };
      setSwapHistory(data);
    } catch (error: any) {
      console.error('Ошибка загрузки истории обменов:', error);
      toast.error('Ошибка загрузки истории изменений');
    }
  };

  const handleSwapRequest = async (shiftId: string, swapTargetId: string) => {
    try {
      await api.post('/shifts/swap-request', {
        shiftId,
        swapTargetId,
        restaurantId: selectedRestaurant,
      });
      toast.success('Запрос на обмен отправлен');
      loadSwapRequests();
      loadIncomingSwapRequests();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Ошибка при отправке запроса на обмен');
    }
  };

  const handleRespondToSwap = async (requestId: string, accept: boolean) => {
    try {
      await api.post(`/shifts/swap-requests/${requestId}/respond`, { accept });
      toast.success(accept ? 'Вы приняли запрос' : 'Вы отклонили запрос');
      loadIncomingSwapRequests();
      loadSwapRequests();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Ошибка ответа на запрос обмена');
    }
  };

  const handleApproveSwap = async (requestId: string, approve: boolean) => {
    try {
      await api.post(`/shifts/swap-requests/${requestId}/approve`, { approve });
      toast.success(approve ? 'Обмен одобрен' : 'Обмен отклонен');
      loadSwapRequests();
      loadIncomingSwapRequests();
      loadSwapHistory();
      loadShifts();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Ошибка подтверждения обмена');
    }
  };

  return {
    swapRequests,
    incomingSwapRequests,
    swapHistory,
    setSwapRequests,
    setIncomingSwapRequests,
    setSwapHistory,
    loadSwapRequests,
    loadIncomingSwapRequests,
    loadSwapHistory,
    handleSwapRequest,
    handleRespondToSwap,
    handleApproveSwap,
  };
}

