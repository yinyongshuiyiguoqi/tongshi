import { useEffect, useMemo, useRef, useState } from 'react';
import { CASES } from '../data/cases';
import { LOW_CONFIDENCE, matchCases, type MatchResult } from '../lib/match';
import { pushRecent } from '../lib/history';
import type { Session } from '../lib/session';
import { Empty } from './Empty';
import { ResultCard } from './ResultCard';
import { AiFallback } from './AiFallback';
import { CaseLibrary, HistoryView, Profile } from './Views';
import type { BackdropSetting } from './Backdrop';
import { Dock, type TabKey } from './Dock';

const EXAMPLES = [
  '小区门口一个外国人拿不出护照，只会说英语，问他来干什么也说不清',
  '有个老外住在朋友家一个多星期了，一直没去派出所登记住宿',
  '酒吧门口两个外国人喝多了在闹事，其中一个躺在地上起不来',
];

export function Workbench({
  session,
  onLogout,
  backdrop,
  onBackdrop,
}: {
  session: Session;
  onLogout: () => void;
  backdrop: BackdropSetting;
  onBackdrop: (s: BackdropSetting) => void;
}) {
  const [tab, setTab] = useState<TabKey>('query');
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
  const active: MatchResult | undefined = matches.find((m) => m.item.id === activeId) ?? top;
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

  function flash(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(''), 2000);
  }

  function scrollToResult() {
    resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function analyse() {
    if (input.trim().length < 4) {
      flash('请先描述现场情况，至少输入一句话');
      return;
    }
    const text = input.trim();
    setQuery(text);
    setActiveId(null);

    const found = matchCases(text, CASES);
    if (found[0]) pushRecent(text, found[0].item.title);

    if (window.innerWidth < 1000) {
      window.setTimeout(scrollToResult, 80);
    }
  }

  function reset() {
    setQuery('');
    setActiveId(null);
    setInput('');
  }

  function pick(text: string) {
    setInput(text);
    setQuery('');
    setActiveId(null);
    setTab('query');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

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
            {session.user.name} · {session.user.unit}
          </span>
        </div>
      </header>

      {tab === 'query' && (
        <main className={`work${query ? '' : ' is-idle'}`}>
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
                <button key={i} className="example" onClick={() => pick(ex)}>
                  {ex}
                </button>
              ))}
            </div>
          </section>

          <section className="result" ref={resultRef}>
            {!query && <Empty onPick={pick} />}

            {query && !active && <AiFallback input={query} token={session.token} />}

            {query && active && (
              <ResultCard
                result={active}
                matches={matches}
                low={lowConfidence}
                onPick={(id) => setActiveId(id)}
                input={query}
                token={session.token}
              />
            )}
          </section>
        </main>
      )}

      {tab === 'cases' && (
        <main className="work single">
          <CaseLibrary onPick={pick} />
        </main>
      )}

      {tab === 'history' && (
        <main className="work single">
          <HistoryView onPick={pick} />
        </main>
      )}

      {tab === 'profile' && (
        <main className="work single">
          <Profile
            session={session}
            onLogout={onLogout}
            backdrop={backdrop}
            onBackdrop={onBackdrop}
          />
        </main>
      )}

      <Dock value={tab} onChange={setTab} />

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
