import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import api from '../utils/api';
import { Building2, ChevronDown } from 'lucide-react';

interface Restaurant {
  id: string;
  name: string;
}

export default function RestaurantSelector() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [selectedRestaurantId, setSelectedRestaurantId] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    loadRestaurants();
  }, []);

  useEffect(() => {
    // Определяем выбранный ресторан из URL или localStorage
    const restaurantId = getRestaurantFromUrl() || localStorage.getItem('selectedRestaurantId');
    if (restaurantId) {
      setSelectedRestaurantId(restaurantId);
    } else if (restaurants.length === 1) {
      // Если только один ресторан, выбираем его автоматически
      setSelectedRestaurantId(restaurants[0].id);
      localStorage.setItem('selectedRestaurantId', restaurants[0].id);
    }
  }, [restaurants]);

  const loadRestaurants = async () => {
    try {
      const response = await api.get('/restaurants');
      const restaurantsList = response.data.restaurants || [];
      setRestaurants(restaurantsList);
    } catch (error) {
      console.error('Ошибка загрузки ресторанов:', error);
    }
  };

  const getRestaurantFromUrl = (): string | null => {
    // Пытаемся извлечь restaurantId из URL
    const match = location.pathname.match(/\/restaurants\/([^\/]+)/);
    if (match) {
      return match[1];
    }
    
    // Проверяем query параметры
    const params = new URLSearchParams(location.search);
    const restaurantId = params.get('restaurantId');
    if (restaurantId) {
      return restaurantId;
    }
    
    return null;
  };

  const handleSelectRestaurant = (restaurantId: string) => {
    setSelectedRestaurantId(restaurantId);
    localStorage.setItem('selectedRestaurantId', restaurantId);
    setIsOpen(false);
    
    // Если мы на странице, которая требует контекст ресторана, обновляем URL
    const restaurantContextPages = ['/schedule', '/tasks', '/timesheets', '/shift-types'];
    const currentPath = location.pathname;
    
    if (restaurantContextPages.some(page => currentPath.startsWith(page))) {
      // Обновляем URL с restaurantId
      const url = new URL(window.location.href);
      url.searchParams.set('restaurantId', restaurantId);
      navigate(`${currentPath}${url.search}`);
    }
  };

  const selectedRestaurant = restaurants.find(r => r.id === selectedRestaurantId);

  // Не показываем селектор, если:
  // - Пользователь OWNER/ADMIN и нет ресторанов
  // - Только один ресторан (автовыбор)
  if (restaurants.length <= 1 && !(user?.role === 'OWNER' || user?.role === 'ADMIN')) {
    return null;
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium text-gray-700"
      >
        <Building2 className="w-4 h-4" />
        <span className="max-w-[150px] truncate">
          {selectedRestaurant ? selectedRestaurant.name : 'Выберите ресторан'}
        </span>
        <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <>
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute top-full left-0 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-[300px] overflow-y-auto">
            {restaurants.map((restaurant) => (
              <button
                key={restaurant.id}
                onClick={() => handleSelectRestaurant(restaurant.id)}
                className={`w-full text-left px-4 py-2 hover:bg-gray-50 transition-colors ${
                  selectedRestaurantId === restaurant.id ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'
                }`}
              >
                {restaurant.name}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

