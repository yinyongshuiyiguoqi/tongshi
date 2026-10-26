/** 本机偏好设置，只存 localStorage，不上传 */

const ENTER_KEY = 'tongshi.enterSend';
const DOCK_KEY = 'tongshi.dockTint';
const EVENT = 'tongshi:prefs';

/** 底栏玻璃浓度：0 最通透，1 最厚重。默认沿用之前调好的 0.72 */
export function loadDockTint(): number {
  try {
    const raw = localStorage.getItem(DOCK_KEY);
    if (raw === null) return 0.72;
    const v = Number(raw);
    return Number.isFinite(v) && v >= 0 && v <= 1 ? v : 0.72;
  } catch {
    return 0.72;
  }
}

export function saveDockTint(v: number) {
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
