import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

type Phase = 'greetings' | 'logo' | 'charging' | 'armed' | 'zooming';

const GREETINGS = [
  { text: '你好', lang: 'zh-CN' },
  { text: 'Hello', lang: 'en-US' },
  { text: 'Hola', lang: 'es-ES' },
  { text: 'Bonjour', lang: 'fr-FR' },
  { text: 'Hallo', lang: 'de-DE' },
  { text: 'Привет', lang: 'ru-RU' },
  { text: 'مرحبا', lang: 'ar-SA' },
  { text: 'こんにちは', lang: 'ja-JP' },
  { text: '안녕하세요', lang: 'ko-KR' },
  { text: 'नमस्ते', lang: 'hi-IN' },
  { text: 'Merhaba', lang: 'tr-TR' },
  { text: 'Halo', lang: 'id-ID' },
  { text: 'Olá', lang: 'pt-BR' },
  { text: 'Ciao', lang: 'it-IT' },
];

const GREETING_MS = 1380;
const LOGO_HOLD_MS = 1100;
const CHARGE_MS = 520;
const ZOOM_MS = 850;
const SAFETY_READY_MS = 26000;

function BrandMark() {
  return (
    <svg className="boot-brand-mark" viewBox="0 0 1024 1024" aria-hidden="true">
      <g fill="currentColor">
        <rect x="292" y="328" width="440" height="94" rx="47" />
        <rect x="318" y="328" width="94" height="354" rx="47" />
        <rect x="612" y="328" width="94" height="354" rx="47" />
        <circle cx="512" cy="535" r="64" />
      </g>
    </svg>
  );
}

/**
 * 通事开机动画。
 *
 * 逻辑：
 * 1. 整块大玻璃先落下；
 * 2. 玻璃上再浮出一块小玻璃，小玻璃里轮播各国“你好”；
 * 3. 页面资源没加载完就一直轮播，不假装加载完成；
 * 4. 页面 ready 后，小玻璃收缩，文字收束成通事门形 Logo；
 * 5. Logo 落定后做一次蓄力（向后收、镜片收紧），然后停住；
 * 6. 停在原地等用户：点击任意位置或按任意键才启动；
 * 7. 启动后是一镜到底的运镜：画面连续推近、Logo 与玻璃加速出画，
 *    主页面在同一镜头里化入，没有白光切换，也没有单独的第三段入场动画。
 *
 * 登录页/工作台始终在玻璃下面挂载，所以开机阶段已经在预加载。
 */
export function BootSplash({
  onFinish,
  onCameraStart,
}: {
  onFinish: () => void;
  /** 运镜开始的一刻通知外层把页面挂到下面，让推近+淡出连成一镜。 */
  onCameraStart?: () => void;
}) {
  const [phase, setPhase] = useState<Phase>('greetings');
  const [greetIndex, setGreetIndex] = useState(0);
  const [pageReady, setPageReady] = useState(false);
  const [wantsLogo, setWantsLogo] = useState(false);
  const [isTouch] = useState(() => window.matchMedia?.('(pointer: coarse)').matches ?? false);
  const cameraStarted = useRef(false);
  const finished = useRef(false);
  const pendingEnter = useRef(false);
  const wantsLogoRef = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const wordRef = useRef<HTMLSpanElement>(null);
  const [wordBox, setWordBox] = useState({ w: 0, h: 0 });
  const timers = useRef<number[]>([]);

  function endBoot() {
    if (finished.current) return;
    finished.current = true;
    onFinish();
  }

  // 一镜到底的运镜：画面从蓄力姿态连续推近，同时化入主页面。
  // 页面在推近开始时就挂到下面，由开机层边推边淡出完成交接，
  // 不再“缩小蓄力 → 白光 → 页面出现”三段跳。
  function beginCamera() {
    if (cameraStarted.current) return;
    cameraStarted.current = true;
    setPhase('zooming');
    onCameraStart?.();
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    // 正常由 CSS 动画的 animationend 收尾；这里只是兜底，防止被节流的标签页卡住。
    timers.current.push(window.setTimeout(endBoot, (reduce ? 420 : ZOOM_MS) + 300));
  }

  // 蓄力完成后停住等用户；如果用户在蓄力期间已经按过，蓄力一结束就出发。
  // 点击进入时把触点写进 CSS 变量，运镜第一帧从触点炸开一圈水波。
  function tapToEnter(e?: ReactPointerEvent<HTMLDivElement>) {
    if (cameraStarted.current) return;
    // 第一次点击只负责离开问候循环，进入 Logo 与蓄力；不会直接进页面。
    if (phase === 'greetings') {
      // 如果第一次点击的 React 状态还没刷新，第二次点击已经到来，也记下来。
      if (wantsLogoRef.current) pendingEnter.current = true;
      else wantsLogoRef.current = true;
      setWantsLogo(true);
      return;
    }
    if (phase === 'armed') {
      const el = rootRef.current;
      if (el) {
        if (e) {
          const r = el.getBoundingClientRect();
          el.style.setProperty('--boot-tap-x', `${e.clientX - r.left}px`);
          el.style.setProperty('--boot-tap-y', `${e.clientY - r.top}px`);
        } else {
          el.style.setProperty('--boot-tap-x', '50%');
          el.style.setProperty('--boot-tap-y', '50%');
        }
      }
      beginCamera();
      return;
    }
    // 第二次点击如果落在 Logo/蓄力阶段，记下来，蓄力结束立刻运镜。
    if (phase === 'logo' || phase === 'charging') pendingEnter.current = true;
  }

  // 开机期间锁住页面滚动，避免看不到页面时把底下的登录页/工作台滚走。
  useEffect(() => {
    const root = document.documentElement;
    const prevOverflow = root.style.overflow;
    root.style.overflow = 'hidden';
    return () => {
      root.style.overflow = prevOverflow;
    };
  }, []);

  // 页面真实加载完成：只标记 ready，不自动离开问候循环。
  useEffect(() => {
    let alive = true;
    const load = document.readyState === 'complete'
      ? Promise.resolve()
      : new Promise<void>((resolve) => window.addEventListener('load', () => resolve(), { once: true }));
    const fonts = document.fonts?.ready ?? Promise.resolve();
    const safety = new Promise<void>((resolve) => {
      timers.current.push(window.setTimeout(resolve, SAFETY_READY_MS));
    });

    Promise.race([Promise.all([load, fonts]), safety]).then(() => {
      if (alive) setPageReady(true);
    });

    return () => {
      alive = false;
    };
  }, []);

  // 第一次点击后，等页面真正 ready，再进入 Logo/蓄力阶段。
  useEffect(() => {
    if (phase === 'greetings' && pageReady && wantsLogo) setPhase('logo');
  }, [phase, pageReady, wantsLogo]);

  // 页面没 ready 就持续轮播各国问候；ready 后也继续播，等第一次点击才收束成 Logo。
  useEffect(() => {
    if (phase !== 'greetings') return;
    const id = window.setInterval(() => {
      setGreetIndex((i) => (i + 1) % GREETINGS.length);
    }, GREETING_MS);
    return () => window.clearInterval(id);
  }, [phase]);

  // Logo 落定后做蓄力，不再自动进入页面。
  useEffect(() => {
    if (phase !== 'logo') return;
    const id = window.setTimeout(() => setPhase('charging'), LOGO_HOLD_MS);
    timers.current.push(id);
    return () => window.clearTimeout(id);
  }, [phase]);

  // 蓄力结束：没有用户输入就停在这里等；用户提前按过就直接开始运镜。
  useEffect(() => {
    if (phase !== 'charging') return;
    const id = window.setTimeout(() => {
      if (pendingEnter.current) beginCamera();
      else setPhase('armed');
    }, CHARGE_MS);
    timers.current.push(id);
    return () => window.clearTimeout(id);
    // beginCamera 读取的是 ref 和 setState，不随渲染变化
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // 任意按键都能进入；蓄力前按过的，也会记下来，蓄力完直接出发。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key;
      if (k === 'Shift' || k === 'Control' || k === 'Alt' || k === 'Meta' || k === 'CapsLock' || k === 'Dead') return;
      if (phase !== 'greetings' && phase !== 'armed' && phase !== 'logo' && phase !== 'charging') return;
      e.preventDefault();
      tapToEnter();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // tapToEnter 读取的是当前 phase
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // 运镜结束时按 CSS 动画实际播完的那一帧收尾，避免定时器和动画错位，
  // 也保证画面是完全淡出后才把主页面单独露出来。
  useEffect(() => {
    if (phase !== 'zooming') return;
    const el = rootRef.current;
    if (!el) return;
    const onEnd = (e: AnimationEvent) => {
      if (e.target !== el) return;
      if (e.animationName !== 'boot-camera-through' && e.animationName !== 'boot-fade-through') return;
      endBoot();
    };
    el.addEventListener('animationend', onEnd);
    return () => el.removeEventListener('animationend', onEnd);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  useEffect(() => () => timers.current.forEach((id) => window.clearTimeout(id)), []);

  function move(e: ReactPointerEvent<HTMLDivElement>) {
    const el = rootRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const mx = ((e.clientX - r.left) / r.width - 0.5) * 2;
    const my = ((e.clientY - r.top) / r.height - 0.5) * 2;
    el.style.setProperty('--boot-mx', mx.toFixed(3));
    el.style.setProperty('--boot-my', my.toFixed(3));
  }

  // 用真实文字的排版尺寸驱动小玻璃，而不是按字符数猜大小。
  useLayoutEffect(() => {
    if (phase !== 'greetings') return;
    const el = wordRef.current;
    if (!el) return;
    const measure = () => {
      setWordBox({ w: el.offsetWidth, h: el.offsetHeight });
    };
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [greetIndex, phase]);

  const greeting = GREETINGS[greetIndex];
  // 真实文字尺寸 + 内边距，换算成小玻璃的宽高比例。
  const measuredW = wordBox.w || Math.max(120, greeting.text.length * 38);
  const measuredH = wordBox.h || 82;
  const desiredW = Math.min(510, Math.max(248, measuredW + 150));
  const desiredH = Math.min(270, Math.max(206, measuredH + 108));
  const lensScaleX = phase === 'greetings'
    ? Math.max(0.72, Math.min(1.42, desiredW / 360))
    : 0.683;
  const lensScaleY = phase === 'greetings'
    ? Math.max(0.92, Math.min(1.10, desiredH / 222))
    : 1.018;

  return (
    <div
      ref={rootRef}
      className={`boot-splash is-${phase}`}
      role="button"
      tabIndex={0}
      aria-label={
        phase === 'armed'
          ? isTouch
            ? '再次轻触任意位置进入通事'
            : '再次点击任意位置或按任意键进入通事'
          : phase === 'greetings'
            ? pageReady
              ? isTouch
                ? '轻触任意位置开始'
                : '点击任意位置或按任意键开始'
              : '正在加载页面'
            : '正在准备蓄力'
      }
      onPointerMove={move}
      onPointerDown={tapToEnter}
    >
      <span className="boot-sr" role="status" aria-live="polite">
        {phase === 'armed'
          ? `页面已就绪，${isTouch ? '再次轻触任意位置进入' : '再次点击任意位置或按任意键进入'}`
          : phase === 'greetings'
            ? pageReady
              ? '页面已就绪，轻触开始进入'
              : '正在加载页面'
            : '正在准备蓄力'}
      </span>
      <div className="boot-cosmos" aria-hidden="true">
        <span className="boot-nebula" />
        <span className="boot-stars s1" />
        <span className="boot-stars s2" />
        <span className="boot-shooting-star q1" />
        <span className="boot-shooting-star q2" />
      </div>

      <div className="boot-aurora" aria-hidden="true">
        <i className="boot-blob b1" />
        <i className="boot-blob b2" />
        <i className="boot-blob b3" />
      </div>

      <div className="boot-glass" aria-hidden="true">
        <span className="boot-glass-sheen" />
        <span className="boot-glass-caustic c1" />
        <span className="boot-glass-caustic c2" />
        <span className="boot-glass-edge" />
        <span className="boot-seam s1" />
        <span className="boot-seam s2" />
        <span className="boot-seam s3" />
        <span className="boot-dust d1" />
        <span className="boot-dust d2" />
        <span className="boot-dust d3" />
        <span className="boot-dust d4" />
        <span className="boot-dust d5" />
        <span className="boot-dust d6" />
      </div>

      <div className="boot-orbit-system" aria-hidden="true">
        <span className="boot-orbit-line o1" />
        <span className="boot-orbit-line o2" />
        <span className="boot-orbit-spinner sp1"><i className="boot-moon m1" /></span>
        <span className="boot-orbit-spinner sp2"><i className="boot-moon m2" /></span>
      </div>

      <div
        className={`boot-lens${phase === 'logo' ? ' is-logo' : ''}`}
        style={{
          ['--boot-lens-sx' as string]: lensScaleX.toFixed(3),
          ['--boot-lens-sy' as string]: lensScaleY.toFixed(3),
        }}
        aria-hidden="true"
      >
        <div className="boot-lens-inner">
          <span className="boot-lens-halo" />
          <span className="boot-lens-ring r1" />
        <span className="boot-lens-core" />
        <span className="boot-lens-ring r2" />
        <span className="boot-lens-ring r3" />
        <span className="boot-lens-rim" />
        <div className="boot-ripples" key={`${greetIndex}-${phase}`}>
          <span className="boot-ripple p1" />
          <span className="boot-ripple p2" />
          <span className="boot-ripple p3" />
        </div>
          <span className="boot-lens-spec" />
          <span className="boot-lens-glint" />
          <span className="boot-lens-water" />
          <span className="boot-lens-crescent" />
          <span key={`shimmer-${greetIndex}-${phase}`} className="boot-lens-shimmer" aria-hidden="true">
            <i />
          </span>
          <span className="boot-lens-orbit" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </span>
        </div>
      </div>

      <div className="boot-center">
        {phase === 'greetings' && (
          <span key={`aura-${greetIndex}`} className="boot-word-aura" aria-hidden="true" />
        )}
        {phase === 'greetings' && (
          <span
            key={greetIndex}
            ref={wordRef}
            className="boot-word"
            lang={greeting.lang}
          >
            {greeting.text}
          </span>
        )}

        {phase !== 'greetings' && (
          <div className={`boot-final${phase === 'logo' ? ' is-on' : ''}`}>
            <BrandMark />
            <span className="boot-final-name">通事</span>
            <span className="boot-final-en">TONGSHI</span>
          </div>
        )}
      </div>

      <div className="boot-footer">
        <span className={`boot-hint${phase === 'greetings' && !pageReady ? ' is-loading' : ' is-ready'}`}>
          {phase === 'zooming'
            ? '正在进入通事…'
            : phase === 'armed'
              ? isTouch
                ? '再次轻触任意位置进入'
                : '再次点击任意位置或按任意键进入'
              : phase === 'charging'
                ? '正在蓄力…'
                : phase === 'logo'
                  ? '准备蓄力…'
                  : phase === 'greetings'
                    ? !pageReady
                      ? wantsLogo
                        ? '页面就绪后开始蓄力…'
                        : '正在加载页面…'
                      : isTouch
                        ? '轻触任意位置开始'
                        : '点击任意位置或按任意键开始'
                    : '正在进入通事…'}
        </span>
        <span className="boot-status">
          <i aria-hidden="true" />
          {pageReady ? '页面已就绪' : '页面预加载中'}
        </span>
      </div>
      <div className={`boot-progress${pageReady ? ' is-ready' : ''}`} aria-hidden="true"><i /></div>
      {phase === 'charging' && <span className="boot-charge" aria-hidden="true" />}
      {phase === 'zooming' && (
        <span className="boot-tap-ripple" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      )}
    </div>
  );
}
