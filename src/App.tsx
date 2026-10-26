import { useEffect, useMemo, useRef, useState } from 'react';
import { CASES, provisionById, type CaseItem } from './data/cases';
import { LOW_CONFIDENCE, matchCases, type MatchResult } from './lib/match';
import { hasLLM, streamAnalyse, streamGeneral } from './lib/ai';
import { hasLawApi, searchLaw, type LawArticle } from './lib/legal';

const SESSION_KEY = 'tongshi.session';

interface Session {
  badge: string;
  name: string;
  unit: string;
}

const EXAMPLES = [
  '小区门口一个外国人拿不出护照，只会说英语，问他来干什么也说不清',
  '有个老外住在朋友家一个多星期了，一直没去派出所登记住宿',
  '酒吧门口两个外国人喝多了在闹事，其中一个躺在地上起不来',
];

function readSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export default function App() {
  const [session, setSession] = useState<Session | null>(readSession);

  function login(s: Session) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    setSession(s);
  }

  function logout() {
    localStorage.removeItem(SESSION_KEY);
    setSession(null);
  }

  return session ? <Workbench session={session} onLogout={logout} /> : <Login onLogin={login} />;
}

/* ───────────────────────── 登录 ───────────────────────── */

function Login({ onLogin }: { onLogin: (s: Session) => void }) {
  const [badge, setBadge] = useState('');
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('派出所');
  const [error, setError] = useState('');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{4,}$/.test(badge.trim())) {
      setError('请输入有效的警号（4 位以上数字）');
      return;
    }
    if (!name.trim()) {
      setError('请输入姓名');
      return;
    }
    onLogin({ badge: badge.trim(), name: name.trim(), unit });
  }

  return (
    <div className="login">
      <form className="login-card" onSubmit={submit}>
        <div className="login-brand">
          <span className="mark">通事</span>
          <span className="latin">TONGSHI</span>
        </div>
        <p className="login-sub">涉外执法现场辅助 · 内部工作台</p>

        <label className="field">
          <span>警号</span>
          <input
            value={badge}
            onChange={(e) => {
              setBadge(e.target.value);
              setError('');
            }}
            placeholder="如 100234"
            inputMode="numeric"
            autoFocus
          />
        </label>

        <label className="field">
          <span>姓名</span>
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError('');
            }}
            placeholder="请输入姓名"
          />
        </label>

        <label className="field">
          <span>单位</span>
          <select value={unit} onChange={(e) => setUnit(e.target.value)}>
            <option>派出所</option>
            <option>巡特警</option>
            <option>出入境管理部门</option>
            <option>治安管理部门</option>
          </select>
        </label>

        {error && <p className="login-error">{error}</p>}

        <button className="primary" type="submit">
          进入工作台
        </button>

        <p className="login-hint">
          演示环境不校验账密，警号填任意 4 位以上数字即可。正式版对接公安内网统一认证。
        </p>
      </form>
    </div>
  );
}

/* ───────────────────────── 工作台 ───────────────────────── */

function Workbench({ session, onLogout }: { session: Session; onLogout: () => void }) {
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [speechOk, setSpeechOk] = useState(false);
  const [toast, setToast] = useState('');
  const recog = useRef<any>(null);
  const resultRef = useRef<HTMLElement>(null);

  const matches = useMemo(() => (query ? matchCases(query, CASES) : []), [query]);
  const top = matches[0];
  const active: MatchResult | undefined =
    matches.find((m) => m.item.id === activeId) ?? top;
  const lowConfidence = !active || active.score < LOW_CONFIDENCE;

  useEffect(() => {
    const w = window as any;
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (Ctor) {
      const r = new Ctor();
      r.lang = 'zh-CN';
      r.continuous = false;
      r.interimResults = false;
      r.onresult = (e: any) => {
        const text = Array.from(e.results)
          .map((x: any) => x[0].transcript)
          .join('');
        setInput((v) => (v ? v + '，' + text : text));
      };
      r.onend = () => setListening(false);
      r.onerror = () => setListening(false);
      recog.current = r;
      setSpeechOk(true);
    }
  }, []);

  function toggleSpeech() {
    if (!recog.current) return;
    if (listening) {
      recog.current.stop();
      setListening(false);
    } else {
      try {
        recog.current.start();
        setListening(true);
      } catch {
        setListening(false);
      }
    }
  }

  function analyse() {
    if (input.trim().length < 4) {
      setToast('请先描述现场情况，至少输入一句话');
      return;
    }
    setQuery(input.trim());
    setActiveId(null);

    // 窄屏下输入区占满一屏，查完自动把结果带进来
    if (window.innerWidth < 1000) {
      window.setTimeout(
        () => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
        60,
      );
    }
  }

  function reset() {
    setQuery('');
    setActiveId(null);
    setInput('');
  }

  function flash(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(''), 2000);
  }

  async function copyScripts() {
    if (!active) return;
    const text = active.item.scripts.map((s) => s.zh).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      flash('话术已复制');
    } catch {
      flash('浏览器拒绝了剪贴板权限');
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        analyse();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <span className="mark">通事</span>
          <span className="latin">TONGSHI</span>
        </div>
        <span className="divider" />
        <span className="sub">涉外执法现场辅助</span>
        <div className="top-right">
          <span className="user">
            {session.name} · {session.unit} · {session.badge}
          </span>
          <button className="ghost-btn" onClick={onLogout}>
            退出
          </button>
        </div>
      </header>

      <main className="work">
        <section className="compose">
          <h2>现场情况</h2>
          <p className="hint-line">
            用平时的说法描述就行，不用套格式。时间、地点、国籍、对方说了什么，知道多少写多少。
          </p>

          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="例如：小区门口一个外国人拿不出护照，只会说英语……"
            rows={7}
            spellCheck={false}
          />

          <div className="compose-actions">
            {speechOk && (
              <button className={`mic${listening ? ' is-rec' : ''}`} onClick={toggleSpeech}>
                {listening ? '正在听…' : '语音输入'}
              </button>
            )}
            <button className="primary" onClick={analyse}>
              查找处置方案
            </button>
            {query && (
              <button className="ghost-btn" onClick={reset}>
                清空
              </button>
            )}
          </div>
          <p className="kbd-tip">Ctrl + Enter 提交</p>

          <div className="examples">
            <span className="label">试试这些</span>
            {EXAMPLES.map((ex, i) => (
              <button
                key={i}
                className="example"
                onClick={() => {
                  setInput(ex);
                  setQuery('');
                  setActiveId(null);
                }}
              >
                {ex}
              </button>
            ))}
          </div>
        </section>

        <section className="result" ref={resultRef}>
          {!query && <Empty />}

          {query && !active && <AiFallback input={query} />}

          {query && active && (
            <>
              <ResultCard
                result={active}
                low={lowConfidence}
                input={query}
                onCopy={copyScripts}
                onPick={(id) => setActiveId(id)}
              />

              {matches.length > 1 && (
                <div className="others">
                  <span className="label">其他可能情形</span>
                  {matches.map((m) => (
                    <button
                      key={m.item.id}
                      className={`other${m.item.id === active.item.id ? ' is-on' : ''}`}
                      onClick={() => setActiveId(m.item.id)}
                    >
                      <span className="other-title">{m.item.title}</span>
                      <span className="other-score">{Math.round(m.score * 100)}%</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </section>
      </main>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

/* ───────────────────────── 结果卡 ───────────────────────── */

function ResultCard({
  result,
  low,
  input,
  onCopy,
  onPick,
}: {
  result: MatchResult;
  low: boolean;
  input: string;
  onCopy: () => void;
  onPick: (id: string) => void;
}) {
  const { item, score, hits } = result;
  const [advice, setAdvice] = useState('');
  const [adviceDone, setAdviceDone] = useState(false);

  useEffect(() => {
    setAdvice('');
    setAdviceDone(false);
    let cancelled = false;

    const fallback = item.brief;

    if (!hasLLM) {
      setAdvice(fallback);
      setAdviceDone(true);
      return;
    }

    const ac = new AbortController();
    streamAnalyse(item, input, (d) => {
      if (!cancelled) setAdvice((t) => t + d);
    }, ac.signal)
      .then(() => !cancelled && setAdviceDone(true))
      .catch(() => {
        if (cancelled) return;
        setAdvice(fallback);
        setAdviceDone(true);
      });

    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [item, input]);

  const provisions = item.provisionIds
    .map((id) => provisionById(id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));

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
      <p className="advice">
        {advice || <span className="hint">生成中…</span>}
        {!adviceDone && advice && <span className="caret" />}
      </p>

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
        <button onClick={onCopy}>复制话术</button>
      </div>

      <p className="risk">
        <b>注意</b>
        {item.risk}
      </p>

      <p className="followup">
        <b>还需要确认</b>
        {item.followUp}
      </p>
    </article>
  );
}

function AiFallback({ input }: { input: string }) {
  const [text, setText] = useState('');
  const [done, setDone] = useState(false);
  const [articles, setArticles] = useState<LawArticle[]>([]);
  const [lawState, setLawState] = useState<'off' | 'loading' | 'ok' | 'error'>(
    hasLawApi ? 'loading' : 'off',
  );

  useEffect(() => {
    setText('');
    setDone(false);
    setArticles([]);
    setLawState(hasLawApi ? 'loading' : 'off');

    let cancelled = false;
    const ac = new AbortController();

    (async () => {
      // 先检索真法条，再让模型只在检索结果里说话
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
  }, [input]);

  return (
    <article className="card ai-card">
      <div className="card-head">
        <div>
          <span className="card-kicker">AI 研判 · 未匹配情形库</span>
          <h2>按描述给出处置思路</h2>
        </div>
      </div>

      {hasLLM ? (
        <p className="advice">
          {text || <span className="hint">生成中…</span>}
          {!done && text && <span className="caret" />}
        </p>
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
        需要时请补充：对方国籍、具体行为、是否持有证件、有无人员受伤、现场能否沟通。
      </p>
    </article>
  );
}

function Empty() {
  return (
    <div className="empty">
      <h2>等待描述现场情况</h2>
      <p>
        系统会在情形库里比对，找出最接近的一条，给出处置流程、法律依据和可以直接说出口的话术。
      </p>
      <div className="empty-cats">
        <span className="label">库里现有 {CASES.length} 类情形</span>
        <div className="cat-list">
          {CASES.map((c) => (
            <span key={c.id} className="cat">
              {c.title}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
