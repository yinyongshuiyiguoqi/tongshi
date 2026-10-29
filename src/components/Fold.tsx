import { useState, type ReactNode } from 'react';

/**
 * 结果页里的夹层：标题常驻，正文点开才展开。
 * AI 研判和处置流程都套这一层，避免整页一上来就铺满。
 */
export function Fold({
  title,
  meta,
  children,
  defaultOpen = false,
  className = '',
}: {
  title: string;
  meta?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className={`r-block r-fold${open ? ' is-open' : ''} ${className}`.trim()}>
      <button
        type="button"
        className="fold-head"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <h2>{title}</h2>
        {meta && <span className="fold-meta">{meta}</span>}
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
      <div className="fold-panel" hidden={!open}>
        {children}
      </div>
    </section>
  );
}
