import { notifyAuthExpired, type User } from './session';

export interface AccountUpdate {
  name?: string;
  avatar?: string;
  email?: string;
  currentPassword?: string;
  newPassword?: string;
}

async function request<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init?.headers || {}),
    },
    signal: AbortSignal.timeout(20000),
  });
  if (res.status === 401) {
    notifyAuthExpired();
    throw new Error('登录已过期，请重新登录');
  }
  const data = (await res.json().catch(() => null)) as (T & { message?: string }) | null;
  if (!res.ok || !data) throw new Error(data?.message || '账号服务暂时不可用');
  return data;
}

export async function getAccount(token: string): Promise<User> {
  const data = await request<{ user: User }>('/api/account', token);
  return data.user;
}

export async function updateAccount(
  token: string,
  patch: AccountUpdate,
): Promise<{ user: User; token?: string }> {
  return request<{ user: User; token?: string }>('/api/account', token, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export interface LoginSession {
  id: string;
  device: string;
  ip: string;
  createdAt: string;
  lastSeen: string;
  current: boolean;
}

export async function getLoginSessions(token: string): Promise<LoginSession[]> {
  const data = await request<{ sessions: LoginSession[] }>('/api/account/sessions', token);
  return Array.isArray(data.sessions) ? data.sessions : [];
}

export async function revokeLoginSession(token: string, id: string): Promise<{ current: boolean }> {
  return request<{ current: boolean }>('/api/account/sessions/revoke', token, {
    method: 'POST',
    body: JSON.stringify({ id }),
  });
}

export async function deleteAccount(token: string, password: string): Promise<void> {
  await request<{ ok: boolean }>('/api/account/delete', token, {
    method: 'POST',
    body: JSON.stringify({ password }),
  });
}

export async function logoutAccount(token: string): Promise<void> {
  await request<{ ok: boolean }>('/api/logout', token, {
    method: 'POST',
    body: JSON.stringify({}),
  }).catch(() => {
    // 退出登录不被网络问题卡住
  });
}
