/** 本机偏好设置，只存 localStorage，不上传 */

const ENTER_KEY = 'tongshi.enterSend';
const EVENT = 'tongshi:prefs';

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
