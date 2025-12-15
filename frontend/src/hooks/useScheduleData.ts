import { useState } from 'react';
import api from '../utils/api';
import toast from 'react-hot-toast';

interface UseScheduleDataParams {
  user: any;
  selectedRestaurant: string;
  startDate: Date;
  endDate: Date;
  setSelectedRestaurant: (id: string) => void;
}

export function useScheduleData({
  user,
  selectedRestaurant,
  startDate,
  endDate,
  setSelectedRestaurant,
}: UseScheduleDataParams) {
  const [restaurants, setRestaurants] = useState<any[]>([]);
  const [employees, setEmployees] = useState<Record<string, Record<string, any[]>>>({});
  const [shifts, setShifts] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [departments, setDepartments] = useState<any[]>([]);
  const [positions, setPositions] = useState<any[]>([]);
  const [scheduleTemplates, setScheduleTemplates] = useState<any[]>([]);
  const [holidays, setHolidays] = useState<any[]>([]);
  const [allEmployeesList, setAllEmployeesList] = useState<any[]>([]);
  const [userPermissions, setUserPermissions] = useState<string[]>([]);

  const loadRestaurants = async () => {
    try {
      const response = await api.get('/restaurants');
      setRestaurants(response.data || []);
      // Если ресторан не выбран - выбрать первый доступный
      if (!selectedRestaurant && response.data && response.data.length > 0) {
        setSelectedRestaurant(response.data[0].id);
      }
    } catch (error: any) {
      toast.error('Ошибка загрузки ресторанов');
    }
  };

  const loadEmployees = async () => {
    try {
      if (!selectedRestaurant) return;
      const response = await api.get(`/restaurants/${selectedRestaurant}/employees`);
      setEmployees(response.data.employeesByDepartment || {});
      setAllEmployeesList(response.data.allEmployees || []);
    } catch (error: any) {
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
      const response = await api.get('/shifts', {
        params: {
          restaurantId: selectedRestaurant,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        },
      });
      setShifts(response.data.shifts || []);
    } catch (error: any) {
      toast.error('Ошибка загрузки смен');
    }
  };

  const loadTemplates = async () => {
    try {
      const response = await api.get('/shift-templates', {
        params: {
          restaurantId: selectedRestaurant,
        },
      });
      setTemplates(response.data.templates || []);
    } catch (error: any) {
      toast.error('Ошибка загрузки типов смен');
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

  const loadUserPermissions = async () => {
    try {
      const response = await api.get(`/permissions/user/${user?.id}`);
      setUserPermissions(response.data || []);
    } catch (error: any) {
      console.error('Ошибка загрузки прав пользователя:', error);
    }
  };

  const loadInitialData = async () => {
    try {
      setLoading(true);
      await loadRestaurants();
      await loadDepartments();
      await loadPositions();
      await loadTemplates();
      await loadScheduleTemplates();
      await loadHolidays();
      await loadEmployees();
      await loadShifts();
      await loadUserPermissions();
    } finally {
      setLoading(false);
    }
  };

  return {
    // state
    restaurants,
    employees,
    shifts,
    templates,
    loading,
    departments,
    positions,
    scheduleTemplates,
    holidays,
    allEmployeesList,
    userPermissions,
    // setters (if needed)
    setShifts,
    setTemplates,
    setScheduleTemplates,
    setHolidays,
    setEmployees,
    setAllEmployeesList,
    setLoading,
    // loaders
    loadInitialData,
    loadRestaurants,
    loadEmployees,
    loadDepartments,
    loadPositions,
    loadShifts,
    loadTemplates,
    loadScheduleTemplates,
    loadHolidays,
    loadUserPermissions,
  };
}

