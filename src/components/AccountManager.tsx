import { useEffect, useRef, useState } from 'react';
import {
  deleteAccount,
  getAccount,
  getLoginSessions,
  revokeLoginSession,
  updateAccount,
  type LoginSession,
} from '../lib/account';
import type { Session, User } from '../lib/session';

function avatarLetter(name: string): string {
  return (name || '通').trim().slice(0, 1) || '通';
}

async function resizeAvatar(file: File): Promise<string> {
  if (!/^image\//.test(file.type)) throw new Error('请选择图片文件');
  if (file.size > 5 * 1024 * 1024) throw new Error('图片不能超过 5MB');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('图片读取失败'));
      image.src = url;
    });
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('无法处理图片');
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const sx = (img.naturalWidth - side) / 2;
    const sy = (img.naturalHeight - side) / 2;
    ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
    let data = canvas.toDataURL('image/jpeg', 0.84);
    if (data.length > 170_000) data = canvas.toDataURL('image/jpeg', 0.68);
    if (data.length > 190_000) data = canvas.toDataURL('image/jpeg', 0.52);
    return data;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function AccountManager({
  session,
  onClose,
  onSession,
  onLogout,
}: {
  session: Session;
  onClose: () => void;
  onSession: (s: Session) => void;
  onLogout: () => void;
}) {
  const [user, setUser] = useState<User>(session.user);
  const [name, setName] = useState(session.user.name);
  const [avatar, setAvatar] = useState(session.user.avatar || '');
  const [originalAvatar, setOriginalAvatar] = useState(session.user.avatar || '');
  const [originalName, setOriginalName] = useState(session.user.name);
  const [email, setEmail] = useState(session.user.email || '');
  const [originalEmail, setOriginalEmail] = useState(session.user.email || '');
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState<'' | 'profile' | 'password' | 'delete'>('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [sessions, setSessions] = useState<LoginSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionsError, setSessionsError] = useState('');
  const [deleteStep, setDeleteStep] = useState(0);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    getAccount(session.token)
      .then((fresh) => {
        if (!alive) return;
        setUser(fresh);
        setName(fresh.name);
        setAvatar(fresh.avatar || '');
        setOriginalAvatar(fresh.avatar || '');
        setOriginalName(fresh.name);
        setEmail(fresh.email || '');
        setOriginalEmail(fresh.email || '');
        onSession({ ...session, user: fresh });
      })
      .catch((err) => {
        if (alive) setError(err instanceof Error ? err.message : '账号资料读取失败');
      });
    return () => {
      alive = false;
    };
    // 只在打开时同步一次，后续由本组件维护状态
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.token]);

  useEffect(() => {
    let alive = true;
    getLoginSessions(session.token)
      .then((list) => {
        if (alive) setSessions(list);
      })
      .catch((err) => {
        if (alive) setSessionsError(err instanceof Error ? err.message : '登录设备读取失败');
      })
      .finally(() => {
        if (alive) setSessionsLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [session.token]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (confirming) setConfirming(false);
        else onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirming, onClose]);

  function adopt(nextSession: Session) {
    setUser(nextSession.user);
    onSession(nextSession);
  }

  async function chooseAvatar(file: File) {
    setError('');
    setSuccess('');
    try {
      const data = await resizeAvatar(file);
      setAvatar(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '头像处理失败');
    }
  }

  async function saveProfile() {
    if (busy) return;
    const nextName = name.trim();
    if (!nextName) {
      setError('昵称不能为空');
      return;
    }
    if (nextName === originalName && avatar === originalAvatar && email.trim().toLowerCase() === originalEmail) {
      setSuccess('资料没有变化');
      return;
    }
    setBusy('profile');
    setError('');
    setSuccess('');
    try {
      const patch: { name?: string; avatar?: string; email?: string } = {};
      if (nextName !== originalName) patch.name = nextName;
      if (avatar !== originalAvatar) patch.avatar = avatar;
      if (email.trim().toLowerCase() !== originalEmail) patch.email = email.trim().toLowerCase();
      const res = await updateAccount(session.token, patch);
      const nextSession = { ...session, token: res.token || session.token, user: res.user };
      adopt(nextSession);
      setOriginalName(res.user.name);
      setOriginalAvatar(res.user.avatar || '');
      setOriginalEmail(res.user.email || '');
      setEmail(res.user.email || '');
      setSuccess('昵称和头像已保存');
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setBusy('');
    }
  }

  function requestPasswordChange() {
    setError('');
    setSuccess('');
    if (!current) {
      setError('请输入当前密码');
      return;
    }
    if (next.length < 8 || next.length > 72) {
      setError('新密码长度需为 8–72 位');
      return;
    }
    if (next !== confirm) {
      setError('两次输入的新密码不一致');
      return;
    }
    if (next === current) {
      setError('新密码不能和当前密码相同');
      return;
    }
    setConfirming(true);
  }

  async function confirmPasswordChange() {
    if (busy) return;
    setBusy('password');
    setError('');
    setSuccess('');
    try {
      const res = await updateAccount(session.token, {
        currentPassword: current,
        newPassword: next,
      });
      adopt({ ...session, token: res.token || session.token, user: res.user });
      setCurrent('');
      setNext('');
      setConfirm('');
      setConfirming(false);
      setSuccess('密码已修改，下次登录请使用新密码');
    } catch (err) {
      setConfirming(false);
      setError(err instanceof Error ? err.message : '密码修改失败');
    } finally {
      setBusy('');
    }
  }

  async function removeSession(target: LoginSession) {
    if (busy) return;
    if (!window.confirm(target.current ? '注销当前登录设备？注销后需要重新登录。' : `注销「${target.device}」这个登录设备？`)) return;
    setBusy('delete');
    setSessionsError('');
    try {
      const result = await revokeLoginSession(session.token, target.id);
      if (result.current || target.current) {
        onLogout();
        return;
      }
      setSessions((list) => list.filter((s) => s.id !== target.id));
    } catch (err) {
      setSessionsError(err instanceof Error ? err.message : '注销设备失败');
    } finally {
      setBusy('');
    }
  }

  async function confirmDeleteAccount() {
    if (busy === 'delete') return;
    if (!deletePassword) {
      setError('请输入当前密码');
      return;
    }
    if (deleteConfirmText.trim() !== '注销我的账号') {
      setError('请输入完整的确认文字：注销我的账号');
      return;
    }
    setBusy('delete');
    setError('');
    try {
      await deleteAccount(session.token, deletePassword);
      onLogout();
    } catch (err) {
      setError(err instanceof Error ? err.message : '注销账号失败');
      setBusy('');
    }
  }

  return (
    <div className="account-backdrop" role="presentation" onPointerDown={onClose}>
      <section
        className="account-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-title"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <header className="account-head">
          <div>
            <p className="account-eyebrow">个人中心</p>
            <h2 id="account-title">账号管理</h2>
          </div>
          <button className="account-close" type="button" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </header>

        <div className="account-avatar-row">
          <div className="account-avatar">
            {avatar ? <img src={avatar} alt="" /> : <span>{avatarLetter(name)}</span>}
          </div>
          <div className="account-avatar-actions">
            <button className="ghost-btn" type="button" onClick={() => fileRef.current?.click()}>
              更换头像
            </button>
            {avatar && (
              <button className="account-link" type="button" onClick={() => setAvatar('')}>
                恢复默认
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) chooseAvatar(file);
                e.currentTarget.value = '';
              }}
            />
            <p>建议使用正方形头像，上传后自动裁剪成 256×256。</p>
          </div>
        </div>

        <label className="account-field">
          <span>昵称</span>
          <input
            value={name}
            maxLength={24}
            onChange={(e) => setName(e.target.value)}
            placeholder="显示在个人页的名字"
          />
        </label>

        {user.phone && (
          <label className="account-field">
            <span>找回邮箱</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="绑定后可自助找回密码"
              autoComplete="email"
            />
          </label>
        )}

        <div className="account-id-row">
          <span>{user.phone ? '手机号' : '警号'}</span>
          <strong>{user.phone || user.badge}</strong>
          <small>{user.unit}</small>
        </div>

        <button className="primary account-save" type="button" onClick={saveProfile} disabled={busy === 'profile'}>
          {busy === 'profile' ? '保存中…' : '保存昵称和头像'}
        </button>

        <div className="account-divider" />

        <div className="account-password-head">
          <h3>修改密码</h3>
          <p>需要先验证当前密码，确认后才会生效。</p>
        </div>

        <div className="account-password-grid">
          <label className="account-field">
            <span>当前密码</span>
            <input
              type="password"
              value={current}
              autoComplete="current-password"
              onChange={(e) => setCurrent(e.target.value)}
            />
          </label>
          <label className="account-field">
            <span>新密码</span>
            <input
              type="password"
              value={next}
              autoComplete="new-password"
              onChange={(e) => setNext(e.target.value)}
              placeholder="8–72 位"
            />
          </label>
          <label className="account-field">
            <span>再次输入新密码</span>
            <input
              type="password"
              value={confirm}
              autoComplete="new-password"
              onChange={(e) => setConfirm(e.target.value)}
            />
          </label>
        </div>

        <button className="ghost-btn account-password-btn" type="button" onClick={requestPasswordChange}>
          修改密码
        </button>

        <div className="account-divider" />

        <div className="account-section-head">
          <div>
            <h3>登录设备</h3>
            <p>查看当前账号登录过的设备；不是自己的设备可以立即注销。</p>
          </div>
        </div>

        <div className="account-session-list">
          {sessionsLoading && <p className="account-muted">正在读取登录设备…</p>}
          {!sessionsLoading && sessions.length === 0 && !sessionsError && (
            <p className="account-muted">暂时没有可显示的登录设备。</p>
          )}
          {sessions.map((item) => (
            <div className="account-session" key={item.id}>
              <div className="account-session-main">
                <strong>
                  {item.device}
                  {item.current ? ' · 当前设备' : ''}
                </strong>
                <span>
                  {item.ip} · 最近活跃{' '}
                  {new Date(item.lastSeen).toLocaleString('zh-CN', {
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
              <button
                className="account-session-revoke"
                type="button"
                disabled={busy === 'delete'}
                onClick={() => removeSession(item)}
              >
                {item.current ? '退出' : '注销'}
              </button>
            </div>
          ))}
          {sessionsError && <p className="account-error">{sessionsError}</p>}
        </div>

        <div className="account-divider" />

        <div className="account-danger">
          <div>
            <h3>注销账号</h3>
            <p>
              {user.phone
                ? '永久删除账号资料、头像、Agent 配置和登录设备，无法恢复。'
                : '预置演示账号 / 警号账号不能注销，请联系管理员处理。'}
            </p>
          </div>
          {user.phone ? (
            <button
              className="account-danger-btn"
              type="button"
              onClick={() => {
                setError('');
                setSuccess('');
                setDeleteStep(1);
              }}
            >
              注销账号
            </button>
          ) : (
            <span className="account-muted">不可注销</span>
          )}
        </div>

        {error && <p className="account-error">{error}</p>}
        {success && <p className="account-success">{success}</p>}

        {deleteStep > 0 && (
          <div className="account-confirm-backdrop" role="presentation" onClick={() => setDeleteStep(0)}>
            <div
              className="account-confirm"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="account-delete-title"
              onClick={(e) => e.stopPropagation()}
            >
              {deleteStep === 1 ? (
                <>
                  <h4 id="account-delete-title">确定要注销账号？</h4>
                  <p>
                    注销会永久删除你的账号资料、头像、Agent 配置和所有登录设备，无法恢复。
                    建议先确认已经不需要这个账号。
                  </p>
                  <div className="account-confirm-actions">
                    <button className="ghost-btn" type="button" onClick={() => setDeleteStep(0)}>
                      取消
                    </button>
                    <button
                      className="account-danger-btn"
                      type="button"
                      onClick={() => setDeleteStep(2)}
                    >
                      继续注销
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <h4 id="account-delete-title">最后一次确认</h4>
                  <p>请输入当前密码，并输入「注销我的账号」六个字。</p>
                  <label className="account-field">
                    <span>当前密码</span>
                    <input
                      type="password"
                      value={deletePassword}
                      onChange={(e) => setDeletePassword(e.target.value)}
                      autoComplete="current-password"
                    />
                  </label>
                  <label className="account-field">
                    <span>确认文字</span>
                    <input
                      value={deleteConfirmText}
                      onChange={(e) => setDeleteConfirmText(e.target.value)}
                      placeholder="注销我的账号"
                    />
                  </label>
                  <div className="account-confirm-actions">
                    <button
                      className="ghost-btn"
                      type="button"
                      onClick={() => setDeleteStep(0)}
                      disabled={busy === 'delete'}
                    >
                      取消
                    </button>
                    <button
                      className="account-danger-btn"
                      type="button"
                      onClick={confirmDeleteAccount}
                      disabled={
                        busy === 'delete' ||
                        deleteConfirmText.trim() !== '注销我的账号' ||
                        !deletePassword
                      }
                    >
                      {busy === 'delete' ? '注销中…' : '永久注销'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {confirming && (
          <div className="account-confirm-backdrop" role="presentation" onClick={() => setConfirming(false)}>
            <div
              className="account-confirm"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="account-confirm-title"
              onClick={(e) => e.stopPropagation()}
            >
              <h4 id="account-confirm-title">再次确认修改密码？</h4>
              <p>修改后当前密码立即失效，下次登录需要使用新密码。</p>
              <div className="account-confirm-actions">
                <button className="ghost-btn" type="button" onClick={() => setConfirming(false)} disabled={busy === 'password'}>
                  取消
                </button>
                <button className="primary" type="button" onClick={confirmPasswordChange} disabled={busy === 'password'}>
                  {busy === 'password' ? '修改中…' : '确认修改'}
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
