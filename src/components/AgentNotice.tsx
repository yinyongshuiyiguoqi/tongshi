import { useEffect } from 'react';

/**
 * 新用户首次进入时的 Agent 配置公告。
 * 产品不再预置系统默认 Agent，所以这里主动把用户带到设置入口。
 */
export function AgentNotice({
  onConfigure,
  onClose,
}: {
  onConfigure: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div className="agent-notice-backdrop" role="presentation" onClick={onClose}>
      <section
        className="agent-notice"
        role="dialog"
        aria-modal="true"
        aria-labelledby="agent-notice-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="agent-notice-mark" aria-hidden="true">
          <svg viewBox="0 0 48 48" width="30" height="30" fill="none">
            <path
              d="M24 5l3.6 11.4L39 20l-11.4 3.6L24 35l-3.6-11.4L9 20l11.4-3.6L24 5z"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
            <circle cx="36.5" cy="11.5" r="2.2" fill="currentColor" />
            <circle cx="12" cy="34" r="1.5" fill="currentColor" opacity=".7" />
          </svg>
        </div>

        <p className="agent-notice-eyebrow">首次使用提示</p>
        <h2 id="agent-notice-title">先设置你的 AI Agent</h2>
        <p className="agent-notice-copy">
          我们不会替新用户预置公共模型或 API Key。先绑定你自己的模型服务，
          Agent 才会开始工作；之后可以随时在「我的 → Agent 设置」里更换。
        </p>

        <div className="agent-notice-points">
          <p><span>01</span> 选择 DeepSeek、智谱、通义等常见服务商</p>
          <p><span>02</span> 粘贴你自己的 API Key</p>
          <p><span>03</span> 保存并检测连接，返回后即可使用现场研判</p>
        </div>

        <div className="agent-notice-actions">
          <button type="button" className="ghost-btn" onClick={onClose}>
            稍后自己设置
          </button>
          <button type="button" className="primary" onClick={onConfigure}>
            去 Agent 设置
          </button>
        </div>
      </section>
    </div>
  );
}
