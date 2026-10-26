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

/** 向 Agent 服务换取会话令牌；服务端不可用时抛错，由登录页提示 */
export async function login(badge: string, password: string): Promise<Session> {
  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ badge, password }),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok || !data.token) {
    throw new Error(data?.message || '登录失败，请检查警号与密码');
  }

  return { token: data.token, user: data.user as User };
}
