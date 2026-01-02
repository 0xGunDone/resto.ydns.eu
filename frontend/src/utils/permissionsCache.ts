/**
 * Модуль кэширования прав доступа
 * Вынесен отдельно для избежания циклических зависимостей
 */

// Глобальный кэш прав по restaurantId
export const permissionsCache = new Map<string, { permissions: string[]; timestamp: number }>();

// TTL для кэша (5 минут)
export const CACHE_TTL = 5 * 60 * 1000;

// Глобальный кэш для useGlobalPermissions
export let globalPermissionsCache: {
  permissionsMap: Record<string, string[]>;
  timestamp: number;
  userId: string | null;
} | null = null;

/**
 * Устанавливает глобальный кэш прав
 */
export function setGlobalPermissionsCache(cache: typeof globalPermissionsCache): void {
  globalPermissionsCache = cache;
}

/**
 * Получает глобальный кэш прав
 */
export function getGlobalPermissionsCache(): typeof globalPermissionsCache {
  return globalPermissionsCache;
}

/**
 * Очищает весь кэш прав доступа
 * Вызывается при logout для обеспечения безопасности
 */
export function clearPermissionsCache(): void {
  permissionsCache.clear();
  globalPermissionsCache = null;
}

/**
 * Инвалидирует кэш для конкретного ресторана
 */
export function invalidateRestaurantCache(restaurantId: string): void {
  permissionsCache.delete(restaurantId);
}

/**
 * Проверяет, валиден ли кэш (не истёк TTL)
 */
export function isCacheValid(timestamp: number): boolean {
  return Date.now() - timestamp < CACHE_TTL;
}

/**
 * Получает размер кэша (для тестирования)
 */
export function getCacheSize(): number {
  return permissionsCache.size;
}

/**
 * Проверяет, есть ли запись в кэше для ресторана
 */
export function hasCacheEntry(restaurantId: string): boolean {
  return permissionsCache.has(restaurantId);
}
