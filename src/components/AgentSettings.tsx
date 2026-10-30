import { useEffect, useRef, useState } from 'react';
import {
  clearAgentKey,
  getAgentConfig,
  probeAgentKey,
  resetAgentConfig,
  revealAgentKey,
  saveAgentConfig,
  testAgentConfig,
  type AgentConfigView,
  type AgentProbeResult,
} from '../lib/agent';

const PROVIDERS = [
  {
    name: 'DeepSeek',
    base: 'https://api.deepseek.com',
    model: 'deepseek-flash',
    keyUrl: 'https://platform.deepseek.com/api_keys',
  },
  {
    name: '智谱 GLM',
    base: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-4-flash',
    keyUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
  },
  {
    name: '通义千问',
    base: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-plus',
    keyUrl: 'https://bailian.console.aliyun.com/',
  },
  {
    name: 'Moonshot',
    base: 'https://api.moonshot.cn/v1',
    model: 'moonshot-v1-8k',
    keyUrl: 'https://platform.moonshot.cn/console/api-keys',
  },
  {
    name: 'OpenAI',
    base: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    keyUrl: 'https://platform.openai.com/api-keys',
  },
  {
    name: '硅基流动',
    base: 'https://api.siliconflow.cn/v1',
    model: 'Qwen/Qwen2.5-7B-Instruct',
    keyUrl: 'https://cloud.siliconflow.cn/account/ak',
  },
];

function Icon({ name }: { name: 'copy' | 'edit' | 'trash' | 'eye' }) {
  if (name === 'copy') {
    return (
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
        <rect x="8" y="8" width="10" height="11" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M6 15V6a2 2 0 0 1 2-2h8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }
  if (name === 'edit') {
    return (
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
        <path d="M4 20l4.2-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M13.5 6.5l3 3" fill="none" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    );
  }
  if (name === 'trash') {
    return (
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
        <path d="M5 7h14M9 7V5h6v2m-8 0l1 12h8l1-12M10 11v5m4-5v5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="2.6" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

/**
 * 个人页的 Agent 设置。
 *
 * 只允许改模型连接；法典库和涉外执法人员人设由服务端强制注入，
 * 这里不提供关闭开关，避免用户把执法辅助改成普通聊天。
 */
export function AgentSettings({
  token,
  onConfiguredChange,
}: {
  token: string;
  onConfiguredChange?: (configured: boolean) => void;
}) {
  const [view, setView] = useState<AgentConfigView | null>(null);
  const [base, setBase] = useState('');
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [revealedKey, setRevealedKey] = useState('');
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [probe, setProbe] = useState<AgentProbeResult | null>(null);
  const [probing, setProbing] = useState(false);
  const [probeError, setProbeError] = useState('');
  const [manualModel, setManualModel] = useState(false);
  const probeTimer = useRef<number | null>(null);
  const probeSeq = useRef(0);

  useEffect(() => {
    return () => {
      if (probeTimer.current) window.clearTimeout(probeTimer.current);
    };
  }, []);

  function scheduleProbe(value: string) {
    if (probeTimer.current) window.clearTimeout(probeTimer.current);
    setProbeError('');
    if (value.trim().length < 12) {
      setProbe(null);
      setProbing(false);
      return;
    }
    // 旧识别结果立即让位，避免用户趁防抖窗口保存到上一个服务商
    setProbe(null);
    setProbing(true);
    probeTimer.current = window.setTimeout(() => {
      void identifyKey(value.trim());
    }, 700);
  }

  async function identifyKey(key: string) {
    if (!key) return;
    const seq = ++probeSeq.current;
    setProbing(true);
    setProbeError('');
    try {
      const data = await probeAgentKey(token, key);
      // 用户可能已经改了 Key；只认最后一次请求
      if (seq !== probeSeq.current) return;
      setProbe(data);
      setBase(data.provider.base);
      setManualModel(false);
      setModel(data.recommended || data.models[0] || '');
      setSuccess(
        `已识别为 ${data.provider.name}，API 地址已自动填入（${data.provider.base}）${
          data.verified ? '' : '，未联网校验，请确认服务商'
        }，选好模型后保存。`,
      );
    } catch (err) {
      if (seq !== probeSeq.current) return;
      setProbe(null);
      setProbeError(err instanceof Error ? err.message : '没能自动识别这个 API Key');
    } finally {
      setProbing(false);
    }
  }

  useEffect(() => {
    let alive = true;
    getAgentConfig(token)
      .then((data) => {
        if (!alive) return;
        setView(data);
        setBase(data.active.base);
        setModel(data.active.model);
        onConfiguredChange?.(Boolean(data.active.configured));
      })
      .catch((err) => {
        if (alive) setError(err instanceof Error ? err.message : '读取 Agent 设置失败');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [token]);

  async function save() {
    if (!base.trim() || !model.trim()) {
      setError('请选择服务商，或填写 API 地址和模型名称');
      return;
    }
    if (!apiKey.trim() && !view?.active.hasKey) {
      setError('请填写你自己的 API Key');
      return;
    }
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const data = await saveAgentConfig(token, {
        apiKey: apiKey.trim() || undefined,
        base: base.trim(),
        model: model.trim(),
      });
      setView(data);
      onConfiguredChange?.(Boolean(data.active.configured));
      setApiKey('');
      setRevealedKey('');
      setEditing(false);
      setSuccess('已保存并初始化：已先写入涉外执法人员人设、法典库背景、推理 skills 和音色设置，再启用这个 Agent。');
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  async function test() {
    setTesting(true);
    setError('');
    setSuccess('');
    try {
      const result = await testAgentConfig(token, {
        apiKey: apiKey.trim() || undefined,
        base: base.trim(),
        model: model.trim(),
      });
      setSuccess(`连接正常：${result.model}${result.reply ? ` · ${result.reply}` : ''}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '连接检测失败');
    } finally {
      setTesting(false);
    }
  }

  async function copyKey() {
    if (!view?.active.hasOwnKey) {
      setError('当前还没有保存 API Key；请先填写并保存你自己的 Key');
      return;
    }
    setError('');
    try {
      const key = await revealAgentKey(token);
      await navigator.clipboard.writeText(key);
      setSuccess('API Key 已复制');
    } catch (err) {
      setError(err instanceof Error ? err.message : '复制失败');
    }
  }

  async function toggleReveal() {
    if (revealedKey) {
      setRevealedKey('');
      return;
    }
    if (!view?.active.hasOwnKey) {
      setError('当前还没有保存 API Key；请先填写并保存你自己的 Key');
      return;
    }
    setError('');
    try {
      setRevealedKey(await revealAgentKey(token));
    } catch (err) {
      setError(err instanceof Error ? err.message : '读取 Key 失败');
    }
  }

  async function deleteKey() {
    if (!view?.active.hasOwnKey) return;
    if (!window.confirm('删除已保存的 API Key？删除后会回到未配置 Agent 状态。')) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const data = await clearAgentKey(token);
      setView(data);
      onConfiguredChange?.(Boolean(data.active.configured));
      setApiKey('');
      setRevealedKey('');
      setEditing(false);
      setSuccess('API Key 已删除，请重新配置 Agent 后才能继续使用 AI。');
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败');
    } finally {
      setSaving(false);
    }
  }

  async function factoryReset() {
    setConfirming(false);
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const data = await resetAgentConfig(token);
      setView(data);
      onConfiguredChange?.(Boolean(data.active.configured));
      setBase(data.active.base);
      setModel(data.active.model);
      setApiKey('');
      setRevealedKey('');
      setEditing(false);
      setSuccess('已清空 Agent 配置：模型和 API Key 已删除，请重新设置。');
    } catch (err) {
      setError(err instanceof Error ? err.message : '恢复出厂设置失败');
    } finally {
      setSaving(false);
    }
  }

  function chooseProvider(provider: (typeof PROVIDERS)[number]) {
    setBase(provider.base);
    setModel(provider.model);
    setManualModel(false);
    setEditing(true);
    setError('');
    setProbe(null);
    setProbeError('');
    if (apiKey.trim().length >= 12) {
      setSuccess(`已选择 ${provider.name}，正在按你填写的 Key 重新识别…`);
      scheduleProbe(apiKey);
    } else {
      setSuccess(`已选择 ${provider.name}，粘贴它的 API Key 后会自动识别服务商和模型。`);
    }
  }

  const showProviders = Boolean(view && !view.active.hasOwnKey);

  return (
    <div className="agent-settings">
      <div className="agent-head">
        <span className="agent-subtitle">当前连接</span>
        {view && (
          <span className={`agent-badge${view.active.configured ? ' is-custom' : ' is-unconfigured'}`}>
            {view.active.isDemo ? '演示 Agent' : view.active.configured ? '已配置 Agent' : '未配置 Agent'}
          </span>
        )}
      </div>
      <p className="bg-hint">
        每个账号需要绑定自己的模型服务。选择或保存 Agent 时，系统会先写入涉外执法人员人设、法典库背景和音色设置；这些是固定基础，不能关闭。
      </p>

      {loading ? (
        <p className="agent-note">正在读取当前配置…</p>
      ) : (
        <>
          {view && !view.active.configured && (
            <div className="agent-empty">
              <b>还没有配置 Agent</b>
              <p>新用户不会预置公共模型或 API Key。选一个服务商，填入你自己的 Key，保存并检测后即可使用。</p>
            </div>
          )}
          {view?.active.isDemo && (
            <p className="agent-note">当前是演示账号的默认 Agent。新注册账号不会继承这套 Key，需要在「我的 → Agent 设置」里自行配置。</p>
          )}
          {view?.active.hasKey && !editing ? (
            <div className="agent-key-row">
              <code className="agent-key-text" title={revealedKey || view.active.keyHint}>
                {revealedKey || view.active.keyHint}
              </code>
              <div className="agent-key-actions">
                <button type="button" className="agent-key-btn" onClick={copyKey} title="复制" aria-label="复制 API Key">
                  <Icon name="copy" />
                </button>
                <button
                  type="button"
                  className="agent-key-btn"
                  onClick={() => {
                    setEditing(true);
                    setApiKey('');
                    setError('');
                    setSuccess('');
                  }}
                  title="修改"
                  aria-label="修改 API Key"
                >
                  <Icon name="edit" />
                </button>
                <button
                  type="button"
                  className="agent-key-btn"
                  onClick={deleteKey}
                  title="删除"
                  aria-label="删除 API Key"
                  disabled={!view.active.hasOwnKey}
                >
                  <Icon name="trash" />
                </button>
                <button
                  type="button"
                  className="agent-key-btn"
                  onClick={toggleReveal}
                  title={revealedKey ? '隐藏' : '查看'}
                  aria-label={revealedKey ? '隐藏 API Key' : '查看 API Key'}
                  disabled={!view.active.hasOwnKey}
                >
                  <Icon name="eye" />
                </button>
                <button
                  type="button"
                  className="agent-detect"
                  onClick={test}
                  disabled={testing}
                >
                  {testing ? '检测中…' : '检测'}
                </button>
              </div>
            </div>
          ) : (
            <div className="agent-form">
              <label className="agent-field">
                <span>API Key</span>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => {
                    const next = e.target.value;
                    setApiKey(next);
                    setError('');
                    setSuccess('');
                    scheduleProbe(next);
                  }}
                  placeholder={
                    view?.active.hasKey
                      ? `当前：${view.active.keyHint}，输入新 Key 可替换`
                      : '粘贴你的 API Key'
                  }
                  autoComplete="off"
                  spellCheck={false}
                />
              </label>

              {(probing || probe || probeError) && (
                <div className="agent-probe" aria-live="polite">
                  {probing ? (
                    <span className="agent-probe-status">正在识别 API Key…</span>
                  ) : probe ? (
                    <>
                      <span className={`agent-probe-badge${probe.verified ? ' is-verified' : ''}`}>
                        {probe.verified ? '已联网识别' : '按格式推断'} · {probe.provider.name}
                      </span>
                      <code className="agent-probe-base">{probe.provider.base}</code>
                      <button
                        type="button"
                        className="agent-probe-retry"
                        onClick={() => identifyKey(apiKey.trim())}
                      >
                        重新识别
                      </button>
                    </>
                  ) : (
                    <span className="agent-probe-error">{probeError}</span>
                  )}
                </div>
              )}
            </div>
          )}

          {showProviders && !probe && (
            <div className="agent-providers">
              <p className="agent-provider-title">快速接入常见大模型</p>
              <div className="agent-provider-grid">
                {PROVIDERS.map((p) => (
                  <div className="agent-provider" key={p.name}>
                    <button type="button" className="agent-provider-main" onClick={() => chooseProvider(p)}>
                      <b>{p.name}</b>
                      <em>{p.model}</em>
                    </button>
                    <a className="agent-provider-link" href={p.keyUrl} target="_blank" rel="noreferrer">
                      获取 Key ↗
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="agent-form">
            <label className="agent-field">
              <span>API 地址</span>
              <input
                value={base}
                onChange={(e) => {
                  setBase(e.target.value);
                  setError('');
                  setSuccess('');
                }}
                placeholder="https://api.deepseek.com"
                spellCheck={false}
              />
            </label>

            <label className="agent-field">
              <span>模型名称</span>
              {probe && probe.models.length > 0 && !manualModel ? (
                <select
                  value={model}
                  onChange={(e) => {
                    setModel(e.target.value);
                    setError('');
                    setSuccess('');
                  }}
                >
                  {probe.models.map((m) => (
                    <option key={m} value={m}>
                      {m}
                      {m === probe.recommended ? '（推荐）' : ''}
                    </option>
                  ))}
                  {model && !probe.models.includes(model) && (
                    <option value={model}>{model}（当前）</option>
                  )}
                </select>
              ) : (
                <input
                  value={model}
                  onChange={(e) => {
                    setModel(e.target.value);
                    setError('');
                    setSuccess('');
                  }}
                  placeholder="deepseek-flash"
                  spellCheck={false}
                />
              )}
            </label>
            {probe && probe.models.length > 0 && (
              <div className="agent-model-tools">
                <span className="agent-model-count">
                  共 {probe.models.length} 个可用模型
                  {probe.recommended ? ` · 推荐 ${probe.recommended}` : ''}
                </span>
                <button
                  type="button"
                  className="agent-model-toggle"
                  onClick={() => setManualModel((v) => !v)}
                >
                  {manualModel ? '从识别列表选择' : '手动填写模型名'}
                </button>
              </div>
            )}
          </div>

          <div className="agent-actions">
            <button className="primary" onClick={save} disabled={saving}>
              {saving ? '保存中…' : editing ? '保存新 Key' : '保存并启用'}
            </button>
            <button className="ghost-btn" onClick={() => setConfirming(true)} disabled={saving}>
              恢复出厂设置
            </button>
            {(!view?.active.hasKey || editing) && (
              <button className="ghost-btn" onClick={test} disabled={testing || saving}>
                {testing ? '检测中…' : '检测连接'}
              </button>
            )}
          </div>

          {error && <p className="agent-error">{error}</p>}
          {success && <p className="agent-success">{success}</p>}

          <div className="agent-rules">
            <p>
              <b>法典库</b>
              {view?.rules.lawLibrary || '已核验法条，强制注入'}
            </p>
            <p>
              <b>执法人设</b>
              {view?.rules.persona || '涉外执法人员人设，强制注入'}
            </p>
            <p>
              <b>推理 Skills</b>
              {view?.rules.skills?.length
                ? view.rules.skills.join('、')
                : '定性判断、法条校验、程序证据、国际法、表达多样、作答自检'}
            </p>
            {view?.rules.persistent && <p className="agent-default">{view.rules.persistent}</p>}
            <p className="agent-default">
              未配置时不会调用任何公共默认模型；配置只保存在你的账号下。
            </p>
          </div>
        </>
      )}

      {confirming && (
        <div className="agent-modal-backdrop" role="presentation" onClick={() => setConfirming(false)}>
          <div
            className="agent-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="factory-reset-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h4 id="factory-reset-title">恢复出厂设置？</h4>
            <p>
              这会清空当前 Agent 配置和已保存的 API Key，回到未配置状态。
              法典库、涉外执法人员人设和推理 skills 不会被删除，仍然强制生效。
            </p>
            <div className="agent-modal-actions">
              <button className="ghost-btn" onClick={() => setConfirming(false)}>
                取消
              </button>
              <button className="agent-danger" onClick={factoryReset} disabled={saving}>
                {saving ? '恢复中…' : '确认恢复'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
