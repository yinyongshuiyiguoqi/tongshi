import { useState } from 'react';
import { provisionById } from '../data/cases';
import type { MatchResult } from '../lib/match';

export function ResultCard({
  result,
  low,
  onPick,
}: {
  result: MatchResult;
  low: boolean;
  onPick: (id: string) => void;
}) {
  const { item, score, hits } = result;
  const [toast, setToast] = useState('');

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
    <article className={`card sev-${item.severity}`}>
      <div className="card-head">
        <div>
          <span className="card-kicker">匹配结果</span>
          <h2>{item.title}</h2>
        </div>
        <div className="score">
          <span className="score-num">{Math.round(score * 100)}</span>
          <span className="score-unit">%</span>
        </div>
      </div>

      {low && (
        <p className="low-warn">
          匹配置信度偏低，请核对下方依据后再决定是否采用，必要时补充信息重新查找。
        </p>
      )}

      <div className="hits">
        <span className="label">命中</span>
        {hits.slice(0, 6).map((h) => (
          <span key={h.w} className="hit">
            {h.w}
          </span>
        ))}
        {hits.length === 0 && <span className="hit muted-tag">无关键词命中，仅形似</span>}
      </div>

      <h3>处置流程</h3>
      <ol className="steps-list">
        {item.steps.map((s, i) => (
          <li key={i}>
            <span className="step-no">{i + 1}</span>
            <span>{s}</span>
          </li>
        ))}
      </ol>

      <h3>研判意见</h3>
      <p className="advice">{item.brief}</p>

      <h3>依据</h3>
      <ul className="provisions">
        {provisions.map((p) => (
          <li key={p.id}>
            <p className="p-law">
              {p.law}
              {p.article && <span> {p.article}</span>}
            </p>
            <p className="p-topic">{p.topic}</p>
            <p className="p-sum">{p.summary}</p>
          </li>
        ))}
      </ul>

      <h3>现场话术</h3>
      <div className="scripts">
        {item.scripts.map((s, i) => (
          <div key={i} className="script">
            <p className="zh">{s.zh}</p>
            {s.en && <p className="en">{s.en}</p>}
          </div>
        ))}
      </div>

      <div className="card-actions">
        <button onClick={() => copy(zh, '中文话术')}>复制中文</button>
        {en && <button onClick={() => copy(en, '英文话术')}>复制英文</button>}
        <button onClick={() => window.print()}>打印 / 存为 PDF</button>
      </div>

      <p className="risk">
        <b>注意</b>
        {item.risk}
      </p>

      <p className="followup">
        <b>还需要确认</b>
        {item.followUp}
      </p>

      {toast && <span className="card-toast">{toast}</span>}
    </article>
  );
}
