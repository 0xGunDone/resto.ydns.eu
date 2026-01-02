import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { clearPermissionsCache } from '../utils/permissionsCache';

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  twoFactorEnabled: boolean;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  setAuth: (user: User, accessToken: string, refreshToken: string) => void;
  setUser: (user: User) => void;
  logout: () => void;
  isAuthenticated: () => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      setAuth: (user, accessToken, refreshToken) => {
        set({ user, accessToken, refreshToken });
      },
      setUser: (user) => {
        set({ user });
      },
      logout: () => {
        // Очищаем кэш прав доступа при logout (Requirements 9.5)
        clearPermissionsCache();
        set({ user: null, accessToken: null, refreshToken: null });
      },
      isAuthenticated: () => {
        return get().accessToken !== null && get().user !== null;
      },
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => localStorage),
    }
  )
);

