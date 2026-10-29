import { useEffect, useState } from 'react';
import { BootSplash } from './components/BootSplash';
import { Login } from './components/Login';
import { Workbench } from './components/Workbench';
import { logoutAccount } from './lib/account';
import {
  Backdrop,
  loadBackdrop,
  PHOTOS,
  rotateDaily,
  saveBackdrop,
  type BackdropSetting,
} from './components/Backdrop';
import { clearSession, loadSession, saveSession, AUTH_EXPIRED_EVENT, type Session } from './lib/session';

export default function App() {
  const [session, setSession] = useState<Session | null>(loadSession);
  // 每次启动都先播放开机动画；已登录也播放，动画下面直接预加载工作台。
  const [booting, setBooting] = useState(true);
  // 运镜开始后页面才挂到下面，由开机层推近+淡出化入，不再单独淡入。
  const [entering, setEntering] = useState(false);
  const [backdrop, setBackdrop] = useState<BackdropSetting>(loadBackdrop);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const onExpired = () => {
      clearSession();
      setSession(null);
      setNotice('登录已过期，请重新登录后继续追问');
    };
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired);
  }, []);

  useEffect(() => {
    // 按天轮换：每天第一次打开换一张，同一天内刷新、登录、切页都不再换。
    // 手动选中的背景（auto=false）和上传的照片不参与轮换。
    setBackdrop((cur) => rotateDaily(cur) ?? cur);
  }, []);

  function handleLogin(s: Session) {
    setNotice('');
    saveSession(s);
    setSession(s);
  }

  async function handleLogout() {
    if (session?.token) await logoutAccount(session.token);
    clearSession();
    setSession(null);
  }

  function handleSession(next: Session) {
    saveSession(next);
    setSession(next);
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
      {/* 开机动画期间整页内容只挂载、不显示：资源照常预加载，
          但登录页/工作台不会从开机动画里透出来。
          运镜开始时把页面挂到开机层下面，让推近和化入连成一镜。 */}
      <div
        className={`app-shell${entering ? ' is-entering' : ''}${booting ? '' : ' is-live'}`}
        aria-hidden={booting || undefined}
        inert={booting || undefined}
      >
        <Backdrop setting={backdrop} />
        <div className="aurora is-dim" aria-hidden="true">
          <span className="a1" />
          <span className="a2" />
          <span className="a3" />
        </div>
        {session ? (
          <Workbench
            session={session}
            onSession={handleSession}
            onLogout={handleLogout}
            backdrop={backdrop}
            onBackdrop={changeBackdrop}
          />
        ) : (
          <Login onLogin={handleLogin} notice={notice} />
        )}
      </div>
      {booting && <BootSplash onFinish={() => setBooting(false)} onCameraStart={() => setEntering(true)} />}
    </>
  );
}
