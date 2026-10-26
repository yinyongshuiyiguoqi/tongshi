export type BackdropKind = 'photo' | 'custom';

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

/** 每次登录往后推一张，自己上传的照片不参与轮换 */
export function nextBackdrop(s: BackdropSetting): BackdropSetting {
  if (s.kind !== 'photo') return s;
  return { kind: 'photo', photo: ((s.photo ?? -1) + 1) % PHOTOS.length };
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
