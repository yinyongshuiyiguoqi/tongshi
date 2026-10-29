import { useState } from 'react';
import { submitFeedback } from '../lib/agent';

/** 个人页最底部的反馈入口，提交后由服务端发送到指定邮箱 */
export function ContactUs({ token }: { token: string }) {
  const [message, setMessage] = useState('');
  const [contact, setContact] = useState('');
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  async function submit() {
    if (message.trim().length < 2) {
      setError('请先写反馈内容');
      return;
    }
    setSending(true);
    setError('');
    setStatus('');
    try {
      const result = await submitFeedback(token, {
        message: message.trim(),
        contact: contact.trim(),
      });
      setStatus(
        result.sent
          ? '已发送到 1957074568@qq.com，感谢反馈。'
          : `已记录到服务器：${result.reason || '邮件通道暂不可用'}`,
      );
      setMessage('');
      setContact('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '提交失败');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="contact-us">
      <p className="bg-hint">
        使用中遇到问题、想补充法条或反馈建议，写在这里。提交后会发送到
        1957074568@qq.com。
      </p>
      <textarea
        className="contact-textarea"
        rows={3}
        value={message}
        maxLength={2000}
        onChange={(e) => {
          setMessage(e.target.value);
          setError('');
          setStatus('');
        }}
        placeholder="写下你的反馈…"
      />
      <input
        className="contact-input"
        value={contact}
        maxLength={200}
        onChange={(e) => setContact(e.target.value)}
        placeholder="联系方式（可选，方便回复）"
      />
      <div className="contact-actions">
        <button className="primary" onClick={submit} disabled={sending || !message.trim()}>
          {sending ? '发送中…' : '发送反馈'}
        </button>
        <a className="contact-mail" href="mailto:1957074568@qq.com">
          或直接发邮件
        </a>
      </div>
      {error && <p className="agent-error">{error}</p>}
      {status && <p className="agent-success">{status}</p>}
    </div>
  );
}
