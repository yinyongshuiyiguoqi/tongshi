/** 本机偏好设置，只存 localStorage，不上传 */

const ENTER_KEY = 'tongshi.enterSend';
const DOCK_KEY = 'tongshi.dockFrost';
const EVENT = 'tongshi:prefs';

/** 底栏质感：0 是液态玻璃（清、边缘折射强），1 是毛玻璃（糊）。默认偏液态 */
export const DOCK_FROST_MAX = 0.9;

export function loadDockFrost(): number {
  try {
    const raw = localStorage.getItem(DOCK_KEY);
    if (raw === null) return 0.28;
    const v = Number(raw);
    return Number.isFinite(v) && v >= 0 && v <= DOCK_FROST_MAX ? v : 0.28;
  } catch {
    return 0.28;
  }
}

export function saveDockFrost(v: number) {
  try {
    localStorage.setItem(DOCK_KEY, String(v));
  } catch {
    // 忽略
  }
  window.dispatchEvent(new Event(EVENT));
}

export function loadEnterSend(): boolean {
  try {
    return localStorage.getItem(ENTER_KEY) === '1';
  } catch {
    return false;
  }
}

export function saveEnterSend(on: boolean) {
  try {
    localStorage.setItem(ENTER_KEY, on ? '1' : '0');
  } catch {
    // 隐私模式下写不进去，忽略
  }
  window.dispatchEvent(new Event(EVENT));
}

/** 监听设置变化，多个输入框共用一份状态 */
export function onPrefsChange(fn: () => void): () => void {
  window.addEventListener(EVENT, fn);
  return () => window.removeEventListener(EVENT, fn);
}

export function isEnterSend(
  e: {
    key: string;
    shiftKey: boolean;
    ctrlKey: boolean;
    metaKey: boolean;
    isComposing?: boolean;
    nativeEvent?: { isComposing?: boolean };
  },
  enterSend: boolean,
): boolean {
  if (e.key !== 'Enter') return false;
  // 中文输入法选词时的回车不算发送
  if (e.isComposing || e.nativeEvent?.isComposing) return false;
  if (enterSend) return !e.shiftKey;
  return e.ctrlKey || e.metaKey;
}
