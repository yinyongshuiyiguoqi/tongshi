import { useEffect, useRef, type ReactNode } from 'react';
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
        <path
          d="M5 7h14M5 12h14M5 17h9"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
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
        <path d="M5 19.4c.9-3.1 3.6-4.8 7-4.8s6.1 1.7 7 4.8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    ),
  },
];

export function Dock({
  value,
  onChange,
}: {
  value: TabKey;
  onChange: (k: TabKey) => void;
}) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const glass = new LiquidGlass(el, {
      tint: 0.85,
      tintTone: 'dark',
      frost: 0.7,
      radius: 26,
    });
    return () => glass.destroy();
  }, []);

  return (
    <nav className="dock" ref={ref} aria-label="主导航">
      {ITEMS.map((it) => (
        <button
          key={it.key}
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
