import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { LiquidGlass } from 'apple-liquid-glass-webgl';

export type TabKey = 'query' | 'cases' | 'history' | 'profile';

const ITEMS: { key: TabKey; label: string; icon: ReactNode }[] = [
  {
    key: 'query',
    label: '查询',
    icon: (
      <svg viewBox="0 0 24 24" width="21" height="21" aria-hidden="true">
        <circle cx="11" cy="11" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M15.6 15.6L20 20" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    key: 'cases',
    label: '情形',
    icon: (
      <svg viewBox="0 0 24 24" width="21" height="21" aria-hidden="true">
        <path d="M5 7h14M5 12h14M5 17h9" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    key: 'history',
    label: '记录',
    icon: (
      <svg viewBox="0 0 24 24" width="21" height="21" aria-hidden="true">
        <circle cx="12" cy="12" r="7.4" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M12 7.6V12l3 1.8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    key: 'profile',
    label: '我的',
    icon: (
      <svg viewBox="0 0 24 24" width="21" height="21" aria-hidden="true">
        <circle cx="12" cy="8.6" r="3.4" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path
          d="M5 19.4c.9-3.1 3.6-4.8 7-4.8s6.1 1.7 7 4.8"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
];

interface Box {
  x: number;
  w: number;
}

export function Dock({ value, onChange }: { value: TabKey; onChange: (k: TabKey) => void }) {
  const hostRef = useRef<HTMLElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [dragX, setDragX] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const glass = new LiquidGlass(el, { tint: 0.85, tintTone: 'dark', frost: 0.7, radius: 30 });
    return () => glass.destroy();
  }, []);

  const measure = useCallback(() => {
    const host = hostRef.current;
    if (!host) return;
    const hr = host.getBoundingClientRect();
    setBoxes(
      itemRefs.current.map((el) => {
        if (!el) return { x: 0, w: 0 };
        const r = el.getBoundingClientRect();
        return { x: r.left - hr.left, w: r.width };
      }),
    );
  }, []);

  useLayoutEffect(() => {
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure]);

  const activeIndex = Math.max(
    0,
    ITEMS.findIndex((i) => i.key === value),
  );
  const activeBox = boxes[activeIndex];
  const x = dragX ?? activeBox?.x ?? 0;
  const w = activeBox?.w ?? 0;

  // 按住横向拖动，1:1 跟手；松手按当前中心加一点速度投影，落到最近的一项
  function onPointerDown(e: ReactPointerEvent) {
    if (boxes.length === 0 || e.button !== 0) return;

    const startX = e.clientX;
    const base = boxes[activeIndex].x;
    const min = boxes[0].x;
    const max = boxes[boxes.length - 1].x;
    let currentX = base;
    let moved = false;
    let lastX = e.clientX;
    let lastT = performance.now();
    let velocity = 0;

    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      if (!moved && Math.abs(dx) < 5) return;
      moved = true;
      setDragging(true);

      const now = performance.now();
      const dt = Math.max(8, now - lastT);
      velocity = ((ev.clientX - lastX) / dt) * 1000;
      lastX = ev.clientX;
      lastT = now;

      currentX = Math.min(max, Math.max(min, base + dx));
      setDragX(currentX);
    };

    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);

      if (!moved) {
        setDragX(null);
        setDragging(false);
        return;
      }

      const halfW = boxes[activeIndex].w / 2;
      // 速度只做一点暗示，别让轻轻一划就飞过两格
      const drift = Math.max(-56, Math.min(56, velocity * 0.05));
      const projectedCenter = currentX + halfW + drift;

      let best = activeIndex;
      let bestDist = Infinity;
      boxes.forEach((b, i) => {
        const d = Math.abs(b.x + b.w / 2 - projectedCenter);
        if (d < bestDist) {
          bestDist = d;
          best = i;
        }
      });

      setDragging(false);
      setDragX(null);
      if (ITEMS[best].key !== value) onChange(ITEMS[best].key);
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  return (
    <nav className="dock" ref={hostRef} aria-label="主导航" onPointerDown={onPointerDown}>
      <span
        className={`dock-lens${dragging ? ' is-drag' : ''}`}
        style={{ transform: `translateX(${x}px)`, width: w || undefined }}
        aria-hidden="true"
      />
      {ITEMS.map((it, i) => (
        <button
          key={it.key}
          ref={(el) => {
            itemRefs.current[i] = el;
          }}
          className={`dock-item${value === it.key ? ' is-on' : ''}`}
          onClick={() => onChange(it.key)}
          aria-current={value === it.key ? 'page' : undefined}
        >
          {it.icon}
          <span>{it.label}</span>
        </button>
      ))}
    </nav>
  );
}
