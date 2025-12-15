import { useState, useEffect } from 'react';
import api from '../utils/api';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/authStore';
import Navbar from '../components/Navbar';
import { User, Save, Lock, Phone, UserCircle, MessageCircle, ExternalLink } from 'lucide-react';

export default function ProfilePage() {
  const { user, setUser } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    firstName: '',
    lastName: '',
    phone: '',
    password: '',
    confirmPassword: '',
  });
  const [telegramLinked, setTelegramLinked] = useState(false);
  const [bindLink, setBindLink] = useState<string | null>(null);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      setLoading(true);
      const response = await api.get('/auth/me');
      const userData = response.data.user;
      setFormData({
        email: userData.email || '',
        firstName: userData.firstName || '',
        lastName: userData.lastName || '',
        phone: userData.phone || '',
        password: '',
        confirmPassword: '',
      });
      setTelegramLinked(!!userData.telegramId);
    } catch (error: any) {
      toast.error('Ошибка загрузки профиля');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Проверка совпадения паролей
    if (formData.password && formData.password !== formData.confirmPassword) {
      toast.error('Пароли не совпадают');
      return;
    }

    try {
      setSaving(true);
      const updateData: any = {
        email: formData.email,
        firstName: formData.firstName,
        lastName: formData.lastName,
        phone: formData.phone || null,
      };

      // Добавляем пароль только если он указан
      if (formData.password) {
        updateData.password = formData.password;
      }

      const response = await api.put('/auth/profile', updateData);
      
      // Обновляем данные пользователя в store
      if (response.data.user && user) {
        setUser({
          id: response.data.user.id,
          email: response.data.user.email,
          firstName: response.data.user.firstName,
          lastName: response.data.user.lastName,
          role: response.data.user.role,
          twoFactorEnabled: response.data.user.twoFactorEnabled || false,
        });
      }

      toast.success('Профиль обновлен');
      
      // Очищаем поля паролей после успешного сохранения
      setFormData({
        ...formData,
        password: '',
        confirmPassword: '',
      });
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Ошибка обновления профиля');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateTelegramBindLink = async () => {
    try {
      const response = await api.post('/invite-links/bind-telegram');
      setBindLink(response.data.link);
      toast.success('Ссылка создана! Перейдите по ней в Telegram для привязки аккаунта.');
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Ошибка создания ссылки');
    }
  };


  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 transition-colors">
        <Navbar />
        <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
          <div className="text-gray-500">Загрузка...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 transition-colors">
      <Navbar />

      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">
            Профиль
          </h1>
          <p className="text-gray-600">Управление личными данными</p>
        </div>

        <div className="card p-6 sm:p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Информация о пользователе */}
            <div className="flex items-center space-x-4 mb-6 pb-6 border-b border-gray-200">
              <div className="w-16 h-16 bg-gradient-to-r from-primary-500 to-primary-600 rounded-full flex items-center justify-center">
                <UserCircle className="w-8 h-8 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-gray-900">
                  {formData.firstName} {formData.lastName}
                </h2>
                <p className="text-sm text-gray-500">{user?.role}</p>
              </div>
            </div>

            {/* Личные данные */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <User className="w-5 h-5" />
                Личные данные
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Имя
                  </label>
                  <input
                    type="text"
                    value={formData.firstName}
                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                    className="input"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Фамилия
                  </label>
                  <input
                    type="text"
                    value={formData.lastName}
                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                    className="input"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
                    <Phone className="w-4 h-4" />
                    Телефон
                  </label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="input"
                    placeholder="+7 (999) 123-45-67"
                  />
                </div>
              </div>
            </div>

            {/* Данные для входа */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Lock className="w-5 h-5" />
                Данные для входа
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Логин
                  </label>
                  <input
                    type="text"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="input"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Новый пароль (оставьте пустым, чтобы не менять)
                  </label>
                  <input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="input"
                    placeholder="Любой пароль"
                  />
                </div>

                {formData.password && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Подтвердите новый пароль
                    </label>
                    <input
                      type="password"
                      value={formData.confirmPassword}
                      onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                      className="input"
                      placeholder="Повторите пароль"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Привязка Telegram */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <MessageCircle className="w-5 h-5" />
                Telegram
              </h3>
              <div className="space-y-4">
                {telegramLinked ? (
                  <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                    <p className="text-green-800 font-medium">✅ Telegram аккаунт привязан</p>
                    <p className="text-sm text-green-600 mt-1">Вы будете получать уведомления через Telegram</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {bindLink ? (
                      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                        <p className="text-blue-800 font-medium mb-3">Ссылка для привязки создана:</p>
                        <a
                          href={bindLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-primary flex items-center justify-center gap-2 w-full"
                        >
                          <ExternalLink className="w-4 h-4" />
                          Перейти по ссылке для привязки Telegram
                        </a>
                        <p className="text-sm text-blue-600 mt-3 text-center">
                          Откроется Telegram для привязки аккаунта
                        </p>
                      </div>
                    ) : (
                      <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                        <p className="text-gray-700 mb-3">Привяжите Telegram аккаунт для получения уведомлений</p>
                        <button
                          type="button"
                          onClick={handleCreateTelegramBindLink}
                          className="btn-primary flex items-center gap-2"
                        >
                          <MessageCircle className="w-4 h-4" />
                          Привязать Telegram
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Кнопки */}
            <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
              <button
                type="button"
                onClick={loadProfile}
                className="btn-secondary"
                disabled={saving}
              >
                Отмена
              </button>
              <button
                type="submit"
                disabled={saving}
                className="btn-primary flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                {saving ? 'Сохранение...' : 'Сохранить изменения'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

