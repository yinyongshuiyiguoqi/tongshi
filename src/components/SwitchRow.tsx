import { useEffect, useRef, useState } from 'react';

/**
 * 一行开关，整行可点。
 *
 * 圆钮在移动途中会被拉长一下再回落，用两套位移关键帧表达「往哪边走」，
 * 停下后回到普通 transform，所以中途再点也不会跳。系统开了减少动态效果就只做颜色过渡。
 */
export function SwitchRow({
  checked,
  onChange,
  title,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  title: string;
  hint: string;
}) {
  const [moving, setMoving] = useState<'' | 'on' | 'off'>('');
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  function toggle() {
    const next = !checked;
    onChange(next);
    setMoving(next ? 'on' : 'off');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMoving(''), 460);
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={title}
      className="pref-row"
      onClick={toggle}
    >
      <span className="pref-text">
        <b>{title}</b>
        <em>{hint}</em>
      </span>

      <span
        className={`ios-switch${checked ? ' is-on' : ''}${moving ? ` is-moving-${moving}` : ''}`}
        aria-hidden="true"
      >
        <span className="ios-knob" />
      </span>
    </button>
  );
}
