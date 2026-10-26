import { useEffect, useState } from 'react';
import { Login } from './components/Login';
import { Workbench } from './components/Workbench';
import {
  Backdrop,
  loadBackdrop,
  nextBackdrop,
  PHOTOS,
  saveBackdrop,
  type BackdropSetting,
} from './components/Backdrop';
import { clearSession, loadSession, saveSession, type Session } from './lib/session';

export default function App() {
  const [session, setSession] = useState<Session | null>(loadSession);
  const [backdrop, setBackdrop] = useState<BackdropSetting>(loadBackdrop);

  function handleLogin(s: Session) {
    saveSession(s);
    setSession(s);

    // 每次登录换一张实景照片；自己上传的和纯色不动
    setBackdrop((cur) => {
      const next = nextBackdrop(cur);
      saveBackdrop(next);
      return next;
    });
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
    const root = document.documentElement;
    root.dataset.bg = backdrop.kind;

    const photo = PHOTOS[backdrop.photo ?? 0];
    if (backdrop.kind === 'photo' && photo) {
      root.style.setProperty('--light-x', photo.light.x);
      root.style.setProperty('--light-y', photo.light.y);
      root.style.setProperty('--light-rgb', photo.light.rgb);
    } else {
      ['--light-x', '--light-y', '--light-rgb'].forEach((k) => root.style.removeProperty(k));
    }
  }, [backdrop]);

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
