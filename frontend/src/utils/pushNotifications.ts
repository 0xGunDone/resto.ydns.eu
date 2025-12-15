import api from './api';

let serviceWorkerRegistration: ServiceWorkerRegistration | null = null;

/**
 * Регистрация Service Worker
 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) {
    console.warn('Service Worker не поддерживается');
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js');
    serviceWorkerRegistration = registration;
    console.log('Service Worker зарегистрирован:', registration);
    return registration;
  } catch (error) {
    console.error('Ошибка регистрации Service Worker:', error);
    return null;
  }
}

/**
 * Получение публичного VAPID ключа с сервера
 */
async function getVapidPublicKey(): Promise<string | null> {
  try {
    const response = await api.get('/vapid-public-key');
    return response.data.publicKey || null;
  } catch (error) {
    console.error('Ошибка получения VAPID ключа:', error);
    return null;
  }
}

/**
 * Подписка на push-уведомления
 */
export async function subscribeToPushNotifications(): Promise<PushSubscription | null> {
  try {
    // Регистрируем Service Worker, если еще не зарегистрирован
    if (!serviceWorkerRegistration) {
      serviceWorkerRegistration = await registerServiceWorker();
      if (!serviceWorkerRegistration) {
        return null;
      }
    }

    // Проверяем поддержку push-уведомлений
    if (!('PushManager' in window)) {
      console.warn('Push-уведомления не поддерживаются');
      return null;
    }

    // Получаем существующую подписку
    let subscription = await serviceWorkerRegistration.pushManager.getSubscription();

    // Если подписки нет, создаем новую
    if (!subscription) {
      const publicKey = await getVapidPublicKey();
      if (!publicKey) {
        throw new Error('VAPID ключ не настроен на сервере');
      }

      // Преобразуем ключ в новый Uint8Array, совместимый с BufferSource
      const serverKey = new Uint8Array(Array.from(urlBase64ToUint8Array(publicKey)));

      subscription = await serviceWorkerRegistration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: serverKey,
      });
    }

    // Отправляем подписку на сервер
    const subscriptionData = subscription.toJSON();
    await api.post('/push-subscriptions/subscribe', {
      endpoint: subscriptionData.endpoint,
      keys: {
        p256dh: subscriptionData.keys?.p256dh,
        auth: subscriptionData.keys?.auth,
      },
    });

    return subscription;
  } catch (error: any) {
    console.error('Ошибка подписки на push-уведомления:', error);
    return null;
  }
}

/**
 * Отписка от push-уведомлений
 */
export async function unsubscribeFromPushNotifications(): Promise<boolean> {
  try {
    if (!serviceWorkerRegistration) {
      return false;
    }

    const subscription = await serviceWorkerRegistration.pushManager.getSubscription();
    if (!subscription) {
      return false;
    }

    // Отправляем запрос на сервер об отписке
    await api.post('/push-subscriptions/unsubscribe', {
      endpoint: subscription.endpoint,
    });

    // Удаляем подписку локально
    await subscription.unsubscribe();

    return true;
  } catch (error) {
    console.error('Ошибка отписки от push-уведомлений:', error);
    return false;
  }
}

/**
 * Проверка статуса подписки
 */
export async function checkSubscriptionStatus(): Promise<boolean> {
  try {
    if (!serviceWorkerRegistration) {
      serviceWorkerRegistration = await registerServiceWorker();
      if (!serviceWorkerRegistration) {
        return false;
      }
    }

    const subscription = await serviceWorkerRegistration.pushManager.getSubscription();
    return subscription !== null;
  } catch (error) {
    console.error('Ошибка проверки статуса подписки:', error);
    return false;
  }
}

/**
 * Преобразование VAPID ключа из base64 в Uint8Array
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
}

