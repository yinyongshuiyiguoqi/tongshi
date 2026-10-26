import { useEffect, useState } from 'react';
import { checkServer, login, type Session } from '../lib/session';

export function Login({ onLogin }: { onLogin: (s: Session) => void }) {
  const [badge, setBadge] = useState('100234');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [server, setServer] = useState<'checking' | 'up' | 'down'>('checking');

  useEffect(() => {
    let alive = true;
    checkServer().then((ok) => alive && setServer(ok ? 'up' : 'down'));
    return () => {
      alive = false;
    };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!badge.trim() || !password) {
      setError('请填写警号与密码');
      return;
    }
    setBusy(true);
    setError('');
    try {
      onLogin(await login(badge.trim(), password));
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <form className="login-card" onSubmit={submit}>
        <div className="login-brand">
          <span className="mark">通事</span>
          <span className="latin">TONGSHI</span>
        </div>
        <p className="login-sub">涉外执法现场辅助 · 内部工作台</p>

        <p className={`server-state is-${server}`}>
          <span className="server-dot" />
          {server === 'checking'
            ? '正在检查后端服务…'
            : server === 'up'
              ? '后端服务已连接'
              : '后端服务未连接，请先双击 start.bat'}
        </p>

        <label className="field">
          <span>警号</span>
          <input
            value={badge}
            onChange={(e) => {
              setBadge(e.target.value);
              setError('');
            }}
            placeholder="如 100234"
            inputMode="numeric"
            autoComplete="username"
            autoFocus
          />
        </label>

        <label className="field">
          <span>密码</span>
          <input
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError('');
            }}
            placeholder="演示密码：tongshi"
            autoComplete="current-password"
          />
        </label>

        {error && <p className="login-error">{error}</p>}

        <button className="primary" type="submit" disabled={busy}>
          {busy ? '验证中…' : '登录'}
        </button>

        <div className="login-demo">
          <p>演示账号</p>
          <p>
            警号 <b>100234</b>　密码 <b>tongshi</b>
          </p>
          <p className="dim">
            账号由服务端校验并签发会话令牌，令牌随请求发送；未登录无法调用分析接口。
          </p>
        </div>
      </form>
    </div>
  );
}
