import { loadRecent } from '../lib/history';

export function Empty({ onPick }: { onPick: (text: string) => void }) {
  const recent = loadRecent();

  return (
    <div className="empty">
      <h2>等待描述现场情况</h2>
      <p>用平时的说法写，越具体越好。</p>

      {recent.length > 0 && (
        <div className="empty-recent">
          <span className="label">最近处置</span>
          {recent.map((r) => (
            <button key={r.at} className="recent-item" onClick={() => onPick(r.text)}>
              <span className="recent-title">{r.title}</span>
              <span className="recent-text">{r.text}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
