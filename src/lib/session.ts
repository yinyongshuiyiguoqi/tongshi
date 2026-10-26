const KEY = 'tongshi.session';

export interface User {
  badge: string;
  name: string;
  unit: string;
}

export interface Session {
  token: string;
  user: User;
}

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Session;
    return s?.token && s?.user ? s : null;
  } catch {
    return null;
  }
}

export function saveSession(s: Session) {
  localStorage.setItem(KEY, JSON.stringify(s));
}

export function clearSession() {
  localStorage.removeItem(KEY);
}

/** 探测后端是否在线，登录页用来自我诊断 */
export async function checkServer(): Promise<boolean> {
  try {
    const res = await fetch('/api/health', { signal: AbortSignal.timeout(2500) });
    if (!res.ok) return false;
    const data = await res.json();
    return Boolean(data?.ok);
  } catch {
    return false;
  }
}

/** 向 Agent 服务换取会话令牌；服务端不可用时抛错，由登录页提示 */
export async function login(badge: string, password: string): Promise<Session> {
  let res: Response;
  try {
    res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ badge, password }),
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new Error('连不上后端服务。请先双击 start.bat，等服务窗口出现再试');
  }

  const data = await res.json().catch(() => null);

  if (!res.ok || !data?.token) {
    // 代理拿不到后端时会返回 500/502，且没有 message 字段，和密码错误区分开
    if (!data?.message) {
      throw new Error('后端没有响应，可能没启动。请双击 start.bat，再刷新本页');
    }
    throw new Error(data.message);
  }

  return { token: data.token, user: data.user as User };
}
