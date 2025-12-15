import { useEffect, useState, useMemo } from 'react';
import Navbar from '../components/Navbar';
import api from '../utils/api';
import toast from 'react-hot-toast';
import { Bell, Check, CheckCheck, Clock, CheckSquare, Calendar, Trash2, Filter } from 'lucide-react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
  isRead: boolean;
  createdAt: string;
  readAt: string | null;
}

type FilterType = 'all' | 'unread' | 'task' | 'shift';

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<FilterType>('all');

  useEffect(() => {
    loadNotifications();
  }, []);

  const loadNotifications = async () => {
    try {
      setLoading(true);
      const res = await api.get('/notifications', { params: { limit: 200 } });
      setNotifications(res.data.notifications || []);
      setUnreadCount(res.data.unreadCount || 0);
    } catch (error: any) {
      toast.error('Ошибка загрузки уведомлений');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkAsRead = async (id: string) => {
    try {
      await api.put(`/notifications/${id}/read`);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true, readAt: new Date().toISOString() } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (error: any) {
      toast.error('Ошибка отметки уведомления');
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await api.put('/notifications/read-all');
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true, readAt: new Date().toISOString() })));
      setUnreadCount(0);
    } catch (error: any) {
      toast.error('Ошибка отметки всех уведомлений');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/notifications/${id}`);
      setNotifications((prev) => {
        const notif = prev.find((n) => n.id === id);
        if (notif && !notif.isRead) {
          setUnreadCount((u) => Math.max(0, u - 1));
        }
        return prev.filter((n) => n.id !== id);
      });
    } catch (error: any) {
      toast.error('Ошибка удаления уведомления');
    }
  };

  const getNotificationIcon = (type: string) => {
    if (type.startsWith('TASK')) return <CheckSquare className="w-5 h-5" />;
    if (type.startsWith('SHIFT')) return <Calendar className="w-5 h-5" />;
    return <Bell className="w-5 h-5" />;
  };

  const filteredNotifications = useMemo(() => {
    return notifications.filter((n) => {
      if (filter === 'unread') return !n.isRead;
      if (filter === 'task') return n.type.startsWith('TASK');
      if (filter === 'shift') return n.type.startsWith('SHIFT');
      return true;
    });
  }, [notifications, filter]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 transition-colors">
      <Navbar />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">Уведомления</h1>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Все события системы с возможностью фильтрации и отметки прочитанного
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={loadNotifications}
              className="btn-secondary flex items-center gap-2"
              title="Обновить"
            >
              Обновить
            </button>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllAsRead}
                className="btn-primary flex items-center gap-2"
                title="Отметить все как прочитанные"
              >
                <CheckCheck className="w-4 h-4" />
                Все прочитано ({unreadCount})
              </button>
            )}
          </div>
        </div>

        <div className="card p-4 sm:p-6 mb-4">
          <div className="flex flex-wrap items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400" />
            {[
              { id: 'all', label: 'Все' },
              { id: 'unread', label: 'Непрочитанные' },
              { id: 'task', label: 'Задачи' },
              { id: 'shift', label: 'Смены' },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id as FilterType)}
                className={`px-3 py-1.5 rounded-lg text-sm border ${
                  filter === f.id
                    ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-200 border-primary-200 dark:border-primary-700'
                    : 'text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="card divide-y divide-gray-100 dark:divide-gray-800">
          {loading ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">Загрузка...</div>
          ) : filteredNotifications.length === 0 ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">
              <Bell className="w-12 h-12 mx-auto mb-2 text-gray-300 dark:text-gray-600" />
              <p>Нет уведомлений</p>
            </div>
          ) : (
            filteredNotifications.map((notification) => (
              <div
                key={notification.id}
                className={`p-4 sm:p-5 flex gap-4 ${
                  !notification.isRead ? 'bg-blue-50 dark:bg-blue-900/10' : ''
                }`}
              >
                <div
                  className={`flex-shrink-0 mt-1 ${
                    notification.type.startsWith('TASK')
                      ? 'text-blue-600 dark:text-blue-400'
                      : notification.type.startsWith('SHIFT')
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-gray-600 dark:text-gray-300'
                  }`}
                >
                  {getNotificationIcon(notification.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                    <div>
                      <div className={`text-sm font-semibold ${!notification.isRead ? 'text-gray-900' : 'text-gray-700 dark:text-gray-200'}`}>
                        {notification.title}
                      </div>
                      <div className="text-sm text-gray-600 dark:text-gray-300 mt-1">{notification.message}</div>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">
                      <Clock className="w-3 h-3" />
                      {format(new Date(notification.createdAt), 'dd MMM HH:mm', { locale: ru })}
                    </div>
                  </div>

                  <div className="mt-3 flex items-center gap-2">
                    {!notification.isRead && (
                      <button
                        onClick={() => handleMarkAsRead(notification.id)}
                        className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 flex items-center gap-1"
                      >
                        <Check className="w-3 h-3" />
                        Прочитано
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(notification.id)}
                      className="text-xs text-gray-500 hover:text-red-600 flex items-center gap-1"
                    >
                      <Trash2 className="w-3 h-3" />
                      Удалить
                    </button>
                    {notification.link && (
                      <a
                        href={notification.link}
                        className="text-xs text-primary-600 hover:text-primary-800"
                      >
                        Открыть
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

