import { useRef } from 'react';

/** A drag handle. `onDrag` receives the pointer's clientX (vertical) or clientY (horizontal). */
export function Splitter({
  orientation,
  onDrag,
  onEnd,
  className = '',
}: {
  orientation: 'vertical' | 'horizontal';
  onDrag: (position: number) => void;
  onEnd?: () => void;
  className?: string;
}) {
  const dragging = useRef(false);
  return (
    <div
      role="separator"
      aria-orientation={orientation}
      className={`splitter splitter-${orientation} ${className}`}
      onPointerDown={(event) => {
        dragging.current = true;
        event.currentTarget.setPointerCapture(event.pointerId);
        document.body.classList.add('is-resizing');
      }}
      onPointerMove={(event) => {
        if (dragging.current) onDrag(orientation === 'vertical' ? event.clientX : event.clientY);
      }}
      onPointerUp={(event) => {
        dragging.current = false;
        event.currentTarget.releasePointerCapture(event.pointerId);
        document.body.classList.remove('is-resizing');
        onEnd?.();
      }}
    />
  );
}
