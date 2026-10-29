export type CompanionFeedback = 'bubble' | 'bounce' | 'none';

export interface CompanionSettings {
  enabled: boolean;
  name: string;
  /** 自动走动的间隔秒数，0 表示停在原地 */
  walkSeconds: number;
  clickFeedback: CompanionFeedback;
  /** 点击时是否播放玻璃轻响 */
  sound: boolean;
  /** 手机倾斜时是否用体感重力滚动 */
  motion: boolean;
}

const KEY = 'tongshi.companion';
const EVENT = 'tongshi:companion';

export const DEFAULT_COMPANION: CompanionSettings = {
  enabled: true,
  name: '小玻璃',
  walkSeconds: 8,
  clickFeedback: 'bubble',
  sound: true,
  motion: true,
};

export function loadCompanion(): CompanionSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_COMPANION;
    const s = JSON.parse(raw) as Partial<CompanionSettings>;
    return {
      enabled: s.enabled !== false,
      name: String(s.name || DEFAULT_COMPANION.name).slice(0, 12),
      walkSeconds: [0, 5, 8, 16, 30].includes(Number(s.walkSeconds))
        ? Number(s.walkSeconds)
        : DEFAULT_COMPANION.walkSeconds,
      clickFeedback:
        s.clickFeedback === 'bounce' || s.clickFeedback === 'none' ? s.clickFeedback : 'bubble',
      sound: s.sound !== false,
      motion: s.motion !== false,
    };
  } catch {
    return DEFAULT_COMPANION;
  }
}

export function saveCompanion(settings: CompanionSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // 隐私模式写不进去，忽略
  }
  window.dispatchEvent(new Event(EVENT));
}

export function onCompanionChange(fn: () => void): () => void {
  window.addEventListener(EVENT, fn);
  return () => window.removeEventListener(EVENT, fn);
}
