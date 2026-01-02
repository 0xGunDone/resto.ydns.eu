import { useState, useEffect, useMemo } from 'react';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/authStore';
import Navbar from '../components/Navbar';
import FloatingActionButton from '../components/FloatingActionButton';
import HolidayModal from '../components/HolidayModal';
import { useSwipe } from '../hooks/useSwipe';
import React from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, addMonths, startOfWeek, endOfWeek, addDays } from 'date-fns';
import { Calendar, Copy, X, AlertCircle } from 'lucide-react';
import { momentLocalizer, View } from 'react-big-calendar';
import moment from 'moment';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import 'moment/locale/ru';
import SwapRequestsBlock from '../components/schedule/SwapRequestsBlock';
import IncomingSwapRequestsBlock from '../components/schedule/IncomingSwapRequestsBlock';
import ChangeHistoryBlock from '../components/schedule/ChangeHistoryBlock';
import EditShiftModal from '../components/schedule/modals/EditShiftModal';
import SwapRequestModal from '../components/schedule/modals/SwapRequestModal';
import SaveTemplateModal from '../components/schedule/modals/SaveTemplateModal';
import ApplyTemplateModal from '../components/schedule/modals/ApplyTemplateModal';
import { Shift, ShiftTemplate } from '../components/schedule/types';
import { useSwapRequests } from '../hooks/useSwapRequests';
import ScheduleCalendarView from '../components/schedule/ScheduleCalendarView';
import ScheduleLegend from '../components/schedule/ScheduleLegend';
import ScheduleTable from '../components/schedule/ScheduleTable';
import ScheduleHeader from '../components/schedule/ScheduleHeader';
import ScheduleFilters from '../components/schedule/ScheduleFilters';
import ScheduleMultiSelect from '../components/schedule/ScheduleMultiSelect';
import ScheduleBulkHolidays from '../components/schedule/ScheduleBulkHolidays';
import api from '../utils/api';

interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  position: string | null;
}

export default function SchedulePage() {
  const { user } = useAuthStore();
  const [restaurants, setRestaurants] = useState<any[]>([]);
  const [selectedRestaurant, setSelectedRestaurant] = useState<string>('');
  const [employees, setEmployees] = useState<Record<string, Record<string, Employee[]>>>({});
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [templates, setTemplates] = useState<ShiftTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [departments, setDepartments] = useState<any[]>([]);
  const [positions, setPositions] = useState<any[]>([]);
  const [selectedDepartment, setSelectedDepartment] = useState<string>('');
  const [selectedPosition, setSelectedPosition] = useState<string>('');
  
  // Фильтр периода
  const [period, setPeriod] = useState<'week' | 'month' | 'custom'>('month');

  // Исправляем проблему с часовыми поясами - создаем даты в локальном времени
  const getCurrentMonthDates = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const start = new Date(year, month, 1); // 1-е число текущего месяца
    const end = new Date(year, month + 1, 0, 23, 59, 59, 999); // Последнее число текущего месяца, конец дня
    return { start, end };
  };

  const [startDate, setStartDate] = useState(() => getCurrentMonthDates().start);
  const [endDate, setEndDate] = useState(() => getCurrentMonthDates().end);
  
  // Мультивыбор
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());
  const [selectedShiftType, setSelectedShiftType] = useState<string>('');
  
  // Обмен сменами
  const [showSwapModal, setShowSwapModal] = useState(false);
  const [selectedShiftForSwap, setSelectedShiftForSwap] = useState<Shift | null>(null);
  
  // Редактирование смены
  const [showEditShiftModal, setShowEditShiftModal] = useState(false);
  const [editingShift, setEditingShift] = useState<Shift | null>(null);
  const [showSwapRequests, setShowSwapRequests] = useState(false);
  const [showIncomingSwapRequests, setShowIncomingSwapRequests] = useState(false);
  const [showSwapHistory, setShowSwapHistory] = useState(false);
  const [allEmployeesList, setAllEmployeesList] = useState<any[]>([]);
  const [isRestaurantManager, setIsRestaurantManager] = useState(false);
  const [userPermissions, setUserPermissions] = useState<string[]>([]);
  
  // Проверка права на запрос обмена сменами
  const hasRequestShiftSwap = useMemo(() => {
    if (!user || !selectedRestaurant) return false;
    if (user.role === 'OWNER' || user.role === 'ADMIN') return true;
    return userPermissions.includes('REQUEST_SHIFT_SWAP');
  }, [user, selectedRestaurant, userPermissions]);

  // Шаблоны графиков
  const [scheduleTemplates, setScheduleTemplates] = useState<any[]>([]);
  const [showSaveTemplateModal, setShowSaveTemplateModal] = useState(false);
  const [showApplyTemplateModal, setShowApplyTemplateModal] = useState(false);

  // Праздники и выходные
  const [holidays, setHolidays] = useState<any[]>([]);
  const [showHolidayModal, setShowHolidayModal] = useState(false);
  const [editingHoliday, setEditingHoliday] = useState<any | null>(null);
  const [clipboardShifts, setClipboardShifts] = useState<Shift[]>([]);
  const [clipboardBaseDate, setClipboardBaseDate] = useState<Date | null>(null);
  const [pasteDate, setPasteDate] = useState<string>('');
  const [showOnlyMyShifts, setShowOnlyMyShifts] = useState(false);
  const [bulkHolidayStart, setBulkHolidayStart] = useState('');
  const [bulkHolidayEnd, setBulkHolidayEnd] = useState('');
  const [bulkHolidayType, setBulkHolidayType] = useState<'HOLIDAY' | 'WEEKEND'>('HOLIDAY');
  const [bulkHolidayName, setBulkHolidayName] = useState('');
  const [bulkHolidayLoading, setBulkHolidayLoading] = useState(false);
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  // Вид отображения (таблица/календарь)
  const [viewMode, setViewMode] = useState<'table' | 'calendar'>('table');
  const [calendarView, setCalendarView] = useState<View>('month');
  const [calendarDate, setCalendarDate] = useState(new Date());
  const handleScrollTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });

  // Локализация для календаря
  moment.locale('ru');
  const localizer = momentLocalizer(moment);
  
  // Кастомные стили для календаря
  const calendarStyle = `
    .rbc-calendar {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
      font-size: 14px;
    }
    .rbc-header {
      padding: 12px 8px;
      font-weight: 600;
      color: #374151;
      border-bottom: 2px solid #e5e7eb;
      background-color: #f9fafb;
    }
    .rbc-today {
      background-color: #eff6ff;
    }
    .rbc-off-range-bg {
      background-color: #f9fafb;
    }
    .rbc-event {
      border-radius: 6px;
      padding: 4px 8px;
      font-size: 13px;
      font-weight: 500;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
      transition: all 0.2s ease;
    }
    .rbc-event:hover {
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.15);
      transform: translateY(-1px);
    }
    .rbc-event-content {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .rbc-toolbar {
      margin-bottom: 20px;
    }
    .rbc-toolbar button {
      color: #374151;
      border: 1px solid #d1d5db;
      background-color: white;
      padding: 8px 16px;
      border-radius: 6px;
      font-weight: 500;
      transition: all 0.2s ease;
    }
    .rbc-toolbar button:hover {
      background-color: #f3f4f6;
      border-color: #9ca3af;
    }
    .rbc-toolbar button.rbc-active {
      background-color: #3b82f6;
      color: white;
      border-color: #3b82f6;
    }
    .rbc-toolbar-label {
      font-weight: 600;
      font-size: 18px;
      color: #111827;
    }
    .rbc-time-slot {
      border-top: 1px solid #e5e7eb;
    }
    .rbc-time-header-content {
      border-left: 1px solid #e5e7eb;
    }
    .rbc-day-slot .rbc-time-slot {
      border-top: 1px solid #f3f4f6;
    }
    .rbc-current-time-indicator {
      background-color: #ef4444;
      height: 2px;
    }
  `;

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    if (selectedRestaurant) {
      loadDepartments();
      loadPositions();
    }
  }, [selectedRestaurant]);

  useEffect(() => {
      if (selectedRestaurant) {
        loadEmployees();
        loadShifts();
        loadUserPermissions();
        if (user?.role === 'MANAGER' || user?.role === 'OWNER' || user?.role === 'ADMIN' || isRestaurantManager) {
          loadSwapRequests();
        }
      // Загружаем входящие запросы для всех пользователей
      loadIncomingSwapRequests();
      // Загружаем праздники и выходные
      loadHolidays();
    }
  }, [selectedRestaurant, startDate, endDate, selectedDepartment, selectedPosition, showOnlyMyShifts]);

  const loadUserPermissions = async () => {
    try {
      if (!selectedRestaurant || !user) return;
      
      // OWNER и ADMIN имеют все права
      if (user.role === 'OWNER' || user.role === 'ADMIN') {
        setUserPermissions(['EDIT_SCHEDULE', 'VIEW_SCHEDULE']); // Все права
        return;
      }

      const response = await api.get(`/permissions/user/${user.id}`, {
        params: { restaurantId: selectedRestaurant },
      });
      const permissions = response.data.permissions || [];
      setUserPermissions(permissions);
    } catch (error: any) {
      console.error('Ошибка загрузки прав:', error);
      setUserPermissions([]);
    }
  };

  // Проверка прав на редактирование графика
  const hasEditSchedule = useMemo(() => {
    if (!user || !selectedRestaurant) return false;
    if (user.role === 'OWNER' || user.role === 'ADMIN') return true;
    return userPermissions.includes('EDIT_SCHEDULE');
  }, [user, selectedRestaurant, userPermissions]);

  const loadInitialData = async () => {
    try {
      setLoading(true);
      const restaurantsRes = await api.get('/restaurants');
      const restaurantsData = restaurantsRes.data.restaurants || [];
      setRestaurants(restaurantsData);
      if (restaurantsData.length > 0) {
        setSelectedRestaurant(restaurantsData[0].id);
        // Проверяем, является ли пользователь менеджером первого ресторана
        const firstRestaurant = restaurantsData[0];
        setIsRestaurantManager((firstRestaurant.managerId === user?.id) || (firstRestaurant.manager?.id === user?.id));
      }
    } catch (error: any) {
      toast.error('Ошибка загрузки данных');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const loadTemplates = async () => {
    try {
      const params: any = {};
      if (selectedRestaurant) {
        params.restaurantId = selectedRestaurant;
      }
      const response = await api.get('/shift-templates', { params });
      const loadedTemplates = response.data.templates || [];
      setTemplates(loadedTemplates);
      // Автоматически выбираем первый шаблон, если доступен
      if (loadedTemplates.length > 0 && !selectedShiftType) {
        setSelectedShiftType(loadedTemplates[0].id);
      }
    } catch (error: any) {
      console.error('Ошибка загрузки шаблонов смен:', error);
    }
  };

  useEffect(() => {
    if (selectedRestaurant) {
      setSelectedShiftType(''); // Сбрасываем выбор при смене ресторана
      loadTemplates();
      // Проверяем, является ли пользователь менеджером выбранного ресторана
      const restaurant = restaurants.find(r => r.id === selectedRestaurant);
      setIsRestaurantManager((restaurant?.managerId === user?.id) || (restaurant?.manager?.id === user?.id));
    }
  }, [selectedRestaurant, restaurants, user]);

  const loadEmployees = async () => {
    try {
      const response = await api.get(`/restaurants/${selectedRestaurant}/employees`);
      const allEmployeesData = response.data.allEmployees || [];
      
      console.log('Loaded employees:', allEmployeesData.length, allEmployeesData);
      
      // Фильтруем по отделу и должности
      let filteredEmployees = allEmployeesData;
      
      if (selectedDepartment) {
        filteredEmployees = filteredEmployees.filter((emp: any) => 
          emp.departmentId === selectedDepartment
        );
      }
      
      if (selectedPosition) {
        filteredEmployees = filteredEmployees.filter((emp: any) => 
          emp.positionId === selectedPosition
        );
      }

      if (showOnlyMyShifts && user?.id) {
        filteredEmployees = filteredEmployees.filter((emp: any) => emp.id === user.id);
      }
      
      console.log('Filtered employees:', filteredEmployees.length, filteredEmployees);
      
      // Группируем по positionId (ключ — позиция, внутри — департаменты)
      const grouped: Record<string, Record<string, any[]>> = {};
      filteredEmployees.forEach((emp: any) => {
        const posKey = emp.positionId || 'unknown';
        const deptKey = emp.departmentId || 'default';

        if (!grouped[posKey]) grouped[posKey] = {};
        if (!grouped[posKey][deptKey]) grouped[posKey][deptKey] = [];

        grouped[posKey][deptKey].push(emp);
      });

      console.log('Grouped employees:', Object.keys(grouped).length, grouped);
      setEmployees(grouped);
      // Также сохраняем плоский список для обмена сменами
      setAllEmployeesList(allEmployeesData);
    } catch (error: any) {
      console.error('Error loading employees:', error);
      toast.error('Ошибка загрузки сотрудников');
    }
  };

  const loadDepartments = async () => {
    try {
      if (selectedRestaurant) {
        const response = await api.get(`/departments/${selectedRestaurant}`);
        setDepartments(response.data.departments || []);
      }
    } catch (error: any) {
      console.error('Ошибка загрузки отделов:', error);
    }
  };

  const loadPositions = async () => {
    try {
      if (selectedRestaurant) {
        const response = await api.get(`/positions/${selectedRestaurant}`);
        setPositions(response.data.positions || []);
      }
    } catch (error: any) {
      console.error('Ошибка загрузки должностей:', error);
    }
  };

  const loadShifts = async () => {
    try {
      // Формируем даты в формате YYYY-MM-DD (без времени, чтобы избежать проблем с часовыми поясами)
      const formatDateForAPI = (date: Date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      };

      const startDateStr = formatDateForAPI(startDate);
      const endDateStr = formatDateForAPI(endDate);

      console.log('Loading shifts with params:', {
        restaurantId: selectedRestaurant,
        startDate: startDateStr,
        endDate: endDateStr,
        startDateLocal: startDate.toLocaleString(),
        endDateLocal: endDate.toLocaleString(),
      });

      const response = await api.get('/shifts', {
        params: {
          restaurantId: selectedRestaurant,
          startDate: startDateStr,
          endDate: endDateStr,
        },
      });
      const loadedShifts = response.data.shifts || [];
      console.log('Loaded shifts:', loadedShifts.length, loadedShifts);
      setShifts(loadedShifts);
    } catch (error: any) {
      console.error('Error loading shifts:', error);
      toast.error('Ошибка загрузки смен');
    }
  };

  const loadScheduleTemplates = async () => {
    try {
      if (selectedRestaurant) {
        const response = await api.get('/schedule-templates', {
          params: {
            restaurantId: selectedRestaurant,
          },
        });
        setScheduleTemplates(response.data.templates || []);
      }
    } catch (error: any) {
      console.error('Ошибка загрузки шаблонов графиков:', error);
    }
  };

  const loadHolidays = async () => {
    try {
      if (selectedRestaurant && startDate && endDate) {
        const response = await api.get('/holidays', {
          params: {
            restaurantId: selectedRestaurant,
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
          },
        });
        setHolidays(response.data.holidays || []);
      }
    } catch (error: any) {
      console.error('Ошибка загрузки праздников:', error);
    }
  };

  const handleSaveHoliday = async (data: { name: string; date: string; type: string; isRecurring: boolean }) => {
    try {
      if (editingHoliday) {
        await api.put(`/holidays/${editingHoliday.id}`, data);
        toast.success('Праздник обновлен');
      } else {
        await api.post('/holidays', {
          ...data,
          restaurantId: selectedRestaurant,
        });
        toast.success('Праздник создан');
      }
      setShowHolidayModal(false);
      setEditingHoliday(null);
      loadHolidays();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Ошибка сохранения праздника');
    }
  };

  const handleDeleteHoliday = async (id: string) => {
    if (!confirm('Удалить этот праздник/выходной?')) return;
    try {
      await api.delete(`/holidays/${id}`);
      toast.success('Праздник удален');
      loadHolidays();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Ошибка удаления праздника');
    }
  };

  // Проверяем, является ли день праздником
  const isHoliday = (date: Date): any | null => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return holidays.find((h) => format(new Date(h.date), 'yyyy-MM-dd') === dateStr) || null;
  };

  const handleSaveTemplate = async (name: string, description: string, periodType: 'week' | 'month') => {
    try {
      await api.post('/schedule-templates', {
        restaurantId: selectedRestaurant,
        name,
        description,
        periodType,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      });
      toast.success('Шаблон графика сохранен');
      setShowSaveTemplateModal(false);
      loadScheduleTemplates();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Ошибка при сохранении шаблона');
    }
  };

  const handleApplyTemplate = async (templateId: string, targetStartDate: Date, replaceExisting: boolean) => {
    try {
      const response = await api.post(`/schedule-templates/${templateId}/apply`, {
        startDate: targetStartDate.toISOString(),
        replaceExisting,
      });
      toast.success(`Применен шаблон: создано ${response.data.count} смен`);
      setShowApplyTemplateModal(false);
      loadShifts();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Ошибка при применении шаблона');
    }
  };

  const handleCopySchedule = async () => {
    try {
      if (!selectedRestaurant) {
        toast.error('Выберите ресторан');
        return;
      }

      const response = await api.post('/shifts/copy', {
        restaurantId: selectedRestaurant,
        fromDate: startDate.toISOString(),
        toDate: endDate.toISOString(),
        period: period === 'week' ? 'week' : 'month',
      });

      toast.success(`Скопировано ${response.data.count} смен на ${period === 'week' ? 'следующую неделю' : 'следующий месяц'}`);
      
      // Переходим на следующий период
      if (period === 'month') {
        const nextMonth = addMonths(startDate, 1);
        setStartDate(startOfMonth(nextMonth));
        setEndDate(endOfMonth(nextMonth));
      } else if (period === 'week') {
        const nextWeek = addDays(startDate, 7);
        setStartDate(startOfWeek(nextWeek, { weekStartsOn: 1 }));
        setEndDate(endOfWeek(nextWeek, { weekStartsOn: 1 }));
      }
      
      loadShifts();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Ошибка при копировании графика');
    }
  };

  const {
    swapRequests,
    incomingSwapRequests,
    swapHistory,
    loadSwapRequests,
    loadIncomingSwapRequests,
    loadSwapHistory,
    handleSwapRequest,
    handleRespondToSwap,
    handleApproveSwap,
  } = useSwapRequests({
    selectedRestaurant,
    loadShifts,
  });

  const handlePeriodChange = (newPeriod: 'week' | 'month' | 'custom') => {
    setPeriod(newPeriod);
    const today = new Date();
    if (newPeriod === 'month') {
      const { start, end } = getCurrentMonthDates();
      setStartDate(start);
      setEndDate(end);
    } else if (newPeriod === 'week') {
      // Создаем даты в локальном времени для текущей недели
      const year = today.getFullYear();
      const month = today.getMonth();
      const day = today.getDate();
      const dayOfWeek = today.getDay(); // 0 = воскресенье, 1 = понедельник

      // Вычисляем понедельник текущей недели
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // Если воскресенье, то -6 дней до понедельника
      const monday = new Date(year, month, day + mondayOffset);

      // Вычисляем воскресенье текущей недели
      const sunday = new Date(year, month, day + mondayOffset + 6, 23, 59, 59, 999);

      setStartDate(monday);
      setEndDate(sunday);
    }
  };

  const navigatePeriod = (direction: 'prev' | 'next') => {
    if (period === 'month') {
      const currentYear = startDate.getFullYear();
      const currentMonth = startDate.getMonth();
      const newMonth = direction === 'next' ? currentMonth + 1 : currentMonth - 1;
      const newYear = newMonth < 0 ? currentYear - 1 : newMonth > 11 ? currentYear + 1 : currentYear;
      const normalizedMonth = newMonth < 0 ? 11 : newMonth > 11 ? 0 : newMonth;

      const newStart = new Date(newYear, normalizedMonth, 1);
      const newEnd = new Date(newYear, normalizedMonth + 1, 0, 23, 59, 59, 999);

      setStartDate(newStart);
      setEndDate(newEnd);
    } else if (period === 'week') {
      const days = direction === 'next' ? 7 : -7;
      const newStart = addDays(startDate, days);
      const newEnd = endOfWeek(newStart, { weekStartsOn: 1 });
      setStartDate(startOfWeek(newStart, { weekStartsOn: 1 }));
      setEndDate(newEnd);
    }
  };

  // Свайпы для навигации по датам в графике (только на мобильных)
  const scheduleSwipeHandlers = useSwipe({
    onSwipeLeft: () => {
      // Свайп влево - следующий период
      navigatePeriod('next');
    },
    onSwipeRight: () => {
      // Свайп вправо - предыдущий период
      navigatePeriod('prev');
    },
    threshold: 100, // Минимальное расстояние для распознавания
    preventDefault: false, // Не предотвращаем прокрутку таблицы
  });

  const days = eachDayOfInterval({ start: startDate, end: endDate });

  // Преобразование смен в события для календаря
  const calendarEvents = useMemo(() => {
    // Фильтруем уникальные смены по ID, чтобы избежать дублирования
    const uniqueShifts = shifts.filter((shift, index, self) => 
      index === self.findIndex((s) => s.id === shift.id)
    );
    
    return uniqueShifts.map((shift) => {
      const start = new Date(shift.startTime);
      const end = new Date(shift.endTime);
      
      // Получаем дату начала смены (без времени)
      const startDate = new Date(start);
      startDate.setHours(0, 0, 0, 0);
      
      // Получаем дату окончания смены (без времени)
      const endDate = new Date(end);
      endDate.setHours(0, 0, 0, 0);
      
      // Если смена заканчивается на следующий день или позже, устанавливаем end на конец дня начала
      // Это предотвратит растягивание смены на несколько дней
      let displayEnd = end;
      if (endDate > startDate) {
        // Смена переходит на следующий день - показываем только до конца дня начала
        displayEnd = new Date(startDate);
        displayEnd.setHours(23, 59, 59, 999);
      }
      
      const employee = allEmployeesList.find(emp => emp.id === shift.userId);
      const employeeName = employee 
        ? `${employee.firstName} ${employee.lastName}`
        : shift.user?.firstName && shift.user?.lastName
        ? `${shift.user.firstName} ${shift.user.lastName}`
        : 'Неизвестный сотрудник';
      
      // Форматируем время для отображения
      const startTimeStr = format(start, 'HH:mm');
      const endTimeStr = format(end, 'HH:mm');
      const endDateStr = format(end, 'dd.MM');
      
      // Если смена заканчивается на следующий день, добавляем дату окончания
      let timeInfo = `${startTimeStr} - ${endTimeStr}`;
      if (endDate > startDate) {
        timeInfo = `${startTimeStr} - ${endTimeStr} (${endDateStr})`;
      }
      
      // Определяем цвет в зависимости от типа смены
      let backgroundColor = '#3174ad'; // По умолчанию синий
      let borderColor = '#265985';
      
      // Проверяем, есть ли шаблон с цветом
      const template = templates.find(t => t.id === shift.type);
      if (template?.color) {
        backgroundColor = template.color;
        borderColor = template.color;
      } else {
        // Используем цвета по типу смены
        switch (shift.type) {
          case 'FULL':
            backgroundColor = '#3b82f6'; // blue-500
            borderColor = '#2563eb';
            break;
          case 'MORNING':
            backgroundColor = '#10b981'; // green-500
            borderColor = '#059669';
            break;
          case 'EVENING':
            backgroundColor = '#f97316'; // orange-500
            borderColor = '#ea580c';
            break;
          case 'PARTIAL':
            backgroundColor = '#a855f7'; // purple-500
            borderColor = '#9333ea';
            break;
        }
      }

      // Добавляем индикацию статуса
      if (shift.swapRequested) {
        backgroundColor = '#fbbf24'; // yellow-500 для запросов на обмен
        borderColor = '#f59e0b';
      }
      if (!shift.isConfirmed) {
        backgroundColor = '#9ca3af'; // gray-400 для неподтвержденных
        borderColor = '#6b7280';
      }

      return {
        id: shift.id,
        title: `${employeeName}${template ? ` - ${template.name}` : ''} (${timeInfo})`,
        start,
        end: displayEnd, // Используем displayEnd вместо реального end
        resource: shift,
        style: {
          backgroundColor,
          borderColor,
          color: '#ffffff',
          borderRadius: '4px',
          border: '1px solid',
          padding: '2px 4px',
        },
      };
    });
  }, [shifts, allEmployeesList, templates]);

  const getShiftForCell = (userId: string, date: Date): Shift | null => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return shifts.find((shift) => {
      const shiftDate = format(new Date(shift.startTime), 'yyyy-MM-dd');
      return shift.userId === userId && shiftDate === dateStr;
    }) || null;
  };

  const handleCellClick = (userId: string, date: Date, shift?: Shift | null, event?: React.MouseEvent) => {
    const isMyShift = shift && shift.userId === user?.id;
    const cellKey = `${userId}|${format(date, 'yyyy-MM-dd')}`;
    
    // Проверяем, зажата ли Ctrl/Cmd - это режим мультивыбора
    const isMultiSelectMode = event?.ctrlKey || event?.metaKey;
    
    // Если режим мультивыбора (Ctrl/Cmd) и есть права на редактирование - добавляем/убираем из выбора
    if (hasEditSchedule && isMultiSelectMode) {
      const newSelected = new Set(selectedCells);
      
      if (newSelected.has(cellKey)) {
        newSelected.delete(cellKey);
      } else {
        newSelected.add(cellKey);
      }
      
      setSelectedCells(newSelected);
      return;
    }

    // Если есть смена и пользователь имеет права на редактирование - открываем модалку редактирования
    if (shift && hasEditSchedule && !isMultiSelectMode) {
      setEditingShift(shift);
      setShowEditShiftModal(true);
      return;
    }

    // Если это своя смена и пользователь имеет право REQUEST_SHIFT_SWAP - открываем модалку обмена
    if (shift && isMyShift && !hasEditSchedule && hasRequestShiftSwap) {
      setSelectedShiftForSwap(shift);
      setShowSwapModal(true);
      return;
    }

    // Пользователи с правом EDIT_SCHEDULE могут выбирать пустые ячейки для назначения смен
    if (hasEditSchedule && !shift) {
      const newSelected = new Set(selectedCells);
      
      if (newSelected.has(cellKey)) {
        newSelected.delete(cellKey);
      } else {
        newSelected.add(cellKey);
      }
      
      setSelectedCells(newSelected);
    }
  };

  const handleQuickUpdateShift = async (shiftId: string, data: { userId?: string; type?: string }) => {
    try {
      await api.put(`/shifts/${shiftId}`, data);
      toast.success('Смена обновлена');
      loadShifts();
      if (showSwapHistory) {
        loadSwapHistory();
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Ошибка при обновлении смены');
    }
  };

  const handleQuickSwap = (shift: Shift) => {
    setSelectedShiftForSwap(shift);
    setShowSwapModal(true);
  };

  const handleCopySelection = () => {
    if (selectedCells.size === 0) {
      toast.error('Выберите ячейки со сменами для копирования');
      return;
    }
    const selectedShifts: Shift[] = [];
    let minDate: Date | null = null;

    selectedCells.forEach((cellKey) => {
      const [empId, dateStr] = cellKey.split('|');
      const date = new Date(dateStr);
      const shift = getShiftForCell(empId, date);
      if (shift) {
        selectedShifts.push(shift);
        if (!minDate || date < minDate) {
          minDate = date;
        }
      }
    });

    if (selectedShifts.length === 0 || !minDate) {
      toast.error('В выбранных ячейках нет смен для копирования');
      return;
    }

    setClipboardShifts(selectedShifts);
    setClipboardBaseDate(minDate);
    toast.success(`Скопировано смен: ${selectedShifts.length}`);
  };

  const handlePasteSelection = async () => {
    if (!clipboardBaseDate || clipboardShifts.length === 0) {
      toast.error('Нет данных для вставки');
      return;
    }
    if (!pasteDate) {
      toast.error('Выберите дату для вставки');
      return;
    }
    if (!selectedRestaurant) {
      toast.error('Выберите ресторан');
      return;
    }
    try {
      setLoading(true);
      const targetDate = new Date(pasteDate);
      const diffDays = Math.round((targetDate.getTime() - clipboardBaseDate.getTime()) / (1000 * 60 * 60 * 24));

      for (const shift of clipboardShifts) {
        const start = addDays(new Date(shift.startTime), diffDays);
        const end = addDays(new Date(shift.endTime), diffDays);
        await api.post('/shifts', {
          userId: shift.userId,
          type: shift.type,
          startTime: start.toISOString(),
          endTime: end.toISOString(),
          restaurantId: selectedRestaurant,
        });
      }

      toast.success('Смены вставлены');
      setClipboardShifts([]);
      setClipboardBaseDate(null);
      setPasteDate('');
      setSelectedCells(new Set());
      loadShifts();
      if (showSwapHistory) {
        loadSwapHistory();
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Ошибка при вставке смен');
    } finally {
      setLoading(false);
    }
  };

  const handleBatchAssign = async () => {
    if (selectedCells.size === 0) {
      toast.error('Выберите ячейки для назначения смен');
      return;
    }

    if (!selectedShiftType) {
      toast.error('Выберите тип смены');
      return;
    }

    try {
      const shiftsToCreate = Array.from(selectedCells).map((cellKey) => {
        // Формат: userId|dateStr
        const [userId, dateStr] = cellKey.split('|');
        return {
          userId,
          type: selectedShiftType, // ID шаблона
          date: dateStr,
        };
      });

      const response = await api.post('/shifts/batch', {
        restaurantId: selectedRestaurant,
        shifts: shiftsToCreate,
      });

      const { count, skipped } = response.data;
      if (skipped > 0) {
        toast.success(`Назначено ${count} смен, ${skipped} пропущено (уже существуют)`);
      } else {
        toast.success(`Назначено ${count} смен`);
      }
      setSelectedCells(new Set());
      loadShifts();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Ошибка назначения смен');
    }
  };

  const handleBatchDelete = async () => {
    if (selectedCells.size === 0) {
      toast.error('Выберите ячейки для удаления');
      return;
    }

    if (!confirm(`Удалить ${selectedCells.size} выбранных смен?`)) {
      return;
    }

    try {
      const cellKeys = Array.from(selectedCells);
      await api.post('/shifts/batch/delete', {
        restaurantId: selectedRestaurant,
        cellKeys,
      });

      toast.success(`Удалено ${cellKeys.length} смен`);
      setSelectedCells(new Set());
      loadShifts();
      if (showSwapHistory) {
        loadSwapHistory();
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Ошибка удаления смен');
      console.error('Ошибка удаления смен:', error);
    }
  };

  const handleDeleteEmployeeShifts = async (employeeId: string) => {
    if (!confirm(`Удалить все смены этого сотрудника за выбранный период?`)) {
      return;
    }

    try {
      await api.post('/shifts/delete-employee', {
        restaurantId: selectedRestaurant,
        userId: employeeId,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      });

      toast.success('Все смены сотрудника удалены');
      loadShifts();
      if (showSwapHistory) {
        loadSwapHistory();
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Ошибка удаления смен');
      console.error('Ошибка удаления смен сотрудника:', error);
    }
  };

  const handleBulkHolidays = async () => {
    if (!selectedRestaurant) {
      toast.error('Выберите ресторан');
      return;
    }
    if (!bulkHolidayStart || !bulkHolidayEnd) {
      toast.error('Укажите даты начала и окончания');
      return;
    }
    const start = new Date(bulkHolidayStart);
    const end = new Date(bulkHolidayEnd);
    if (start > end) {
      toast.error('Дата начала позже даты окончания');
      return;
    }
    try {
      setBulkHolidayLoading(true);
      let count = 0;
      let current = start;
      while (current <= end) {
        await api.post('/holidays', {
          restaurantId: selectedRestaurant,
          date: current.toISOString(),
          type: bulkHolidayType,
          name: bulkHolidayName || (bulkHolidayType === 'HOLIDAY' ? 'Праздничный день' : 'Выходной'),
        });
        current = addDays(current, 1);
        count += 1;
      }
      toast.success(`Добавлено дней: ${count}`);
      setBulkHolidayStart('');
      setBulkHolidayEnd('');
      setBulkHolidayName('');
      loadHolidays();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Ошибка добавления дней');
    } finally {
      setBulkHolidayLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 transition-colors">
        <Navbar />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="grid gap-4 sm:grid-cols-2 animate-pulse">
            <div className="card p-4 space-y-3">
              <div className="h-5 w-1/2 bg-gray-200 dark:bg-slate-700 rounded" />
              <div className="h-4 w-3/4 bg-gray-200 dark:bg-slate-700 rounded" />
              <div className="h-4 w-2/3 bg-gray-200 dark:bg-slate-700 rounded" />
            </div>
            <div className="card p-4 space-y-3">
              <div className="h-4 w-full bg-gray-200 dark:bg-slate-700 rounded" />
              <div className="h-4 w-5/6 bg-gray-200 dark:bg-slate-700 rounded" />
              <div className="h-4 w-4/6 bg-gray-200 dark:bg-slate-700 rounded" />
            </div>
            <div className="card p-6 space-y-4 sm:col-span-2">
              <div className="h-6 w-1/3 bg-gray-200 dark:bg-slate-700 rounded" />
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="h-10 bg-gray-200 dark:bg-slate-700 rounded" />
                <div className="h-10 bg-gray-200 dark:bg-slate-700 rounded" />
                <div className="h-10 bg-gray-200 dark:bg-slate-700 rounded" />
                <div className="h-10 bg-gray-200 dark:bg-slate-700 rounded" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="h-4 bg-gray-200 dark:bg-slate-700 rounded" />
                <div className="h-4 bg-gray-200 dark:bg-slate-700 rounded" />
                <div className="h-4 bg-gray-200 dark:bg-slate-700 rounded" />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 transition-colors">
      <Navbar />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
        <ScheduleHeader
          period={period}
          startDate={startDate}
          selectedRestaurant={selectedRestaurant}
          restaurants={restaurants}
          selectedDepartment={selectedDepartment}
          departments={departments}
          selectedPosition={selectedPosition}
          positions={positions}
          viewMode={viewMode}
          setViewMode={setViewMode}
          navigatePeriod={navigatePeriod}
          setPeriod={setPeriod}
          setStartDate={setStartDate}
          setEndDate={setEndDate}
          hasEditSchedule={hasEditSchedule}
          handleCopySchedule={handleCopySchedule}
          setShowSaveTemplateModal={setShowSaveTemplateModal}
          setShowApplyTemplateModal={setShowApplyTemplateModal}
          setEditingHoliday={setEditingHoliday}
          setShowHolidayModal={setShowHolidayModal}
        />

        <div className="hidden sm:block">
          <ScheduleFilters
            restaurants={restaurants}
            selectedRestaurant={selectedRestaurant}
            setSelectedRestaurant={setSelectedRestaurant}
            departments={departments}
            selectedDepartment={selectedDepartment}
            setSelectedDepartment={setSelectedDepartment}
            positions={positions}
            selectedPosition={selectedPosition}
            setSelectedPosition={setSelectedPosition}
            period={period}
            handlePeriodChange={handlePeriodChange}
            startDate={startDate}
            endDate={endDate}
            setStartDate={setStartDate}
            setEndDate={setEndDate}
            navigatePeriod={navigatePeriod}
            showOnlyMyShifts={showOnlyMyShifts}
            setShowOnlyMyShifts={setShowOnlyMyShifts}
          />
        </div>

        {!hasEditSchedule && (
          <div className="card mb-4 sm:mb-6 bg-amber-50 border border-amber-200 text-amber-800 dark:bg-amber-950/60 dark:border-amber-900/60 dark:text-amber-100 flex gap-3">
            <div className="pt-1">
              <AlertCircle className="w-5 h-5 text-amber-500 dark:text-amber-200" />
            </div>
            <div className="text-sm leading-relaxed">
              <div className="font-semibold">Нет прав на редактирование графика</div>
              <div className="text-amber-700 dark:text-amber-100/80">
                Доступен просмотр, свои запросы на обмен и личные смены. Для редактирования смен попросите менеджера выдать право «Редактирование графика».
              </div>
            </div>
          </div>
        )}

        <ScheduleMultiSelect
          hasEditSchedule={hasEditSchedule}
          selectedCells={selectedCells}
          setSelectedCells={setSelectedCells}
          selectedShiftType={selectedShiftType}
          setSelectedShiftType={setSelectedShiftType}
          templates={templates}
          handleBatchAssign={handleBatchAssign}
          handleBatchDelete={handleBatchDelete}
          handleCopySelection={handleCopySelection}
          clipboardShifts={clipboardShifts}
          pasteDate={pasteDate}
          setPasteDate={setPasteDate}
          handlePasteSelection={handlePasteSelection}
        />

        <ScheduleBulkHolidays
          hasEditSchedule={hasEditSchedule}
          bulkHolidayStart={bulkHolidayStart}
          setBulkHolidayStart={setBulkHolidayStart}
          bulkHolidayEnd={bulkHolidayEnd}
          setBulkHolidayEnd={setBulkHolidayEnd}
          bulkHolidayType={bulkHolidayType}
          setBulkHolidayType={setBulkHolidayType}
          bulkHolidayName={bulkHolidayName}
          setBulkHolidayName={setBulkHolidayName}
          bulkHolidayLoading={bulkHolidayLoading}
          handleBulkHolidays={handleBulkHolidays}
        />

        {Object.keys(employees).length === 0 && (
          <div className="card p-6 text-center text-gray-700 dark:text-gray-200 mb-4">
            <div className="text-lg font-semibold mb-2">Нет данных для отображения</div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Измените фильтры или выберите другой период, чтобы увидеть смены.
            </p>
            <button onClick={handleScrollTop} className="btn-secondary inline-flex items-center gap-2 justify-center">
              К фильтрам
            </button>
          </div>
        )}

        {viewMode === 'table' ? (
          <div
            ref={scheduleSwipeHandlers.ref}
            {...scheduleSwipeHandlers.handlers}
            className="card overflow-x-auto -mx-4 sm:mx-0"
          >
            <ScheduleTable
              days={days}
              employees={employees}
              positions={positions}
              templates={templates}
              selectedCells={selectedCells}
              employeesFlat={allEmployeesList}
              user={user}
              hasEditSchedule={hasEditSchedule}
              hasRequestShiftSwap={hasRequestShiftSwap}
              handleCellClick={handleCellClick}
              getShiftForCell={getShiftForCell}
              onDeleteEmployeeShifts={handleDeleteEmployeeShifts}
              isHoliday={isHoliday}
              onQuickUpdateShift={handleQuickUpdateShift}
              onQuickSwap={handleQuickSwap}
            />
          </div>
        ) : (
          <ScheduleCalendarView
            calendarStyle={calendarStyle}
            calendarEvents={calendarEvents}
            localizer={localizer}
            calendarView={calendarView}
            onViewChange={setCalendarView}
            calendarDate={calendarDate}
            onNavigate={setCalendarDate}
            isHoliday={isHoliday}
            user={user}
            hasEditSchedule={hasEditSchedule}
            hasRequestShiftSwap={hasRequestShiftSwap}
            onEditShift={(shift) => {
              setEditingShift(shift);
              setShowEditShiftModal(true);
            }}
            onRequestSwap={(shift) => {
              setSelectedShiftForSwap(shift);
              setShowSwapModal(true);
            }}
          />
        )}

        <ScheduleLegend templates={templates} />

        {(user?.role === 'MANAGER' || user?.role === 'OWNER' || user?.role === 'ADMIN' || isRestaurantManager) && (
          <SwapRequestsBlock
            show={showSwapRequests}
            requests={swapRequests}
            onToggle={() => {
              const next = !showSwapRequests;
              setShowSwapRequests(next);
              if (next) {
                loadSwapRequests();
              }
            }}
            onApprove={handleApproveSwap}
          />
        )}

        <IncomingSwapRequestsBlock
          show={showIncomingSwapRequests}
          requests={incomingSwapRequests}
          onToggle={() => {
            const next = !showIncomingSwapRequests;
            setShowIncomingSwapRequests(next);
            if (next) {
              loadIncomingSwapRequests();
            }
          }}
          onRespond={handleRespondToSwap}
        />

        {(user?.role === 'MANAGER' || user?.role === 'OWNER' || user?.role === 'ADMIN' || isRestaurantManager) && (
          <ChangeHistoryBlock
            show={showSwapHistory}
            history={swapHistory}
            onToggle={() => {
              const next = !showSwapHistory;
              setShowSwapHistory(next);
              if (next) {
                loadSwapHistory();
              }
            }}
          />
        )}

        {/* Плавающая кнопка фильтров для мобайла */}
        <div className="sm:hidden fixed bottom-20 right-4 z-40">
          <button
            onClick={() => setShowMobileFilters(true)}
            className="px-4 py-3 rounded-full shadow-lg bg-blue-500 text-white font-semibold active:scale-[0.98] transition-transform"
          >
            Фильтры
          </button>
        </div>

        {/* Мобильная панель фильтров */}
        {showMobileFilters && (
          <div className="sm:hidden fixed inset-0 z-50 flex">
            <div className="absolute inset-0 bg-black/40" onClick={() => setShowMobileFilters(false)} />
            <div className="relative ml-auto h-full w-full max-w-md bg-white dark:bg-slate-900 shadow-xl overflow-y-auto">
              <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
                <div className="text-base font-semibold text-gray-900 dark:text-gray-100">Фильтры</div>
                <button
                  onClick={() => setShowMobileFilters(false)}
                  className="p-2 rounded-md hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-600 dark:text-gray-200"
                  aria-label="Закрыть фильтры"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-4">
                <ScheduleFilters
                  restaurants={restaurants}
                  selectedRestaurant={selectedRestaurant}
                  setSelectedRestaurant={setSelectedRestaurant}
                  departments={departments}
                  selectedDepartment={selectedDepartment}
                  setSelectedDepartment={setSelectedDepartment}
                  positions={positions}
                  selectedPosition={selectedPosition}
                  setSelectedPosition={setSelectedPosition}
                  period={period}
                  handlePeriodChange={handlePeriodChange}
                  startDate={startDate}
                  endDate={endDate}
                  setStartDate={setStartDate}
                  setEndDate={setEndDate}
                  navigatePeriod={navigatePeriod}
                  showOnlyMyShifts={showOnlyMyShifts}
                  setShowOnlyMyShifts={setShowOnlyMyShifts}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {showEditShiftModal && editingShift && (
        <EditShiftModal
          shift={editingShift!}
          employees={allEmployeesList}
          templates={templates}
          onClose={() => {
            setShowEditShiftModal(false);
            setEditingShift(null);
          }}
          onSave={async () => {
            setShowEditShiftModal(false);
            setEditingShift(null);
            loadShifts();
          }}
          onDelete={async () => {
            setShowEditShiftModal(false);
            setEditingShift(null);
            loadShifts();
          }}
        />
      )}

      {showSwapModal && selectedShiftForSwap && (
        <SwapRequestModal
          shift={selectedShiftForSwap!}
          employees={allEmployeesList.filter((emp: any) => emp.id !== user?.id)}
          onClose={() => {
            setShowSwapModal(false);
            setSelectedShiftForSwap(null);
          }}
          onRequest={handleSwapRequest}
          templates={templates}
        />
      )}

      {showSaveTemplateModal && (
        <SaveTemplateModal
          period={period}
          startDate={startDate}
          endDate={endDate}
          onClose={() => setShowSaveTemplateModal(false)}
          onSave={handleSaveTemplate}
        />
      )}

      {showApplyTemplateModal && (
        <ApplyTemplateModal
          templates={scheduleTemplates}
          onClose={() => setShowApplyTemplateModal(false)}
          onApply={handleApplyTemplate}
          currentStartDate={startDate}
        />
      )}

      {showHolidayModal && (
        <HolidayModal
          holiday={editingHoliday}
          holidays={holidays}
          onClose={() => {
            setShowHolidayModal(false);
            setEditingHoliday(null);
          }}
          onSave={handleSaveHoliday}
          onDelete={handleDeleteHoliday}
          onEdit={(h) => {
            setEditingHoliday(h);
            setTimeout(() => setShowHolidayModal(true), 100);
          }}
        />
      )}

      {hasEditSchedule && (
        <FloatingActionButton
          actions={[
            { name: 'Сохранить шаблон', icon: Calendar, onClick: () => setShowSaveTemplateModal(true) },
            { name: 'Применить шаблон', icon: Calendar, onClick: () => setShowApplyTemplateModal(true) },
            { name: 'Копировать график', icon: Copy, onClick: handleCopySchedule },
          ]}
          position="bottom-right"
        />
      )}
    </div>
  );
}