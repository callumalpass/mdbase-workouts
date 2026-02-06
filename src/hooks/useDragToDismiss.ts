import { useRef, useState, useCallback, type CSSProperties } from "react";

const THRESHOLD = 150;

export function useDragToDismiss(onDismiss: () => void) {
  const startY = useRef(0);
  const [offsetY, setOffsetY] = useState(0);
  const dragging = useRef(false);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    startY.current = e.touches[0].clientY;
    dragging.current = true;
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!dragging.current) return;
    const delta = e.touches[0].clientY - startY.current;
    if (delta > 0) setOffsetY(delta);
  }, []);

  const onTouchEnd = useCallback(() => {
    dragging.current = false;
    if (offsetY > THRESHOLD) {
      onDismiss();
    }
    setOffsetY(0);
  }, [offsetY, onDismiss]);

  const style: CSSProperties =
    offsetY > 0
      ? { transform: `translateY(${offsetY}px)`, transition: dragging.current ? "none" : "transform 0.2s ease-out" }
      : {};

  const dragHandleProps = { onTouchStart, onTouchMove, onTouchEnd };

  return { style, dragHandleProps };
}
