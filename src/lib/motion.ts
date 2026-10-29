export function motionAvailable(): boolean {
  return typeof window !== 'undefined' && 'DeviceOrientationEvent' in window;
}

/**
 * iOS 13+ 需要在用户手势里申请体感权限。
 * 安卓/桌面没有 requestPermission 时直接返回 true（桌面只是没有事件）。
 */
export async function requestMotionPermission(): Promise<boolean> {
  if (!motionAvailable()) return false;
  const ctor = window.DeviceOrientationEvent as typeof DeviceOrientationEvent & {
    requestPermission?: () => Promise<'granted' | 'denied'>;
  };
  if (typeof ctor.requestPermission !== 'function') return true;
  try {
    return (await ctor.requestPermission()) === 'granted';
  } catch {
    return false;
  }
}
