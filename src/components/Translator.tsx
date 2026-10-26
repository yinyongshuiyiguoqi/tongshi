import { useEffect, useRef, useState } from 'react';
import { translateText } from '../lib/agent';
import { LANGUAGES } from '../lib/languages';
import { canSpeak, speak, stopSpeaking } from '../lib/speech';

/** 包含中文，供源语言和目标语言共用 */
const ALL_LANGS = [{ label: '中文', name: '中文', code: 'zh-CN' }, ...LANGUAGES];

const AUTO = 'auto';

/**
 * 现场翻译器。
 *
 * 对方说什么语言不确定时选「自动识别」，模型先认语言再翻；
 * 认得准的可以自己指定，识别用浏览器语音，翻译和播报复用话术那套。
 */
export function Translator({ token }: { token: string }) {
  const [from, setFrom] = useState<string>(AUTO);
  const [to, setTo] = useState('en-US');
  const [input, setInput] = useState('');
  const [out, setOut] = useState('');
  const [detected, setDetected] = useState('');
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [err, setErr] = useState('');
  const [speaking, setSpeaking] = useState(false);
  const [speechOk, setSpeechOk] = useState(false);
  const recog = useRef<any>(null);

  const target = ALL_LANGS.find((l) => l.code === to) ?? ALL_LANGS[1];
  const source = ALL_LANGS.find((l) => l.code === from);

  useEffect(() => {
    const w = window as any;
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) return;

    const r = new Ctor();
    r.continuous = false;
    r.interimResults = true;
    r.onresult = (e: any) => {
      const text = Array.from(e.results)
        .map((x: any) => x[0].transcript)
        .join('');
      setInput(text);
    };
    r.onend = () => setListening(false);
    r.onerror = () => {
      setListening(false);
      setErr('没听清，换个安静点的地方再试');
    };
    recog.current = r;
    setSpeechOk(true);

    return () => {
      try {
        r.abort();
      } catch {
        /* 忽略 */
      }
    };
  }, []);

  useEffect(() => () => stopSpeaking(), []);

  function toggleMic() {
    if (!recog.current) return;
    if (listening) {
      recog.current.stop();
      setListening(false);
      return;
    }
    setErr('');
    // 指定了源语言就按它听；自动识别时用系统语言听，交给模型判断
    recog.current.lang = source?.code ?? navigator.language ?? 'zh-CN';
    try {
      recog.current.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  }

  async function run(text = input) {
    const t = text.trim();
    if (!t || busy) return;

    setBusy(true);
    setErr('');
    setOut('');
    setDetected('');

    try {
      const r = await translateText(t, target.name, token, undefined, target.code, from === AUTO);
      setOut(r.text);
      if (r.from) setDetected(r.from);
    } catch {
      setErr('翻译没成功，稍后再试一次');
    }
    setBusy(false);
  }

  function swap() {
    if (from === AUTO) return;
    setFrom(to);
    setTo(from);
    if (out) {
      setInput(out);
      setOut('');
    }
  }

  function play() {
    if (!out) return;
    if (speaking) {
      stopSpeaking();
      setSpeaking(false);
      return;
    }
    if (!speak(out, target.code)) {
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

  return (
    <section className="translator">
      <div className="tr-head">
        <h3>翻译器</h3>
        <span className="tr-hint">说不清对方说什么，先按一下听</span>
      </div>

      <div className="tr-langs">
        <select value={from} onChange={(e) => setFrom(e.target.value)} aria-label="源语言">
          <option value={AUTO}>自动识别</option>
          {ALL_LANGS.map((l) => (
            <option key={l.code} value={l.code}>
              {l.label}
            </option>
          ))}
        </select>

        <button className="tr-swap" onClick={swap} disabled={from === AUTO} aria-label="对调语言">
          ⇄
        </button>

        <select value={to} onChange={(e) => setTo(e.target.value)} aria-label="目标语言">
          {ALL_LANGS.map((l) => (
            <option key={l.code} value={l.code}>
              {l.label}
            </option>
          ))}
        </select>
      </div>

      <div className="tr-input">
        <textarea
          rows={2}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={listening ? '正在听…' : '说一句，或把对方的话打进来'}
        />
        {speechOk && (
          <button className={`tr-mic${listening ? ' is-on' : ''}`} onClick={toggleMic}>
            {listening ? '停止' : '说话'}
          </button>
        )}
      </div>

      <div className="tr-actions">
        <button className="tr-go" onClick={() => run()} disabled={busy || !input.trim()}>
          {busy ? '翻译中…' : '翻译'}
        </button>
        {input && (
          <button className="tr-clear" onClick={() => { setInput(''); setOut(''); setDetected(''); }}>
            清空
          </button>
        )}
      </div>

      {err && <p className="tr-err">{err}</p>}

      {out && (
        <div className="tr-out">
          <div className="tr-out-head">
            <span>
              {detected ? `识别为${detected} → ` : ''}
              {target.label}
            </span>
            {canSpeak() && <button onClick={play}>{speaking ? '停止' : '播报'}</button>}
          </div>
          <p>{out}</p>
        </div>
      )}
    </section>
  );
}
