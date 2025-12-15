import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/authStore';
import Navbar from '../components/Navbar';
import BonusPenaltyModal from '../components/BonusPenaltyModal';
import { usePermissions } from '../hooks/usePermissions';
import { FileText, ChevronRight, ChevronDown, TrendingUp, FileSpreadsheet, Filter, ChevronsUp } from 'lucide-react';

interface ShiftSummary {
  templateId: string;
  templateName: string;
  count: number;
  rate: number;
  bonusPerShift: number;
  totalEarnings: number;
}

interface TimesheetDetailData {
  employee: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string | null;
    position: {
      id: string;
      name: string;
      bonusPerShift: number;
    };
  };
  period: {
    month: number;
    year: number;
    startDate: string;
    endDate: string;
  };
  shifts: ShiftSummary[];
  totalShifts: number;
  totalEarnings: number;
}

interface SummaryEmployee {
  employee: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string | null;
    position: {
      id: string;
      name: string;
      bonusPerShift: number;
    };
  };
  totalShifts: number;
  totalEarnings: number;
  bonusesTotal?: number;
  penaltiesTotal?: number;
  netEarnings?: number;
}

interface TimesheetSummaryData {
  period: {
    month: number;
    year: number;
    startDate: string;
    endDate: string;
  };
  summary: SummaryEmployee[];
  totalEmployees: number;
  totalShifts: number;
  totalEarnings: number;
  totalBonuses?: number;
  totalPenalties?: number;
  totalNet?: number;
}

export default function TimesheetPage() {
  const { user } = useAuthStore();
  const [restaurants, setRestaurants] = useState<any[]>([]);
  const [selectedRestaurant, setSelectedRestaurant] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [summaryData, setSummaryData] = useState<TimesheetSummaryData | null>(null);
  const [detailData, setDetailData] = useState<TimesheetDetailData | null>(null);
  const [expandedEmployees, setExpandedEmployees] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState<string | null>(null);
  const [bonuses, setBonuses] = useState<any[]>([]);
  const [penalties, setPenalties] = useState<any[]>([]);
  const [exportError, setExportError] = useState<{ target: 'excel' | 'pdf'; message: string } | null>(null);
  const [exportLoading, setExportLoading] = useState<'' | 'excel' | 'pdf'>('');
  const [bonusPenaltyModal, setBonusPenaltyModal] = useState<{
    isOpen: boolean;
    employeeId: string;
    employeeName: string;
  }>({
    isOpen: false,
    employeeId: '',
    employeeName: '',
  });

  const { hasPermission } = usePermissions(selectedRestaurant);
  const canEditTimesheets = hasPermission('EDIT_TIMESHEETS');

  useEffect(() => {
    loadRestaurants();
  }, []);

  useEffect(() => {
    if (selectedRestaurant && selectedMonth && selectedYear) {
      loadSummary();
    } else {
      setSummaryData(null);
      setDetailData(null);
      setExpandedEmployees(new Set());
    }
  }, [selectedRestaurant, selectedMonth, selectedYear]);

  const loadRestaurants = async () => {
    try {
      const response = await api.get('/restaurants');
      setRestaurants(response.data.restaurants || []);
      if (response.data.restaurants?.length > 0) {
        setSelectedRestaurant(response.data.restaurants[0].id);
      }
    } catch (error: any) {
      toast.error('Ошибка загрузки ресторанов');
    }
  };

  const loadSummary = async () => {
    try {
      setLoading(true);
      const response = await api.get('/timesheets/summary', {
        params: {
          restaurantId: selectedRestaurant,
          month: selectedMonth,
          year: selectedYear,
        },
      });
      setSummaryData(response.data);
      // Сбрасываем детализацию при загрузке новой сводки
      setDetailData(null);
      setExpandedEmployees(new Set());
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Ошибка загрузки сводки табелей');
      setSummaryData(null);
    } finally {
      setLoading(false);
    }
  };

  const loadDetail = async (employeeId: string) => {
    if (expandedEmployees.has(employeeId)) {
      // Сворачиваем
      setExpandedEmployees((prev) => {
        const newSet = new Set(prev);
        newSet.delete(employeeId);
        return newSet;
      });
      setDetailData(null);
      return;
    }

    try {
      setLoadingDetail(employeeId);
      const response = await api.get('/timesheets/earnings', {
        params: {
          restaurantId: selectedRestaurant,
          userId: employeeId,
          month: selectedMonth,
          year: selectedYear,
        },
      });
      setDetailData(response.data);
      // Разворачиваем
      setExpandedEmployees((prev) => new Set(prev).add(employeeId));
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Ошибка загрузки детализации');
    } finally {
      setLoadingDetail(null);
    }
  };

  const loadBonuses = async (employeeId: string) => {
    try {
      const response = await api.get('/bonuses', {
        params: {
          restaurantId: selectedRestaurant,
          userId: employeeId,
          month: selectedMonth,
          year: selectedYear,
        },
      });
      return response.data.bonuses || [];
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Ошибка загрузки премий');
      return [];
    }
  };

  const loadPenalties = async (employeeId: string) => {
    try {
      const response = await api.get('/penalties', {
        params: {
          restaurantId: selectedRestaurant,
          userId: employeeId,
          month: selectedMonth,
          year: selectedYear,
        },
      });
      return response.data.penalties || [];
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Ошибка загрузки штрафов');
      return [];
    }
  };

  const handleOpenBonusPenaltyModal = async (employeeId: string, employeeName: string) => {
    setBonusPenaltyModal({
      isOpen: true,
      employeeId,
      employeeName,
    });
    const bonusesData = await loadBonuses(employeeId);
    const penaltiesData = await loadPenalties(employeeId);
    setBonuses(bonusesData);
    setPenalties(penaltiesData);
  };

  const handleAddBonus = async (data: {
    userId: string;
    restaurantId: string;
    amount: number;
    comment?: string;
    month: number;
    year: number;
  }) => {
    try {
      const payload: any = {
        userId: data.userId,
        restaurantId: data.restaurantId,
        amount: data.amount,
        month: data.month,
        year: data.year,
      };
      if (data.comment && data.comment.trim()) {
        payload.comment = data.comment.trim();
      }
      await api.post('/bonuses', payload);
      toast.success('Премия добавлена');
      const bonusesData = await loadBonuses(data.userId);
      setBonuses(bonusesData);
      loadSummary(); // Обновляем сводку
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Ошибка добавления премии');
      throw error;
    }
  };

  const handleAddPenalty = async (data: {
    userId: string;
    restaurantId: string;
    amount: number;
    comment?: string;
    month: number;
    year: number;
  }) => {
    try {
      const payload: any = {
        userId: data.userId,
        restaurantId: data.restaurantId,
        amount: data.amount,
        month: data.month,
        year: data.year,
      };
      if (data.comment && data.comment.trim()) {
        payload.comment = data.comment.trim();
      }
      await api.post('/penalties', payload);
      toast.success('Штраф добавлен');
      const penaltiesData = await loadPenalties(data.userId);
      setPenalties(penaltiesData);
      loadSummary(); // Обновляем сводку
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Ошибка добавления штрафа');
      throw error;
    }
  };

  const handleDeleteBonus = async (id: string) => {
    try {
      await api.delete(`/bonuses/${id}`);
      toast.success('Премия удалена');
      const bonusesData = await loadBonuses(bonusPenaltyModal.employeeId);
      setBonuses(bonusesData);
      loadSummary(); // Обновляем сводку
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Ошибка удаления премии');
    }
  };

  const handleDeletePenalty = async (id: string) => {
    try {
      await api.delete(`/penalties/${id}`);
      toast.success('Штраф удален');
      const penaltiesData = await loadPenalties(bonusPenaltyModal.employeeId);
      setPenalties(penaltiesData);
      loadSummary(); // Обновляем сводку
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Ошибка удаления штрафа');
    }
  };

  const handleReloadBonusesPenalties = async () => {
    if (bonusPenaltyModal.employeeId) {
      const bonusesData = await loadBonuses(bonusPenaltyModal.employeeId);
      const penaltiesData = await loadPenalties(bonusPenaltyModal.employeeId);
      setBonuses(bonusesData);
      setPenalties(penaltiesData);
    }
  };

  const handleExportExcel = async () => {
    try {
      setExportError(null);
      setExportLoading('excel');
      if (!selectedRestaurant || !selectedMonth || !selectedYear) {
        toast.error('Выберите ресторан, месяц и год');
        return;
      }

      const response = await api.get('/timesheets/export/excel', {
        params: {
          restaurantId: selectedRestaurant,
          month: selectedMonth,
          year: selectedYear,
        },
        responseType: 'blob',
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `табель-${monthNames[selectedMonth - 1]}-${selectedYear}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      toast.success('Экспорт в Excel выполнен успешно');
    } catch (error: any) {
      const msg = error.response?.data?.error || 'Ошибка экспорта в Excel';
      setExportError({ target: 'excel', message: msg });
      toast.error(msg);
    } finally {
      setExportLoading('');
    }
  };

  const handleExportPDF = async () => {
    try {
      setExportError(null);
      setExportLoading('pdf');
      if (!selectedRestaurant || !selectedMonth || !selectedYear) {
        toast.error('Выберите ресторан, месяц и год');
        return;
      }

      const response = await api.get('/timesheets/export/pdf', {
        params: {
          restaurantId: selectedRestaurant,
          month: selectedMonth,
          year: selectedYear,
        },
        responseType: 'blob',
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `табель-${monthNames[selectedMonth - 1]}-${selectedYear}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      toast.success('Экспорт в PDF выполнен успешно');
    } catch (error: any) {
      const msg = error.response?.data?.error || 'Ошибка экспорта в PDF';
      setExportError({ target: 'pdf', message: msg });
      toast.error(msg);
    } finally {
      setExportLoading('');
    }
  };

  const monthNames = [
    'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
    'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 transition-colors">
      <Navbar />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
        <div className="mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">
            Табель заработной платы
            </h1>
            <div className="flex flex-col sm:flex-row gap-2">
              <button
                onClick={() => setShowFilters((v) => !v)}
                className="btn-secondary flex items-center gap-2 justify-center"
              >
                <Filter className="w-4 h-4" />
                {showFilters ? 'Скрыть фильтры' : 'Показать фильтры'}
              </button>
              <button
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                className="btn-secondary flex items-center gap-2 justify-center"
              >
                <ChevronsUp className="w-4 h-4" />
                Наверх
              </button>
            </div>
          </div>
          <p className="text-gray-600 dark:text-gray-400">Расчет заработка по типам смен</p>
        </div>

        {/* Фильтры */}
        {showFilters && (
          <div className="card p-4 sm:p-6 mb-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Ресторан
                </label>
                <select
                  value={selectedRestaurant}
                  onChange={(e) => {
                    setSelectedRestaurant(e.target.value);
                  }}
                  className="select"
                  disabled={user?.role === 'EMPLOYEE'}
                >
                  <option value="">Выберите ресторан</option>
                  {restaurants.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Месяц
                </label>
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                  className="select"
                >
                  {monthNames.map((name, index) => (
                    <option key={index + 1} value={index + 1}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Год
                </label>
                <input
                  type="number"
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                  className="input"
                  min="2020"
                  max="2100"
                />
              </div>
            </div>
          </div>
        )}

        {/* Загрузка */}
        {loading && (
          <div className="card p-8 text-center">
            <div className="text-gray-500">Загрузка табелей...</div>
          </div>
        )}

        {/* Сводка по всем сотрудникам */}
        {!loading && summaryData && (
          <div className="space-y-6">
            {/* Общая информация */}
            <div className="card p-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900 mb-2">
                    Сводка за {monthNames[summaryData.period.month - 1]} {summaryData.period.year}
                  </h2>
                  <p className="text-sm text-gray-600">
                    Всего сотрудников: {summaryData.totalEmployees}
                  </p>
                  {exportError && (
                    <div className="mt-2 p-3 rounded-lg border border-red-200 bg-red-50 text-sm text-red-800 flex flex-wrap items-center gap-2">
                      <span>Ошибка экспорта ({exportError.target.toUpperCase()}): {exportError.message}</span>
                      <button
                        onClick={() => {
                          if (exportError.target === 'excel') handleExportExcel();
                          else handleExportPDF();
                        }}
                        className="btn-secondary btn-sm"
                      >
                        Повторить
                      </button>
                      <button
                        onClick={() => setExportError(null)}
                        className="text-xs text-red-600 hover:text-red-800"
                      >
                        Скрыть
                      </button>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-6">
                  <div className="flex gap-6">
                    <div className="text-center">
                      <p className="text-sm text-gray-600">Всего смен</p>
                      <p className="text-2xl font-bold text-gray-900">{summaryData.totalShifts}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm text-gray-600">Премии</p>
                      <p className="text-xl font-bold text-green-600">
                        {(summaryData.totalBonuses || 0).toFixed(2)} ₽
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm text-gray-600">Штрафы</p>
                      <p className="text-xl font-bold text-red-600">
                        {(summaryData.totalPenalties || 0).toFixed(2)} ₽
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm text-gray-600">Итого с учетом</p>
                      <p className="text-2xl font-bold text-green-700">
                        {(summaryData.totalNet ?? summaryData.totalEarnings).toFixed(2)} ₽
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleExportExcel}
                      className={`px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2 text-sm ${exportLoading === 'excel' ? 'opacity-70 cursor-wait' : ''}`}
                      disabled={exportLoading === 'excel' || exportLoading === 'pdf'}
                      title="Экспорт в Excel"
                    >
                      <FileSpreadsheet className="w-4 h-4" />
                      {exportLoading === 'excel' ? 'Экспорт...' : 'Excel'}
                    </button>
                    <button
                      onClick={handleExportPDF}
                      className={`px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2 text-sm ${exportLoading === 'pdf' ? 'opacity-70 cursor-wait' : ''}`}
                      disabled={exportLoading === 'excel' || exportLoading === 'pdf'}
                      title="Экспорт в PDF"
                    >
                      <FileText className="w-4 h-4" />
                      {exportLoading === 'pdf' ? 'Экспорт...' : 'PDF'}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Таблица сводки */}
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-10">
                        <span className="sr-only">Развернуть</span>
                      </th>
                      <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Сотрудник
                      </th>
                      <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Должность
                      </th>
                      <th className="px-4 sm:px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Смен
                      </th>
                      <th className="px-4 sm:px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Заработок (₽)
                      </th>
                      <th className="px-4 sm:px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Премии (₽)
                      </th>
                      <th className="px-4 sm:px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Штрафы (₽)
                      </th>
                      <th className="px-4 sm:px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Итого (₽)
                      </th>
                      {canEditTimesheets && (
                        <th className="px-4 sm:px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Действия
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {summaryData.summary.length === 0 ? (
                      <tr>
                        <td colSpan={canEditTimesheets ? 9 : 8} className="px-4 sm:px-6 py-8 text-center text-gray-500">
                          Нет сотрудников с сменами за выбранный период
                        </td>
                      </tr>
                    ) : (
                      summaryData.summary.map((item) => {
                        const isExpanded = expandedEmployees.has(item.employee.id);
                        const isDetailForThisEmployee = detailData?.employee.id === item.employee.id;
                        
                        return (
                          <React.Fragment key={item.employee.id}>
                            <tr 
                              className="hover:bg-gray-50 cursor-pointer transition-colors"
                              onClick={() => loadDetail(item.employee.id)}
                            >
                              <td className="px-4 sm:px-6 py-4 whitespace-nowrap">
                                {loadingDetail === item.employee.id ? (
                                  <div className="w-5 h-5 border-2 border-gray-300 border-t-primary-600 rounded-full animate-spin"></div>
                                ) : isExpanded ? (
                                  <ChevronDown className="w-5 h-5 text-gray-400" />
                                ) : (
                                  <ChevronRight className="w-5 h-5 text-gray-400" />
                                )}
                              </td>
                              <td className="px-4 sm:px-6 py-4 whitespace-nowrap">
                                <div className="text-sm font-medium text-gray-900">
                                  {item.employee.lastName} {item.employee.firstName}
                                </div>
                                {item.employee.phone && (
                                  <div className="text-sm text-gray-500">{item.employee.phone}</div>
                                )}
                              </td>
                              <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                {item.employee.position.name}
                              </td>
                              <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
                                {item.totalShifts}
                              </td>
                              <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900 text-right">
                                {item.totalEarnings.toFixed(2)}
                              </td>
                              <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-green-700 text-right">
                                {(item.bonusesTotal || 0).toFixed(2)}
                              </td>
                              <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-red-700 text-right">
                                {(item.penaltiesTotal || 0).toFixed(2)}
                              </td>
                              <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900 text-right">
                                {(item.netEarnings ?? item.totalEarnings).toFixed(2)}
                              </td>
                              {canEditTimesheets && (
                                <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-center">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleOpenBonusPenaltyModal(
                                        item.employee.id,
                                        `${item.employee.lastName} ${item.employee.firstName}`
                                      );
                                    }}
                                    className="px-3 py-1.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm flex items-center gap-1.5"
                                    title="Премии и штрафы"
                                  >
                                    <TrendingUp className="w-4 h-4" />
                                    <span className="hidden sm:inline">Премии/Штрафы</span>
                                  </button>
                                </td>
                              )}
                            </tr>
                            
                            {/* Детализация */}
                            {isExpanded && isDetailForThisEmployee && detailData && (
                              <tr>
                                <td colSpan={canEditTimesheets ? 9 : 8} className="px-4 sm:px-6 py-4 bg-gray-50">
                                  <div className="pl-4 sm:pl-8">
                                    <h4 className="text-sm font-semibold text-gray-900 mb-3">
                                      Детализация по типам смен
                                    </h4>
                                    <div className="overflow-x-auto">
                                      <table className="min-w-full divide-y divide-gray-200">
                                        <thead className="bg-white">
                                          <tr>
                                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                                              Тип смены
                                            </th>
                                            <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">
                                              Количество
                                            </th>
                                            <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                                              Ставка (₽)
                                            </th>
                                            <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                                              Надбавка (₽)
                                            </th>
                                            <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                                              Итого (₽)
                                            </th>
                                          </tr>
                                        </thead>
                                        <tbody className="bg-white divide-y divide-gray-200">
                                          {detailData.shifts.length === 0 ? (
                                            <tr>
                                              <td colSpan={5} className="px-4 py-4 text-center text-sm text-gray-500">
                                                Нет смен за выбранный период
                                              </td>
                                            </tr>
                                          ) : (
                                            detailData.shifts.map((shift) => (
                                              <tr key={shift.templateId} className="hover:bg-gray-50">
                                                <td className="px-4 py-2 text-sm text-gray-900">
                                                  {shift.templateName}
                                                </td>
                                                <td className="px-4 py-2 text-sm text-gray-500 text-center">
                                                  {shift.count}
                                                </td>
                                                <td className="px-4 py-2 text-sm text-gray-500 text-right">
                                                  {shift.rate.toFixed(2)}
                                                </td>
                                                <td className="px-4 py-2 text-sm text-gray-500 text-right">
                                                  {shift.bonusPerShift.toFixed(2)}
                                                </td>
                                                <td className="px-4 py-2 text-sm font-semibold text-gray-900 text-right">
                                                  {shift.totalEarnings.toFixed(2)}
                                                </td>
                                              </tr>
                                            ))
                                          )}
                                        </tbody>
                                        <tfoot className="bg-gray-100">
                                          <tr>
                                            <td colSpan={4} className="px-4 py-2 text-right text-sm font-bold text-gray-900">
                                              Итого:
                                            </td>
                                            <td className="px-4 py-2 text-right text-sm font-bold text-green-600">
                                              {detailData.totalEarnings.toFixed(2)} ₽
                                            </td>
                                          </tr>
                                        </tfoot>
                                      </table>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })
                    )}
                  </tbody>
                  <tfoot className="bg-gray-50">
                    <tr>
                      <td colSpan={4} className="px-4 sm:px-6 py-4 text-right text-sm font-bold text-gray-900">
                        Итого:
                      </td>
                      <td className="px-4 sm:px-6 py-4 text-right text-sm font-bold text-gray-900">
                        {summaryData.totalEarnings.toFixed(2)} ₽
                      </td>
                      <td className="px-4 sm:px-6 py-4 text-right text-sm font-bold text-green-700">
                        {(summaryData.totalBonuses || 0).toFixed(2)} ₽
                      </td>
                      <td className="px-4 sm:px-6 py-4 text-right text-sm font-bold text-red-700">
                        {(summaryData.totalPenalties || 0).toFixed(2)} ₽
                      </td>
                      <td className="px-4 sm:px-6 py-4 text-right text-lg font-bold text-green-700">
                        {(summaryData.totalNet ?? (summaryData.totalEarnings + (summaryData.totalBonuses || 0) - (summaryData.totalPenalties || 0))).toFixed(2)} ₽
                      </td>
                      {canEditTimesheets && <td></td>}
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Пустой стейт при отсутствии данных */}
        {!loading && selectedRestaurant && !summaryData && (
          <div className="card p-6 text-center text-gray-700 dark:text-gray-200">
            <div className="text-lg font-semibold mb-2">Нет данных за выбранный период</div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Выберите другой период или убедитесь, что за выбранное время есть смены.
            </p>
            <button
              onClick={() => setShowFilters(true)}
              className="btn-secondary inline-flex items-center gap-2 justify-center"
            >
              <Filter className="w-4 h-4" />
              Открыть фильтры
            </button>
          </div>
        )}

        {!loading && !summaryData && selectedRestaurant && (
          <div className="card p-8 text-center">
            <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500">Нет данных за выбранный период</p>
          </div>
        )}

        {/* Модальное окно премий и штрафов */}
        <BonusPenaltyModal
          isOpen={bonusPenaltyModal.isOpen}
          onClose={() => {
            setBonusPenaltyModal({ isOpen: false, employeeId: '', employeeName: '' });
            setBonuses([]);
            setPenalties([]);
          }}
          employeeId={bonusPenaltyModal.employeeId}
          employeeName={bonusPenaltyModal.employeeName}
          restaurantId={selectedRestaurant}
          month={selectedMonth}
          year={selectedYear}
          bonuses={bonuses}
          penalties={penalties}
          onReload={handleReloadBonusesPenalties}
          onAddBonus={handleAddBonus}
          onAddPenalty={handleAddPenalty}
          onDeleteBonus={handleDeleteBonus}
          onDeletePenalty={handleDeletePenalty}
          canEdit={canEditTimesheets}
        />
      </div>
    </div>
  );
}
