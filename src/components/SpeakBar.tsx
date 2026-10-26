import { useEffect, useRef, useState } from 'react';
import { translateText } from '../lib/agent';
import { LANGUAGES, type LangOption } from '../lib/languages';
import { canSpeak, speak, stopSpeaking } from '../lib/speech';

/**
 * 任意一段结果的朗读条。
 *
 * 三个按钮跟现场话术那一行保持一致：播报中文 / Play English / Other languages…?
 * 没有现成英文的段落，按英文翻一遍再念。
 */
export function SpeakBar({
  text,
  token,
  en,
}: {
  text: string;
  token: string;
  en?: string;
}) {
  const [speaking, setSpeaking] = useState<'' | 'zh' | 'en' | 'other'>('');
  const [menu, setMenu] = useState(false);
  const [picked, setPicked] = useState<LangOption | null>(null);
  const [translated, setTranslated] = useState('');
  const [busy, setBusy] = useState<'' | 'en' | 'other'>('');
  const [err, setErr] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setMenu(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [menu]);

  useEffect(() => () => stopSpeaking(), []);

  function toggle(say: string, lang: string, key: 'zh' | 'en' | 'other') {
    if (speaking === key) {
      stopSpeaking();
      setSpeaking('');
      return;
    }
    if (!speak(say, lang)) {
      setErr('当前浏览器不支持语音播报');
      return;
    }
    setSpeaking(key);
    const timer = window.setInterval(() => {
      if (!window.speechSynthesis.speaking) {
        setSpeaking('');
        window.clearInterval(timer);
      }
    }, 400);
  }

  async function playEnglish() {
    if (speaking === 'en') {
      stopSpeaking();
      setSpeaking('');
      return;
    }
    if (en) {
      toggle(en, 'en-US', 'en');
      return;
    }

    setErr('');
    setBusy('en');
    try {
      const { text: out } = await translateText(text, '英语', token, undefined, 'en-US', false);
      setBusy('');
      toggle(out, 'en-US', 'en');
    } catch {
      setBusy('');
      setErr('翻译没成功，稍后再试');
    }
  }

  async function choose(lang: LangOption) {
    setMenu(false);
    setPicked(lang);
    setErr('');

    if (lang.code === 'zh-CN') {
      toggle(text, 'zh-CN', 'zh');
      return;
    }
    if (lang.code === 'en-US' && en) {
      toggle(en, 'en-US', 'en');
      return;
    }

    stopSpeaking();
    setBusy('other');
    setTranslated('');
    try {
      const { text: out } = await translateText(text, lang.name, token, undefined, lang.code, false);
      setBusy('');
      setTranslated(out);
      toggle(out, lang.code, 'other');
    } catch {
      setBusy('');
      setErr('翻译没成功，稍后再试');
    }
  }

  if (!canSpeak() || !text.trim()) return null;

  return (
    <div className="speak-bar" ref={wrapRef}>
      <button className={speaking === 'zh' ? 'is-on' : ''} onClick={() => toggle(text, 'zh-CN', 'zh')}>
        {speaking === 'zh' ? '停止' : '播报中文'}
      </button>

      <button className={speaking === 'en' ? 'is-on' : ''} onClick={playEnglish}>
        {speaking === 'en' ? 'Stop' : busy === 'en' ? '翻译中…' : 'Play English'}
      </button>

      <div className="lang-wrap">
        <button className={menu ? 'is-on' : ''} onClick={() => setMenu((m) => !m)}>
          {busy === 'other' ? '翻译中…' : 'Other languages…?'}
        </button>
        {menu && (
          <div className="lang-menu" role="menu">
            {LANGUAGES.map((l) => (
              <button
                key={l.code}
                role="menuitem"
                className={picked?.code === l.code ? 'is-on' : ''}
                onClick={() => choose(l)}
              >
                {l.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {err && <span className="speak-err">{err}</span>}

      {translated && (
        <div className="speak-out">
          <span>{picked?.label}</span>
          <p>{translated}</p>
        </div>
      )}
    </div>
  );
}
