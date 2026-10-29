import { useEffect, useRef, useState } from 'react';
import { translateText } from '../lib/agent';
import { LANGUAGES, type LangOption } from '../lib/languages';
import { canSpeak, isSpeaking, speak, stopSpeaking } from '../lib/speech';

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
  const [selection, setSelection] = useState<{
    text: string;
    lang: string;
  } | null>(null);

  useEffect(() => {
    if (!menu) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setMenu(false);
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [menu]);

  useEffect(() => () => stopSpeaking(), []);

  useEffect(() => {
    const hide = () => setSelection(null);
    let timer: number | undefined;

    const refresh = () => {
      const root = wrapRef.current;
      const sel = window.getSelection();
      if (!root || !sel || sel.isCollapsed || !sel.rangeCount) {
        hide();
        return;
      }
      const range = sel.getRangeAt(0);
      if (!root.contains(range.commonAncestorContainer)) {
        hide();
        return;
      }
      const text = sel.toString().replace(/\s+/g, ' ').trim();
      if (!text) {
        hide();
        return;
      }

      const start =
        range.startContainer.nodeType === Node.TEXT_NODE
          ? range.startContainer.parentElement
          : (range.startContainer as Element);
      const block = start?.closest('.r-zh,.r-en,.r-other');
      if (!block || !root.contains(block)) {
        hide();
        return;
      }

      const lang = block.classList.contains('r-en')
        ? 'en-US'
        : block.classList.contains('r-other')
          ? picked?.code || 'en-US'
          : 'zh-CN';

      setSelection({ text, lang });
    };

    const onChange = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(refresh, 30);
    };

    document.addEventListener('selectionchange', onChange);
    window.addEventListener('scroll', hide, true);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('selectionchange', onChange);
      window.removeEventListener('scroll', hide, true);
    };
  }, [picked]);

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
      const { text } = await translateText(script.zh, lang.name, token, undefined, lang.code);
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
      if (!isSpeaking()) {
        setSpeaking('');
        window.clearInterval(timer);
      }
    }, 400);
  }

  function readSelection() {
    if (!selection) return;
    speak(selection.text, selection.lang);
    setSelection(null);
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
              type="button"
              className={`selection-speak-inline${selection ? ' is-ready' : ''}`}
              onClick={readSelection}
              disabled={!selection}
              title={selection ? `朗读所选：${selection.text.slice(0, 24)}` : '先选中一段文字'}
            >
              朗读所选
            </button>
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

      {selection && (
        <p className="r-selection-hint">
          已选中 {selection.text.length} 字，点上方「朗读所选」只读这一段
        </p>
      )}
    </div>
  );
}
