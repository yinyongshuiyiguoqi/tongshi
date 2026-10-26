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

type LensPhase = 'idle' | 'stretch' | 'settle';

export function Dock({ value, onChange }: { value: TabKey; onChange: (k: TabKey) => void }) {
  const hostRef = useRef<HTMLElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [lens, setLens] = useState<{ x: number; w: number; phase: LensPhase }>({
    x: 0,
    w: 0,
    phase: 'idle',
  });
  const [dragging, setDragging] = useState(false);
  const [dragX, setDragX] = useState(0);
  const [stretch, setStretch] = useState(0);
  const lensRef = useRef<{ x: number; w: number }>({ x: 0, w: 0 });
  const settled = useRef(false);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const glass = new LiquidGlass(el, { tint: 0.55, tintTone: 'dark', frost: 0.55, radius: 30 });
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

  // 切换时：先拉成「旧位置到新位置」的并集，再收缩落位 —— 就是 QQ 那种被拽过去的弹性
  useEffect(() => {
    if (!boxes.length || dragging) return;
    const to = boxes[activeIndex];
    if (!to) return;

    if (!settled.current) {
      setLens({ ...to, phase: 'idle' });
      lensRef.current = to;
      settled.current = true;
      return;
    }

    const from = lensRef.current;
    if (Math.abs(from.x - to.x) < 1 && Math.abs(from.w - to.w) < 1) return;

    const unionX = Math.min(from.x, to.x);
    const unionW = Math.max(from.x + from.w, to.x + to.w) - unionX;

    setLens({ x: unionX, w: unionW, phase: 'stretch' });

    const timer = window.setTimeout(() => {
      setLens({ ...to, phase: 'settle' });
      lensRef.current = to;
    }, 130);

    return () => window.clearTimeout(timer);
  }, [value, boxes, activeIndex, dragging]);

  function onPointerDown(e: ReactPointerEvent) {
    if (boxes.length === 0 || e.button !== 0) return;

    const startX = e.clientX;
    const base = boxes[activeIndex].x;
    const width = boxes[activeIndex].w;
    const min = boxes[0].x;
    const max = boxes[boxes.length - 1].x;
    let currentX = base;
    let moved = false;
    let lastX = e.clientX;
    let lastT = performance.now();

    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      if (!moved && Math.abs(dx) < 5) return;
      moved = true;
      setDragging(true);

      const now = performance.now();
      const dt = Math.max(8, now - lastT);
      const v = ((ev.clientX - lastX) / dt) * 1000; // px/s
      lastX = ev.clientX;
      lastT = now;

      currentX = Math.min(max, Math.max(min, base + dx));
      setDragX(currentX);
      // 拖得越快，指条在水平方向拉得越长，垂直方向压扁一点
      setStretch(Math.min(0.22, Math.abs(v) / 3600));
    };

    const finish = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);

      if (!moved) {
        setDragging(false);
        setStretch(0);
        return;
      }

      const halfW = width / 2;
      let best = activeIndex;
      let bestDist = Infinity;
      boxes.forEach((b, i) => {
        const d = Math.abs(b.x + b.w / 2 - (currentX + halfW));
        if (d < bestDist) {
          bestDist = d;
          best = i;
        }
      });

      setDragging(false);
      setStretch(0);
      lensRef.current = { x: currentX, w: width };
      setLens({ x: currentX, w: width, phase: 'idle' });

      if (ITEMS[best].key !== value) onChange(ITEMS[best].key);
      // 没换项时交给上面的 effect 做回弹，别在这里再排一次动画
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
  }

  const duration = lens.phase === 'stretch' ? 130 : lens.phase === 'settle' ? 560 : 0;
  const easing = lens.phase === 'settle' ? 'cubic-bezier(.16,1.35,.36,1)' : 'cubic-bezier(.3,.9,.3,1)';

  const style = dragging
    ? {
        transform: `translateX(${dragX}px) scale(${1 + stretch}, ${1 - stretch * 0.45})`,
        width: boxes[activeIndex]?.w ?? 0,
        transition: 'none',
      }
    : {
        transform: `translateX(${lens.x}px)`,
        width: lens.w || undefined,
        transition: `transform ${duration}ms ${easing}, width ${duration}ms ${easing}`,
      };

  return (
    <nav className="dock" ref={hostRef} aria-label="主导航" onPointerDown={onPointerDown}>
      <span className={`dock-lens${dragging ? ' is-drag' : ''}`} style={style} aria-hidden="true" />
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
