import { useEffect } from 'react';
import { useThemeStore } from '../store/themeStore';

/**
 * Хук для управления темой приложения
 */
export function useTheme() {
  const { mode, effectiveTheme, setMode } = useThemeStore();

  // Применяем тему при монтировании и изменении
  useEffect(() => {
    if (effectiveTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [effectiveTheme]);

  // Проверяем авто-режим каждую минуту
  useEffect(() => {
    if (mode === 'auto') {
      const interval = setInterval(() => {
        const hour = new Date().getHours();
        const shouldBeDark = hour >= 20 || hour < 8;
        const currentIsDark = document.documentElement.classList.contains('dark');
        
        if (shouldBeDark && !currentIsDark) {
          document.documentElement.classList.add('dark');
          useThemeStore.setState({ effectiveTheme: 'dark' });
        } else if (!shouldBeDark && currentIsDark) {
          document.documentElement.classList.remove('dark');
          useThemeStore.setState({ effectiveTheme: 'light' });
        }
      }, 60000); // Проверяем каждую минуту

      return () => clearInterval(interval);
    }
  }, [mode]);

  const toggleTheme = () => {
    if (mode === 'light') {
      setMode('dark');
    } else if (mode === 'dark') {
      setMode('auto');
    } else {
      setMode('light');
    }
  };

  return {
    mode,
    effectiveTheme,
    setMode,
    toggleTheme,
    isDark: effectiveTheme === 'dark',
  };
}

