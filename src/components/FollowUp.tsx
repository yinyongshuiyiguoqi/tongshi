import { useEffect, useRef, useState } from 'react';
import { runChat, type ChatMessage } from '../lib/agent';
import { isEnterSend, loadEnterSend, onPrefsChange } from '../lib/prefs';
import { SpeakBar } from './SpeakBar';

/**
 * 追问区。
 *
 * 第一条结果出来之后，民警还能接着问「他要是不配合呢」这类问题。
 * 每次追问都带着前面的对话和本案条文调模型，回答完再核一遍条号。
 */
export function FollowUp({
  token,
  title,
  brief,
  provisionIds,
}: {
  token: string;
  title: string;
  brief: string;
  provisionIds: string[];
}) {
  const [msgs, setMsgs] = useState<ChatMessage[]>([]);
  const [stream, setStream] = useState('');
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [unmatched, setUnmatched] = useState<string[]>([]);
  const [enterSend, setEnterSend] = useState(loadEnterSend);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => onPrefsChange(() => setEnterSend(loadEnterSend())), []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [msgs.length, stream]);

  async function ask() {
    const content = input.trim();
    if (!content || busy) return;

    const history: ChatMessage[] = [...msgs, { role: 'user', content }];
    setMsgs(history);
    setInput('');
    setUnmatched([]);
    setStream('');
    setBusy(true);

    let acc = '';
    try {
      await runChat({ title, brief, provisionIds, history }, token, (e) => {
        if (e.type === 'delta') {
          acc += e.text;
          setStream(acc);
        }
        if (e.type === 'verify') setUnmatched(e.unmatched);
      });
    } catch {
      acc = acc || '连接中断了，检查一下后端窗口还在不在。';
    }

    setMsgs([...history, { role: 'assistant', content: acc || '这次没有返回内容，可以再问一次。' }]);
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
          <p>{m.content}</p>
          {m.role === 'assistant' && <SpeakBar text={m.content} token={token} />}
        </div>
      ))}

      {busy && (
        <div className="chat-msg assistant">
          <span className="chat-role">研判</span>
          <p>
            {stream || '正在想…'}
            <span className="caret" />
          </p>
        </div>
      )}

      {unmatched.length > 0 && (
        <p className="r-warn">
          回答里引用的 {unmatched.join('、')} 不在本案条文中，请人工核对。
        </p>
      )}

      <div className="chat-input">
        <textarea
          value={input}
          rows={2}
          placeholder="接着问，比如：对方拒绝配合怎么办？"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (isEnterSend(e, enterSend)) {
              e.preventDefault();
              ask();
            }
          }}
        />
        <button className="primary" onClick={ask} disabled={busy || !input.trim()}>
          {busy ? '回答中' : '发送'}
        </button>
      </div>

      <div ref={endRef} />
    </section>
  );
}

