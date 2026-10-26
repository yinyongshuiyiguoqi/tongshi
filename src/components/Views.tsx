import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { CASES } from '../data/cases';
import { clearRecent, loadRecent } from '../lib/history';
import { loadEnterSend, saveEnterSend } from '../lib/prefs';
import type { Session } from '../lib/session';
import { PHOTOS, photoUrl, type BackdropSetting } from './Backdrop';
import { SwitchRow } from './SwitchRow';

/* ───────── 情形库 ───────── */

export function CaseLibrary({ onPick }: { onPick: (text: string) => void }) {
  const [q, setQ] = useState('');

  const list = useMemo(() => {
    const key = q.trim();
    if (!key) return CASES;
    return CASES.filter((c) =>
      [c.title, c.scene, ...c.keywords.map((k) => k.w)].join(' ').includes(key),
    );
  }, [q]);

  return (
    <div className="view">
      <header className="view-head">
        <h1>情形库</h1>
        <p>库里现有 {CASES.length} 类情况，点一条就能带进查询。</p>
        <input
          className="view-search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜情形名或口语说法，例如 护照、喝多、剐蹭"
        />
      </header>

      <div className="case-list">
        {list.map((c) => (
          <button key={c.id} className="case-item" onClick={() => onPick(c.scene)}>
            <span className={`case-sev sev-${c.severity}`}>{c.severity}</span>
            <div className="case-body">
              <p className="case-title">{c.title}</p>
              <p className="case-scene">{c.scene}</p>
              <div className="case-tags">
                {c.keywords.slice(0, 5).map((k) => (
                  <span key={k.w}>{k.w}</span>
                ))}
              </div>
            </div>
          </button>
        ))}
        {list.length === 0 && <p className="view-empty">没有匹配的情形，换个说法试试。</p>}
      </div>
    </div>
  );
}

/* ───────── 记录 ───────── */

export function HistoryView({ onPick }: { onPick: (text: string) => void }) {
  const [list, setList] = useState(loadRecent);

  function clear() {
    clearRecent();
    setList([]);
  }

  return (
    <div className="view">
      <header className="view-head">
        <h1>记录</h1>
        <p>存在这台设备上，换设备不会同步。</p>
      </header>

      {list.length === 0 ? (
        <p className="view-empty">还没有查询记录。回到「查询」，描述一次现场情况就会记下来。</p>
      ) : (
        <>
          <div className="case-list">
            {list.map((r) => (
              <button key={r.at} className="case-item record-item" onClick={() => onPick(r.text)}>
                <div className="case-body">
                  <p className="case-title">{r.title}</p>
                  <p className="case-scene">{r.text}</p>
                  <p className="record-time">
                    {new Date(r.at).toLocaleString('zh-CN', {
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
              </button>
            ))}
          </div>
          <button className="ghost-btn view-clear" onClick={clear}>
            清空记录
          </button>
        </>
      )}
    </div>
  );
}

/* ───────── 我的 ───────── */

export function Profile({
  session,
  onLogout,
  backdrop,
  onBackdrop,
}: {
  session: Session;
  onLogout: () => void;
  backdrop: BackdropSetting;
  onBackdrop: (s: BackdropSetting) => void;
}) {
  const { user } = session;
  const [model, setModel] = useState<string | null | undefined>(undefined);
  const [enterSend, setEnterSend] = useState(loadEnterSend);

  function toggleEnter(on: boolean) {
    setEnterSend(on);
    saveEnterSend(on);
  }

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then((d) => setModel(d?.model ?? null))
      .catch(() => setModel(null));
  }, []);

  function pickFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      alert('图片超过 4MB，换一张小一点的。');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => onBackdrop({ kind: 'custom', dataUrl: String(reader.result) });
    reader.readAsDataURL(file);
  }

  return (
    <div className="view">
      <header className="view-head">
        <h1>我的</h1>
      </header>

      <div className="profile-card">
        <span className="avatar">{user.name.slice(0, 1)}</span>
        <div>
          <p className="profile-name">{user.name}</p>
          <p className="profile-meta">
            {user.unit} · 警号 {user.badge}
          </p>
        </div>
      </div>

      <section className="bg-section">
        <h3>背景</h3>
        <p className="bg-hint">
          五张实景按登录轮换，也可以固定一张，或者上传自己的照片。只存在本机。
        </p>
        <div className="bg-grid">
          {PHOTOS.map((p, i) => (
            <button
              key={p.file}
              className={`bg-swatch is-photo${backdrop.kind === 'photo' && (backdrop.photo ?? 0) === i ? ' is-on' : ''}`}
              style={{ backgroundImage: `url(${photoUrl(i)})` }}
              onClick={() => onBackdrop({ kind: 'photo', photo: i })}
            >
              <span>{p.label}</span>
            </button>
          ))}
          <label className={`bg-swatch sw-upload${backdrop.kind === 'custom' ? ' is-on' : ''}`}>
            <input type="file" accept="image/*" hidden onChange={pickFile} />
            <span>{backdrop.kind === 'custom' ? '已上传照片' : '上传照片'}</span>
          </label>
        </div>
      </section>

      <section className="bg-section">
        <h3>输入</h3>
        <SwitchRow
          checked={enterSend}
          onChange={toggleEnter}
          title="回车直接发送"
          hint={
            enterSend
              ? '现在回车就提交，Shift + Enter 换行'
              : '现在用 Ctrl + Enter 提交，回车换行'
          }
        />
      </section>

      <dl className="profile-list">
        <div>
          <dt>登录方式</dt>
          <dd>警号 + 密码，服务端签发令牌，12 小时有效</dd>
        </div>
        <div>
          <dt>大模型</dt>
          <dd>
            {model === undefined
              ? '检查中…'
              : model
                ? `已接入 · ${model}`
                : '未配置，当前用本地模板作答'}
          </dd>
        </div>
        <div>
          <dt>数据存储</dt>
          <dd>记录与背景只存在本机浏览器，不上传</dd>
        </div>
        <div>
          <dt>版本</dt>
          <dd>原型 v0.5 · 传智杯 2026</dd>
        </div>
      </dl>

      <p className="profile-note">
        本系统只提供研判参考，处置决定由执法人员作出；援引条款以现行文本为准。
      </p>

      <button className="ghost-btn view-clear" onClick={onLogout}>
        退出登录
      </button>
    </div>
  );
}
