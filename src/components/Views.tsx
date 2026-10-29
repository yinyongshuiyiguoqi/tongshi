import { useMemo, useState, type ChangeEvent } from 'react';
import { CASES } from '../data/cases';
import { clearRecent, loadRecent } from '../lib/history';
import {
  DOCK_FROST_MAX,
  loadDockFrost,
  loadEnterSend,
  saveDockFrost,
  saveEnterSend,
} from '../lib/prefs';
import {
  loadVoiceId,
  saveVoiceId,
  speak,
  VOICE_PRESETS,
  NEURAL_VOICES,
  loadVoiceUri,
  saveVoiceUri,
  foreignPreview,
} from '../lib/speech';
import type { Session } from '../lib/session';
import { PHOTOS, photoUrl, nextPhoto, type BackdropSetting } from './Backdrop';
import { SwitchRow } from './SwitchRow';
import { AgentSettings } from './AgentSettings';
import { AccountManager } from './AccountManager';
import { ProfileFold } from './ProfileFold';
import { ContactUs } from './ContactUs';
import { loadCompanion, saveCompanion, type CompanionSettings } from '../lib/companion';
import { motionAvailable, requestMotionPermission } from '../lib/motion';

/* ───────── 情形库 / 记录 / 我的 ───────── */

function maskPhone(phone: string): string {
  return phone.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2');
}

const FOREIGN_LANGS = [
  { code: 'en-US', label: '英语（美音）' },
  { code: 'en-GB', label: '英语（英音）' },
  { code: 'ja-JP', label: '日语' },
  { code: 'ko-KR', label: '韩语' },
  { code: 'fr-FR', label: '法语' },
  { code: 'de-DE', label: '德语' },
  { code: 'es-ES', label: '西班牙语' },
  { code: 'ru-RU', label: '俄语' },
  { code: 'ar-SA', label: '阿拉伯语' },
  { code: 'th-TH', label: '泰语' },
  { code: 'vi-VN', label: '越南语' },
  { code: 'pt-BR', label: '葡萄牙语' },
  { code: 'it-IT', label: '意大利语' },
];

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
        <h1>常见情形库</h1>
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
  onSession,
  onLogout,
  backdrop,
  onBackdrop,
  agentSetupSignal = 0,
  agentUnconfigured = false,
  onAgentConfiguredChange,
}: {
  session: Session;
  onSession: (s: Session) => void;
  onLogout: () => void;
  backdrop: BackdropSetting;
  onBackdrop: (s: BackdropSetting) => void;
  /** 从首次使用公告跳转过来时，自动展开 Agent 设置 */
  agentSetupSignal?: number;
  agentUnconfigured?: boolean;
  onAgentConfiguredChange?: (configured: boolean) => void;
}) {
  const { user } = session;
  const [accountOpen, setAccountOpen] = useState(false);
  const [enterSend, setEnterSend] = useState(loadEnterSend);
  const [tone, setTone] = useState(loadVoiceId);
  const [zhVoice, setZhVoice] = useState(() => loadVoiceUri('zh-CN'));
  const [foreignLang, setForeignLang] = useState('en-US');
  const [foreignVoice, setForeignVoice] = useState(() => loadVoiceUri('en-US'));
  const [dockFrost, setDockFrost] = useState(loadDockFrost);
  const [companion, setCompanion] = useState(loadCompanion);

  function patchCompanion(patch: Partial<CompanionSettings>) {
    const next = { ...companion, ...patch };
    setCompanion(next);
    saveCompanion(next);
  }

  async function toggleCompanionMotion(on: boolean) {
    if (on && motionAvailable()) {
      const granted = await requestMotionPermission();
      if (!granted) {
        alert('没有获得体感权限。请在系统设置里允许运动与方向访问后再试。');
        return;
      }
    }
    patchCompanion({ motion: on });
  }

  const zhVoices = NEURAL_VOICES.filter((v) => v.lang.startsWith('zh'));
  const foreignVoices = NEURAL_VOICES.filter((v) => v.lang === foreignLang);
  const activeForeignVoice = foreignVoice || foreignVoices[0]?.id || '';

  function toggleEnter(on: boolean) {
    setEnterSend(on);
    saveEnterSend(on);
  }

  function pickTone(id: string) {
    setTone(id);
    saveVoiceId(id);
    speak('您好，我是执勤民警，请出示您的护照和签证。', 'zh-CN', zhVoice || undefined);
  }

  function pickAcoustic(lang: string, uri: string) {
    saveVoiceUri(lang, uri);
    if (lang === 'zh-CN') {
      setZhVoice(uri);
    } else {
      setForeignLang(lang);
      setForeignVoice(uri);
    }
    speak(
      lang === 'zh-CN'
        ? '您好，我是执勤民警，请出示您的护照和签证。'
        : foreignPreview(lang),
      lang,
      uri,
    );
  }

  function pickForeignLang(lang: string) {
    setForeignLang(lang);
    setForeignVoice(loadVoiceUri(lang));
  }

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

      <button
        type="button"
        className="profile-card profile-account-entry"
        onClick={() => setAccountOpen(true)}
        aria-label="打开账号管理"
      >
        <span className="avatar">
          {user.avatar ? <img src={user.avatar} alt="" /> : user.name.slice(0, 1)}
        </span>
        <div>
          <p className="profile-name">{user.name}</p>
          <p className="profile-meta">
            {user.unit} · {user.phone ? `手机号 ${maskPhone(user.phone)}` : `警号 ${user.badge}`}
          </p>
        </div>
        <span className="profile-account-arrow">账号管理 <i>›</i></span>
      </button>

      {accountOpen && (
        <AccountManager
          session={session}
          onClose={() => setAccountOpen(false)}
          onSession={onSession}
          onLogout={onLogout}
        />
      )}

      <ProfileFold title="背景">
        <p className="bg-hint">
          {PHOTOS.length} 张实景，每天第一次打开 App 自动换一张；点选一张就固定，也可以随时换一张。只存在本机。
        </p>
        {backdrop.kind === 'photo' && (
          <div className="bg-actions">
            {backdrop.auto === false ? (
              <button
                type="button"
                className="bg-action"
                onClick={() => onBackdrop(nextPhoto(backdrop))}
              >
                恢复自动轮换
              </button>
            ) : (
              <button
                type="button"
                className="bg-action"
                onClick={() => onBackdrop(nextPhoto(backdrop))}
              >
                换一张
              </button>
            )}
          </div>
        )}
        <div className="bg-grid">
          {PHOTOS.map((p, i) => (
            <button
              key={p.file}
              className={`bg-swatch is-photo${backdrop.kind === 'photo' && (backdrop.photo ?? 0) === i ? ' is-on' : ''}`}
              style={{ backgroundImage: `url(${photoUrl(i)})` }}
              onClick={() => onBackdrop({ kind: 'photo', photo: i, auto: false })}
            >
              <span>{p.label}</span>
            </button>
          ))}
          <label className={`bg-swatch sw-upload${backdrop.kind === 'custom' ? ' is-on' : ''}`}>
            <input type="file" accept="image/*" hidden onChange={pickFile} />
            <span>{backdrop.kind === 'custom' ? '已上传照片' : '上传照片'}</span>
          </label>
        </div>
      </ProfileFold>

      <ProfileFold title="音色">
        <p className="bg-hint">
          使用 Edge 神经语音，真正换嗓子；点一下会自动试听，选中的记在本机。
        </p>

        <p className="voice-label">中文音色</p>
        <div className="voice-grid">
          {zhVoices.map((v) => (
            <button
              key={v.id}
              className={`voice-chip${(zhVoice || zhVoices[0]?.id) === v.id ? ' is-on' : ''}`}
              onClick={() => pickAcoustic('zh-CN', v.id)}
              title={v.id}
            >
              <b>{v.label}</b>
              <em>
                {v.hint} · {v.lang}
              </em>
            </button>
          ))}
        </div>

        <div className="voice-label-row">
          <p className="voice-label">外语音色</p>
          <select
            className="voice-lang-select"
            value={foreignLang}
            onChange={(e) => pickForeignLang(e.target.value)}
            aria-label="外语试听语种"
          >
            {FOREIGN_LANGS.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
        </div>
        <div className="voice-grid">
          {foreignVoices.map((v) => (
            <button
              key={v.id}
              className={`voice-chip${activeForeignVoice === v.id ? ' is-on' : ''}`}
              onClick={() => pickAcoustic(v.lang, v.id)}
              title={v.id}
            >
              <b>{v.label}</b>
              <em>
                {v.hint} · {v.lang}
              </em>
            </button>
          ))}
        </div>

        <p className="voice-label">语气</p>
        <div className="voice-grid">
          {VOICE_PRESETS.map((v) => (
            <button
              key={v.id}
              className={`voice-chip${tone === v.id ? ' is-on' : ''}`}
              onClick={() => pickTone(v.id)}
            >
              <b>{v.label}</b>
              <em>{v.desc}</em>
            </button>
          ))}
        </div>

        <div className="voice-try-row">
          <button
            className="voice-try"
            onClick={() =>
              speak('您好，我是执勤民警，请出示您的护照和签证。', 'zh-CN', zhVoice || undefined)
            }
          >
            试听中文
          </button>
          <button
            className="voice-try"
            onClick={() =>
              speak(foreignPreview(foreignLang), foreignLang, activeForeignVoice || undefined)
            }
          >
            试听外语
          </button>
        </div>
      </ProfileFold>

      <ProfileFold title="输入">
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
      </ProfileFold>

      <ProfileFold title="外观">
        <div className="pref-row is-static">
          <div className="pref-text">
            <b>底栏质感</b>
            <em>往左是液态玻璃，边缘会折射背景；往右变毛玻璃，糊成一片柔光</em>
          </div>
          <span className="pref-val">
            {dockFrost < 0.3 ? '液态' : dockFrost < 0.62 ? '介于两者' : '毛玻璃'}
          </span>
          <input
            className="ios-range"
            type="range"
            min={0}
            max={100}
            step={1}
            value={Math.round((dockFrost / DOCK_FROST_MAX) * 100)}
            aria-label="底栏质感"
            onChange={(e) => {
              const next = (Number(e.target.value) / 100) * DOCK_FROST_MAX;
              setDockFrost(next);
              saveDockFrost(next);
            }}
            style={{
              ['--fill' as string]: `${Math.round((dockFrost / DOCK_FROST_MAX) * 100)}%`,
            }}
          />
        </div>

        <div className="my-glass">
          <div className="my-glass-head">
            <h4>my glass</h4>
            <span>玻璃小精灵 · 只做陪伴</span>
          </div>

          <SwitchRow
            checked={companion.enabled}
            onChange={(on) => patchCompanion({ enabled: on })}
            title="显示小精灵"
            hint="会在页面边缘自由走动，滑动页面时会躲一下"
          />

          <SwitchRow
            checked={companion.sound}
            onChange={(on) => patchCompanion({ sound: on })}
            title="点击音效"
            hint="点一下小玻璃会有一声很轻的玻璃响"
          />

          <SwitchRow
            checked={companion.motion}
            onChange={(on) => void toggleCompanionMotion(on)}
            title="重力感应"
            hint="手机倾斜，或桌面把鼠标靠近小玻璃，都会改变重力方向"
          />

          <label className="my-glass-field">
            <span>名字</span>
            <input
              value={companion.name}
              maxLength={12}
              onChange={(e) => patchCompanion({ name: e.target.value })}
              onBlur={() => patchCompanion({ name: companion.name.trim() || '小玻璃' })}
              placeholder="小玻璃"
            />
          </label>

          <div className="my-glass-row">
            <span className="my-glass-label">走动频率</span>
            <div className="my-glass-options">
              {[
                [0, '静止'],
                [30, '很少'],
                [16, '安静'],
                [8, '正常'],
                [5, '活跃'],
              ].map(([value, label]) => (
                <button
                  key={String(value)}
                  className={`my-glass-chip${companion.walkSeconds === value ? ' is-on' : ''}`}
                  onClick={() => patchCompanion({ walkSeconds: Number(value) })}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="my-glass-row">
            <span className="my-glass-label">点击回馈</span>
            <div className="my-glass-options">
              {[
                ['bubble', '气泡'],
                ['bounce', '弹跳'],
                ['none', '无'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  className={`my-glass-chip${companion.clickFeedback === value ? ' is-on' : ''}`}
                  onClick={() =>
                    patchCompanion({ clickFeedback: value as CompanionSettings['clickFeedback'] })
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <p className="my-glass-note">
            目前只是外观陪伴，没有接入业务功能；不喜欢可以在上面直接关闭。
          </p>
        </div>
      </ProfileFold>

      <ProfileFold
        title="Agent 设置"
        forceOpen={agentSetupSignal}
        badge={agentUnconfigured ? 1 : 0}
      >
        <AgentSettings token={session.token} onConfiguredChange={onAgentConfiguredChange} />
      </ProfileFold>

      <ProfileFold title="联系我们">
        <ContactUs token={session.token} />
      </ProfileFold>

      <button className="view-clear logout-glass" onClick={onLogout}>
        退出登录
      </button>
    </div>
  );
}
