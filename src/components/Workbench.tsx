import { useEffect, useMemo, useRef, useState } from 'react';
import { CASES } from '../data/cases';
import { HIT_THRESHOLD, matchCases, type MatchResult } from '../lib/match';
import { pushRecent } from '../lib/history';
import type { Session } from '../lib/session';
import { Empty } from './Empty';
import { ResultCard } from './ResultCard';
import { AiFallback } from './AiFallback';
import { FollowUp } from './FollowUp';
import { Translator } from './Translator';
import { isEnterSend, loadEnterSend, onPrefsChange } from '../lib/prefs';
import { appendVoiceText, languageLabel, useVoiceInput } from '../lib/voiceInput';
import { CaseLibrary, HistoryView, Profile } from './Views';
import type { BackdropSetting } from './Backdrop';
import { Dock, type TabKey } from './Dock';
import { GlassCompanion } from './GlassCompanion';
import { EdgeBlur } from './EdgeBlur';
import { BrandMarkIcon } from './BrandMarkIcon';
import { AgentNotice } from './AgentNotice';
import { getAgentConfig } from '../lib/agent';

const EXAMPLES = [
  '小区门口一个外国人拿不出护照，只会说英语，问他来干什么也说不清',
  '有个老外住在朋友家一个多星期了，一直没去派出所登记住宿',
];

export function Workbench({
  session,
  onSession,
  onLogout,
  backdrop,
  onBackdrop,
}: {
  session: Session;
  onSession: (s: Session) => void;
  onLogout: () => void;
  backdrop: BackdropSetting;
  onBackdrop: (s: BackdropSetting) => void;
}) {
  const [tab, setTab] = useState<TabKey>('query');
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [homeKey, setHomeKey] = useState(0);
  const [brandBounce, setBrandBounce] = useState(false);
  const [agentNotice, setAgentNotice] = useState(false);
  const [agentSetupSignal, setAgentSetupSignal] = useState(0);
  const [agentConfigured, setAgentConfigured] = useState<boolean | null>(null);
  const [enterSend, setEnterSend] = useState(loadEnterSend);

  useEffect(() => onPrefsChange(() => setEnterSend(loadEnterSend())), []);

  // 每次登录进入工作台：只要 Agent 还没配置，就弹出一次设置公告。
  // 已配置用户不弹；本次登录内手动关闭后不会反复骚扰，下次登录会再次提醒。
  useEffect(() => {
    let alive = true;
    getAgentConfig(session.token)
      .then((view) => {
        if (!alive) return;
        setAgentConfigured(Boolean(view.active.configured));
        if (!view.active.configured) setAgentNotice(true);
      })
      .catch(() => {
        // 网络异常时不打扰用户，Agent 设置页本身会显示错误。
      });
    return () => {
      alive = false;
    };
  }, [session.token, session.user.badge]);

  // 跳转信号只负责这一次展开；1.5s 后复位，之后重新进「我的」不会又被强制展开。
  useEffect(() => {
    if (!agentSetupSignal) return;
    const id = window.setTimeout(() => setAgentSetupSignal(0), 1500);
    return () => window.clearTimeout(id);
  }, [agentSetupSignal]);
  const resultRef = useRef<HTMLElement>(null);
  const voice = useVoiceInput({
    token: session.token,
    onText: (text) => setInput((v) => appendVoiceText(v, text)),
  });

  const matches = useMemo(() => (query ? matchCases(query, CASES) : []), [query]);
  // 只有 ≥95% 相似度才调出情形库预设，其余交给 Agent 自主研判
  const confident = useMemo(
    () => matches.filter((m) => m.score >= HIT_THRESHOLD),
    [matches],
  );
  const active: MatchResult | undefined =
    confident.find((m) => m.item.id === activeId) ?? confident[0];

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

    const found = matchCases(text, CASES).filter((m) => m.score >= HIT_THRESHOLD);
    pushRecent(text, found[0]?.item.title ?? 'Agent 研判');

    if (window.innerWidth < 1000) {
      window.setTimeout(scrollToResult, 80);
    }
  }

  function reset() {
    setQuery('');
    setActiveId(null);
    setInput('');
  }

  function dismissAgentNotice() {
    setAgentNotice(false);
  }

  function openAgentSetup() {
    dismissAgentNotice();
    setTab('profile');
    setAgentSetupSignal((n) => n + 1);
  }

  function goHome() {
    setTab('query');
    setQuery('');
    setActiveId(null);
    setInput('');
    setToast('');
    // 重建查询主区，连同翻译器、追问和本地临时状态一起回到初始页
    setHomeKey((k) => k + 1);
    // 重新触发左上角的 Q 弹反馈
    setBrandBounce(false);
    window.requestAnimationFrame(() => setBrandBounce(true));
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
        <button
          type="button"
          className={`brand${brandBounce ? ' is-bouncing' : ''}`}
          onClick={goHome}
          onAnimationEnd={(e) => {
            if (e.target === e.currentTarget) setBrandBounce(false);
          }}
          aria-label="回到通事首页"
        >
          <span className="brand-logo">
            <BrandMarkIcon />
          </span>
          <span className="brand-word">
            <span className="mark">通事</span>
            <span className="latin">TONGSHI</span>
          </span>
        </button>
        <span className="divider" />
        <span className="sub">涉外执法现场辅助</span>
        <div className="top-right">
          <span className="user">
            {session.user.name} · {session.user.unit}
          </span>
        </div>
      </header>

      {tab === 'query' && (
        <main key={homeKey} className={`work${query ? '' : ' is-idle'}`}>
          <section className="compose">
            <h2>AI 现场研判</h2>
            <p className="hint-line">
              用平时的说法描述就行，不用套格式。时间、地点、国籍、对方说了什么，知道多少写多少。
            </p>

            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (isEnterSend(e, enterSend)) {
                  e.preventDefault();
                  analyse();
                }
              }}
              placeholder={
                voice.recording
                  ? '正在听…'
                  : '例如：小区门口一个外国人拿不出护照，只会说英语……'
              }
              rows={7}
              spellCheck={false}
            />

            <div className="compose-actions">
              <button
                type="button"
                className={`mic${voice.recording ? ' is-rec' : ''}`}
                onClick={voice.start}
                disabled={voice.busy || (!voice.supported && !voice.recording)}
              >
                {voice.busy ? '识别中…' : voice.recording ? '停止' : '语音输入'}
              </button>
              <button className="primary" onClick={analyse}>
                查找处置方案
              </button>
              {query && (
                <button className="ghost-btn new-case" onClick={reset}>
                  + 新情形
                </button>
              )}
            </div>
            {(voice.error ||
              (voice.supported && voice.language) ||
              !voice.supported) && (
              <p className="mic-hint">
                {voice.error ||
                  (voice.language
                    ? `已识别为${languageLabel(voice.language)}`
                    : '当前浏览器不支持录音，请用文字输入')}
              </p>
            )}
            <p className="kbd-tip">
              {enterSend ? 'Enter 提交 · Shift + Enter 换行' : 'Ctrl + Enter 提交'}
            </p>

            <div className="examples">
              <span className="label">试试这些</span>
              {EXAMPLES.map((ex, i) => (
                <button key={i} className="example" onClick={() => pick(ex)}>
                  {ex}
                </button>
              ))}
            </div>

            <Translator token={session.token} />
          </section>

          <section className="result" ref={resultRef}>
            {!query && <Empty onPick={pick} />}

            {query && !active && <AiFallback input={query} token={session.token} />}

            {query && active && (
              <ResultCard
                result={active}
                matches={confident}
                low={false}
                onPick={(id) => setActiveId(id)}
                input={query}
                token={session.token}
              />
            )}

            {query && (
              <FollowUp
                key={query}
                token={session.token}
                title={active?.item.title ?? ''}
                brief={active?.item.brief ?? ''}
                provisionIds={active?.item.provisionIds ?? []}
                baseScripts={active?.item.scripts ?? []}
                baseSteps={active?.item.steps ?? []}
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
            onSession={onSession}
            onLogout={onLogout}
            backdrop={backdrop}
            onBackdrop={onBackdrop}
            agentSetupSignal={agentSetupSignal}
            agentUnconfigured={agentConfigured === false}
            onAgentConfiguredChange={setAgentConfigured}
          />
        </main>
      )}

      {agentNotice && <AgentNotice onConfigure={openAgentSetup} onClose={dismissAgentNotice} />}

      <EdgeBlur />
      <GlassCompanion />

      <Dock
        value={tab}
        onChange={setTab}
        backdrop={backdrop}
        profileBadge={agentConfigured === false ? 1 : 0}
      />

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
