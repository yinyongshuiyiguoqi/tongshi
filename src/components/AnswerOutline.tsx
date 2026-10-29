import { useCallback, useState, type ReactNode } from 'react';

/**
 * 答案卡的二级目录。
 *
 * 首次研判结果和继续追问的结构化回答共用这一套：
 * - AnswerOutline：答案顶部的「目录」条，点条目跳到对应段落；
 * - AnswerSection：可折叠的段落，收起时可以留一行摘要预览。
 *
 * 默认状态由调用方给出：依据默认收起并带预览，其余段落默认展开。
 * 现场话术不再折叠，直接常驻展示，所以它不在这套二级目录里。
 */

export interface OutlineSection {
  id: string;
  title: string;
}

export function useAnswerOutline(
  sections: OutlineSection[],
  defaults: Record<string, boolean> = {},
) {
  const [open, setOpen] = useState<Record<string, boolean>>(defaults);
  const [active, setActive] = useState('');

  const key = sections.map((s) => s.id).join('|');

  const toggle = useCallback((id: string) => {
    setOpen((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const jump = useCallback((id: string) => {
    // 目标段落如果收着，先展开再跳，否则跳过去只剩一个标题
    setOpen((prev) => (prev[id] ? prev : { ...prev, [id]: true }));
    setActive(id);
    window.requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, []);

  return { open, active, toggle, jump, key };
}

export function AnswerOutline({
  sections,
  active,
  onJump,
  className = '',
}: {
  sections: OutlineSection[];
  active: string;
  onJump: (id: string) => void;
  className?: string;
}) {
  return (
    <nav className={`answer-toc ${className}`.trim()} aria-label="本页目录">
      <span className="answer-toc-label">目录</span>
      <div className="answer-toc-list">
        {sections.map((s) => (
          <button
            key={s.id}
            type="button"
            className={active === s.id ? 'is-active' : ''}
            aria-current={active === s.id ? 'true' : undefined}
            onClick={() => onJump(s.id)}
          >
            {s.title}
          </button>
        ))}
      </div>
    </nav>
  );
}

export function AnswerSection({
  id,
  title,
  meta,
  open,
  onToggle,
  preview,
  action,
  footer,
  className = '',
  children,
}: {
  id: string;
  title: string;
  meta?: ReactNode;
  open: boolean;
  onToggle: (id: string) => void;
  /** 收起时显示的一行摘要 */
  preview?: ReactNode;
  /** 段落自带的快捷操作（如「换一组」），收起时跟预览并排 */
  action?: ReactNode;
  /** 常驻在折叠面板外、收起时也可见的内容（如依据的语音播报按钮） */
  footer?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className={`r-block r-fold answer-sec${open ? ' is-open' : ''}${!open && preview ? ' has-preview' : ''}${footer ? ' has-footer' : ''} ${className}`.trim()}
    >
      <button
        type="button"
        className="fold-head"
        aria-expanded={open}
        aria-controls={`${id}-panel`}
        onClick={() => onToggle(id)}
      >
        <h2>{title}</h2>
        {meta != null && <span className="fold-meta">{meta}</span>}
        <span className="fold-chevron" aria-hidden="true">
          <svg viewBox="0 0 20 20" width="18" height="18">
            <path
              d="M5 8l5 5 5-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </button>

      {preview && !open && (
        <div className="fold-preview-row">
          <button type="button" className="fold-preview" onClick={() => onToggle(id)}>
            {preview}
          </button>
          {action && <div className="fold-preview-action">{action}</div>}
        </div>
      )}

      <div className="fold-panel" id={`${id}-panel`} hidden={!open}>
        {children}
      </div>

      {footer && <div className="answer-sec-footer">{footer}</div>}
    </section>
  );
}
