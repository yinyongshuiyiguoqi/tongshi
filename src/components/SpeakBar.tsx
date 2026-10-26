import { useEffect, useRef, useState } from 'react';
import { translateText } from '../lib/agent';
import { LANGUAGES, type LangOption } from '../lib/languages';
import { canSpeak, speak, stopSpeaking } from '../lib/speech';

/**
 * 任意一段 AI 回答的朗读条。
 *
 * 预设情形有审定好的双语话术，模型现写的回答没有，所以这里补一个：
 * 中文直接念，别的语种先翻再念，选中就播。
 */
export function SpeakBar({
  text,
  token,
  compact = false,
}: {
  text: string;
  token: string;
  compact?: boolean;
}) {
  const [speaking, setSpeaking] = useState(false);
  const [menu, setMenu] = useState(false);
  const [picked, setPicked] = useState<LangOption | null>(null);
  const [translated, setTranslated] = useState('');
  const [loading, setLoading] = useState(false);
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

  function toggle(lang: string) {
    if (speaking) {
      stopSpeaking();
      setSpeaking(false);
      return;
    }
    if (!speak(text, lang)) {
      setErr('当前浏览器不支持语音播报');
      return;
    }
    setSpeaking(true);
    const timer = window.setInterval(() => {
      if (!window.speechSynthesis.speaking) {
        setSpeaking(false);
        window.clearInterval(timer);
      }
    }, 400);
  }

  async function choose(lang: LangOption) {
    setMenu(false);
    setPicked(lang);
    setErr('');

    if (lang.code === 'zh-CN') {
      toggle('zh-CN');
      return;
    }

    stopSpeaking();
    setLoading(true);
    setTranslated('');
    try {
      const { text: out } = await translateText(
        text,
        lang.name,
        token,
        undefined,
        lang.code,
        false,
      );
      setLoading(false);
      setTranslated(out);
      if (speak(out, lang.code)) {
        setSpeaking(true);
        const timer = window.setInterval(() => {
          if (!window.speechSynthesis.speaking) {
            setSpeaking(false);
            window.clearInterval(timer);
          }
        }, 400);
      }
    } catch {
      setLoading(false);
      setErr('翻译没成功，稍后再试');
    }
  }

  if (!canSpeak() || !text.trim()) return null;

  return (
    <div className={`speak-bar${compact ? ' is-compact' : ''}`} ref={wrapRef}>
      <button className={speaking ? 'is-on' : ''} onClick={() => toggle('zh-CN')}>
        {speaking ? '停止' : compact ? '播报' : '播报中文'}
      </button>

      <div className="lang-wrap">
        <button className={menu ? 'is-on' : ''} onClick={() => setMenu((m) => !m)}>
          {loading ? '翻译中…' : 'Other languages…?'}
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
