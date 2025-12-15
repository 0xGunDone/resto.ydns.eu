# Улучшения мобильной версии

## Реализованные улучшения

### 1. Оптимизация для смартфонов

- ✅ **Touch targets** - минимальный размер 44x44px для всех интерактивных элементов
- ✅ **Touch manipulation** - оптимизирована обработка касаний
- ✅ **Safe area insets** - поддержка устройств с notch (iPhone X и новее)
- ✅ **Увеличенные размеры** - кнопки и поля ввода адаптированы для мобильных
- ✅ **Предотвращение авто-зума** - размер шрифта 16px для input полей

### 2. Свайпы для действий

Создан хук `useSwipe` для распознавания свайпов:

```typescript
import { useSwipe } from '../hooks/useSwipe';

const { handlers, ref } = useSwipe({
  onSwipeLeft: () => console.log('Свайп влево'),
  onSwipeRight: () => console.log('Свайп вправо'),
  threshold: 50, // минимальное расстояние в пикселях
});

<div ref={ref} {...handlers}>
  Элемент с поддержкой свайпов
</div>
```

**Применение:**
- В задачах: свайп влево/вправо для изменения статуса
- В графике: свайп влево/вправо для навигации по датам
- В списках: свайп для быстрых действий (удаление, редактирование)

### 3. Оффлайн режим

Улучшен service worker с кешированием:

- **Network First** - для API запросов (сначала сеть, потом кеш)
- **Cache First** - для статических ресурсов (сначала кеш, потом сеть)
- **Автоматический fallback** - при отсутствии сети возвращаются кешированные данные
- **Кеширование API** - успешные ответы API кешируются для оффлайн использования

### 4. Быстрые действия (FAB)

Компонент `FloatingActionButton` для быстрого доступа к действиям:

```typescript
import FloatingActionButton from '../components/FloatingActionButton';
import { Plus, Calendar } from 'lucide-react';

<FloatingActionButton
  mainAction={{
    icon: Plus,
    onClick: () => setShowModal(true),
    label: 'Создать',
  }}
  actions={[
    {
      name: 'Создать задачу',
      icon: CheckSquare,
      onClick: () => createTask(),
    },
    {
      name: 'Создать смену',
      icon: Calendar,
      onClick: () => createShift(),
    },
  ]}
  position="bottom-right"
/>
```

### 5. PWA улучшения

- ✅ **manifest.json** - конфигурация для установки как приложение
- ✅ **Shortcuts** - быстрый доступ к основным разделам
- ✅ **Мета-теги** - оптимизация для iOS и Android
- ✅ **Theme color** - цвет темы приложения

## Использование

### Добавление свайпов в задачи

```typescript
// В TasksPage.tsx
import { useSwipe } from '../hooks/useSwipe';

function TaskCard({ task, onStatusChange }) {
  const { handlers, ref } = useSwipe({
    onSwipeLeft: () => {
      // Переместить задачу в следующий статус
      moveToNextStatus(task);
    },
    onSwipeRight: () => {
      // Переместить задачу в предыдущий статус
      moveToPreviousStatus(task);
    },
    threshold: 100, // для задач нужен более длинный свайп
  });

  return (
    <div ref={ref} {...handlers} className="task-card">
      {/* содержимое карточки задачи */}
    </div>
  );
}
```

### Добавление FAB на страницу

```typescript
// В SchedulePage.tsx
import FloatingActionButton from '../components/FloatingActionButton';
import { Plus, Calendar, Clock } from 'lucide-react';

<FloatingActionButton
  mainAction={{
    icon: Plus,
    onClick: () => setShowCreateModal(true),
    label: 'Создать смену',
  }}
  actions={[
    {
      name: 'Быстрое создание',
      icon: Clock,
      onClick: () => quickCreateShift(),
    },
  ]}
/>
```

### Оффлайн индикатор

Для отображения статуса подключения:

```typescript
const [isOnline, setIsOnline] = useState(navigator.onLine);

useEffect(() => {
  const handleOnline = () => setIsOnline(true);
  const handleOffline = () => setIsOnline(false);
  
  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);
  
  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  };
}, []);

{!isOnline && (
  <div className="bg-yellow-100 text-yellow-800 p-2 text-center">
    Оффлайн режим. Данные могут быть устаревшими.
  </div>
)}
```

## CSS классы

- `.touch-target` - минимальный размер 44x44px для touch элементов
- `.no-select` - предотвращение выделения текста при тапе
- `.fab` - стиль плавающей кнопки действий
- `.safe-area-inset-bottom` - отступ для безопасной зоны (notch)
- `.safe-area-inset-top` - отступ для безопасной зоны сверху
- `.animate-fade-in` - анимация появления для FAB меню

## Следующие шаги

1. Применить свайпы в задачах для изменения статуса
2. Добавить свайпы в график для навигации по датам
3. Добавить FAB кнопки на страницы создания (задачи, смены)
4. Добавить оффлайн индикатор в интерфейс
5. Оптимизировать изображения и иконки для мобильных

## Примечания

- Все улучшения обратно совместимы
- Работают на всех современных браузерах
- Поддерживаются как touch, так и mouse события
- Оптимизировано для производительности

