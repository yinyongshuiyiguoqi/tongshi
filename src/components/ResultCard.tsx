import { useEffect, useState } from 'react';
import { provisionById } from '../data/cases';
import type { MatchResult } from '../lib/match';
import { canSpeak, speak, stopSpeaking, type SpeakLang } from '../lib/speech';
import { CaseBrief } from './CaseBrief';

export function ResultCard({
  result,
  matches,
  low,
  onPick,
  input,
  token,
}: {
  result: MatchResult;
  matches: MatchResult[];
  low: boolean;
  onPick: (id: string) => void;
  input: string;
  token: string;
}) {
  const { item, score, hits } = result;
  const [toast, setToast] = useState('');
  const [speaking, setSpeaking] = useState('');

  useEffect(() => () => stopSpeaking(), []);

  function toggleSpeak(text: string, lang: SpeakLang, key: string) {
    if (speaking === key) {
      stopSpeaking();
      setSpeaking('');
      return;
    }
    if (!speak(text, lang)) {
      setToast('当前浏览器不支持语音播报');
      window.setTimeout(() => setToast(''), 1800);
      return;
    }
    setSpeaking(key);
    // 播完自动复位
    const check = window.setInterval(() => {
      if (!window.speechSynthesis.speaking) {
        setSpeaking('');
        window.clearInterval(check);
      }
    }, 400);
  }

  const provisions = item.provisionIds
    .map((id) => provisionById(id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      setToast(label + '已复制');
    } catch {
      setToast('浏览器拒绝了剪贴板权限');
    }
    window.setTimeout(() => setToast(''), 1800);
  }

  const zh = item.scripts.map((s) => s.zh).join('\n');
  const en = item.scripts
    .map((s) => s.en)
    .filter(Boolean)
    .join('\n');

  return (
    <article className="rpage">
      <header className={`r-hero sev-${item.severity}`}>
        <span className="r-kicker">
          匹配结果 · {item.severity === '高' ? '高处置强度' : item.severity === '中' ? '中等处置强度' : '一般处置'}
        </span>
        <h1>{item.title}</h1>
        <p className="r-sub">
          匹配度 <b>{Math.round(score * 100)}%</b>
          {hits.length > 0 && (
            <>
              <span className="r-dot">·</span>命中 {hits.slice(0, 4).map((h) => h.w).join('、')}
            </>
          )}
        </p>

        <div className="r-actions">
          <button onClick={() => copy(zh, '中文话术')}>复制中文</button>
          {en && <button onClick={() => copy(en, '英文话术')}>复制英文</button>}
          <button className="r-actions-primary" onClick={() => window.print()}>
            打印 / 存为 PDF
          </button>
          {toast && <span className="r-actions-toast">{toast}</span>}
        </div>

        {low && (
          <p className="r-warn">
            匹配度偏低，请核对下方依据再决定是否采用，必要时补充信息重新查找。
          </p>
        )}

        {matches.length > 1 && (
          <div className="r-tiles" role="radiogroup" aria-label="其他可能情形">
            {matches.map((m) => (
              <button
                key={m.item.id}
                role="radio"
                aria-checked={m.item.id === item.id}
                className={`r-tile${m.item.id === item.id ? ' is-on' : ''}`}
                onClick={() => onPick(m.item.id)}
              >
                <span className="r-tile-score">{Math.round(m.score * 100)}%</span>
                <span className="r-tile-name">{m.item.title}</span>
              </button>
            ))}
          </div>
        )}
      </header>

      <CaseBrief item={item} input={input} token={token} />

      <section className="r-block">
        <h2>处置流程</h2>
        <ol className="r-steps">
          {item.steps.map((s, i) => (
            <li key={i}>
              <span className="r-step-no">{String(i + 1).padStart(2, '0')}</span>
              <span>{s}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="r-block">
        <h2>现场话术</h2>
        <div className="r-scripts">
          {item.scripts.map((s, i) => (
            <div key={i} className="r-script">
              <p className="r-zh">{s.zh}</p>
              {s.en && <p className="r-en">{s.en}</p>}
              {canSpeak() && (
                <div className="r-speak">
                  <button
                    className={speaking === `${i}-zh` ? 'is-on' : ''}
                    onClick={() => toggleSpeak(s.zh, 'zh-CN', `${i}-zh`)}
                  >
                    {speaking === `${i}-zh` ? '停止' : '播报中文'}
                  </button>
                  {s.en && (
                    <button
                      className={speaking === `${i}-en` ? 'is-on' : ''}
                      onClick={() => toggleSpeak(s.en as string, 'en-US', `${i}-en`)}
                    >
                      {speaking === `${i}-en` ? 'Stop' : 'Play English'}
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="r-block">
        <h2>依据</h2>
        <ul className="r-laws">
          {provisions.map((p) => (
            <li key={p.id}>
              <p className="r-law">
                {p.law}
                {p.article && <span> {p.article}</span>}
              </p>
              <p className="r-topic">
                {p.topic}
                {p.status && <span className="r-status">{p.status}</span>}
              </p>
              <p className="r-sum">{p.summary}</p>
              {p.text && (
                <details className="r-orig">
                  <summary>查看条文原文</summary>
                  <p>{p.text}</p>
                </details>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="r-block r-notes">
        <div className="r-note">
          <b>注意</b>
          <span>{item.risk}</span>
        </div>
        <div className="r-note">
          <b>还需要确认</b>
          <span>{item.followUp}</span>
        </div>
      </section>

    </article>
  );
}
