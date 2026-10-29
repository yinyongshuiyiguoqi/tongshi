import { useState } from 'react';
import type { AgentResult } from '../lib/agent';
import type { LawArticle } from '../lib/legal';
import { AnswerOutline, AnswerSection, useAnswerOutline } from './AnswerOutline';
import { ScriptItem } from './ScriptItem';
import { SpeakBar } from './SpeakBar';

/**
 * 未命中情形库时的结果卡。
 *
 * 版式跟命中的结果卡一致：AI 研判 / 处置流程 / 现场话术 / 依据，
 * 每块单独放一条朗读，想听哪段点哪段。
 */
export function AgentCard({
  data,
  articles,
  trace,
  unmatched,
  token,
}: {
  data: AgentResult;
  articles: LawArticle[];
  trace: string[];
  unmatched: string[];
  token: string;
}) {
  const [toast, setToast] = useState('');

  const stepsText = data.steps.map((s, i) => `${i + 1}、${s}`).join(' ');
  const articlesText = articles
    .map((a) => `《${a.law}》${a.num}：${(a.content || '').slice(0, 80)}`)
    .join(' ');

  const sections = [
    ...(data.judgement ? [{ id: 'agent-judgement', title: '研判' }] : []),
    ...(data.steps.length ? [{ id: 'agent-steps', title: '处置流程' }] : []),
    ...(articles.length ? [{ id: 'agent-laws', title: '依据' }] : []),
    ...(data.note ? [{ id: 'agent-note', title: '还需要核实' }] : []),
  ];
  const outline = useAnswerOutline(sections, {
    'agent-judgement': false,
    'agent-steps': false,
    'agent-laws': false,
    'agent-note': true,
  });

  const full = [data.judgement, stepsText, data.scriptZh]
    .filter(Boolean)
    .join('\n\n');

  async function copy() {
    try {
      await navigator.clipboard.writeText(full);
      setToast('已复制');
    } catch {
      setToast('浏览器拒绝了剪贴板权限');
    }
    window.setTimeout(() => setToast(''), 1800);
  }

  return (
    <article className="rpage">
      <header className="r-hero sev-中">
        <span className="r-kicker">未命中情形库 · Agent 研判</span>
        <h1>{data.title || '按描述给出处置思路'}</h1>
        <p className="r-sub">
          依据 <b>{articles.length}</b> 条现行条文
          {articles.some((a) => a.num) && <span className="r-dot">·</span>}
          {articles
            .map((a) => a.num)
            .filter(Boolean)
            .slice(0, 3)
            .join('、')}
        </p>

        <div className="r-actions">
          <button onClick={copy}>复制中文</button>
          <button className="r-actions-primary" onClick={() => window.print()}>
            打印 / 存为 PDF
          </button>
          {toast && <span className="r-actions-toast">{toast}</span>}
        </div>
      </header>

      {trace.length > 0 && (
        <ol className="trace r-brief-trace">
          {trace.map((s, i) => (
            <li key={i}>
              <span className="tick" />
              {s}
            </li>
          ))}
        </ol>
      )}

      {unmatched.length > 0 && (
        <p className="r-warn">
          研判中引用的 {unmatched.join('、')} 未出现在本次检索结果里，请人工核对后再使用。
        </p>
      )}

      <AnswerOutline sections={sections} active={outline.active} onJump={outline.jump} />

      {data.judgement && (
        <AnswerSection
          id="agent-judgement"
          title="研判"
          open={outline.open['agent-judgement']}
          onToggle={outline.toggle}
        >
          <p className="r-lead">{data.judgement}</p>
          <SpeakBar text={data.judgement} token={token} />
        </AnswerSection>
      )}

      {data.steps.length > 0 && (
        <AnswerSection
          id="agent-steps"
          title="处置流程"
          meta={`${data.steps.length} 步`}
          open={outline.open['agent-steps']}
          onToggle={outline.toggle}
        >
          <ol className="r-steps">
            {data.steps.map((s, i) => (
              <li key={i}>
                <span className="r-step-no">{String(i + 1).padStart(2, '0')}</span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
          <SpeakBar text={stepsText} token={token} />
        </AnswerSection>
      )}

      {data.scriptZh && (
        <section className="r-block">
          <h2>现场话术</h2>
          <div className="r-scripts">
            <ScriptItem script={{ zh: data.scriptZh, en: data.scriptEn }} token={token} />
          </div>
        </section>
      )}

      {articles.length > 0 && (
        <AnswerSection
          id="agent-laws"
          title="依据"
          meta={`${articles.length} 条`}
          open={outline.open['agent-laws']}
          onToggle={outline.toggle}
          preview={`《${articles[0].law}》${articles[0].num || ''}`}
          footer={<SpeakBar text={articlesText} token={token} />}
        >
          <ul className="r-laws">
            {articles.map((a) => (
              <li key={a.id || `${a.law}${a.num}`}>
                <p className="r-law">
                  {a.law}
                  {a.num && <span> {a.num}</span>}
                </p>
                <p className="r-topic">
                  {a.level}
                  {a.status && <span className="r-status">{a.status}</span>}
                </p>
                <p className="r-sum">{a.content}</p>
              </li>
            ))}
          </ul>
        </AnswerSection>
      )}

      {data.note && (
        <AnswerSection
          id="agent-note"
          title="还需要核实"
          open={outline.open['agent-note']}
          onToggle={outline.toggle}
          className="answer-sec--notes"
          footer={<SpeakBar text={data.note} token={token} />}
        >
          <div className="r-note">
            <b>待核实</b>
            <span>{data.note}</span>
          </div>
        </AnswerSection>
      )}

      <p className="r-brief-note r-disclaimer">
        AI 生成，仅作研判参考；援引条款以现行文本为准，处置决定由执法人员作出。
      </p>
    </article>
  );
}

