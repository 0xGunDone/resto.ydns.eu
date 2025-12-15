import { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import api from '../utils/api';

/**
 * Хук для проверки, является ли пользователь менеджером ресторана
 */
export function useRestaurantManager() {
  const { user } = useAuthStore();
  const [isManager, setIsManager] = useState(false);
  const [managedRestaurants, setManagedRestaurants] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkManagerStatus = async () => {
      if (!user) {
        setIsManager(false);
        setManagedRestaurants([]);
        setLoading(false);
        return;
      }

      // OWNER и ADMIN всегда считаются менеджерами всех ресторанов
      if (user.role === 'OWNER' || user.role === 'ADMIN') {
        setIsManager(true);
        setLoading(false);
        return;
      }

      try {
        // Получаем список ресторанов пользователя
        const response = await api.get('/restaurants');
        const restaurants = response.data.restaurants || [];
        
        // Проверяем, является ли пользователь менеджером хотя бы одного ресторана
        const managed = restaurants
          .filter((restaurant: any) => restaurant.manager?.id === user.id)
          .map((restaurant: any) => restaurant.id);
        
        setIsManager(managed.length > 0);
        setManagedRestaurants(managed);
      } catch (error) {
        console.error('Ошибка проверки статуса менеджера:', error);
        setIsManager(false);
        setManagedRestaurants([]);
      } finally {
        setLoading(false);
      }
    };

    checkManagerStatus();
  }, [user]);

  return { isManager, managedRestaurants, loading };
}

