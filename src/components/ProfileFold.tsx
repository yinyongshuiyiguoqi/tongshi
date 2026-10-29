import { useEffect, useRef, useState, type ReactNode } from 'react';

/** 个人页的二级抽屉：标题常驻，点开后展开背景/音色内容 */
export function ProfileFold({
  title,
  children,
  defaultOpen = false,
  forceOpen = 0,
  badge = 0,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  /** 值变化时自动展开并滚动到当前抽屉，用于从公告跳转到 Agent 设置 */
  forceOpen?: number;
  /** 标题右侧的红色提醒角标，0 为不显示 */
  badge?: number;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!forceOpen) return;
    setOpen(true);
    const id = window.requestAnimationFrame(() => {
      rootRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    return () => window.cancelAnimationFrame(id);
  }, [forceOpen]);

  return (
    <div ref={rootRef} className={`profile-fold${open ? ' is-open' : ''}`}>
      <button
        type="button"
        className="fold-head profile-fold-head"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <h3>{title}</h3>
        {badge > 0 && <span className="fold-badge">{badge > 99 ? '99+' : badge}</span>}
        <span className="fold-chevron" aria-hidden="true">
          <svg viewBox="0 0 20 20" width="17" height="17">
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
      <div className="fold-panel profile-fold-panel" hidden={!open}>
        {children}
      </div>
    </div>
  );
}
