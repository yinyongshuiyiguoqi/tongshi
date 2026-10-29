import { useEffect, useState } from 'react';
import { translateText } from '../lib/agent';
import { LANGUAGES } from '../lib/languages';
import { canSpeak, isSpeaking, speak, stopSpeaking } from '../lib/speech';
import { appendVoiceText, languageLabel, useVoiceInput } from '../lib/voiceInput';

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
  const [err, setErr] = useState('');
  const [speaking, setSpeaking] = useState(false);
  const voice = useVoiceInput({
    token,
    onText: (text) => setInput((v) => appendVoiceText(v, text)),
  });

  const target = ALL_LANGS.find((l) => l.code === to) ?? ALL_LANGS[1];

  useEffect(() => () => stopSpeaking(), []);

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
      if (!isSpeaking()) {
        setSpeaking(false);
        window.clearInterval(timer);
      }
    }, 400);
  }

  return (
    <section className="translator">
      <div className="tr-head">
        <h3>翻译器</h3>
        <span className="tr-hint">听不懂对方说什么，先按一下听</span>
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
          placeholder={voice.recording ? '正在听…' : '说一句，或把对方的话打进来'}
        />
        <button
          type="button"
          className={`tr-mic${voice.recording ? ' is-on' : ''}`}
          onClick={voice.start}
          disabled={voice.busy || (!voice.supported && !voice.recording)}
        >
          {voice.busy ? '识别中…' : voice.recording ? '停止' : '语音输入'}
        </button>
      </div>
      {(voice.error || !voice.supported || voice.language) && (
        <p className="mic-hint">
          {voice.error ||
            (voice.language
              ? `已识别为${languageLabel(voice.language)}`
              : '当前浏览器不支持录音，请用文字输入')}
        </p>
      )}

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
