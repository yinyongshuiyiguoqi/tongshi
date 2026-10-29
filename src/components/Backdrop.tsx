export type BackdropKind = 'photo' | 'custom';

export interface BackdropSetting {
  kind: BackdropKind;
  dataUrl?: string;
  /** 轮到第几张实景照片 */
  photo?: number;
  /** 是否跟随自动轮换；false 表示用户手动固定了一张 */
  auto?: boolean;
  /** 自动模式下，这张图是哪一天选的（YYYY-MM-DD），用于按天轮换 */
  day?: string;
}

const KEY = 'tongshi.backdrop';

/**
 * 实景照片（当前 18 张）。
 *
 * light 是每张图的自然光源位置和色温，玻璃卡片的高光按它走，
 * 所以换一张图，反光方向也跟着变，而不是所有背景打同一个方向的灯。
 */
export const PHOTOS = [
  { file: 'ridge.jpg', label: '云海群山', light: { x: '78%', y: '18%', rgb: '255, 196, 150' } },
  { file: 'lagoon.jpg', label: '碧湖行舟', light: { x: '74%', y: '14%', rgb: '255, 240, 210' } },
  { file: 'woods.jpg', label: '林间透光', light: { x: '62%', y: '12%', rgb: '206, 232, 170' } },
  { file: 'snowpeak.jpg', label: '云上雪峰', light: { x: '50%', y: '18%', rgb: '226, 236, 250' } },
  { file: 'valley.jpg', label: '翠谷石林', light: { x: '18%', y: '16%', rgb: '255, 230, 180' } },
  { file: 'boardwalk.jpg', label: '林间栈道', light: { x: '52%', y: '12%', rgb: '220, 235, 190' } },
  { file: 'desert.jpg', label: '荒漠孤峰', light: { x: '82%', y: '22%', rgb: '255, 206, 150' } },
  { file: 'mist.jpg', label: '山雾层叠', light: { x: '46%', y: '26%', rgb: '190, 206, 226' } },
  { file: 'starry.jpg', label: '雪山星河', light: { x: '28%', y: '14%', rgb: '176, 168, 255' } },
  { file: 'cabin.jpg', label: '湖畔木屋', light: { x: '58%', y: '18%', rgb: '255, 226, 180' } },
  { file: 'oak.jpg', label: '原野孤树', light: { x: '20%', y: '18%', rgb: '214, 236, 196' } },
  { file: 'fogpine.jpg', label: '雾锁松林', light: { x: '44%', y: '10%', rgb: '236, 244, 250' } },
  { file: 'sunsetvalley.jpg', label: '落日谷地', light: { x: '64%', y: '20%', rgb: '255, 190, 120' } },
  { file: 'lake.jpg', label: '湖光树影', light: { x: '34%', y: '20%', rgb: '198, 220, 214' } },
  { file: 'alpine.jpg', label: '山谷远湖', light: { x: '72%', y: '16%', rgb: '255, 236, 210' } },
  { file: 'fjord.jpg', label: '峡湾倒影', light: { x: '52%', y: '20%', rgb: '210, 232, 240' } },
  { file: 'goldfield.jpg', label: '黄昏麦田', light: { x: '68%', y: '26%', rgb: '255, 190, 120' } },
  { file: 'wildflower.jpg', label: '山花漫野', light: { x: '24%', y: '12%', rgb: '255, 220, 130' } },
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
    // 旧版本存过手绘场景，读到就直接换成实景
    if (s?.kind === 'photo' || s?.kind === 'custom') return s;
    return { kind: 'photo', photo: 0 };
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

/** 防止 React StrictMode 开发模式把一次挂载跑两遍时连换两张 */
let rotatedThisLoad = false;

/** 最近用过的几张，避免短期内在几张之间来回跳 */
const RECENT_KEY = 'tongshi.backdrop.recent';

function loadRecent(): number[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? list.filter((n): n is number => Number.isInteger(n)) : [];
  } catch {
    return [];
  }
}

function saveRecent(list: number[]) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(-4)));
  } catch {
    // 隐私模式写不进去就少一层防重复，不影响功能
  }
}

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 随机换一张：避开当前这张和最近用过的几张 */
function pickDifferent(current: number): number {
  if (PHOTOS.length <= 1) return 0;
  const recent = new Set(loadRecent());
  const all = PHOTOS.map((_, i) => i);
  const preferred = all.filter((i) => i !== current && !recent.has(i));
  const pool = preferred.length ? preferred : all.filter((i) => i !== current);
  const next = pool[Math.floor(Math.random() * pool.length)] ?? 0;
  saveRecent([...loadRecent(), next]);
  return next;
}

/**
 * 背景轮换规则（自动模式）：
 * - 按自然日轮换：每天第一次打开换一张，同一天内刷新、登录、切页都不换；
 * - 换图避开当前和最近 4 张，不连续重复；
 * - 手动点选一张或上传照片后固定（auto=false），不再自动轮换；
 * - 「恢复自动轮换」重新加入轮换；「换一张」可随时手动换，当天保持。
 */
export function rotateDaily(s: BackdropSetting): BackdropSetting | null {
  if (rotatedThisLoad) return null;
  if (s.kind !== 'photo' || s.auto === false) return null;
  const today = todayKey();
  if (s.day === today) return null;
  rotatedThisLoad = true;
  const next: BackdropSetting = {
    kind: 'photo',
    photo: pickDifferent(s.photo ?? 0),
    auto: true,
    day: today,
  };
  saveBackdrop(next);
  return next;
}

/** 「换一张」/「恢复自动轮换」：立刻换一张，并算作当天的选择 */
export function nextPhoto(s: BackdropSetting): BackdropSetting {
  rotatedThisLoad = true;
  const next: BackdropSetting = {
    kind: 'photo',
    photo: pickDifferent(s.photo ?? 0),
    auto: true,
    day: todayKey(),
  };
  saveBackdrop(next);
  return next;
}


export function Backdrop({ setting }: { setting: BackdropSetting }) {
  return (
    <>
      <div className={`backdrop${setting.kind === 'photo' ? ' is-photo' : ''}`} aria-hidden="true">
        <img
          src={setting.kind === 'custom' && setting.dataUrl ? setting.dataUrl : photoUrl(setting.photo ?? 0)}
          alt=""
        />
      </div>
      {setting.kind === 'custom' && <div className="backdrop-scrim" aria-hidden="true" />}
    </>
  );
}
