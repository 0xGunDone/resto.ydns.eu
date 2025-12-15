import { useRef, useCallback } from 'react';

interface SwipeOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
  threshold?: number; // Минимальное расстояние для распознавания свайпа (по умолчанию 50px)
  preventDefault?: boolean;
}

export function useSwipe(options: SwipeOptions = {}) {
  const {
    onSwipeLeft,
    onSwipeRight,
    onSwipeUp,
    onSwipeDown,
    threshold = 50,
    preventDefault = true,
  } = options;

  const startPos = useRef<{ x: number; y: number } | null>(null);
  const elementRef = useRef<HTMLDivElement | null>(null);

  const handleStart = useCallback((x: number, y: number) => {
    startPos.current = { x, y };
  }, []);

  const handleEnd = useCallback((x: number, y: number) => {
    if (!startPos.current) return;

    const deltaX = x - startPos.current.x;
    const deltaY = y - startPos.current.y;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    // Определяем направление свайпа
    if (absX > threshold || absY > threshold) {
      if (absX > absY) {
        // Горизонтальный свайп
        if (deltaX > 0) {
          onSwipeRight?.();
        } else {
          onSwipeLeft?.();
        }
      } else {
        // Вертикальный свайп
        if (deltaY > 0) {
          onSwipeDown?.();
        } else {
          onSwipeUp?.();
        }
      }
    }

    startPos.current = null;
  }, [threshold, onSwipeLeft, onSwipeRight, onSwipeUp, onSwipeDown]);

  const touchHandlers = {
    onTouchStart: (e: React.TouchEvent) => {
      const touch = e.touches[0];
      handleStart(touch.clientX, touch.clientY);
      if (preventDefault) {
        e.preventDefault();
      }
    },
    onTouchMove: (e: React.TouchEvent) => {
      if (preventDefault && startPos.current) {
        e.preventDefault();
      }
    },
    onTouchEnd: (e: React.TouchEvent) => {
      if (startPos.current && e.changedTouches.length > 0) {
        const touch = e.changedTouches[0];
        handleEnd(touch.clientX, touch.clientY);
      }
    },
  };

  const mouseHandlers = {
    onMouseDown: (e: React.MouseEvent) => {
      handleStart(e.clientX, e.clientY);
    },
    onMouseUp: (e: React.MouseEvent) => {
      if (startPos.current) {
        handleEnd(e.clientX, e.clientY);
      }
    },
  };

  return {
    ref: elementRef,
    handlers: {
      ...touchHandlers,
      ...mouseHandlers,
    },
  };
}
