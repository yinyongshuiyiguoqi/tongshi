import { useEffect, useRef, useState } from 'react';
import { translateText } from '../lib/agent';
import { LANGUAGES, type LangOption } from '../lib/languages';
import { canSpeak, speak, stopSpeaking } from '../lib/speech';

/**
 * 一条现场话术。
 *
 * 中英双语是库里写好的；其他语种按需翻译——点 Other languages…? 选一门，
 * 走模型翻一次，翻完存在本页内，同一个语种再点不会重复花钱。
 */
export function ScriptItem({
  script,
  token,
}: {
  script: { zh: string; en?: string };
  token: string;
}) {
  const [speaking, setSpeaking] = useState('');
  const [menu, setMenu] = useState(false);
  const [picked, setPicked] = useState<LangOption | null>(null);
  const [translated, setTranslated] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);
  const cache = useRef(new Map<string, string>());

  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setMenu(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [menu]);

  useEffect(() => () => stopSpeaking(), []);

  async function choose(lang: LangOption) {
    setMenu(false);
    setPicked(lang);
    setError('');

    if (lang.code === 'en-US' && script.en) {
      setTranslated(script.en);
      return;
    }

    const hit = cache.current.get(lang.code);
    if (hit) {
      setTranslated(hit);
      return;
    }

    setTranslated('');
    setLoading(true);
    try {
      const text = await translateText(script.zh, lang.name, token, undefined, lang.code);
      cache.current.set(lang.code, text);
      setTranslated(text);
    } catch (err) {
      setError(err instanceof Error ? err.message : '翻译失败');
    }
    setLoading(false);
  }

  function toggle(text: string, lang: string, key: string) {
    if (speaking === key) {
      stopSpeaking();
      setSpeaking('');
      return;
    }
    if (!speak(text, lang)) {
      setError('当前浏览器不支持语音播报');
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

  const other = picked && picked.code !== 'en-US';

  return (
    <div className="r-script" ref={wrapRef}>
      <p className="r-zh">{script.zh}</p>
      {script.en && <p className="r-en">{script.en}</p>}

      {other && (
        <div className="r-other">
          <span className="r-other-tag">{picked.label}</span>
          <p>{loading ? '翻译中…' : translated}</p>
        </div>
      )}

      {error && <p className="r-warn">{error}</p>}

      <div className="r-speak">
        {canSpeak() && (
          <>
            <button
              className={speaking === 'zh' ? 'is-on' : ''}
              onClick={() => toggle(script.zh, 'zh-CN', 'zh')}
            >
              {speaking === 'zh' ? '停止' : '播报中文'}
            </button>
            {script.en && (
              <button
                className={speaking === 'en' ? 'is-on' : ''}
                onClick={() => toggle(script.en as string, 'en-US', 'en')}
              >
                {speaking === 'en' ? 'Stop' : 'Play English'}
              </button>
            )}
            {other && translated && (
              <button
                className={speaking === 'other' ? 'is-on' : ''}
                onClick={() => toggle(translated, picked.code, 'other')}
              >
                {speaking === 'other' ? '停止' : `播报${picked.label}`}
              </button>
            )}
          </>
        )}

        <div className="lang-wrap">
          <button className={menu ? 'is-on' : ''} onClick={() => setMenu((m) => !m)}>
            Other languages…?
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
      </div>
    </div>
  );
}
