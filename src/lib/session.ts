const KEY = 'tongshi.session';

/** 服务端返回 401 时由 API 客户端广播，App 收到后回到登录页。 */
export const AUTH_EXPIRED_EVENT = 'tongshi:auth-expired';

export function notifyAuthExpired() {
  clearSession();
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
}

export interface User {
  badge: string;
  name: string;
  unit: string;
  /** 头像 data URL；没有时前端显示姓氏首字 */
  avatar?: string;
  /** 手机号注册用户才有 */
  phone?: string;
  /** 找回密码邮箱（可选） */
  email?: string;
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
    const res = await fetch('/api/health', { signal: AbortSignal.timeout(12000) });
    if (!res.ok) return false;
    const data = await res.json();
    return Boolean(data?.ok);
  } catch {
    return false;
  }
}

/** 向 Agent 服务换取会话令牌；服务端不可用时抛错，由登录页提示 */
export async function login(account: string, password: string): Promise<Session> {
  const normalized = account.replace(/\s+/g, '').trim();
  const isPhone = /^1[3-9]\d{9}$/.test(normalized);
  return authRequest('/api/login', {
    ...(isPhone ? { phone: normalized } : { badge: normalized }),
    password,
  });
}

/** 手机号注册；成功后服务端直接返回会话令牌 */
export async function register(input: {
  phone: string;
  password: string;
  name?: string;
  unit?: string;
  email?: string;
}): Promise<Session> {
  return authRequest('/api/register', input);
}

async function authRequest(path: string, body: Record<string, unknown>): Promise<Session> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });
  } catch {
    throw new Error('服务暂时繁忙，请稍后重试');
  }

  const data = await res.json().catch(() => null);

  if (!res.ok || !data?.token) {
    // 代理拿不到后端时会返回 500/502，且没有 message 字段，和密码错误区分开
    if (!data?.message) {
      throw new Error('服务暂时繁忙，请稍后重试');
    }
    throw new Error(data.message);
  }

  return { token: data.token, user: data.user as User };
}

/** 忘记密码：请求向绑定邮箱发送验证码 */
export async function requestPasswordReset(phone: string): Promise<{ email: string }> {
  const res = await fetch('/api/password/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone }),
    signal: AbortSignal.timeout(30000),
  });
  const data = (await res.json().catch(() => null)) as { email?: string; message?: string } | null;
  if (!res.ok || !data?.email) throw new Error(data?.message || '验证码发送失败');
  return { email: data.email };
}

/** 忘记密码：验证码 + 新密码 */
export async function resetPassword(input: {
  phone: string;
  code: string;
  password: string;
}): Promise<void> {
  const res = await fetch('/api/password/reset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(30000),
  });
  const data = (await res.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
  if (!res.ok || !data?.ok) throw new Error(data?.message || '密码重置失败');
}
