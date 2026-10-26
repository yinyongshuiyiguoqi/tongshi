import { useEffect, useMemo, useRef, useState } from 'react';
import { SCENARIOS, findScenario, provisionsOf } from './data/scenarios';
import { buildMessages, hasLLM, streamChat } from './lib/ai';

const STEPS = ['语音转写', '语种识别', '身份核验', '法规检索', '生成建议'];

type Phase = 'idle' | 'running' | 'done';

export default function App() {
  const [scenarioId, setScenarioId] = useState(SCENARIOS[0].id);
  const [phase, setPhase] = useState<Phase>('idle');
  const [tick, setTick] = useState(0);
  const [typed, setTyped] = useState('');
  const [summaryText, setSummaryText] = useState('');
  const [summaryDone, setSummaryDone] = useState(false);
  const streamStarted = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const [recording, setRecording] = useState(false);
  const [audioReady, setAudioReady] = useState(false);
  const [photo, setPhoto] = useState<{ name: string; url: string } | null>(null);
  const [draft, setDraft] = useState('');
  const [toast, setToast] = useState('');
  const toastTimer = useRef<number | undefined>(undefined);

  const scenario = findScenario(scenarioId);
  const provisions = useMemo(() => provisionsOf(scenario.provisionIds), [scenario]);

  const fallbackSummary = `${scenario.identity.detail}。匹配 ${provisions.length} 条依据，建议按下列要点处置。`;

  function flash(msg: string) {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(''), 2200);
  }

  // 场景切换时重置
  useEffect(() => {
    abortRef.current?.abort();
    setPhase('idle');
    setTick(0);
    setTyped('');
    setSummaryText('');
    setSummaryDone(false);
    streamStarted.current = false;
    setAudioReady(false);
    setPhoto(null);
    setDraft(scenario.transcript);
  }, [scenario]);

  // 主流程推进
  useEffect(() => {
    if (phase !== 'running') return;
    if (tick >= STEPS.length) {
      setPhase('done');
      return;
    }
    const id = window.setTimeout(() => setTick((t) => t + 1), 820);
    return () => window.clearTimeout(id);
  }, [phase, tick]);

  // 转写文本逐字出现（模拟流式）
  useEffect(() => {
    if (tick < 1) {
      setTyped('');
      return;
    }
    if (typed.length >= scenario.transcript.length) return;
    const id = window.setTimeout(
      () => setTyped(scenario.transcript.slice(0, typed.length + 2)),
      18,
    );
    return () => window.clearTimeout(id);
  }, [tick, typed, scenario]);

  // 结论：配了 key 就走真实模型流式输出，没配就在本地逐字模拟
  useEffect(() => {
    if (tick < 4) return;
    if (streamStarted.current) return;
    streamStarted.current = true;

    if (hasLLM) {
      const ac = new AbortController();
      abortRef.current = ac;
      streamChat(
        buildMessages(scenario, provisions),
        (d) => setSummaryText((t) => t + d),
        ac.signal,
      )
        .then(() => setSummaryDone(true))
        .catch((err) => {
          if (ac.signal.aborted) return;
          console.warn('模型调用失败，回落到本地文本：', err);
          setSummaryText(fallbackSummary);
          setSummaryDone(true);
        });
      return;
    }

    let i = 0;
    const id = window.setInterval(() => {
      i += 2;
      setSummaryText(fallbackSummary.slice(0, i));
      if (i >= fallbackSummary.length) {
        window.clearInterval(id);
        setSummaryDone(true);
      }
    }, 26);
    return () => window.clearInterval(id);
  }, [tick, scenario, provisions, fallbackSummary]);

  useEffect(() => () => abortRef.current?.abort(), []);

  function start() {
    if (phase === 'running') return;
    abortRef.current?.abort();
    streamStarted.current = false;
    setTick(0);
    setTyped('');
    setSummaryText('');
    setSummaryDone(false);
    setPhase('running');
  }

  function startRecording() {
    setRecording(true);
    setAudioReady(false);
    window.setTimeout(() => {
      setRecording(false);
      setAudioReady(true);
      flash('录音已就绪（12.4 秒）');
    }, 2000);
  }

  function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setPhoto({ name: f.name, url: URL.createObjectURL(f) });
  }

  async function copyScript() {
    const text = scenario.lines.map((l) => `${l.zh}\n${l.en}`).join('\n\n');
    try {
      await navigator.clipboard.writeText(text);
      flash('话术已复制');
    } catch {
      flash('浏览器拒绝了剪贴板权限');
    }
  }

  function exportRecord() {
    const lines = [
      '涉外执法现场处置记录（草稿）',
      `场景：${scenario.title}`,
      `地点：${scenario.place}`,
      `语言：${scenario.lang.name}（置信度 ${scenario.lang.confidence}）`,
      '',
      '【转写】',
      scenario.transcript,
      scenario.translated,
      '',
      '【核验】',
      scenario.identity.detail,
      '',
      '【处置要点】',
      ...scenario.points.map((p, i) => `${i + 1}. ${p}`),
      '',
      '【示范话术】',
      ...scenario.lines.map((l) => `${l.zh}\n${l.en}`),
      '',
      '【依据】',
      ...provisions.map((p) => `${p.law}${p.article}（${p.topic}）`),
      '',
      '本记录由原型生成，条文要点待核对原文。',
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `处置记录-${scenario.id}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
    flash('记录已导出');
  }

  const stepState = (i: number) =>
    tick > i ? 'done' : tick === i && phase === 'running' ? 'active' : 'idle';

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <span className="mark">通事</span>
          <span className="latin">TONGSHI</span>
        </div>
        <p className="sub">涉外执法现场助手</p>
        <div className="top-right">
          <span className="badge">{hasLLM ? '已接入模型' : '演示模式'}</span>
          <span className="mode">{hasLLM ? '流式输出 · 已启用' : 'Mock AI · 未接模型'}</span>
        </div>
      </header>

      <main className="grid">
        {/* 左：输入 */}
        <section className="panel">
          <h2>现场输入</h2>
          <div className="chips">
            {SCENARIOS.map((s) => (
              <button
                key={s.id}
                className={`chip${s.id === scenarioId ? ' is-on' : ''}`}
                onClick={() => setScenarioId(s.id)}
              >
                {s.chip}
              </button>
            ))}
          </div>

          <p className="scene">{scenario.title}</p>
          <p className="place">{scenario.place}</p>

          <div className="input-group">
            <span className="label">语音</span>
            <button
              className={`mic${recording ? ' is-rec' : ''}`}
              onClick={startRecording}
              disabled={recording}
            >
              {recording ? '录制中…' : audioReady ? '已录制 12.4 秒 · 重录' : '按一下开始录音'}
            </button>
          </div>

          <div className="input-group">
            <span className="label">证件</span>
            <label className="upload">
              <input type="file" accept="image/*" onChange={onPhoto} hidden />
              {photo ? '已选：' + photo.name : '上传护照或居留证件照片'}
            </label>
            {photo && <img className="thumb" src={photo.url} alt="证件预览" />}
          </div>

          <div className="input-group">
            <span className="label">文本</span>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={4}
              spellCheck={false}
            />
          </div>

          <button className="primary" onClick={start} disabled={phase === 'running'}>
            {phase === 'running' ? '处理中…' : phase === 'done' ? '重新处理' : '开始处理'}
          </button>
        </section>

        {/* 中：链路 */}
        <section className="panel flow">
          <h2>处理链路</h2>
          <ol className="steps">
            {STEPS.map((s, i) => (
              <li key={s} className={`step is-${stepState(i)}`}>
                <span className="dot" />
                <span className="step-name">{s}</span>
                <span className="step-value">
                  {tick > i ? stepValue(i, scenario, provisions.length) : '—'}
                </span>
              </li>
            ))}
          </ol>

          <h3>转写</h3>
          <p className="transcript">
            {typed || (phase === 'idle' ? '等待输入…' : '')}
            {tick >= 1 && typed.length < scenario.transcript.length && <span className="caret" />}
          </p>

          {tick >= 2 && (
            <>
              <h3>译文</h3>
              <p className="translated">{scenario.translated}</p>
            </>
          )}

          {tick >= 3 && (
            <div className="verify">
              <span className={`pill ${scenario.identity.status === '已核验' ? 'ok' : 'warn'}`}>
                {scenario.identity.status}
              </span>
              <span>{scenario.identity.detail}</span>
            </div>
          )}
        </section>

        {/* 右：建议 */}
        <section className="panel advice">
          <h2>处置建议</h2>

          {tick < 4 ? (
            <div className="empty">
              <p className="empty-title">尚未生成</p>
              <p className="empty-hint">
                开始处理后，这里会给出处置判断、动作要点、可直接照念的双语话术，以及每条判断背后的依据。
              </p>
            </div>
          ) : (
            <>
              <p className="summary">
                {summaryText}
                {!summaryDone && <span className="caret" />}
              </p>

              <h3>要点</h3>
              <ul className="points">
                {scenario.points.map((p, i) => (
                  <li
                    key={i}
                    className={phase === 'done' ? 'in' : ''}
                    style={{ transitionDelay: `${i * 90}ms` }}
                  >
                    <span className="num">{String(i + 1).padStart(2, '0')}</span>
                    {p}
                  </li>
                ))}
              </ul>

              {phase === 'done' && (
                <>
                  <h3>示范话术</h3>
                  <div className="lines">
                    {scenario.lines.map((l, i) => (
                      <div key={i} className="line in" style={{ transitionDelay: `${i * 120}ms` }}>
                        <p className="zh">{l.zh}</p>
                        <p className="en">{l.en}</p>
                      </div>
                    ))}
                  </div>
                </>
              )}

              <h3>依据（要点摘录）</h3>
              <ul className="provisions">
                {provisions.map((p) => (
                  <li key={p.id}>
                    <p className="p-law">
                      {p.law}
                      <span> {p.article}</span>
                    </p>
                    <p className="p-topic">{p.topic}</p>
                    <p className="p-sum">{p.summary}</p>
                  </li>
                ))}
              </ul>
            </>
          )}

          <div className="actions">
            <button onClick={copyScript} disabled={tick < 4}>
              复制话术
            </button>
            <button onClick={exportRecord} disabled={tick < 4}>
              导出记录
            </button>
          </div>

          <p className="caution">{scenario.caution}</p>
        </section>
      </main>

      <footer className="foot">
        条文要点为演示数据，非条文原文；正式提交前须逐条核对现行法规。AI 输出仅供参考，处置决定由执法人员作出。
      </footer>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function stepValue(i: number, s: { lang: { name: string; confidence: number } }, n: number) {
  switch (i) {
    case 0:
      return '12.4 秒';
    case 1:
      return `${s.lang.name} · ${s.lang.confidence.toFixed(2)}`;
    case 2:
      return '核对证件与停留事由';
    case 3:
      return `命中 ${n} 条`;
    default:
      return '3 条要点 · 2 段话术';
  }
}
