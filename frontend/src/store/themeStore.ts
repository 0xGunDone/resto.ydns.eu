import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type ThemeMode = 'light' | 'dark' | 'auto';

interface ThemeState {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  effectiveTheme: 'light' | 'dark'; // Реальная тема с учетом auto
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => {
      // Функция определения реальной темы
      const getEffectiveTheme = (mode: ThemeMode): 'light' | 'dark' => {
        if (mode === 'auto') {
          // Автоматическое определение по времени (с 20:00 до 8:00 - темная тема)
          const hour = new Date().getHours();
          return hour >= 20 || hour < 8 ? 'dark' : 'light';
        }
        return mode;
      };

      // Инициализация с применением темы к документу
      const initialMode: ThemeMode = 'light';
      const initialEffectiveTheme = getEffectiveTheme(initialMode);

      // Применяем тему сразу при создании store
      if (typeof window !== 'undefined') {
        if (initialEffectiveTheme === 'dark') {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
      }

      return {
        mode: initialMode,
        effectiveTheme: initialEffectiveTheme,
        setMode: (mode: ThemeMode) => {
          const effectiveTheme = getEffectiveTheme(mode);
          set({ mode, effectiveTheme });
          
          // Применяем тему к документу
          if (typeof window !== 'undefined') {
            if (effectiveTheme === 'dark') {
              document.documentElement.classList.add('dark');
            } else {
              document.documentElement.classList.remove('dark');
            }
          }
        },
      };
    },
    {
      name: 'theme-storage',
      storage: createJSONStorage(() => localStorage),
      onRehydrateStorage: () => (state) => {
        // При восстановлении из localStorage применяем тему
        if (state && typeof window !== 'undefined') {
          const effectiveTheme = state.mode === 'auto' 
            ? (new Date().getHours() >= 20 || new Date().getHours() < 8 ? 'dark' : 'light')
            : state.mode;
          
          if (effectiveTheme === 'dark') {
            document.documentElement.classList.add('dark');
          } else {
            document.documentElement.classList.remove('dark');
          }
          
          state.effectiveTheme = effectiveTheme as 'light' | 'dark';
        }
      },
    }
  )
);

