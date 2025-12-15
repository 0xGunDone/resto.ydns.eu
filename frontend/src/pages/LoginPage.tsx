import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import api from '../utils/api';
import { useAuthStore } from '../store/authStore';
import toast from 'react-hot-toast';
import { Calendar, ArrowLeft } from 'lucide-react';

const loginSchema = z.object({
  email: z.string().min(1, 'Логин обязателен'),
  password: z.string().min(1, 'Пароль обязателен'),
});

const twoFactorSchema = z.object({
  token: z.string().length(6, 'Код должен содержать 6 цифр'),
});

type LoginFormData = z.infer<typeof loginSchema>;
type TwoFactorFormData = z.infer<typeof twoFactorSchema>;

export default function LoginPage() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.setAuth);
  const [requires2FA, setRequires2FA] = useState(false);
  const [email, setEmail] = useState('');

  const loginForm = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  const twoFactorForm = useForm<TwoFactorFormData>({
    resolver: zodResolver(twoFactorSchema),
  });

  const onLoginSubmit = async (data: LoginFormData) => {
    try {
      const response = await api.post('/auth/login', data);

      if (response.data.requires2FA) {
        setRequires2FA(true);
        setEmail(data.email);
        toast.success('Введите код из приложения-аутентификатора');
      } else {
        setAuth(
          response.data.user,
          response.data.accessToken,
          response.data.refreshToken
        );
        toast.success('Вход выполнен успешно');
        navigate('/dashboard');
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Ошибка входа');
    }
  };

  const onTwoFactorSubmit = async (data: TwoFactorFormData) => {
    try {
      const response = await api.post('/auth/2fa/verify', {
        email,
        token: data.token,
      });

      setAuth(
        response.data.user,
        response.data.accessToken,
        response.data.refreshToken
      );
      toast.success('Вход выполнен успешно');
      navigate('/dashboard');
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Неверный код');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 via-white to-primary-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full">
        {/* Логотип */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-r from-primary-600 to-primary-700 rounded-2xl mb-4 shadow-lg">
            <Calendar className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-primary-600 to-primary-700 bg-clip-text text-transparent">
            Resto Management
          </h2>
          <p className="mt-2 text-sm sm:text-base text-gray-600">
            Войдите в свой аккаунт
          </p>
        </div>

        {/* Форма */}
        <div className="card p-6 sm:p-8">
          {!requires2FA ? (
            <form
              className="space-y-6"
              onSubmit={loginForm.handleSubmit(onLoginSubmit)}
            >
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                  Логин
                </label>
                <input
                  {...loginForm.register('email')}
                  type="text"
                  autoComplete="username"
                  className="input"
                  placeholder="Введите логин"
                />
                {loginForm.formState.errors.email && (
                  <p className="mt-1 text-sm text-red-600">
                    {loginForm.formState.errors.email.message}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                  Пароль
                </label>
                <input
                  {...loginForm.register('password')}
                  type="password"
                  autoComplete="current-password"
                  className="input"
                  placeholder="••••••••"
                />
                {loginForm.formState.errors.password && (
                  <p className="mt-1 text-sm text-red-600">
                    {loginForm.formState.errors.password.message}
                  </p>
                )}
              </div>

              <button
                type="submit"
                className="btn-primary w-full"
              >
                Войти
              </button>
            </form>
          ) : (
            <form
              className="space-y-6"
              onSubmit={twoFactorForm.handleSubmit(onTwoFactorSubmit)}
            >
              <div>
                <label htmlFor="token" className="block text-sm font-medium text-gray-700 mb-2">
                  Код двухфакторной аутентификации
                </label>
                <input
                  {...twoFactorForm.register('token')}
                  type="text"
                  maxLength={6}
                  className="input text-center text-2xl tracking-widest"
                  placeholder="000000"
                />
                {twoFactorForm.formState.errors.token && (
                  <p className="mt-1 text-sm text-red-600">
                    {twoFactorForm.formState.errors.token.message}
                  </p>
                )}
              </div>

              <button
                type="submit"
                className="btn-primary w-full"
              >
                Подтвердить
              </button>

              <button
                type="button"
                onClick={() => {
                  setRequires2FA(false);
                  twoFactorForm.reset();
                }}
                className="w-full flex items-center justify-center gap-2 text-sm text-primary-600 hover:text-primary-700 font-medium"
              >
                <ArrowLeft className="w-4 h-4" />
                Назад к входу
              </button>
            </form>
          )}
        </div>

        {/* Подсказка */}
        <p className="mt-6 text-center text-xs sm:text-sm text-gray-500">
          По умолчанию: admin@resto.local / Admin123!
        </p>
      </div>
    </div>
  );
}
