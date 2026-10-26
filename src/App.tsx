import { useState } from 'react';
import { Login } from './components/Login';
import { Workbench } from './components/Workbench';
import { clearSession, loadSession, saveSession, type Session } from './lib/session';

export default function App() {
  const [session, setSession] = useState<Session | null>(loadSession);

  function handleLogin(s: Session) {
    saveSession(s);
    setSession(s);
  }

  function handleLogout() {
    clearSession();
    setSession(null);
  }

  return (
    <>
      <div className="aurora" aria-hidden="true">
        <span className="a1" />
        <span className="a2" />
        <span className="a3" />
      </div>
      {session ? (
        <Workbench session={session} onLogout={handleLogout} />
      ) : (
        <Login onLogin={handleLogin} />
      )}
    </>
  );
}
