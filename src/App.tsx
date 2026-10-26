import { useEffect, useState } from 'react';
import { Login } from './components/Login';
import { Workbench } from './components/Workbench';
import { Backdrop, loadBackdrop, saveBackdrop, type BackdropSetting } from './components/Backdrop';
import { clearSession, loadSession, saveSession, type Session } from './lib/session';

export default function App() {
  const [session, setSession] = useState<Session | null>(loadSession);
  const [backdrop, setBackdrop] = useState<BackdropSetting>(loadBackdrop);

  function handleLogin(s: Session) {
    saveSession(s);
    setSession(s);
  }

  function handleLogout() {
    clearSession();
    setSession(null);
  }

  function changeBackdrop(next: BackdropSetting) {
    saveBackdrop(next);
    setBackdrop(next);
  }

  // 把当前场景挂到 <html> 上，CSS 据此决定高光从哪个方向打过来
  useEffect(() => {
    document.documentElement.dataset.bg = backdrop.kind;
  }, [backdrop.kind]);

  return (
    <>
      <Backdrop setting={backdrop} />
      <div className={`aurora${backdrop.kind !== 'none' ? ' is-dim' : ''}`} aria-hidden="true">
        <span className="a1" />
        <span className="a2" />
        <span className="a3" />
      </div>
      {session ? (
        <Workbench
          session={session}
          onLogout={handleLogout}
          backdrop={backdrop}
          onBackdrop={changeBackdrop}
        />
      ) : (
        <Login onLogin={handleLogin} />
      )}
    </>
  );
}
