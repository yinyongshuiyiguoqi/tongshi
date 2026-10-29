import { useEffect, useState } from 'react';
import {
  checkServer,
  login,
  register,
  requestPasswordReset,
  resetPassword,
  type Session,
} from '../lib/session';

type Mode = 'login' | 'register';

const PHONE_RE = /^1[3-9]\d{9}$/;

export function Login({ onLogin, notice = '' }: { onLogin: (s: Session) => void; notice?: string }) {
  const [mode, setMode] = useState<Mode>('login');
  const [account, setAccount] = useState('001984');
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [server, setServer] = useState<'checking' | 'up' | 'down'>('checking');
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotStep, setForgotStep] = useState<1 | 2>(1);
  const [forgotPhone, setForgotPhone] = useState('');
  const [forgotCode, setForgotCode] = useState('');
  const [forgotPassword, setForgotPassword] = useState('');
  const [forgotConfirm, setForgotConfirm] = useState('');
  const [forgotBusy, setForgotBusy] = useState(false);
  const [forgotError, setForgotError] = useState('');
  const [forgotSuccess, setForgotSuccess] = useState('');
  const [maskedEmail, setMaskedEmail] = useState('');

  useEffect(() => {
    let alive = true;
    checkServer().then((ok) => alive && setServer(ok ? 'up' : 'down'));
    return () => {
      alive = false;
    };
  }, []);

  function switchMode(next: Mode) {
    setMode(next);
    setError('');
    setPassword('');
    setConfirm('');
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;

    if (mode === 'login') {
      if (!account.trim() || !password) {
        setError('请填写手机号/警号与密码');
        return;
      }
    } else {
      if (!PHONE_RE.test(phone.trim())) {
        setError('请输入 11 位中国大陆手机号');
        return;
      }
      if (password.length < 8) {
        setError('密码至少 8 位');
        return;
      }
      if (password !== confirm) {
        setError('两次密码不一致');
        return;
      }
    }

    setBusy(true);
    setError('');
    try {
      const session =
        mode === 'login'
          ? await login(account.trim(), password)
          : await register({
              phone: phone.trim(),
              password,
              name: name.trim() || undefined,
              unit: unit.trim() || undefined,
            });
      onLogin(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : mode === 'login' ? '登录失败' : '注册失败');
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
              : '服务暂时繁忙，请稍后重试'}
        </p>

        {notice && <p className="login-notice">{notice}</p>}

        <div className="login-tabs" role="tablist" aria-label="登录或注册">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'login'}
            className={mode === 'login' ? 'is-on' : ''}
            onClick={() => switchMode('login')}
          >
            登录
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'register'}
            className={mode === 'register' ? 'is-on' : ''}
            onClick={() => switchMode('register')}
          >
            注册
          </button>
        </div>

        {mode === 'login' ? (
          <>
            <label className="field">
              <span>手机号 / 警号</span>
              <input
                value={account}
                onChange={(e) => {
                  setAccount(e.target.value);
                  setError('');
                }}
                placeholder="手机号或演示警号，如 001984"
                inputMode="text"
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
            <button
              type="button"
              className="login-forgot"
              onClick={() => {
                setForgotOpen(true);
                setForgotStep(1);
                setForgotPhone(account.includes('@') ? '' : account);
                setForgotCode('');
                setForgotPassword('');
                setForgotConfirm('');
                setForgotError('');
                setForgotSuccess('');
                setMaskedEmail('');
              }}
            >
              忘记密码？
            </button>
          </>
        ) : (
          <>
            <label className="field">
              <span>手机号</span>
              <input
                type="tel"
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value.replace(/\D/g, '').slice(0, 11));
                  setError('');
                }}
                placeholder="11 位中国大陆手机号"
                inputMode="tel"
                autoComplete="tel"
                autoFocus
              />
            </label>

            <label className="field">
              <span>找回邮箱（选填）</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="忘记密码时用来接收验证码"
                autoComplete="email"
              />
            </label>

            <div className="login-row">
              <label className="field">
                <span>姓名（选填）</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="怎么称呼"
                  maxLength={20}
                />
              </label>
              <label className="field">
                <span>单位（选填）</span>
                <input
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  placeholder="如 派出所"
                  maxLength={30}
                />
              </label>
            </div>

            <label className="field">
              <span>设置密码</span>
              <input
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError('');
                }}
                placeholder="至少 8 位"
                autoComplete="new-password"
              />
            </label>

            <label className="field">
              <span>确认密码</span>
              <input
                type="password"
                value={confirm}
                onChange={(e) => {
                  setConfirm(e.target.value);
                  setError('');
                }}
                placeholder="再输入一次"
                autoComplete="new-password"
              />
            </label>

            <p className="login-hint">
              手机号只作为登录账号。建议填写找回邮箱，忘记密码时可以自助重置；未绑定邮箱的账号需要联系管理员。
            </p>
          </>
        )}

        {error && <p className="login-error">{error}</p>}

        <button className="primary" type="submit" disabled={busy}>
          {busy ? (mode === 'login' ? '验证中…' : '注册中…') : mode === 'login' ? '登录' : '注册并登录'}
        </button>

        {mode === 'login' && (
          <div className="login-demo">
            <p>演示账号</p>
            <p>
              警号 <b>001984</b>　密码 <b>tongshi</b>
            </p>
            <p className="dim">
              账号由服务端校验并签发会话令牌，令牌随请求发送；未登录无法调用分析接口。
            </p>
          </div>
        )}
      </form>

      {forgotOpen && (
        <div className="forgot-backdrop" role="presentation" onClick={() => setForgotOpen(false)}>
          <section
            className="forgot-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="forgot-title"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="forgot-head">
              <div>
                <p className="forgot-eyebrow">账号找回</p>
                <h2 id="forgot-title">忘记密码</h2>
              </div>
              <button type="button" className="forgot-close" onClick={() => setForgotOpen(false)} aria-label="关闭">×</button>
            </header>

            {forgotStep === 1 ? (
              <>
                <p className="forgot-copy">
                  输入注册手机号。如果账号已绑定找回邮箱，我们会发送 6 位验证码。
                </p>
                <label className="field">
                  <span>注册手机号</span>
                  <input
                    type="tel"
                    value={forgotPhone}
                    onChange={(e) => {
                      setForgotPhone(e.target.value.replace(/\D/g, '').slice(0, 11));
                      setForgotError('');
                    }}
                    placeholder="11 位中国大陆手机号"
                    inputMode="tel"
                    autoFocus
                  />
                </label>
                <button
                  className="primary forgot-submit"
                  type="button"
                  disabled={forgotBusy}
                  onClick={async () => {
                    if (!/^1[3-9]\d{9}$/.test(forgotPhone)) {
                      setForgotError('请输入正确的手机号');
                      return;
                    }
                    setForgotBusy(true);
                    setForgotError('');
                    setForgotSuccess('');
                    try {
                      const result = await requestPasswordReset(forgotPhone);
                      setMaskedEmail(result.email);
                      setForgotStep(2);
                      setForgotSuccess(`验证码已发送到 ${result.email}`);
                    } catch (err) {
                      setForgotError(err instanceof Error ? err.message : '验证码发送失败');
                    } finally {
                      setForgotBusy(false);
                    }
                  }}
                >
                  {forgotBusy ? '发送中…' : '发送验证码'}
                </button>
              </>
            ) : (
              <>
                <p className="forgot-copy">
                  验证码已发送到 {maskedEmail}，10 分钟内有效。
                </p>
                <label className="field">
                  <span>验证码</span>
                  <input
                    value={forgotCode}
                    onChange={(e) => {
                      setForgotCode(e.target.value.replace(/\D/g, '').slice(0, 6));
                      setForgotError('');
                    }}
                    placeholder="6 位数字"
                    inputMode="numeric"
                    autoFocus
                  />
                </label>
                <label className="field">
                  <span>新密码</span>
                  <input
                    type="password"
                    value={forgotPassword}
                    onChange={(e) => {
                      setForgotPassword(e.target.value);
                      setForgotError('');
                    }}
                    placeholder="8–72 位"
                    autoComplete="new-password"
                  />
                </label>
                <label className="field">
                  <span>确认新密码</span>
                  <input
                    type="password"
                    value={forgotConfirm}
                    onChange={(e) => {
                      setForgotConfirm(e.target.value);
                      setForgotError('');
                    }}
                    placeholder="再输入一次"
                    autoComplete="new-password"
                  />
                </label>
                <button
                  className="primary forgot-submit"
                  type="button"
                  disabled={forgotBusy}
                  onClick={async () => {
                    if (forgotPassword.length < 8) {
                      setForgotError('新密码至少 8 位');
                      return;
                    }
                    if (forgotPassword !== forgotConfirm) {
                      setForgotError('两次输入的新密码不一致');
                      return;
                    }
                    setForgotBusy(true);
                    setForgotError('');
                    try {
                      await resetPassword({ phone: forgotPhone, code: forgotCode, password: forgotPassword });
                      setForgotSuccess('密码已重置，请用新密码登录');
                      setMode('login');
                      setAccount(forgotPhone);
                      setPassword('');
                      setTimeout(() => setForgotOpen(false), 900);
                    } catch (err) {
                      setForgotError(err instanceof Error ? err.message : '密码重置失败');
                    } finally {
                      setForgotBusy(false);
                    }
                  }}
                >
                  {forgotBusy ? '重置中…' : '重置密码'}
                </button>
                <button
                  type="button"
                  className="login-forgot"
                  onClick={() => {
                    setForgotStep(1);
                    setForgotError('');
                    setForgotSuccess('');
                  }}
                >
                  重新获取验证码
                </button>
              </>
            )}

            {forgotError && <p className="login-error">{forgotError}</p>}
            {forgotSuccess && <p className="forgot-success">{forgotSuccess}</p>}
          </section>
        </div>
      )}
    </div>
  );
}
