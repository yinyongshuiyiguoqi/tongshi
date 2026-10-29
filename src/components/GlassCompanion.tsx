import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  loadCompanion,
  onCompanionChange,
  type CompanionFeedback,
  type CompanionSettings,
} from '../lib/companion';
import { playGlassTap } from '../lib/glassSound';
import { motionAvailable, requestMotionPermission } from '../lib/motion';

interface Position {
  x: number;
  y: number;
}

interface Velocity {
  x: number;
  y: number;
}

interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  floorY: number;
}

interface DragState {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  lastX: number;
  lastY: number;
  lastT: number;
  vx: number;
  vy: number;
  moved: boolean;
}

const BODY_W = 76;
const BODY_H = 82;
const GRAVITY = 2200;
const RESTITUTION = 0.52;
const FLOOR_FRICTION = 0.78;
const MAX_SPEED = 1800;

function computeBounds(): Bounds {
  const dock = document.querySelector('.dock')?.getBoundingClientRect();
  let floorY = window.innerHeight - 94;
  // 窄屏 Dock 靠左，把地面抬到 Dock 上方，避免盖住导航
  if (dock && 16 + BODY_W + 8 > dock.left) {
    floorY = Math.min(floorY, dock.top - 92);
  }
  return {
    minX: 8,
    maxX: Math.max(8, window.innerWidth - BODY_W - 8),
    minY: 72,
    floorY: Math.max(96, floorY),
  };
}

function clampPosition(x: number, y: number, bounds: Bounds): Position {
  return {
    x: Math.max(bounds.minX, Math.min(bounds.maxX, x)),
    y: Math.max(bounds.minY, Math.min(bounds.floorY, y)),
  };
}

function initialHome(bounds: Bounds): Position {
  return { x: bounds.minX + 8, y: bounds.floorY };
}

function bubbleFor(feedback: CompanionFeedback, name: string): string {
  if (feedback === 'none') return '';
  const options = [`${name}在`, '嗯？', '我在听', '……', '要出警了吗', '别戳啦'];
  return options[Math.floor(Math.random() * options.length)];
}

/**
 * 玻璃小精灵。
 *
 * 用轻量物理：重力、地面/边界碰撞、拖拽抛掷、落地回弹。
 * 默认在左下角 Dock 附近；可拖动、点击有轻响和弹跳，滚动会受惊。
 */
export function GlassCompanion() {
  const [settings, setSettings] = useState<CompanionSettings>(loadCompanion);
  const [walking, setWalking] = useState(false);
  const [dashing, setDashing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [landing, setLanding] = useState(false);
  const [bounce, setBounce] = useState(false);
  const [bubble, setBubble] = useState('');

  const startRef = useRef<{ bounds: Bounds; home: Position } | null>(null);
  if (!startRef.current) {
    const bounds = computeBounds();
    startRef.current = { bounds, home: initialHome(bounds) };
  }

  const rootRef = useRef<HTMLDivElement>(null);
  const posRef = useRef<Position>({ ...startRef.current.home });
  const velRef = useRef<Velocity>({ x: 0, y: 0 });
  const gravityRef = useRef<Velocity>({ x: 0, y: GRAVITY });
  const homeRef = useRef<Position>({ ...startRef.current.home });
  const boundsRef = useRef<Bounds>(startRef.current.bounds);
  const dragRef = useRef<DragState | null>(null);
  const draggingRef = useRef(false);
  const suppressClick = useRef(false);
  const deviceMotionSeen = useRef(false);
  const bounceTimer = useRef<number | undefined>(undefined);
  const bubbleTimer = useRef<number | undefined>(undefined);
  const dashTimer = useRef<number | undefined>(undefined);
  const landTimer = useRef<number | undefined>(undefined);
  const walkTimer = useRef<number | undefined>(undefined);

  const applyTransform = useCallback(() => {
    if (rootRef.current) {
      const tilt = Math.max(-1, Math.min(1, gravityRef.current.x / 1800));
      rootRef.current.style.transform = `translate3d(${posRef.current.x}px, ${posRef.current.y}px, 0)`;
      rootRef.current.style.setProperty('--gc-liquid-x', `${tilt * 5}px`);
      rootRef.current.style.setProperty('--gc-liquid-skew', `${tilt * 7}deg`);
    }
  }, []);

  const flashLanding = useCallback(() => {
    setLanding(true);
    window.clearTimeout(landTimer.current);
    landTimer.current = window.setTimeout(() => setLanding(false), 190);
  }, []);

  useLayoutEffect(() => {
    const next = computeBounds();
    boundsRef.current = next;
    const home = initialHome(next);
    homeRef.current = home;
    posRef.current = clampPosition(posRef.current.x, home.y, next);
    velRef.current = { x: 0, y: 0 };
    applyTransform();
  }, [applyTransform]);

  useEffect(() => onCompanionChange(() => setSettings(loadCompanion())), []);

  useEffect(
    () => () => {
      window.clearTimeout(bounceTimer.current);
      window.clearTimeout(bubbleTimer.current);
      window.clearTimeout(dashTimer.current);
      window.clearTimeout(landTimer.current);
      window.clearTimeout(walkTimer.current);
    },
    [],
  );

  useEffect(() => {
    const onResize = () => {
      const next = computeBounds();
      boundsRef.current = next;
      homeRef.current = {
        x: clampPosition(homeRef.current.x, next.floorY, next).x,
        y: next.floorY,
      };
      posRef.current = clampPosition(posRef.current.x, posRef.current.y, next);
      applyTransform();
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [applyTransform]);

  // 手机倾斜 → 重力向量。安卓直接有事件；iOS 需要在手势里申请权限。
  useEffect(() => {
    gravityRef.current = { x: 0, y: GRAVITY };
    deviceMotionSeen.current = false;
    if (!settings.enabled || !settings.motion || !motionAvailable()) return;

    let baseGamma: number | null = null;
    let baseBeta: number | null = null;
    let validSamples = 0;

    const onOrientation = (e: DeviceOrientationEvent) => {
      if (e.gamma == null && e.beta == null) return;
      validSamples += 1;
      // 桌面 Chrome 可能只发一次 0/0；连续样本才认为是真正在倾斜
      if (validSamples >= 2) deviceMotionSeen.current = true;
      if (baseGamma == null) {
        baseGamma = e.gamma ?? 0;
        baseBeta = e.beta ?? 0;
        return;
      }
      const gamma = (e.gamma ?? 0) - baseGamma;
      const beta = (e.beta ?? 0) - (baseBeta ?? 0);
      const tiltX = Math.max(-1, Math.min(1, gamma / 35));
      const tiltY = Math.max(-1, Math.min(1, beta / 35));
      const targetX = tiltX * 1500;
      const targetY = GRAVITY + tiltY * 700;
      gravityRef.current.x += (targetX - gravityRef.current.x) * 0.18;
      gravityRef.current.y += (targetY - gravityRef.current.y) * 0.18;
    };

    window.addEventListener('deviceorientation', onOrientation);
    return () => {
      window.removeEventListener('deviceorientation', onOrientation);
      gravityRef.current = { x: 0, y: GRAVITY };
    };
  }, [settings.enabled, settings.motion]);

  // 物理循环：重力、地面/边界碰撞、落地回弹、静止时轻微回到落脚点
  useEffect(() => {
    if (!settings.enabled) return;
    let raf = 0;
    let last = performance.now();

    const step = (now: number) => {
      const dt = Math.min(0.034, Math.max(0.001, (now - last) / 1000));
      last = now;
      const p = posRef.current;
      const v = velRef.current;
      const b = boundsRef.current;

      if (!draggingRef.current) {
        v.y += gravityRef.current.y * dt;
        v.x += gravityRef.current.x * dt;
        v.x *= 0.998;
        v.y *= 0.999;
        p.x += v.x * dt;
        p.y += v.y * dt;

        if (p.x < b.minX) {
          p.x = b.minX;
          v.x = Math.abs(v.x) * RESTITUTION;
        } else if (p.x > b.maxX) {
          p.x = b.maxX;
          v.x = -Math.abs(v.x) * RESTITUTION;
        }

        if (p.y < b.minY) {
          p.y = b.minY;
          v.y = Math.abs(v.y) * 0.4;
        }

        if (p.y >= b.floorY) {
          p.y = b.floorY;
          if (v.y > 140) {
            v.y = -v.y * RESTITUTION;
            flashLanding();
          } else {
            v.y = 0;
            v.x *= FLOOR_FRICTION;
            if (Math.abs(v.x) < 6) v.x = 0;
          }
          // 落地后慢慢回到自己的落脚点，不横穿页面
          v.x += (homeRef.current.x - p.x) * 1.2 * dt;
        }

        v.x = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, v.x));
        v.y = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, v.y));
        applyTransform();
      }

      raf = window.requestAnimationFrame(step);
    };

    raf = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(raf);
  }, [applyTransform, flashLanding, settings.enabled]);

  // 自动小跳：频率由 my glass 控制，0 = 不动
  useEffect(() => {
    if (!settings.enabled || !settings.walkSeconds) return;
    const timer = window.setInterval(() => {
      if (draggingRef.current) return;
      setWalking(true);
      velRef.current.y = -360;
      velRef.current.x += (Math.random() * 2 - 1) * 65;
      walkTimer.current = window.setTimeout(() => setWalking(false), 900);
    }, settings.walkSeconds * 1000);
    return () => window.clearInterval(timer);
  }, [settings.enabled, settings.walkSeconds]);

  // 滚动受惊：向上小跳、轻微横向偏移，不再随机传送到页面其他地方
  useEffect(() => {
    if (!settings.enabled) return;
    let lastY = window.scrollY;
    let lastMove = 0;
    let frame = 0;

    const onScroll = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const nextY = window.scrollY;
        const dy = nextY - lastY;
        lastY = nextY;
        if (Math.abs(dy) < 6 || Date.now() - lastMove < 420) return;
        lastMove = Date.now();
        setDashing(true);
        velRef.current.y = Math.min(velRef.current.y, -260);
        velRef.current.x += (Math.random() > 0.5 ? 1 : -1) * 32;
        window.clearTimeout(dashTimer.current);
        dashTimer.current = window.setTimeout(() => setDashing(false), 480);
      });
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.cancelAnimationFrame(frame);
    };
  }, [settings.enabled]);

  // 眼睛跟着鼠标看；桌面没有陀螺仪时，鼠标靠近也会产生等效重力
  useEffect(() => {
    if (!settings.enabled) return;

    const onMove = (e: PointerEvent) => {
      const el = rootRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const dx = e.clientX - (rect.left + rect.width / 2);
      const dy = e.clientY - (rect.top + rect.height / 2);
      const dist = Math.hypot(dx, dy);
      const far = dist > 320;
      const x = far ? 0 : Math.max(-3.5, Math.min(3.5, dx / 32));
      const y = far ? 0 : Math.max(-2.5, Math.min(2.5, dy / 36));
      el.style.setProperty('--gc-look-x', `${x}px`);
      el.style.setProperty('--gc-look-y', `${y}px`);

      if (settings.motion && !deviceMotionSeen.current) {
        const near = dist < 300;
        const targetX = near ? Math.max(-1, Math.min(1, dx / 120)) * 1000 : 0;
        const targetY = GRAVITY + (near ? Math.max(-1, Math.min(1, dy / 150)) * 500 : 0);
        gravityRef.current.x += (targetX - gravityRef.current.x) * 0.12;
        gravityRef.current.y += (targetY - gravityRef.current.y) * 0.12;
      }
    };

    const resetGravity = () => {
      if (deviceMotionSeen.current) return;
      gravityRef.current.x += (0 - gravityRef.current.x) * 0.2;
      gravityRef.current.y += (GRAVITY - gravityRef.current.y) * 0.2;
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerleave', resetGravity);
    return () => {
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerleave', resetGravity);
    };
  }, [settings.enabled, settings.motion]);

  const tap = useCallback(() => {
    if (!settings.enabled) return;
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }

    playGlassTap(settings.sound);
    if (settings.motion && motionAvailable()) void requestMotionPermission();
    velRef.current.y = Math.min(velRef.current.y, -360);
    velRef.current.x += (Math.random() * 2 - 1) * 80;
    setBounce(true);
    window.clearTimeout(bounceTimer.current);
    bounceTimer.current = window.setTimeout(() => setBounce(false), 520);

    if (settings.clickFeedback === 'bubble') {
      setBubble(bubbleFor(settings.clickFeedback, settings.name));
      window.clearTimeout(bubbleTimer.current);
      bubbleTimer.current = window.setTimeout(() => setBubble(''), 1800);
    }
  }, [settings.clickFeedback, settings.enabled, settings.name, settings.sound]);

  function onPointerDown(e: ReactPointerEvent<HTMLButtonElement>) {
    if (e.button !== 0) return;
    const p = posRef.current;
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originX: p.x,
      originY: p.y,
      lastX: e.clientX,
      lastY: e.clientY,
      lastT: performance.now(),
      vx: 0,
      vy: 0,
      moved: false,
    };
    velRef.current = { x: 0, y: 0 };
    draggingRef.current = true;
    setDragging(true);
    setWalking(false);
    setBubble('');
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: ReactPointerEvent<HTMLButtonElement>) {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
    if (!d.moved) return;

    e.preventDefault();
    const now = performance.now();
    const dt = Math.max(0.012, (now - d.lastT) / 1000);
    d.vx = ((e.clientX - d.lastX) / dt) * 0.75;
    d.vy = ((e.clientY - d.lastY) / dt) * 0.75;
    d.lastX = e.clientX;
    d.lastY = e.clientY;
    d.lastT = now;

    posRef.current = clampPosition(d.originX + dx, d.originY + dy, boundsRef.current);
    applyTransform();
  }

  function endDrag(e: ReactPointerEvent<HTMLButtonElement>) {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    suppressClick.current = d.moved;
    if (d.moved) {
      velRef.current = {
        x: Math.max(-MAX_SPEED, Math.min(MAX_SPEED, d.vx)),
        y: Math.max(-MAX_SPEED, Math.min(MAX_SPEED, d.vy)),
      };
      homeRef.current = {
        x: posRef.current.x,
        y: boundsRef.current.floorY,
      };
    }
    dragRef.current = null;
    draggingRef.current = false;
    setDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }

  if (!settings.enabled) return null;

  return (
    <div
      ref={rootRef}
      className={`glass-companion${dashing ? ' is-dashing' : ''}${walking ? ' is-walking' : ''}${
        dragging ? ' is-dragging' : ''
      }`}
      style={{ transform: `translate3d(${posRef.current.x}px, ${posRef.current.y}px, 0)` }}
      aria-live="polite"
    >
      {bubble && <span className="gc-bubble">{bubble}</span>}

      <div className={`gc${bounce ? ' is-bounce' : ''}${landing ? ' is-landing' : ''}`}>
        <span className="gc-shadow" aria-hidden="true" />
        <span className="gc-antenna gc-antenna-a" aria-hidden="true" />
        <span className="gc-antenna gc-antenna-b" aria-hidden="true" />
        <span className="gc-leg gc-leg-a" aria-hidden="true" />
        <span className="gc-leg gc-leg-b" aria-hidden="true" />
        <button
          type="button"
          className="gc-body"
          onClick={tap}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          aria-label={`${settings.name}，玻璃小精灵，可拖动`}
          title={settings.name}
        >
          <span className="gc-eyes" aria-hidden="true">
            <i />
            <i />
          </span>
          <span className="gc-liquid" aria-hidden="true" />
          <span className="gc-mouth" aria-hidden="true" />
          <span className="gc-glint" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
