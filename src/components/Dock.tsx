import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { LiquidGlass } from 'apple-liquid-glass-webgl';
import { loadDockFrost, onPrefsChange } from '../lib/prefs';
import { photoUrl, type BackdropSetting } from './Backdrop';
import { paintControlText } from '../lib/glassTextPainter';

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

/** 选中胶囊往内收几个像素，四边留出呼吸空间，不贴着外框圆角 */
const INSET = 4;

type LensPhase = 'idle' | 'stretch' | 'settle';

const GLASS_FROST_MAX = 0.9;

/**
 * 0 = 液态玻璃，0.9 = 毛玻璃。
 * 两个映射必须同时变化，否则滑块中间会只剩“糊”而没有玻璃边缘：
 * - tint 随 frost 缓慢增加，给文字留底；
 * - refraction / edgeReach / dispersion 随 frost 下降，避免毛玻璃还带彩色边缘；
 * - backdropBlur 用绝对像素补足毛玻璃的雾化。
 */
function glassTint(tone: 'light' | 'dark', frost: number): number {
  const f = Math.min(GLASS_FROST_MAX, Math.max(0, frost));
  return (tone === 'light' ? 0.26 : 0.14) + f * 0.06;
}

function glassMaterial(frost: number) {
  const f = Math.min(GLASS_FROST_MAX, Math.max(0, frost));
  return {
    refraction: 112 - f * 78, // 112 → 41.8
    edgeReach: 0.15 - f * 0.03, // 0.15 → 0.123
    dispersion: 2.2 - f * 1.3, // 2.2 → 1.03
    frost: f,
    backdropBlur: f * 8, // 0 → 7.2px
    body: 0.7 + f * 0.14, // 0.70 → 0.826
    rim: 0.26 - f * 0.06, // 0.26 → 0.206
    reflection: 0.32 - f * 0.05, // 0.32 → 0.275
    highlight: 0.35 - f * 0.08, // 0.35 → 0.278
  };
}

/** 取背景底部中心区域的亮度和对比度，决定玻璃色调和文字阴影强度 */
function useBackdropLuminance(setting: BackdropSetting): { lum: number; contrast: number } {
  const [metrics, setMetrics] = useState({ lum: 0.45, contrast: 0.18 });

  useEffect(() => {
    const url =
      setting.kind === 'custom' && setting.dataUrl
        ? setting.dataUrl
        : photoUrl(setting.photo ?? 0);
    let alive = true;
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      if (!alive) return;
      try {
        const size = 64;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, size, size);
        // Dock 在底部居中：只采样底部中心 50%×40%，比整张图底部更贴近实际玻璃区域
        const sx = Math.floor(size * 0.25);
        const sy = Math.floor(size * 0.58);
        const data = ctx.getImageData(sx, sy, Math.ceil(size * 0.5), Math.ceil(size * 0.4)).data;
        const values: number[] = [];
        for (let i = 0; i < data.length; i += 4) {
          values.push((0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255);
        }
        if (!values.length) return;
        const lum = values.reduce((a, b) => a + b, 0) / values.length;
        const variance = values.reduce((a, b) => a + (b - lum) ** 2, 0) / values.length;
        setMetrics({ lum, contrast: Math.sqrt(variance) });
      } catch {
        setMetrics({ lum: 0.45, contrast: 0.18 });
      }
    };
    img.onerror = () => {
      if (alive) setMetrics({ lum: 0.45, contrast: 0.18 });
    };
    img.src = url;
    return () => {
      alive = false;
    };
  }, [setting.kind, setting.photo, setting.dataUrl]);

  return metrics;
}

export function Dock({
  value,
  onChange,
  backdrop,
  profileBadge = 0,
}: {
  value: TabKey;
  onChange: (k: TabKey) => void;
  backdrop: BackdropSetting;
  /** 「我的」上的未配置 Agent 提醒角标，0 为不显示 */
  profileBadge?: number;
}) {
  const { lum, contrast } = useBackdropLuminance(backdrop);
  const tone = lum > 0.58 ? 'light' : 'dark';
  const lowContrast = contrast < 0.12;
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

  const [frost, setFrost] = useState(loadDockFrost);
  const [glassFailed, setGlassFailed] = useState(false);
  const frostRaf = useRef<number | undefined>(undefined);
  const glassRef = useRef<LiquidGlass | null>(null);

  // 拖动滑杆时不要防抖到“松手才更新”：每个 input 事件合并到下一帧，
  // 让 WebGL 参数、CSS 模糊和文字对比度跟随手指连续变化。
  useEffect(() => {
    const off = onPrefsChange(() => {
      if (frostRaf.current !== undefined) window.cancelAnimationFrame(frostRaf.current);
      frostRaf.current = window.requestAnimationFrame(() => setFrost(loadDockFrost()));
    });
    return () => {
      off();
      if (frostRaf.current !== undefined) window.cancelAnimationFrame(frostRaf.current);
    };
  }, []);

  useEffect(() => {
    const el = hostRef.current;
    if (!el || glassFailed) return;

    // 鸿蒙/部分安卓 WebView 没有 WebGL2，LiquidGlass 会直接失败；
    // 先探测再做，失败就交给 dock--fallback 的 CSS 毛玻璃。
    let glass: LiquidGlass | null = null;
    try {
      const probe = document.createElement('canvas');
      const probeCtx = probe.getContext('webgl2');
      if (!probeCtx) {
        setGlassFailed(true);
        return;
      }
      probeCtx.getExtension('WEBGL_lose_context')?.loseContext();
      glass = new LiquidGlass(el, {
        tint: glassTint(tone, frost),
        tintTone: tone,
        frost,
        material: glassMaterial(frost),
        radius: 30,
        backdrop: ['auto', paintControlText],
      });
      glassRef.current = glass;
    } catch {
      setGlassFailed(true);
    }
    return () => {
      glassRef.current = null;
      glass?.destroy();
    };
  }, [glassFailed]);

  // 只在同一个 WebGL 实例上 update，不销毁/重建上下文。
  // 这既是实时滑块的关键，也避免连续拖动把 GPU 上下文耗尽。
  useLayoutEffect(() => {
    glassRef.current?.update({
      tint: glassTint(tone, frost),
      tintTone: tone,
      frost,
      material: glassMaterial(frost),
    });
  }, [frost, tone]);

  const measure = useCallback(() => {
    const host = hostRef.current;
    if (!host) return;
    const hr = host.getBoundingClientRect();
    // 胶囊是相对内容盒定位的，扣掉外框那道 1px 边框，左右内缩才对得齐
    const border = host.clientLeft;
    setBoxes(
      itemRefs.current.map((el) => {
        if (!el) return { x: 0, w: 0 };
        const r = el.getBoundingClientRect();
        return { x: r.left - hr.left - border, w: r.width };
      }),
    );
  }, []);

  useLayoutEffect(() => {
    measure();

    window.addEventListener('resize', measure);
    // 中文字体晚到、页面缩放、滚动条出现都会改变项宽，光靠 resize 会错位
    document.fonts?.ready.then(measure).catch(() => {});

    const ro = new ResizeObserver(() => measure());
    if (hostRef.current) ro.observe(hostRef.current);
    itemRefs.current.forEach((el) => el && ro.observe(el));

    return () => {
      window.removeEventListener('resize', measure);
      ro.disconnect();
    };
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
        transform: `translateX(${Math.round(dragX + INSET)}px) scale(${1 + stretch}, ${1 - stretch * 0.45})`,
        width: Math.max(0, (boxes[activeIndex]?.w ?? 0) - INSET * 2),
        transition: 'none',
      }
    : {
        transform: `translateX(${Math.round(lens.x + INSET)}px)`,
        width: lens.w ? Math.max(0, Math.round(lens.w) - INSET * 2) : undefined,
        transition: `transform ${duration}ms ${easing}, width ${duration}ms ${easing}`,
      };

  return (
    <nav
      className={`dock is-${tone}-bg${lowContrast ? ' is-low-contrast' : ''}${glassFailed ? ' dock--fallback' : ''}`}
      ref={hostRef}
      aria-label="主导航"
      onPointerDown={onPointerDown}
      style={
        {
          '--dock-frost': frost.toFixed(2),
          '--dock-lum': lum.toFixed(2),
          '--dock-contrast': contrast.toFixed(2),
        } as CSSProperties
      }
    >
      <span className={`dock-lens${dragging ? ' is-drag' : ''}`} style={style} aria-hidden="true" />
      {ITEMS.map((it, i) => (
        <button
          key={it.key}
          ref={(el) => {
            itemRefs.current[i] = el;
          }}
          className={`dock-item${value === it.key ? ' is-on' : ''}`}
          onClick={() => onChange(it.key)}
          aria-label={it.key === 'profile' && profileBadge > 0 ? `${it.label}，有未配置的 Agent` : it.label}
          title={it.label}
          aria-current={value === it.key ? 'page' : undefined}
        >
          {it.key === 'profile' && profileBadge > 0 && (
            <span className="dock-badge" aria-hidden="true">
              {profileBadge > 99 ? '99+' : profileBadge}
            </span>
          )}
          {it.icon}
          <span>{it.label}</span>
        </button>
      ))}
    </nav>
  );
}
