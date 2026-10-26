export type BackdropKind = 'photo' | 'alpine' | 'ocean' | 'forest' | 'none' | 'custom';

export interface BackdropSetting {
  kind: BackdropKind;
  dataUrl?: string;
  /** 轮到第几张实景照片 */
  photo?: number;
}

const KEY = 'tongshi.backdrop';

/**
 * 五张实景照片。
 *
 * light 是每张图的自然光源位置和色温，玻璃卡片的高光按它走，
 * 所以换一张图，反光方向也跟着变，而不是所有背景打同一个方向的灯。
 */
export const PHOTOS = [
  { file: 'ridge.jpg', label: '云海群山', light: { x: '78%', y: '18%', rgb: '255, 196, 150' } },
  { file: 'shore.jpg', label: '海岸晨光', light: { x: '24%', y: '22%', rgb: '255, 214, 178' } },
  { file: 'woods.jpg', label: '林间透光', light: { x: '62%', y: '12%', rgb: '206, 232, 170' } },
  { file: 'mist.jpg', label: '山雾层叠', light: { x: '46%', y: '26%', rgb: '190, 206, 226' } },
  { file: 'lake.jpg', label: '湖光树影', light: { x: '34%', y: '20%', rgb: '198, 220, 214' } },
] as const;

export function photoUrl(index: number): string {
  const p = PHOTOS[((index % PHOTOS.length) + PHOTOS.length) % PHOTOS.length];
  return `${import.meta.env.BASE_URL}backgrounds/${p.file}`;
}

export function loadBackdrop(): BackdropSetting {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { kind: 'photo', photo: 0 };
    const s = JSON.parse(raw) as BackdropSetting;
    return s?.kind ? s : { kind: 'photo', photo: 0 };
  } catch {
    return { kind: 'photo', photo: 0 };
  }
}

export function saveBackdrop(s: BackdropSetting) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // 图片过大时可能写不进去，忽略
  }
}

/** 每次登录往后推一张，自己上传的照片和纯色不参与轮换 */
export function nextBackdrop(s: BackdropSetting): BackdropSetting {
  if (s.kind !== 'photo') return s;
  return { kind: 'photo', photo: ((s.photo ?? -1) + 1) % PHOTOS.length };
}

export const PRESETS: { kind: BackdropKind; label: string }[] = [
  { kind: 'alpine', label: '晨雾山脊' },
  { kind: 'ocean', label: '暮色海面' },
  { kind: 'forest', label: '深林薄雾' },
  { kind: 'none', label: '纯色' },
];

function Alpine() {
  return (
    <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="al-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#071322" />
          <stop offset="0.42" stopColor="#1e4468" />
          <stop offset="0.72" stopColor="#8a7280" />
          <stop offset="1" stopColor="#dda471" />
        </linearGradient>
      </defs>
      <rect width="1600" height="900" fill="url(#al-sky)" />
      <circle cx="1180" cy="720" r="240" fill="#ffb877" opacity="0.34" />
      <path
        d="M0 620 L200 455 L350 545 L520 415 L700 585 L860 495 L1040 640 L1210 505 L1400 625 L1600 545 L1600 900 L0 900Z"
        fill="#16304a"
        opacity="0.92"
      />
      <path
        d="M0 705 L180 590 L380 690 L560 580 L760 710 L940 610 L1160 730 L1340 640 L1600 750 L1600 900 L0 900Z"
        fill="#0f2233"
        opacity="0.96"
      />
      <path
        d="M0 795 L240 715 L480 785 L720 705 L980 795 L1240 725 L1600 815 L1600 900 L0 900Z"
        fill="#081420"
      />
    </svg>
  );
}

function Ocean() {
  return (
    <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="oc-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#070512" />
          <stop offset="0.45" stopColor="#2a1738" />
          <stop offset="0.7" stopColor="#7a3f52" />
          <stop offset="0.78" stopColor="#e0905f" />
          <stop offset="0.8" stopColor="#2a1a24" />
          <stop offset="1" stopColor="#0a0810" />
        </linearGradient>
      </defs>
      <rect width="1600" height="900" fill="url(#oc-sky)" />
      <circle cx="800" cy="700" r="120" fill="#ffc38f" opacity="0.5" />
      <circle cx="800" cy="700" r="320" fill="#ff9b5e" opacity="0.12" />
      <g stroke="#ffbe8a" strokeWidth="2" opacity="0.18">
        <line x1="640" y1="740" x2="960" y2="740" />
        <line x1="680" y1="770" x2="920" y2="770" />
        <line x1="720" y1="800" x2="880" y2="800" />
        <line x1="600" y1="830" x2="1000" y2="830" />
      </g>
    </svg>
  );
}

function Forest() {
  return (
    <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="fo-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#04100c" />
          <stop offset="0.5" stopColor="#0e2a20" />
          <stop offset="1" stopColor="#06120f" />
        </linearGradient>
        <radialGradient id="fo-glow" cx="0.62" cy="0.3" r="0.5">
          <stop offset="0" stopColor="#b7e0b0" stopOpacity="0.24" />
          <stop offset="1" stopColor="#b7e0b0" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="1600" height="900" fill="url(#fo-sky)" />
      <rect width="1600" height="900" fill="url(#fo-glow)" />
      <g fill="#173d2e" opacity="0.9">
        <path d="M0 900 L0 520 L70 640 L140 470 L210 660 L280 520 L350 700 L430 560 L520 720 L600 590 L700 760 L800 610 L900 780 L1000 600 L1100 770 L1200 620 L1300 790 L1400 640 L1500 800 L1600 660 L1600 900Z" />
      </g>
      <g fill="#0a2018" opacity="0.95">
        <path d="M0 900 L0 700 L120 780 L220 690 L340 800 L460 700 L600 820 L740 710 L880 840 L1020 720 L1160 850 L1300 730 L1440 860 L1600 760 L1600 900Z" />
      </g>
    </svg>
  );
}

export function Backdrop({ setting }: { setting: BackdropSetting }) {
  if (setting.kind === 'none') return null;

  const isPhoto = setting.kind === 'photo';

  return (
    <>
      <div className={`backdrop${isPhoto ? ' is-photo' : ''}`} aria-hidden="true">
        {isPhoto ? (
          <img src={photoUrl(setting.photo ?? 0)} alt="" />
        ) : setting.kind === 'custom' && setting.dataUrl ? (
          <img src={setting.dataUrl} alt="" />
        ) : setting.kind === 'ocean' ? (
          <Ocean />
        ) : setting.kind === 'forest' ? (
          <Forest />
        ) : (
          <Alpine />
        )}
      </div>
      {!isPhoto && <div className="backdrop-scrim" aria-hidden="true" />}
    </>
  );
}
