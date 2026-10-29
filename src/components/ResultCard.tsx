import { useEffect, useState } from 'react';
import { provisionById } from '../data/cases';
import type { MatchResult } from '../lib/match';
import { generateScripts, type ScriptPair } from '../lib/agent';
import { AnswerOutline, AnswerSection, useAnswerOutline } from './AnswerOutline';
import { CaseBrief } from './CaseBrief';
import { ScriptItem } from './ScriptItem';
import { SpeakBar } from './SpeakBar';

/** 答案卡的二级目录：研判、处置流程、依据默认收起，还需要核实默认展开；现场话术常驻不折叠 */
const SECTIONS = [
  { id: 'answer-ai', title: '研判' },
  { id: 'answer-steps', title: '处置流程' },
  { id: 'answer-laws', title: '依据' },
  { id: 'answer-notes', title: '还需要核实' },
];

const DEFAULT_OPEN: Record<string, boolean> = {
  'answer-ai': false,
  'answer-steps': false,
  'answer-laws': false,
  'answer-notes': true,
};

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
  const [scripts, setScripts] = useState<ScriptPair[]>(item.scripts);
  const [scriptLoading, setScriptLoading] = useState(false);
  const [scriptError, setScriptError] = useState('');
  const [scriptRound, setScriptRound] = useState(0);
  const outline = useAnswerOutline(SECTIONS, DEFAULT_OPEN);

  useEffect(() => {
    setScripts(item.scripts);
    setScriptError('');
    if (!input.trim()) return;

    const ac = new AbortController();
    setScriptLoading(true);
    generateScripts(
      {
        input,
        title: item.title,
        brief: item.brief,
        steps: item.steps,
        provisionIds: item.provisionIds,
      },
      token,
      ac.signal,
    )
      .then((list) => {
        if (list.length) setScripts(list);
        else setScriptError('模型暂时没有生成新话术，已使用标准话术');
      })
      .catch((err) => {
        if (!ac.signal.aborted) {
          setScriptError(err instanceof Error ? err.message : '话术生成失败，已使用标准话术');
        }
      })
      .finally(() => {
        if (!ac.signal.aborted) setScriptLoading(false);
      });

    return () => ac.abort();
  }, [item, input, token, scriptRound]);

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

  const zh = scripts.map((s) => s.zh).join('\n');
  const en = scripts
    .map((s) => s.en)
    .filter(Boolean)
    .join('\n');

  const lawPreview = provisions.length
    ? `《${provisions[0].law}》${provisions[0].article ?? ''}`
    : '本次未匹配到条文';
  const regen = (
    <button
      className="r-regen"
      onClick={() => setScriptRound((n) => n + 1)}
      disabled={scriptLoading}
    >
      {scriptLoading ? '按现场生成中…' : '换一组'}
    </button>
  );

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

      <AnswerOutline
        sections={SECTIONS}
        active={outline.active}
        onJump={outline.jump}
      />

      <CaseBrief
        item={item}
        input={input}
        token={token}
        sectionId="answer-ai"
        open={outline.open['answer-ai']}
        onToggle={() => outline.toggle('answer-ai')}
      />

      <AnswerSection
        id="answer-steps"
        title="处置流程"
        meta={`${item.steps.length} 步`}
        open={outline.open['answer-steps']}
        onToggle={outline.toggle}
      >
        <ol className="r-steps">
          {item.steps.map((s, i) => (
            <li key={i}>
              <span className="r-step-no">{String(i + 1).padStart(2, '0')}</span>
              <span>{s}</span>
            </li>
          ))}
        </ol>
        <SpeakBar
          text={item.steps.map((s, i) => `${i + 1}、${s}`).join(' ')}
          token={token} />
      </AnswerSection>

      <section className="r-block">
        <div className="r-scripts-head">
          <h2>现场话术</h2>
          {regen}
        </div>
        {scriptError && <p className="r-script-note">{scriptError}</p>}
        <div className="r-scripts">
          {scripts.map((s, i) => (
            <ScriptItem key={`${i}-${s.zh}`} script={s} token={token} />
          ))}
        </div>
      </section>

      <AnswerSection
        id="answer-laws"
        title="依据"
        meta={provisions.length ? `${provisions.length} 条` : undefined}
        open={outline.open['answer-laws']}
        onToggle={outline.toggle}
        preview={lawPreview}
        footer={
          <SpeakBar
            text={provisions
              .map((p) => `《${p.law}》${p.article}：${p.summary}`)
              .join(' ')}
            token={token} />
        }
      >
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
      </AnswerSection>

      <AnswerSection
        id="answer-notes"
        title="还需要核实"
        open={outline.open['answer-notes']}
        onToggle={outline.toggle}
        className="answer-sec--notes"
        footer={
          <SpeakBar
            text={`注意：${item.risk} 还需要核实：${item.followUp}`}
            token={token} />
        }
      >
        <div className="r-note">
          <b>注意</b>
          <span>{item.risk}</span>
        </div>
        <div className="r-note">
          <b>待核实</b>
          <span>{item.followUp}</span>
        </div>
      </AnswerSection>

    </article>
  );
}

