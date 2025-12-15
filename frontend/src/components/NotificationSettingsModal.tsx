import { useState, useEffect } from 'react';
import api from '../utils/api';
import toast from 'react-hot-toast';
import { X, Bell, BellOff } from 'lucide-react';
import { subscribeToPushNotifications, unsubscribeFromPushNotifications, checkSubscriptionStatus } from '../utils/pushNotifications';

interface NotificationSettings {
  id: string;
  enablePushNotifications: boolean;
  enableTaskNotifications: boolean;
  enableShiftNotifications: boolean;
  enableSwapNotifications: boolean;
  enableTimesheetNotifications: boolean;
  enableInAppNotifications: boolean;
}

interface NotificationSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function NotificationSettingsModal({ isOpen, onClose }: NotificationSettingsModalProps) {
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [checkingSubscription, setCheckingSubscription] = useState(true);

  useEffect(() => {
    if (isOpen) {
      loadSettings();
      checkSubscription();
    }
  }, [isOpen]);

  const loadSettings = async () => {
    try {
      const response = await api.get('/notification-settings');
      setSettings(response.data.settings);
    } catch (error: any) {
      toast.error('Ошибка загрузки настроек');
      console.error(error);
    }
  };

  const checkSubscription = async () => {
    setCheckingSubscription(true);
    const subscribed = await checkSubscriptionStatus();
    setIsSubscribed(subscribed);
    setCheckingSubscription(false);
  };

  const handleTogglePush = async () => {
    if (!settings) return;

    try {
      setLoading(true);
      
      if (settings.enablePushNotifications) {
        // Отключаем push-уведомления
        await unsubscribeFromPushNotifications();
        setIsSubscribed(false);
      } else {
        // Включаем push-уведомления
        const subscription = await subscribeToPushNotifications();
        setIsSubscribed(subscription !== null);
        
        if (!subscription) {
          toast.error('Не удалось подписаться на push-уведомления. Проверьте настройки браузера.');
          return;
        }
      }

      const newSettings = {
        ...settings,
        enablePushNotifications: !settings.enablePushNotifications,
      };

      await api.put('/notification-settings', newSettings);
      setSettings(newSettings);
      toast.success('Настройки обновлены');
    } catch (error: any) {
      toast.error('Ошибка обновления настроек');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (field: keyof NotificationSettings) => {
    if (!settings || loading) return;

    try {
      setLoading(true);
      const newSettings = {
        ...settings,
        [field]: !settings[field],
      };

      await api.put('/notification-settings', newSettings);
      setSettings(newSettings);
      toast.success('Настройки обновлены');
    } catch (error: any) {
      toast.error('Ошибка обновления настроек');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-xl font-semibold text-gray-900">Настройки уведомлений</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Push-уведомления */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {isSubscribed ? (
                  <Bell className="w-5 h-5 text-green-600" />
                ) : (
                  <BellOff className="w-5 h-5 text-gray-400" />
                )}
                <div>
                  <h3 className="font-medium text-gray-900">Push-уведомления</h3>
                  <p className="text-sm text-gray-500">
                    {isSubscribed
                      ? 'Вы подписаны на push-уведомления'
                      : 'Уведомления даже когда сайт закрыт'}
                  </p>
                </div>
              </div>
              <button
                onClick={handleTogglePush}
                disabled={loading || checkingSubscription}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  settings?.enablePushNotifications ? 'bg-blue-600' : 'bg-gray-300'
                } ${loading || checkingSubscription ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    settings?.enablePushNotifications ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>

          <div className="border-t border-gray-200 pt-4 space-y-4">
            <h3 className="font-medium text-gray-900">Типы уведомлений</h3>

            {/* Задачи */}
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900">Задачи</p>
                <p className="text-sm text-gray-500">Уведомления о новых задачах</p>
              </div>
              <button
                onClick={() => handleToggle('enableTaskNotifications')}
                disabled={loading || !settings?.enablePushNotifications}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  settings?.enableTaskNotifications ? 'bg-blue-600' : 'bg-gray-300'
                } ${loading || !settings?.enablePushNotifications ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    settings?.enableTaskNotifications ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {/* Смены */}
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900">Смены</p>
                <p className="text-sm text-gray-500">Уведомления о новых сменах</p>
              </div>
              <button
                onClick={() => handleToggle('enableShiftNotifications')}
                disabled={loading || !settings?.enablePushNotifications}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  settings?.enableShiftNotifications ? 'bg-blue-600' : 'bg-gray-300'
                } ${loading || !settings?.enablePushNotifications ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    settings?.enableShiftNotifications ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {/* Обмены сменами */}
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900">Обмены сменами</p>
                <p className="text-sm text-gray-500">Уведомления об обменах</p>
              </div>
              <button
                onClick={() => handleToggle('enableSwapNotifications')}
                disabled={loading || !settings?.enablePushNotifications}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  settings?.enableSwapNotifications ? 'bg-blue-600' : 'bg-gray-300'
                } ${loading || !settings?.enablePushNotifications ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    settings?.enableSwapNotifications ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {/* Табели */}
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900">Табели</p>
                <p className="text-sm text-gray-500">Уведомления о табелях</p>
              </div>
              <button
                onClick={() => handleToggle('enableTimesheetNotifications')}
                disabled={loading || !settings?.enablePushNotifications}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  settings?.enableTimesheetNotifications ? 'bg-blue-600' : 'bg-gray-300'
                } ${loading || !settings?.enablePushNotifications ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    settings?.enableTimesheetNotifications ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {/* In-app уведомления */}
            <div className="flex items-center justify-between pt-4 border-t border-gray-200">
              <div>
                <p className="font-medium text-gray-900">Уведомления в приложении</p>
                <p className="text-sm text-gray-500">Показывать уведомления в интерфейсе</p>
              </div>
              <button
                onClick={() => handleToggle('enableInAppNotifications')}
                disabled={loading}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  settings?.enableInAppNotifications ? 'bg-blue-600' : 'bg-gray-300'
                } ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    settings?.enableInAppNotifications ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

