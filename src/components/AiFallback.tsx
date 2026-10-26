import { useEffect, useState } from 'react';
import { CASES } from '../data/cases';
import { runAgent, type AgentResult } from '../lib/agent';
import { hasLawApi, searchLaw, type LawArticle } from '../lib/legal';
import { hasLLM, streamGeneral } from '../lib/ai';
import { SpeakBar } from './SpeakBar';
import { AgentCard } from './AgentCard';

export function AiFallback({ input, token }: { input: string; token: string }) {
  const [text, setText] = useState('');
  const [done, setDone] = useState(false);
  const [articles, setArticles] = useState<LawArticle[]>([]);
  const [steps, setSteps] = useState<string[]>([]);
  const [viaAgent, setViaAgent] = useState(false);
  const [localLaw, setLocalLaw] = useState(false);
  const [lawFallback, setLawFallback] = useState('');
  const [result, setResult] = useState<AgentResult | null>(null);
  const [unmatched, setUnmatched] = useState<string[]>([]);
  const [lawState, setLawState] = useState<'off' | 'ok' | 'error'>(
    hasLawApi ? 'ok' : 'off',
  );

  useEffect(() => {
    setText('');
    setDone(false);
    setArticles([]);
    setSteps([]);
    setViaAgent(false);
    setLocalLaw(false);
    setLawFallback('');
    setResult(null);
    setUnmatched([]);

    let cancelled = false;
    const ac = new AbortController();

    (async () => {
      // 首选后端 Agent：key 在服务端，能真正跑「规划 → 调工具 → 作答」
      let agentDone = false;
      let agentFailed = false;

      try {
        await runAgent(
          input,
          token,
          (e) => {
            if (cancelled) return;
            switch (e.type) {
              case 'step':
                setSteps((s) => [...s, e.detail ? `${e.name} · ${e.detail}` : e.name]);
                break;
              case 'tool':
                setArticles(e.articles);
                setLocalLaw(Boolean(e.local));
                setLawFallback(e.fallback ? e.reason || '在线检索不可用' : '');
                break;
              case 'delta':
                setText((t) => t + e.text);
                break;
              case 'result':
                setResult(e.data);
                setArticles(e.articles);
                break;
              case 'verify':
                setUnmatched(e.unmatched);
                break;
              case 'done':
                agentDone = true;
                break;
              case 'error':
                agentFailed = true;
                break;
            }
          },
          ac.signal,
        );
      } catch {
        agentFailed = true;
      }

      if (cancelled) return;

      if (agentDone && !agentFailed) {
        setViaAgent(true);
        setDone(true);
        return;
      }

      // 后端起不来就退回前端直连，功能不因此中断
      let found: LawArticle[] = [];
      if (hasLawApi) {
        try {
          found = await searchLaw(input);
          if (!cancelled) {
            setArticles(found);
            setLawState('ok');
          }
        } catch {
          if (!cancelled) setLawState('error');
        }
      }

      if (cancelled || !hasLLM) {
        if (!cancelled) setDone(true);
        return;
      }

      try {
        await streamGeneral(
          input,
          found,
          (d) => {
            if (!cancelled) setText((t) => t + d);
          },
          ac.signal,
        );
      } catch {
        // 失败就停在空态，由下方提示兜底
      }
      if (!cancelled) setDone(true);
    })();

    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [input, token]);

  if (result) {
    return (
      <>
        {lawFallback && (
          <p className="low-warn">
            在线法规检索失败（{lawFallback}），本次依据已回退本地法条库。
          </p>
        )}
        <AgentCard
          data={result}
          articles={articles}
          trace={steps}
          unmatched={unmatched}
          token={token}
        />
      </>
    );
  }

  return (
    <article className="card ai-card">
      <div className="card-head">
        <div>
          <span className="card-kicker">
            {viaAgent ? 'Agent 研判 · 已调用法规检索' : 'AI 研判 · 未匹配情形库'}
          </span>
          <h2>按描述给出处置思路</h2>
        </div>
      </div>

      {steps.length > 0 && (
        <ol className="trace">
          {steps.map((s, i) => (
            <li key={i}>
              <span className="tick" />
              {s}
            </li>
          ))}
        </ol>
      )}

      {lawFallback && (
        <p className="low-warn">
          在线法规检索失败（{lawFallback}），本次依据已回退本地法条库。请检查
          LAW_API_KEY 或稍后重试。
        </p>
      )}

      {localLaw && !lawFallback && articles.length > 0 && (
        <p className="advice dim">
          依据取自本地法条库，条文原文已对照国家法律法规数据库核验；配置法规检索
          key 后可扩展到全库检索。
        </p>
      )}

      {hasLLM || viaAgent ? (
        <>
          <p className="advice">
            {text || <span className="hint">{done ? '没有返回内容，请重试' : '生成中…'}</span>}
            {!done && text && <span className="caret" />}
          </p>
          {done && <SpeakBar text={text} token={token} />}
        </>
      ) : (
        <p className="advice dim">
          {articles.length > 0
            ? `已检索到 ${articles.length} 条现行法条，但未配置模型 key，无法生成研判。`
            : `当前未配置模型 key，只能匹配情形库里的 ${CASES.length} 类情形。配置后，任意描述都会由模型在检索到的法条范围内给出研判。`}
        </p>
      )}

      {lawState === 'error' && (
        <p className="low-warn">
          法规检索接口调用失败，本次研判只依据本地要点。请人工核对条款时效与表述。
        </p>
      )}

      {articles.length > 0 && (
        <>
          <h3>检索到的依据（{articles.length} 条 · 现行有效）</h3>
          <ul className="provisions">
            {articles.map((a) => (
              <li key={a.id}>
                <p className="p-law">
                  《{a.law}》<span>{a.num}</span>
                </p>
                <p className="p-topic">
                  {a.level} · {a.status}
                </p>
                <p className="p-sum">{a.content}</p>
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="risk">
        <b>注意</b>
        AI 生成内容只作研判参考，不能直接作为执法依据。援引条款以现行文本为准，处置决定由执法人员作出。
      </p>
    </article>
  );
}
