import { CASES } from '../data/cases';
import { loadRecent } from '../lib/history';

export function Empty({ onPick }: { onPick: (text: string) => void }) {
  const recent = loadRecent();

  return (
    <div className="empty">
      <h2>等待描述现场情况</h2>
      <p>
        用平时的说法写就行。系统会在情形库里比对，找出最接近的一条，给出处置流程、法律依据和能照着念的话术。
      </p>

      <ol className="flow-mini">
        <li>
          <span className="flow-no">1</span>
          <div>
            <b>描述</b>
            <span>时间、地点、国籍、对方说了什么，知道多少写多少</span>
          </div>
        </li>
        <li>
          <span className="flow-no">2</span>
          <div>
            <b>匹配</b>
            <span>在 {CASES.length} 类情形里按关键词与相似度排序，给出匹配度</span>
          </div>
        </li>
        <li>
          <span className="flow-no">3</span>
          <div>
            <b>处置</b>
            <span>流程、依据、话术一并给出，可复制可打印</span>
          </div>
        </li>
      </ol>

      <div className="empty-cats">
        <span className="label">可处理的情形</span>
        <div className="cat-list">
          {CASES.map((c) => (
            <span key={c.id} className="cat">
              {c.title}
            </span>
          ))}
        </div>
      </div>

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
