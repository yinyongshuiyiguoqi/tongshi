import { useEffect, useId, useRef, useState } from 'react';
import { runChat, type ChatAnswer, type ChatMessage } from '../lib/agent';
import { appendVoiceText, languageLabel, useVoiceInput } from '../lib/voiceInput';
import { VoiceWave } from './VoiceWave';
import { isEnterSend, loadEnterSend, onPrefsChange } from '../lib/prefs';
import { AnswerOutline, AnswerSection, useAnswerOutline } from './AnswerOutline';
import { ScriptItem } from './ScriptItem';
import { SpeakBar } from './SpeakBar';

interface Turn {
  role: 'user' | 'assistant';
  content: string;
  answer?: ChatAnswer;
}

function StructuredAnswer({ answer, token }: { answer: ChatAnswer; token: string }) {
  const steps = answer.steps || [];
  const stepsText = steps.map((s, i) => `${i + 1}、${s}`).join(' ');
  const cases = answer.cases || [];
  const citations = answer.citations || [];

  // 多轮追问会渲染多个答案卡，锚点按实例区分，避免目录跳错卡
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const ids = {
    judgement: `chat-${uid}-judgement`,
    steps: `chat-${uid}-steps`,
    citations: `chat-${uid}-citations`,
    cases: `chat-${uid}-cases`,
    note: `chat-${uid}-note`,
  };

  const sections = [
    { id: ids.judgement, title: '研判' },
    { id: ids.steps, title: '处置流程' },
    { id: ids.citations, title: '依据' },
    ...(cases.length > 0 ? [{ id: ids.cases, title: '国际案例' }] : []),
    { id: ids.note, title: '还需要核实' },
  ];

  const outline = useAnswerOutline(sections, {
    [ids.judgement]: false,
    [ids.steps]: false,
    [ids.citations]: false,
    [ids.cases]: true,
    [ids.note]: true,
  });

  return (
    <div className="chat-answer follow-answer">
      <header className="follow-head">
        <span className="r-kicker">继续追问 · 结构化研判</span>
        <h2>{answer.title || '追问研判'}</h2>
      </header>

      <AnswerOutline sections={sections} active={outline.active} onJump={outline.jump} />

      <AnswerSection
        id={ids.judgement}
        title="研判"
        open={outline.open[ids.judgement]}
        onToggle={outline.toggle}
      >
        <p className="r-lead">{answer.judgement || '本次未返回研判，请重试。'}</p>
        <SpeakBar text={answer.judgement} token={token} />
      </AnswerSection>

      <AnswerSection
        id={ids.steps}
        title="处置流程"
        meta={`${steps.length} 步`}
        open={outline.open[ids.steps]}
        onToggle={outline.toggle}
      >
        <ol className="r-steps">
          {steps.map((s, i) => (
            <li key={i}>
              <span className="r-step-no">{String(i + 1).padStart(2, '0')}</span>
              <span>{s}</span>
            </li>
          ))}
        </ol>
        <SpeakBar text={stepsText} token={token} />
      </AnswerSection>

      <section className="r-block">
        <h2>现场话术</h2>
        {answer.scriptZh ? (
          <div className="r-scripts">
            <ScriptItem script={{ zh: answer.scriptZh, en: answer.scriptEn }} token={token} />
          </div>
        ) : (
          <p className="r-sum">本次未返回现场话术。</p>
        )}
      </section>

      <AnswerSection
        id={ids.citations}
        title="依据"
        meta={citations.length ? `${citations.length} 条` : undefined}
        open={outline.open[ids.citations]}
        onToggle={outline.toggle}
        preview={citations.length ? citations[0] : '本次未返回可引用条文'}
        footer={
          citations.length ? (
            <SpeakBar text={citations.join('；')} token={token} />
          ) : undefined
        }
      >
        {citations.length ? (
          <ul className="chat-citations">
            {citations.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        ) : (
          <p className="r-sum">本次未返回可引用条文，请人工核对。</p>
        )}
      </AnswerSection>

      {cases.length > 0 && (
        <AnswerSection
          id={ids.cases}
          title="国际案例参考"
          meta={`${cases.length} 个`}
          open={outline.open[ids.cases]}
          onToggle={outline.toggle}
          footer={
            <SpeakBar
              text={cases.map((c) => `${c.title}。${c.holding}`).join(' ')}
              token={token} />
          }
        >
          <p className="intl-case-note">
            以下案例只帮助理解国际法原则，不参与情形匹配，也不作为中国执法依据。
          </p>
          <ul className="intl-cases">
            {cases.map((c) => (
              <li key={c.id}>
                <p className="intl-case-title">{c.title}</p>
                <p className="intl-case-meta">
                  {c.forum} · {c.year}
                  {c.en ? ` · ${c.en}` : ''}
                </p>
                <p className="intl-case-text">{c.holding}</p>
                <p className="intl-case-relevance">关联：{c.relevance}</p>
                {c.source && (
                  <a href={c.source} target="_blank" rel="noreferrer">
                    查看案例来源
                  </a>
                )}
              </li>
            ))}
          </ul>
        </AnswerSection>
      )}

      <AnswerSection
        id={ids.note}
        title="还需要核实"
        open={outline.open[ids.note]}
        onToggle={outline.toggle}
        className="answer-sec--notes"
        footer={<SpeakBar text={answer.note || '无特别待核实事项。'} token={token} />}
      >
        <div className="r-note">
          <b>待核实</b>
          <span>{answer.note || '无特别待核实事项。'}</span>
        </div>
      </AnswerSection>
    </div>
  );
}

/**
 * 追问区。
 *
 * 回答沿用第一张结果卡的结构：研判 / 处置流程 / 现场话术 / 依据，
 * 不再退回一段没有结构的说明文。
 */
export function FollowUp({
  token,
  title,
  brief,
  provisionIds,
  baseScripts = [],
  baseSteps = [],
}: {
  token: string;
  title: string;
  brief: string;
  provisionIds: string[];
  baseScripts?: { zh: string; en?: string }[];
  baseSteps?: string[];
}) {
  const [msgs, setMsgs] = useState<Turn[]>([]);
  const [stream, setStream] = useState('');
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [unmatched, setUnmatched] = useState<string[]>([]);
  const [remoteError, setRemoteError] = useState('');
  const [enterSend, setEnterSend] = useState(loadEnterSend);
  const endRef = useRef<HTMLDivElement>(null);
  const voice = useVoiceInput({
    token,
    onText: (text) => setInput((v) => appendVoiceText(v, text)),
  });

  useEffect(() => onPrefsChange(() => setEnterSend(loadEnterSend())), []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [msgs.length, stream]);

  async function ask() {
    const content = input.trim();
    if (!content || busy) return;

    const prior = msgs;
    const history: ChatMessage[] = prior.map((m) => ({
      role: m.role,
      content: m.answer
        ? `${m.answer.judgement} ${m.answer.steps.join('；')} ${m.answer.note}`.trim()
        : m.content,
    }));
    history.push({ role: 'user', content });

    setMsgs([...prior, { role: 'user', content }]);
    setInput('');
    setUnmatched([]);
    setRemoteError('');
    setStream('');
    setBusy(true);

    let acc = '';
    let answer: ChatAnswer | undefined;

    try {
      await runChat({ title, brief, provisionIds, baseScripts, baseSteps, history }, token, (e) => {
        if (e.type === 'delta') {
          acc += e.text;
          setStream(acc);
        }
        if (e.type === 'chat') answer = e.data;
        if (e.type === 'verify') setUnmatched(e.unmatched);
        if (e.type === 'error') setRemoteError(e.message || '服务暂时不可用，请稍后重试');
      });
    } catch {
      setRemoteError('网络连接中断，请检查网络后重试');
      setInput(content);
    }

    if (answer) {
      setMsgs([...prior, { role: 'user', content }, {
        role: 'assistant',
        content: answer.judgement,
        answer,
      }]);
    } else if (acc) {
      setMsgs([...prior, { role: 'user', content }, { role: 'assistant', content: acc }]);
    }

    setStream('');
    setBusy(false);
  }

  return (
    <section className="r-block chat">
      <div className="chat-head">
        <h2>继续追问</h2>
        {enterSend ? (
          <span className="chat-tip">Enter 发送 · Shift + Enter 换行</span>
        ) : (
          <span className="chat-tip">Ctrl + Enter 发送</span>
        )}
      </div>

      {msgs.length === 0 && !busy && (
        <p className="chat-hint">
          结果有哪里对不上，或者想问「他不配合怎么办」，直接在这里接着问。
        </p>
      )}

      {msgs.map((m, i) => (
        <div key={i} className={`chat-msg ${m.role}`}>
          <span className="chat-role">{m.role === 'user' ? '你' : '研判'}</span>
          {m.answer ? (
            <StructuredAnswer answer={m.answer} token={token} />
          ) : (
            <p>{m.content}</p>
          )}
          {m.role === 'assistant' && !m.answer && (
            <SpeakBar text={m.content} token={token} />
          )}
        </div>
      ))}

      {busy && (
        <div className="chat-msg assistant">
          <span className="chat-role">研判</span>
          <p>
            {stream || '正在按现场处置结构整理…'}
            <span className="caret" />
          </p>
        </div>
      )}

      {unmatched.length > 0 && (
        <p className="r-warn">
          回答里引用的 {unmatched.join('、')} 不在已核验条文中，请人工核对。
        </p>
      )}

      {remoteError && (
        <div className="chat-error">
          <span>{remoteError}</span>
          <button type="button" onClick={ask} disabled={busy || !input.trim()}>
            重试
          </button>
        </div>
      )}

      <div className="chat-input">
        <textarea
          value={input}
          rows={2}
          placeholder={voice.recording ? '正在听…' : '接着问，比如：对方拒绝配合怎么办？'}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (isEnterSend(e, enterSend)) {
              e.preventDefault();
              ask();
            }
          }}
        />
        <button
          type="button"
          className={`chat-mic${voice.recording ? ' is-rec' : ''}`}
          onClick={voice.start}
          disabled={voice.busy || (!voice.supported && !voice.recording)}
          aria-label={voice.recording ? '停止语音输入' : '语音输入'}
          title={voice.supported ? '语音输入' : '当前浏览器不支持录音'}
        >
          {voice.busy ? (
            '识别中…'
          ) : voice.recording ? (
            <>
              <VoiceWave levels={voice.levels} />
              <span>停止</span>
            </>
          ) : (
            '语音输入'
          )}
        </button>
        <button className="primary" onClick={ask} disabled={busy || !input.trim()}>
          {busy ? '回答中' : '发送'}
        </button>
      </div>

      {(voice.error || (voice.supported && voice.language) || !voice.supported) && (
        <p className="mic-hint chat-mic-hint">
          {voice.error ||
            (voice.language
              ? `已识别为${languageLabel(voice.language)}`
              : '当前浏览器不支持录音，请用文字输入')}
        </p>
      )}

      <div ref={endRef} />
    </section>
  );
}
