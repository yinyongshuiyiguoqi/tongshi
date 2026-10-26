import { useCallback, useEffect, useRef, useState } from 'react';
import type { CaseItem } from '../data/cases';
import { runBrief } from '../lib/agent';
import { SpeakBar } from './SpeakBar';

/**
 * 命中情形后的个性化研判。
 *
 * 情形库给的是审定过的通用流程，这一段负责「结合民警这句原话」——
 * 模型只看本次条文，答完再做一次条号核对，引用了没给出的条文就标出来。
 */
export function CaseBrief({ item, input, token }: { item: CaseItem; input: string; token: string }) {
  const [text, setText] = useState('');
  const [steps, setSteps] = useState<string[]>([]);
  const [unmatched, setUnmatched] = useState<string[]>([]);
  const [state, setState] = useState<'idle' | 'run' | 'done' | 'fail'>('idle');
  const [round, setRound] = useState(0);
  const ac = useRef<AbortController | null>(null);

  const start = useCallback(() => {
    ac.current?.abort();
    const ctrl = new AbortController();
    ac.current = ctrl;

    setText('');
    setSteps([]);
    setUnmatched([]);
    setState('run');

    runBrief(
      {
        input,
        title: item.title,
        brief: item.brief,
        steps: item.steps,
        provisionIds: item.provisionIds,
      },
      token,
      (e) => {
        if (ctrl.signal.aborted) return;
        if (e.type === 'step') setSteps((s) => [...s, e.detail ? `${e.name} · ${e.detail}` : e.name]);
        if (e.type === 'delta') setText((t) => t + e.text);
        if (e.type === 'verify') setUnmatched(e.unmatched);
        if (e.type === 'done') setState('done');
        if (e.type === 'error') setState('fail');
      },
      ctrl.signal,
    ).catch(() => {
      if (!ctrl.signal.aborted) setState('fail');
    });
  }, [input, item, token]);

  useEffect(() => {
    start();
    return () => ac.current?.abort();
  }, [start, round]);

  const lawCount = item.provisionIds.length;

  return (
    <section className="r-block r-brief">
      <div className="r-brief-head">
        <h2>AI 研判</h2>
        <span className="r-brief-tag">
          {state === 'run' ? '生成中' : `基于 ${lawCount} 条现行依据`}
        </span>
      </div>

      {steps.length > 0 && state === 'run' && (
        <ol className="trace r-brief-trace">
          {steps.map((s, i) => (
            <li key={i}>
              <span className="tick" />
              {s}
            </li>
          ))}
        </ol>
      )}

      {state === 'fail' ? (
        <p className="r-lead">{item.brief}</p>
      ) : (
        <p className="r-lead r-brief-text">
          {text || (state === 'done' ? item.brief : '正在结合现场描述生成…')}
          {state === 'run' && text && <span className="caret" />}
        </p>
      )}

      {unmatched.length > 0 && (
        <p className="r-warn">
          研判中引用的 {unmatched.join('、')} 未出现在本次检索结果里，请人工核对后再使用。
        </p>
      )}

      <div className="r-brief-actions">
        <button onClick={() => setRound((r) => r + 1)} disabled={state === 'run'}>
          重新生成
        </button>
        <span className="r-brief-note">AI 生成，仅作研判参考，处置决定由执法人员作出</span>
      </div>

      <SpeakBar text={state === 'fail' ? item.brief : text} token={token} compact />
    </section>
  );
}
