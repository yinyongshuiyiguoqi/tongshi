/**
 * 通事 Agent 服务
 *
 * 职责：接收一句现场描述，走一遍「规划 → 调工具 → 组织答案」的循环，流式返回。
 * 前端只管渲染，key 全部留在服务端，不进 bundle。
 *
 * 运行：npm run agent
 * 环境变量（可写在 .env.local，本文件会读）：
 *   LAW_API_KEY   元典开放平台 key，用于检索法条
 *   LLM_API_KEY   模型 key
 *   LLM_BASE      默认 https://api.deepseek.com
 *   LLM_MODEL     默认 deepseek-chat
 *
 * 没有 key 时以 mock 模式运行，链路完整可演示，输出标注为示例。
 */

import http from 'node:http';
import crypto from 'node:crypto';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { AsyncLocalStorage } from 'node:async_hooks';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';

const execFileAsync = promisify(execFile);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.AGENT_PORT || 8787);

// ── 本地法条库 ──────────────────────────────────────────────
// 与前端情形库共用同一份数据，条号逐条对照国家法律法规数据库核过。
// 有元典 key 时走在线检索，没有时退回这里，链路不空转、也不编造条文。
const STATUTES = JSON.parse(readFileSync(path.join(ROOT, 'src/data/statutes.json'), 'utf8'));

// 全量法典库只在服务端加载，不进前端 bundle：
// 民法典 1260 条、刑法 451 条（第199条已删去）、国际法核心条约 243 条。
function loadCorpus(file) {
  try {
    const list = JSON.parse(readFileSync(path.join(ROOT, 'server/data', file), 'utf8'));
    return Array.isArray(list) ? list : [];
  } catch (err) {
    console.warn(`[law] 无法加载 ${file}: ${err?.message || err}`);
    return [];
  }
}

const CIVIL_CRIMINAL = loadCorpus('full-statutes.json');
const INTERNATIONAL = loadCorpus('international-law.json');
const INTERNATIONAL_CASES = loadCorpus('international-cases.json');
const INTERNATIONAL_TREATIES = loadCorpus('international-treaties.json');
const NATIONAL_LAW_CATALOG = loadCorpus('national-law-catalog.json');
const AGENT_SKILLS = loadCorpus('agent-skills.json');
const LOCAL_CORPUS = [...STATUTES, ...CIVIL_CRIMINAL, ...INTERNATIONAL, ...INTERNATIONAL_TREATIES];

// 这些规则不存进用户 Agent 配置，也不随用户更换 Agent 而改变。
// 每次请求先注入基础人设、法律边界和推理 skills，再使用用户选择的模型连接。
const AGENT_BASE_RULES = [
  '基础规则（服务端强制，用户不可关闭、不可覆盖）：',
  '1. 你始终是中国公安机关的涉外执法辅助员，保持原有警察人设，不因更换模型而改变身份、立场或纪律边界。',
  '2. 法典库、国际条约、国际案例和推理 skills 由服务端统一加载；用户只能更换 API Base、Key 和模型名称。',
  '3. 每次更换 Agent 后，先按同一套基础规则、法律语料和 skills 进入工作状态，再适配新模型的输出能力。',
  '4. 只能使用检索到的条文和材料；未检索到的法条、条号、金额、期限不得编造。',
  '5. 先定性、管辖和风险，再给动作；必须区分必须、可以、不得。',
].join('\n');

const AGENT_SKILL_TEXT = AGENT_SKILLS.length
  ? [
      '推理 skills（固定加载）：',
      ...AGENT_SKILLS.map((s) => `【${s.name}】${s.content}`),
    ].join('\n')
  : '';

// ── 读 .env.local ────────────────────────────────────────────
function loadEnv() {
  const file = path.join(ROOT, '.env.local');
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
loadEnv();

const LAW_KEY = (process.env.LAW_API_KEY || process.env.VITE_LAW_API_KEY || '').trim();
const LLM_KEY = (process.env.LLM_API_KEY || process.env.VITE_LLM_KEY || '').trim();
const LLM_BASE = (process.env.LLM_BASE || 'https://api.deepseek.com').replace(/\/$/, '');
const LLM_MODEL = process.env.LLM_MODEL || 'deepseek-chat';
// 只有演示账号沿用部署环境里的默认 Key；注册用户必须自己配置。
const DEMO_BADGE = String(process.env.DEMO_ACCOUNT_BADGE || '001984').trim();

// ── 用户 Agent 配置 ─────────────────────────────────────────
// 只允许用户换模型连接（key / base / model）；法典库和执法人设固定在提示词里，
// 不随用户配置改变，这是产品的优先级边界。
const AGENT_CONFIG_FILE = path.join(ROOT, 'data', 'agent-configs.json');
const llmContext = new AsyncLocalStorage();

function readAgentConfigs() {
  try {
    const raw = readFileSync(AGENT_CONFIG_FILE, 'utf8');
    const data = JSON.parse(raw);
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  } catch {
    return {};
  }
}

function writeAgentConfigs(data) {
  mkdirSync(path.dirname(AGENT_CONFIG_FILE), { recursive: true });
  writeFileSync(AGENT_CONFIG_FILE, JSON.stringify(data, null, 2), { encoding: 'utf8', mode: 0o600 });
}

function getAgentConfig(badge) {
  const custom = readAgentConfigs()[String(badge)] || null;
  // 演示账号沿用部署环境的默认 Key；其他新用户必须自己配置。
  if (!custom || !custom.base || !custom.model) {
    if (String(badge) === DEMO_BADGE && LLM_KEY) {
      return {
        apiKey: LLM_KEY,
        base: LLM_BASE,
        model: LLM_MODEL,
        custom: false,
        ownKey: '',
        demo: true,
      };
    }
    return { apiKey: '', base: '', model: '', custom: false, ownKey: '', demo: false };
  }
  return {
    apiKey: String(custom.apiKey || ''),
    base: String(custom.base),
    model: String(custom.model),
    custom: true,
    ownKey: String(custom.apiKey || ''),
    demo: false,
  };
}

function maskKey(key) {
  const s = String(key || '');
  if (!s) return '';
  if (s.length <= 8) return '****';
  return `${s.slice(0, 3)}****${s.slice(-4)}`;
}

function agentView(badge) {
  const active = getAgentConfig(badge);
  const configured = Boolean(active.base && active.model && active.apiKey);
  return {
    // 保留字段兼容旧前端，但不再把系统默认模型暴露成“当前 Agent”。
    default: {
      base: '',
      model: '',
      hasKey: false,
    },
    active: {
      base: active.base,
      model: active.model,
      hasKey: Boolean(active.apiKey),
      hasOwnKey: Boolean(active.ownKey),
      keyHint: maskKey(active.apiKey),
      isDefault: false,
      isDemo: Boolean(active.demo),
      configured,
    },
    rules: {
      lawLibrary: `本地全文 ${LOCAL_CORPUS.length} 条；国家法律目录 ${NATIONAL_LAW_CATALOG.length} 部；国际条约核心条款 ${INTERNATIONAL_TREATIES.length} 条`,
      persona: '涉外执法人员人设，强制注入且不可关闭',
      skills: AGENT_SKILLS.map((s) => s.name),
      persistent: '更换 Agent 时，人设、法律语料和推理 skills 保持不变，先加载再工作',
    },
  };
}

// ── API Key 自动识别 ────────────────────────────────────────
// 粘贴 Key 后并发请求各家 OpenAI 兼容的 /models，哪家认这个 Key 就是哪家；
// 对没有 /models 的服务商（如智谱）再按 Key 格式和固定模型表兜底。
const AGENT_PROVIDERS = [
  {
    id: 'deepseek',
    name: 'DeepSeek',
    base: 'https://api.deepseek.com',
    recommend: ['deepseek-chat', 'deepseek-reasoner', 'deepseek-flash'],
  },
  {
    id: 'openai',
    name: 'OpenAI',
    base: 'https://api.openai.com/v1',
    recommend: ['gpt-4o-mini', 'gpt-4.1-mini', 'gpt-4o'],
  },
  {
    id: 'zhipu',
    name: '智谱 GLM',
    base: 'https://open.bigmodel.cn/api/paas/v4',
    recommend: ['glm-4-flash', 'glm-4-air', 'glm-4-plus'],
  },
  {
    id: 'dashscope',
    name: '通义千问',
    base: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    recommend: ['qwen-plus', 'qwen-turbo', 'qwen-max'],
  },
  {
    id: 'moonshot',
    name: 'Moonshot',
    base: 'https://api.moonshot.cn/v1',
    recommend: ['moonshot-v1-8k', 'moonshot-v1-32k'],
  },
  {
    id: 'siliconflow',
    name: '硅基流动',
    base: 'https://api.siliconflow.cn/v1',
    recommend: ['Qwen/Qwen2.5-7B-Instruct', 'deepseek-ai/DeepSeek-V3'],
  },
  {
    id: 'hunyuan',
    name: '腾讯混元',
    base: 'https://api.hunyuan.cloud.tencent.com/v1',
    recommend: ['hunyuan-turbos-latest', 'hunyuan-lite', 'hunyuan-pro'],
  },
  {
    id: 'qianfan',
    name: '百度千帆',
    base: 'https://qianfan.baidubce.com/v2',
    recommend: ['ernie-4.5-turbo-128k', 'ernie-speed-8k', 'ernie-4.5-8k-preview'],
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    base: 'https://generativelanguage.googleapis.com/v1beta/openai',
    recommend: ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-pro'],
  },
  {
    id: 'spark',
    name: '讯飞星火',
    base: 'https://spark-api-open.xf-yun.com/v1',
    recommend: ['generalv3.5', '4.0Ultra', 'lite'],
  },
  {
    id: 'ark',
    name: '火山方舟',
    base: 'https://ark.cn-beijing.volces.com/api/v3',
    // 方舟的模型名通常是控制台里的推理接入点 ID（ep-...），这里不写死
    recommend: [],
  },
  {
    id: 'groq',
    name: 'Groq',
    base: 'https://api.groq.com/openai/v1',
    recommend: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'],
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    base: 'https://openrouter.ai/api/v1',
    // OpenRouter 的 /models 是公开可读的，必须用一个需要鉴权的 /key 来验证 Key
    verifyPath: '/key',
    recommend: ['deepseek/deepseek-chat-v3-0324', 'openai/gpt-4o-mini'],
  },
  {
    id: 'mistral',
    name: 'Mistral',
    base: 'https://api.mistral.ai/v1',
    recommend: ['mistral-small-latest'],
  },
  {
    id: 'xai',
    name: 'xAI',
    base: 'https://api.x.ai/v1',
    recommend: ['grok-2-latest'],
  },
];

const MODEL_DENY = /embed|embedding|tts|whisper|moderation|rerank|image|dall-e|stable-diffusion|sora|bge|clip|audio|transcribe|realtime|search-preview/i;

function guessAgentProvider(apiKey) {
  const key = String(apiKey || '').trim();
  if (/^sk-or-v1-/i.test(key)) return AGENT_PROVIDERS.find((p) => p.id === 'openrouter');
  if (/^gsk_/i.test(key)) return AGENT_PROVIDERS.find((p) => p.id === 'groq');
  // 智谱的 Key 形如 id.secret
  if (/^[A-Za-z0-9]{16,}\.[A-Za-z0-9]{16,}$/.test(key)) return AGENT_PROVIDERS.find((p) => p.id === 'zhipu');
  return null;
}

function cleanModelList(provider, ids) {
  const seen = new Set();
  const models = [];
  for (const raw of ids) {
    const id = String(raw || '').trim();
    if (!id || seen.has(id) || MODEL_DENY.test(id)) continue;
    seen.add(id);
    models.push(id);
    if (models.length >= 80) break;
  }
  const recommended =
    provider.recommend.find((m) => seen.has(m)) ||
    models.find((m) => /flash|mini|turbo|chat|instruct/i.test(m)) ||
    models[0] ||
    provider.recommend[0] ||
    '';
  return { models, recommended };
}

async function probeProviderModels(provider, apiKey) {
  const base = provider.base.replace(/\/$/, '');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6500);
  try {
    // 少数服务商的 /models 可匿名读取，先打一个需要鉴权的端点确认 Key 真属于它
    if (provider.verifyPath) {
      const authRes = await fetch(`${base}${provider.verifyPath}`, {
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        signal: ctrl.signal,
      });
      if (!authRes.ok) return null;
    }
    const res = await fetch(`${base}/models`, {
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    const list = Array.isArray(data?.data)
      ? data.data
      : Array.isArray(data?.models)
        ? data.models
        : [];
    const ids = list
      .map((m) => (typeof m === 'string' ? m : m?.id))
      .filter(Boolean)
      .map(String);
    if (!ids.length) return null;
    const { models, recommended } = cleanModelList(provider, ids);
    if (!models.length) return null;
    return { models, recommended };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ── 联系我们 ────────────────────────────────────────────────
const FEEDBACK_FILE = path.join(ROOT, 'data', 'feedback.jsonl');

async function deliverFeedback(entry) {
  mkdirSync(path.dirname(FEEDBACK_FILE), { recursive: true });
  writeFileSync(FEEDBACK_FILE, JSON.stringify(entry) + '\n', { encoding: 'utf8', flag: 'a', mode: 0o600 });

  const smtpUser = String(process.env.FEEDBACK_SMTP_USER || '').trim();
  const smtpPass = String(process.env.FEEDBACK_SMTP_PASS || '').trim();
  if (!smtpUser || !smtpPass) {
    return { sent: false, reason: '邮件通道尚未配置，反馈已保存到服务器' };
  }

  const dir = await mkdtemp(path.join(os.tmpdir(), 'tongshi-feedback-'));
  const file = path.join(dir, 'feedback.json');
  try {
    writeFileSync(file, JSON.stringify(entry), 'utf8');
    await execFileAsync(
      '/usr/bin/python3',
      [path.join(ROOT, 'server', 'send_feedback.py'), file],
      { timeout: 30000, maxBuffer: 1024 * 1024 },
    );
    return { sent: true, reason: '已发送到邮箱' };
  } catch (err) {
    return { sent: false, reason: `邮件发送失败，反馈已保存：${String(err?.message || err).slice(0, 120)}` };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// ── Edge 神经语音 ───────────────────────────────────────────
// 浏览器自带 speechSynthesis 在 Windows 上往往只有 Huihui 一套嗓子，
// 这里改用 Edge 在线神经语音，同一句话能听出晓晓、云希、云健等不同人。
const TTS_VOICES = new Set([
  'zh-CN-XiaoxiaoNeural',
  'zh-CN-XiaoyiNeural',
  'zh-CN-YunxiNeural',
  'zh-CN-YunjianNeural',
  'zh-CN-YunyangNeural',
  'zh-CN-liaoning-XiaobeiNeural',
  'zh-CN-shaanxi-XiaoniNeural',
  'en-US-AriaNeural',
  'en-US-GuyNeural',
  'en-US-JennyNeural',
  'en-GB-SoniaNeural',
  'en-GB-RyanNeural',
  'ja-JP-NanamiNeural',
  'ko-KR-SunHiNeural',
  'fr-FR-DeniseNeural',
  'de-DE-KatjaNeural',
  'es-ES-ElviraNeural',
  'ru-RU-SvetlanaNeural',
  'ar-SA-ZariyahNeural',
  'th-TH-PremwadeeNeural',
  'vi-VN-HoaiMyNeural',
  'tr-TR-EmelNeural',
  'tr-TR-AhmetNeural',
  'id-ID-GadisNeural',
  'id-ID-ArdiNeural',
  'hi-IN-SwaraNeural',
  'hi-IN-MadhurNeural',
  'pt-BR-FranciscaNeural',
  'it-IT-ElsaNeural',
]);

async function synthesise(text, voice, rate = 0, pitch = 0) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'tongshi-tts-'));
  const file = path.join(dir, 'voice.mp3');
  const args = [
    '-m',
    'edge_tts',
    '--voice',
    voice,
    '--text',
    text,
    '--write-media',
    file,
    '--no-progress',
  ];
  if (rate) args.push(`--rate=${rate > 0 ? '+' : ''}${rate}%`);
  if (pitch) args.push(`--pitch=${pitch > 0 ? '+' : ''}${pitch}Hz`);
  try {
    await execFileAsync('/usr/bin/python3', args, { timeout: 30000, maxBuffer: 1024 * 1024 });
    return await readFile(file);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// ── 工具：法条检索 ──────────────────────────────────────────
// 先取本地审定库（准、免费），再用元典补覆盖面（全，但向量召回噪声大）。
// 合并时本地在前，在线结果按与查询的字面重合度过滤一次，去掉明显跑题的。
//
// 元典出任何问题（key 过期、积分不足、网络不通、接口改版）都不让它拖垮整条链路：
// 记一条日志，只返回本地结果，前端会看到「在线检索失败，已回退本地库」。

function bigrams(s) {
  const t = String(s || '').replace(/[\s，。、；：,.;:!?！？（）()【】《》""'']/g, '');
  const out = new Set();
  for (let i = 0; i < t.length - 1; i++) out.add(t.slice(i, i + 2));
  return out;
}

/** 与查询的字面重合度，用来剔除向量召回里明显不相关的结果 */
function overlap(queryGrams, text) {
  if (!queryGrams.size) return 1;
  const g = bigrams(text);
  let hit = 0;
  queryGrams.forEach((x) => {
    if (g.has(x)) hit++;
  });
  return hit / queryGrams.size;
}

async function searchLaw(query, limit = 6, timeoutMs = 12000) {
  const local = localSearch(query, 4);
  if (!LAW_KEY) return local;

  try {
    const res = await fetch('https://open.chineselaw.com/open/law_vector_search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Accept: 'application/json',
        'X-API-Key': LAW_KEY,
      },
      body: JSON.stringify({
        query,
        rewrite_flag: true,
        return_num: 18,
        fatiao_filter: { sxx: ['现行有效'] },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!res.ok) throw new Error(`元典返回 HTTP ${res.status}`);
    const json = await res.json();
    // 元典成功时业务码是 201（不是 200），2xx 一律按成功处理
    const code = Number(json?.code);
    if (!(code >= 200 && code < 300)) throw new Error(json?.msg || `元典业务码 ${json?.code}`);

    const list = json?.extra?.fatiao ?? [];
    if (!list.length) throw new Error('元典未命中任何条文');

    const qGrams = bigrams(query);
    // 「治安管理处罚法」与「治安管理处罚法(2025修订)」是同一部法，去重前先抹平
    const normLaw = (s) =>
      String(s || '')
        .replace(/[（(][^）)]*[）)]/g, '')
        .replace(/修正|修订|年版/g, '')
        .trim();
    const seen = new Set(local.articles.map((a) => `${normLaw(a.law)}|${a.num}`));

    const online = list
      .map((f) => ({
        id: String(f.ftid ?? ''),
        law: Array.isArray(f.fgtitle) ? f.fgtitle[0] : f.fgtitle,
        num: f.num ?? '',
        content: (f.content ?? '').replace(/\s+/g, ' ').slice(0, 300),
        status: f.sxx ?? '',
        level: f.effect1 ?? '',
      }))
      .filter((a) => !seen.has(`${normLaw(a.law)}|${a.num}`))
      .map((a) => ({ a, s: overlap(qGrams, `${a.law} ${a.content}`) }))
      .filter((x) => x.s >= 0.08)
      .sort((x, y) => y.s - x.s)
      .slice(0, 2)
      .map((x) => x.a);

    return {
      mock: false,
      local: online.length === 0,
      articles: [...local.articles, ...online].slice(0, limit),
    };
  } catch (err) {
    console.warn(`[law] 在线检索失败，回退本地库：${err?.message || err}`);
    return { ...local, fallback: true, reason: String(err?.message || err) };
  }
}

/** 国际案例检索：只作原则参考，不作为中国执法依据 */
function searchCases(query, limit = 2) {
  const q = String(query || '');
  const qGrams = bigrams(q);
  if (!qGrams.size) return [];

  return INTERNATIONAL_CASES
    .map((c) => {
      let keyword = 0;
      for (const k of c.keywords || []) if (q.includes(k)) keyword += 2;
      const body = `${c.title} ${c.en || ''} ${c.issue || ''} ${c.holding || ''} ${c.relevance || ''}`;
      const grams = bigrams(body);
      let shared = 0;
      qGrams.forEach((g) => {
        if (grams.has(g)) shared += 1;
      });
      return { c, score: keyword + (shared / qGrams.size) * 5 };
    })
    .filter((x) => x.score >= 0.7)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.c);
}

/** 本地法条检索：小型高频库用关键词，全量库用条文二元组重合度 */
function localSearch(query, limit = 4) {
  const q = String(query || '');
  const STOP = new Set([
    '应当', '可以', '本法', '规定', '行为', '其他', '以及', '或者', '依照',
    '进行', '有关', '机关', '公安', '人民', '国家', '法律', '依法', '予以',
  ]);
  const DOMAIN = [
    '违约', '合同', '侵权', '婚姻', '继承', '物权', '犯罪', '量刑', '故意伤害',
    '诈骗', '走私', '毒品', '非法拘禁', '正当防卫', '紧急避险', '管辖', '引渡',
    '外交豁免', '领事', '条约', '难民', '酷刑', '战争罪', '海洋权益',
  ];
  // 情形库收缩后，Agent 要接住大部分口语描述：把口语词映射成法条里的用语。
  // 只做检索扩展，不改写用户原话，也不改变法条原文。
  const EXPAND = [
    [/砸|摔|弄坏|损坏/g, '损毁'],
    [/动手|推搡|撕扯|打架/g, '殴打'],
    [/偷|扒窃|顺走/g, '盗窃'],
    [/车祸|撞车|撞人|交通事故/g, '交通事故'],
    [/喝醉|醉酒|喝了酒/g, '醉酒'],
    [/打工|干活|上班|兼职/g, '就业'],
    [/住朋友家|住在|租房|住宿/g, '住宿登记'],
    [/过期|超期|逾期|没续签/g, '非法居留'],
    [/老外|外国人|外籍人士|外国友人/g, '外国'],
  ];
  const extras = [];
  for (const [re, to] of EXPAND) if (re.test(q) && !q.includes(to)) extras.push(to);
  const qx = extras.length ? `${q} ${extras.join(' ')}` : q;
  const qGrams = bigrams(qx);
  const terms = [...new Set(qx.split(/[\s，。、；：,.;:!?！？]+/).filter((t) => t.length >= 2))];
  const lawHint = ['民法典', '刑法', '治安管理处罚法', '维也纳外交关系公约', '维也纳领事关系公约', '联合国宪章']
    .find((name) => q.includes(name));

  const scored = LOCAL_CORPUS.map((s) => {
    let hit = 0;
    for (const k of s.keywords || []) if (qx.includes(k)) hit += 1 + k.length / 4;

    const body = `${s.topic || ''} ${s.text || s.gist || ''}`;
    let exact = 0;
    for (const term of terms) if (body.includes(term)) exact += term.length >= 3 ? 2 : 1;
    for (const term of DOMAIN) if (qx.includes(term) && body.includes(term)) exact += 1.5;
    const lawBoost = lawHint && s.law.includes(lawHint) ? 3 : 0;

    let shared = 0;
    if (qGrams.size) {
      const grams = bigrams(body);
      qGrams.forEach((g) => {
        if (!STOP.has(g) && grams.has(g)) shared += 1;
      });
    }
    const useful = Math.max(1, qGrams.size - [...qGrams].filter((g) => STOP.has(g)).length);
    const sim = shared / useful;
    return { s, hit, exact, sim, score: hit * 2 + exact * 2 + sim * 4 + lawBoost };
  })
    // 小型库命中关键词，或全量库有足够条文重合才进入候选
    .filter((x) => x.hit > 0 || x.sim >= 0.16)
    .sort((a, b) => b.score - a.score || b.hit - a.hit)
    .slice(0, limit);

  return {
    mock: false,
    local: true,
    articles: scored
      .map(({ s }) => ({
        id: s.id,
        law: s.law,
        num: s.article,
        content: String(s.text || s.gist || '').slice(0, 800),
        status: s.status,
        level: s.level,
      }))
      // 小型高频库和全量库可能收录同一条（如刑法第234条），按法名+条号去重
      .filter((a, i, list) => list.findIndex((b) => b.law === a.law && b.num === a.num) === i),
  };
}

// ── 工具定义（OpenAI 兼容 function calling）──────────────────
const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'search_law',
      description:
        '检索现行有效的中国法律法规条文。需要法律依据时调用，可多次调用，每次传入不同关键词。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '检索关键词或问题，中文' },
        },
        required: ['query'],
      },
    },
  },
];

// ── 模型调用 ────────────────────────────────────────────────
async function chat(messages, { tools, toolChoice, maxTokens, responseFormat } = {}) {
  const llm = llmContext.getStore() || { apiKey: LLM_KEY, base: LLM_BASE, model: LLM_MODEL };
  const body = {
    model: llm.model,
    messages,
    temperature: 0.2,
    ...(tools ? { tools, tool_choice: toolChoice || 'auto' } : {}),
    ...(maxTokens ? { max_tokens: maxTokens } : {}),
    ...(responseFormat ? { response_format: responseFormat } : {}),
  };

  const res = await fetch(`${llm.base.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${llm.apiKey}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) throw new Error(`模型 ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

async function chatStream(messages, onDelta) {
  const llm = llmContext.getStore() || { apiKey: LLM_KEY, base: LLM_BASE, model: LLM_MODEL };
  const res = await fetch(`${llm.base.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${llm.apiKey}` },
    body: JSON.stringify({ model: llm.model, messages, temperature: 0.2, stream: true }),
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok || !res.body) throw new Error(`模型 ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split('\n\n');
    buffer = chunks.pop() ?? '';
    for (const chunk of chunks) {
      const line = chunk.split('\n').find((l) => l.startsWith('data:'));
      if (!line) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') return;
      try {
        const delta = JSON.parse(data)?.choices?.[0]?.delta?.content;
        if (delta) onDelta(delta);
      } catch {
        /* 心跳 */
      }
    }
  }
}

// ── Agent 循环 ──────────────────────────────────────────────
// 所有模型路径共用同一套执法身份，避免追问时变成“客服口吻”
const POLICE_PERSONA = [
  '你是中国公安机关的涉外执法辅助员，服务对象是一线民警，不是通用聊天助手或客服。',
  '服务范围包括所有涉及外国人的警情：治安案件、刑事案件、交通事故、求助、证件查验、住宿登记、非法居留或就业、外交豁免等。',
  '不得以“不属于涉外执法范围”为由拒绝回答；外国人被殴打、打架、涉嫌犯罪同样属于涉外警情，必须按治安或刑事案件受理思路处置。',
  '回答先判断案件性质、风险和管辖，再给民警下一步处置动作，最后说明需核实的事实和依据；不得建议放弃管辖、私下调解代替受案，也不得编造法律。',
  '信息不全时按已知信息给出方向，明确待核实项，不向民警反问。',
].join('\n');

const SYSTEM = [
  POLICE_PERSONA,
  AGENT_BASE_RULES,
  AGENT_SKILL_TEXT,
  '系统已经预先检索了现行法条，检索结果会放在用户消息里。',
  '规则：',
  '1. 只能依据用户消息中给出的条文作答，不得凭记忆补充法名、条号、罚款数额、期限；',
  '1.1 不要向民警反问或要求补充材料。信息不全时，按已知信息给出方向，并在末尾一句话说明还需核实什么；',
  '2. 检索结果不足以支撑判断时，直接说明还缺什么信息，不要编造依据；',
  '3. 输出先给一句判断，再说现场处置顺序，最后指出还需核实的事实，不超过 180 字；',
  '4. 不分点编号，不用“首先、其次、最后”这类套话；',
  '5. 先定性（刑事/行政/民事/领事/求助）、判断管辖和现场风险，再给动作；引用条文时要说明适用条件，不能只报条号；',
  '6. 处置动作区分“必须、可以、不得”，写清证据固定、告知、通知和通报环节；',
  '7. 措辞可根据场景变化，但不得改变法律结论和执法边界；始终站在中国涉外执法人员一侧。',
  '8. 情形库只保留五类高频标准流程（证件查验、住宿登记、非法居留、非法就业、涉外纠纷冲突），它只是参考。未命中情形库时按自主研判处理，不得以“未匹配”“不在范围”为由拒绝、减步骤或泛泛而谈。',
  '9. 即使没有预设，也要按“定性、管辖、风险 → 现场动作 → 证据固定 → 受案或移交 → 告知/通知/通报”的完整链条作答。',
].join('\n');

async function runAgent(input, emit) {
  const messages = [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: input },
  ];

  emit({ type: 'step', name: '理解现场描述' });

  if (!LLM_KEY) {
    emit({ type: 'step', name: '检索法规' });
    const { articles, mock, local, fallback, reason } = await searchLaw(input);
    emit({ type: 'tool', name: 'search_law', articles, mock, local, fallback, reason });
    emit({ type: 'step', name: '组织研判' });

    const list = articles.map((a) => `《${a.law}》${a.num}`).join('、');
    const text = articles.length
      ? `未配置模型 key，以下为基于检索结果的模板输出。本次共命中 ${articles.length} 条现行依据，涉及 ${list}。建议先核实对方身份与事由，再对照上述条款确定处置方式。`
      : '未检索到相关条文，建议补充对方身份、具体行为与现场情况后重试。';
    for (const ch of text) emit({ type: 'delta', text: ch });
    emit({ type: 'done', mock: true });
    return;
  }

  // 不再让思考模型做强制 tool_choice：DeepSeek Flash 的 thinking 模式会返回
  // “Thinking mode does not support this tool_choice”。改为服务端直接检索，
  // 只让模型做一次结构化研判，既避开兼容性错误，也少一轮模型往返。
  // 先查本地已核验库；本地没有命中时再走一次在线法规检索。
  // 卖淫嫖娼、殴打、住宿登记等常见警情都能直接命中本地库，不会每次等在线接口。
  emit({ type: 'step', name: '检索法规' });
  const local = localSearch(input, 6);
  const search = local.articles.length ? local : await searchLaw(input, 6, 8000);
  const { articles, mock, local: isLocal, fallback, reason } = search;
  emit({ type: 'tool', name: 'search_law', articles, mock, local: isLocal, fallback, reason });

  const lawText = articles.length
    ? articles
        .map((a) => `《${a.law}》${a.num}（${a.level}·${a.status}）：${a.content}`)
        .join('\n')
    : '本次没有检索到直接对应的条文。不要编造法条，只给现场处置方向，并明确说明需要补充或由法制部门核实。';

  emit({ type: 'step', name: '组织研判' });

  const ask =
    '根据下面检索到的条文，按这个 JSON 结构作答，只输出 JSON，不要代码块、不要解释：\n' +
    '{"title":"不超过12字的情形名","judgement":"一句判断，不超过100字",' +
    '"steps":["处置步骤1","处置步骤2","处置步骤3","处置步骤4"],' +
    '"scriptZh":"现场对当事人说的话，40到80字，礼貌口语",' +
    '"scriptEn":"scriptZh 的英文",' +
    '"note":"还需核实什么，一句话"}\n\n' +
    '质量要求：\n' +
    '1. judgement 必须写明案件性质和管辖；有可用条文时，必须点出具体法名、条号和处罚幅度；没有可用条文时明确说“本次未检索到直接条文”，不得编造。\n' +
    '2. steps 给 4 到 6 步，按现场先后顺序写可执行动作，至少覆盖：风险控制与人员分离、身份与豁免核验、受案与调查取证、告知/通知/通报或移交。涉外案件要写清领事通报、出入境通报等适用环节；没有该环节就省略，不要硬凑。\n' +
    '3. 没有情形库预设时，按你自己的定性研判给出完整处置链，不要写“未匹配情形库”“建议咨询其他部门”来替代处置方向；确实需要法制、外事或上级机关介入的，写成其中一个具体动作。\n' +
    '4. scriptZh 要能直接照念，点明要求对方配合的具体事项；不要写“依法处理”“妥善处置”这类空话，不要用首先、其次、最后。\n\n' +
    `民警原话：${input}\n\n可用条文：\n${lawText}`;

  let data = null;
  let raw = '';
  try {
    const r = await chat([...messages, { role: 'user', content: ask }]);
    raw = String(r?.choices?.[0]?.message?.content || '').trim();
    const body = raw.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    const obj = JSON.parse(body);
    if (obj && (obj.judgement || obj.steps?.length)) {
      data = {
        title: String(obj.title || '').slice(0, 20),
        judgement: String(obj.judgement || '').slice(0, 200),
        steps: Array.isArray(obj.steps) ? obj.steps.slice(0, 6).map((s) => String(s).slice(0, 120)) : [],
        scriptZh: String(obj.scriptZh || '').slice(0, 300),
        scriptEn: String(obj.scriptEn || '').slice(0, 400),
        note: String(obj.note || '').slice(0, 160),
      };
    }
  } catch {
    /* 结构化失败就退回整段文字 */
  }

  if (!data) {
    // 模型没按格式来或调用失败：把原文按字推回去，界面照样能看
    const text =
      raw ||
      (articles.length
        ? `AI 服务暂时没有返回结构化结果。已检索到 ${articles.length} 条现行依据，请先核对上方条文，再按现场情况处置。`
        : 'AI 服务暂时没有返回结果。请稍后重试，或先按现场安全处置，并咨询法制部门。');
    for (const ch of text) emit({ type: 'delta', text: ch });
    const bad = unmatchedCitations(text, articles);
    if (bad.length) emit({ type: 'verify', unmatched: bad });
    emit({ type: 'done', mock: true });
    return;
  }

  const allArticles = articles;
  const joined = [data.judgement, ...data.steps, data.scriptZh, data.note].join(' ');
  const bad = unmatchedCitations(joined, allArticles);
  if (bad.length) emit({ type: 'verify', unmatched: bad });

  emit({ type: 'result', data, articles: allArticles });
  emit({ type: 'done', mock: false });
}

// ── 依据校验 ────────────────────────────────────────────────
// 模型答完再看一眼：它引用的《法》条号，是不是真在本次检索结果里。
// 不在的标出来交给民警人工核，而不是假装没看见。
const CN_NUM = { 零: 0, 〇: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 百: 100 };

function artNum(s) {
  const t = String(s || '').replace(/[第条\s]/g, '');
  if (/^\d+$/.test(t)) return Number(t);
  let total = 0;
  let cur = 0;
  for (const ch of t) {
    const v = CN_NUM[ch];
    if (v === undefined) continue;
    if (v === 10) cur = (cur || 1) * 10;
    else if (v === 100) {
      total += (cur || 1) * 100;
      cur = 0;
    } else cur += v;
  }
  return total + cur;
}

const normLaw = (s) =>
  String(s || '')
    .replace(/[（(][^）)]*[）)]/g, '')
    .replace(/修正|修订|年版|中华人民共和国/g, '')
    .trim();

function unmatchedCitations(text, articles) {
  const allowed = new Set();
  for (const a of articles) {
    const law = normLaw(a.law);
    for (const num of String(a.num || '').split(/[、,，和及\s]+/).filter(Boolean)) {
      allowed.add(`${law}|${artNum(num)}`);
    }
  }
  const found = [];
  const re = /《([^》]{2,60})》\s*(第[一二三四五六七八九十百零〇\d]+条)/g;
  let m;
  while ((m = re.exec(text))) {
    const key = `${normLaw(m[1])}|${artNum(m[2])}`;
    if (!allowed.has(key)) found.push(`《${m[1]}》${m[2]}`);
  }
  return [...new Set(found)];
}

// ── 命中情形后的个性化研判 ──────────────────────────────────
// 情形库给的是审定过的通用流程；这里让模型结合民警的原话，说清这次该抓什么。
async function runBrief({ input, title, brief, steps, provisionIds = [] }, emit) {
  const arts = provisionIds
    .map((id) => STATUTES.find((s) => s.id === id))
    .filter(Boolean)
    .map((s) => ({
      law: s.law,
      num: s.article,
      content: s.text || s.gist,
      status: s.status,
      level: s.level,
    }));

  emit({ type: 'step', name: '匹配情形库', detail: title });
  emit({ type: 'tool', name: 'search_law', articles: arts, mock: false, local: !LAW_KEY });

  if (!LLM_KEY) {
    const text = brief || '';
    for (const ch of text) emit({ type: 'delta', text: ch });
    emit({ type: 'done', mock: true });
    return;
  }

  const sys = [
    POLICE_PERSONA,
    AGENT_BASE_RULES,
    AGENT_SKILL_TEXT,
    '下面给出的是系统已匹配到的情形和人工审定的处置流程，以及对应的现行条文。',
    '你的任务不是复述流程，而是结合民警的原话，指出这一次现场该抓的重点、容易出错的地方。',
    '规则：',
    '1. 只能依据给出的条文说话，不得编造法规名称、条号、罚款数额、期限；',
    '2. 不要重复“先表明身份、出示证件”这类流程里已经写明的步骤；',
    '3. 不超过 120 字，不分点编号，不用“首先、其次、最后”这类套话；',
    '4. 信息不全时按已知信息给方向，末尾一句话说明还需核实什么。',
  ].join('\n');

  const ctx = [
    `民警描述：${input}`,
    `匹配情形：${title}`,
    `审定要点：${brief}`,
    `处置流程：${steps.map((s, i) => `${i + 1}. ${s}`).join(' ')}`,
    `可用条文：${arts.map((a) => `《${a.law}》${a.num}：${a.content}`).join('\n')}`,
  ].join('\n');

  emit({ type: 'step', name: '研判现场重点' });

  let out = '';
  await chatStream(
    [
      { role: 'system', content: sys },
      { role: 'user', content: ctx },
    ],
    (t) => {
      out += t;
      emit({ type: 'delta', text: t });
    },
  );

  const bad = unmatchedCitations(out, arts);
  if (bad.length) emit({ type: 'verify', unmatched: bad });
  emit({ type: 'done', mock: false });
}

// ── 追问：在一条已出的结果上继续问 ──────────────────────────
// 民警看完处置方案常常还有一句「那他要是不配合呢」。
// 这里带着前面几轮对话和本案条文继续问模型，不给工具、不查库，避免跑题。
async function runChat({ history = [], title = '', brief = '', provisionIds = [], baseScripts = [], baseSteps = [] }, emit) {
  // 全量本地语料用于校验引用；提示词只放本案相关条文，避免上下文过大。
  const allArts = LOCAL_CORPUS.map((s) => ({
    law: s.law,
    num: s.article,
    content: s.text || s.gist,
    status: s.status,
    level: s.level,
  }));
  const caseArts = provisionIds
    .map((id) => STATUTES.find((s) => s.id === id))
    .filter(Boolean)
    .map((s) => ({ law: s.law, num: s.article, content: s.text || s.gist }));
  const searchQuery = history
    .filter((m) => m.role === 'user')
    .slice(-2)
    .map((m) => String(m.content || ''))
    .join(' ');
  const searchedArts = localSearch(searchQuery, 8).articles.map((a) => ({
    law: a.law,
    num: a.num,
    content: a.content,
  }));
  const relevantArts = [...caseArts, ...searchedArts].filter(
    (a, i, list) => list.findIndex((b) => b.law === a.law && b.num === a.num) === i,
  );
  const promptArts = relevantArts.length
    ? relevantArts.slice(0, 8)
    : LOCAL_CORPUS.slice(0, 40).map((s) => ({
        law: s.law,
        num: s.article,
        content: s.text || s.gist,
      }));

  if (!LLM_KEY) {
    const text = '还没有配置模型，追问功能暂时不能用。先看上面的处置流程和依据。';
    for (const ch of text) emit({ type: 'delta', text: ch });
    emit({ type: 'done', mock: true });
    return;
  }

  const lawText = promptArts
    .map((a) => `《${a.law}》${a.num}：${a.content}`)
    .join('\n');

  const caseQuery = history
    .filter((m) => m.role === 'user')
    .slice(-2)
    .map((m) => String(m.content || ''))
    .join(' ');
  const cases = searchCases(caseQuery, 2);
  const caseText = cases.length
    ? cases
        .map((c) => `${c.title}（${c.forum}，${c.year}）：${c.holding} 与本警情的关联：${c.relevance}`)
        .join('\n')
    : '本次未匹配到直接相关的国际案例。';

  const inheritedSteps = Array.isArray(baseSteps)
    ? baseSteps.map((s) => String(s || '').trim()).filter(Boolean).slice(0, 6)
    : [];
  const inheritedScripts = Array.isArray(baseScripts)
    ? baseScripts
        .map((s) => String(s?.zh || s || '').trim())
        .filter(Boolean)
        .slice(0, 3)
    : [];

  const sys = [
    POLICE_PERSONA,
    AGENT_BASE_RULES,
    AGENT_SKILL_TEXT,
    '你在回答民警对一条已经给出的处置方案提出的追问。',
    title && `本轮情形：${title}`,
    brief && `已给研判：${brief}`,
    inheritedSteps.length ? `第一次回答的处置步骤：${inheritedSteps.join('；')}` : '',
    inheritedScripts.length ? `第一次回答的现场话术：${inheritedScripts.join('；')}` : '',
    '本次追问必须延续第一次回答的身份称呼、处置基线和话术语气，不要另起炉灶。',
    caseArts.length
      ? `本案重点条文：${caseArts.map((a) => `《${a.law}》${a.num}`).join('、')}`
      : '',
    '下面是可引用的现行条文，只能引用这里出现的内容，不得编造条号、金额、期限：',
    lawText,
    '下面是可供类比的国际案例摘要。它们只用于帮助理解国际法原则，不进入中国情形库，也不是中国法律依据，不能直接套用结论：',
    caseText,
    '输出要求：只输出一个 JSON 对象，不要 markdown、不要解释。格式：',
    '{"title":"本次追问的简短标题","judgement":"先判断这次追问涉及的性质、风险和管辖，1-2句","steps":["民警下一步动作1","动作2","动作3","动作4"],"scriptZh":"一句可直接对当事人说的中文","scriptEn":"对应的自然英文","citations":["《法律名》第X条"],"note":"还需要核实的事实"}',
    '硬性规则：',
    '1. 你是中国公安机关的涉外执法辅助员，必须站在民警现场处置角度回答；',
    '2. 涉及外国人被殴打、打架、涉嫌犯罪，属于涉外警情，按治安/刑事案件受理思路处理，不得说“不在涉外执法范围”；',
    '3. 先受案/控制风险/救助伤者，再核实身份、伤情、是否报警、对方国籍等涉外环节；',
    '4. 不得建议放弃管辖、不得用私下调解代替受案、不得编造法律；',
    '5. 不要向民警反问；信息不足写进 note。',
    '6. 只输出一个合法 JSON；字符串内不要出现真实换行，不要使用未转义的英文双引号。',
    '7. steps 必须给出 3-5 条可执行动作；scriptZh 和 scriptEn 必须填写；不要只返回 judgement。',
    '8. 先定性、管辖和风险，再给动作；引用法条要说明适用条件，不能只报条号。',
    '9. 明确区分必须、可以、不得；写清证据固定、告知、通知和通报环节。',
    '10. 话术可以根据场景更换开场和措辞，但保持中国涉外执法人员的立场和边界，不得改变法律结论。',
    '11. citations 必须来自上面的可引用条文；如果找不到合适条文，citations 留空，并在 note 说明需要核实。',
  ]
    .filter(Boolean)
    .join('\n');

  const messages = [
    { role: 'system', content: sys },
    ...history.slice(-12).map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: String(m.content || '').slice(0, 1000),
    })),
  ];

  emit({ type: 'step', name: '理解追问' });
  emit({ type: 'step', name: '按现场处置结构回答' });

  let raw = '';
  try {
    let res;
    try {
      res = await chat(messages, {
        maxTokens: 1200,
        responseFormat: { type: 'json_object' },
      });
    } catch {
      // 某些 OpenAI 兼容网关不支持 response_format，退回普通模式再试一次
      res = await chat(messages, { maxTokens: 1200 });
    }
    raw = String(res?.choices?.[0]?.message?.content || '').trim();
  } catch (err) {
    emit({ type: 'error', message: String(err?.message || err) });
    emit({ type: 'done', mock: false });
    return;
  }

  let data = parseModelJson(raw) || structuredFallback(raw);

  // 模型偶尔返回空串或半截 JSON：再要求它只补一个合法 JSON，避免直接把
  // “模型返回格式异常”丢给民警。
  const incomplete =
    !data ||
    String(data.judgement || '').includes('模型返回格式异常') ||
    !Array.isArray(data.steps) ||
    !data.steps.length ||
    !data.scriptZh ||
    !data.scriptEn;
  if (incomplete) {
    try {
      const repair = await chat(
        [
          ...messages,
          { role: 'assistant', content: String(raw || '').slice(0, 3000) || '{"ok":false}' },
          {
            role: 'user',
            content:
              '上一条不是合法的结构化回答。请只重新输出一个合法 JSON 对象，字段为 title、judgement、steps、scriptZh、scriptEn、citations、note；不要 markdown，不要解释。',
          },
        ],
        { maxTokens: 1200, responseFormat: { type: 'json_object' } },
      );
      const repaired = String(repair?.choices?.[0]?.message?.content || '').trim();
      data = parseModelJson(repaired) || structuredFallback(repaired);
    } catch {
      /* 修复失败时使用下面的本地兜底 */
    }
  }

  if (!data || String(data.judgement || '').includes('模型返回格式异常')) {
    data = {
      title: title || '继续追问',
      judgement: brief || '继续按第一次回答的处置基线处理：先控制风险，再核实身份和现场事实。',
      steps: inheritedSteps.length
        ? inheritedSteps
        : [
            '先控制现场风险，分开当事双方并核实身份。',
            '依法受案调查，固定证据并制作笔录。',
            '按管辖和涉外程序报告相关部门。',
          ],
      scriptZh:
        inheritedScripts[0] ||
        '请配合我们核实身份和现场情况，相关事项会依法处理。',
      scriptEn: '',
      citations: relevantArts.slice(0, 3).map((a) => `《${a.law}》${a.num}`),
      note: '本次模型未返回完整结构，以上沿用第一次回答的处置基线，请结合现场事实核实。',
    };
  }

  const answer = {
    title: String(data?.title || '').trim() || title || '继续追问',
    judgement: String(data?.judgement || '').trim(),
    steps: Array.isArray(data?.steps)
      ? data.steps.map((s) => String(s).trim()).filter(Boolean).slice(0, 5)
      : [],
    scriptZh: String(data?.scriptZh || '').trim().slice(0, 300),
    scriptEn: String(data?.scriptEn || '').trim().slice(0, 500),
    citations: Array.isArray(data?.citations)
      ? data.citations.map((s) => String(s).trim()).filter(Boolean).slice(0, 5)
      : [],
    note: String(data?.note || '').trim().slice(0, 300),
    cases,
  };

  if (!answer.citations.length && relevantArts.length) {
    answer.citations = relevantArts.slice(0, 3).map((a) => `《${a.law}》${a.num}`);
  }
  if (!answer.steps.length) {
    answer.steps = inheritedSteps.length
      ? inheritedSteps
      : [
          '先控制现场风险，分开当事双方并核实身份。',
          '依法受案调查，固定证据并制作笔录。',
          '按管辖和涉外程序报告相关部门。',
        ];
  }
  if (!answer.scriptZh) {
    answer.scriptZh =
      inheritedScripts[0] || '请配合我们核实身份和现场情况，相关事项会依法处理。';
  }
  if (!answer.scriptEn) {
    answer.scriptEn = 'Please cooperate with our identity and situation verification; the matter will be handled in accordance with the law.';
  }

  const bad = unmatchedCitations(answer.citations.join(' '), allArts);
  if (bad.length) emit({ type: 'verify', unmatched: bad });
  emit({ type: 'chat', data: answer });
  emit({ type: 'done', mock: false });
}

// ── 话术翻译 ────────────────────────────────────────────────
// 模型偶尔会把中文原样返回（实测日语遇到过长句时会这样），
// 所以翻完要先验一下：是不是原文、是不是真的换成目标语言的文字。
const SCRIPT_RE = {
  ja: /[぀-ヿ]/, // 假名
  ko: /[가-힯]/, // 谚文
  ru: /[Ѐ-ӿ]/, // 西里尔
  ar: /[؀-ۿ]/, // 阿拉伯
  th: /[฀-๿]/, // 泰文
  hi: /[ऀ-ॿ]/, // 天城文
};

function looksTranslated(out, src, code) {
  const o = String(out || '').trim();
  if (!o || o === String(src || '').trim()) return false;
  const re = SCRIPT_RE[String(code || '').slice(0, 2).toLowerCase()];
  if (re && !re.test(o)) return false;
  return true;
}

/**
 * 不知道对方说什么语言时用这个：让模型先认语言再翻译。
 * 返回 { from, text }，认不出来就退回普通翻译。
 */
async function translateAuto(text, lang, code) {
  const sys =
    `你是中国警察的现场口译。先判断下面这段话是哪种语言，再翻译成${lang}。` +
    '只输出一行 JSON，不要代码块、不要解释，格式：{"from":"源语言的中文名称","text":"译文"}。';

  const r = await chat([
    { role: 'system', content: sys },
    { role: 'user', content: text },
  ]);
  const raw = String(r?.choices?.[0]?.message?.content || '').trim();
  const body = raw.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();

  try {
    const obj = JSON.parse(body);
    const from = String(obj?.from || '').slice(0, 20);
    const out = String(obj?.text || '').trim();

    // 源语言和目标语言是同一个，原样返回，别让模型来回折腾
    if (from && from === lang) return { from, text: text.trim() };

    if (out && out !== text.trim()) return { from, text: out };
  } catch {
    /* 落到普通翻译 */
  }

  const fallback = await translate(text, lang, code);
  return { from: '', text: fallback };
}

async function translate(text, lang, code) {
  const base =
    `你是中国警察的现场口译。把用户给出的中文翻译成${lang}，用于当面告知外籍当事人。` +
    '要求：语气礼貌、句子简短、保持原意，只输出译文，不要解释，不要加引号，不要保留中文原文。';

  const ask = (system) =>
    chat([
      { role: 'system', content: system },
      { role: 'user', content: text },
    ]).then((r) => String(r?.choices?.[0]?.message?.content || '').trim());

  let out = await ask(base);
  if (looksTranslated(out, text, code)) return out;

  out = await ask(`${base}\n注意：上一次输出原样照抄了中文。这次必须全部换成${lang}，不能留一个汉字。`);
  return looksTranslated(out, text, code) ? out : '';
}

// ── 按当前场景生成现场话术 ──────────────────────────────────
// 情形库里的 scripts 是通用模板；这里再按民警这句原话生成三句更贴现场的：
// 开场、要求配合、收尾。模型失败时前端回落到情形库模板。
async function runScripts({ input, title, brief, steps = [], provisionIds = [] }) {
  if (!LLM_KEY) return [];

  const arts = provisionIds
    .map((id) => STATUTES.find((s) => s.id === id))
    .filter(Boolean)
    .map((s) => `《${s.law}》${s.article}：${s.text || s.gist}`);

  const res = await chat([
    {
      role: 'system',
      content: [
        POLICE_PERSONA,
        AGENT_BASE_RULES,
        AGENT_SKILL_TEXT,
        '根据下面的情形、民警原话和可用条文，写三条现场可以直接照着念的话术：',
        '第一条：开场，表明执法身份并说明为什么拦下对方；',
        '第二条：针对本次描述里的具体情况，要求对方配合核实；',
        '第三条：收尾，告知下一步怎么办或请对方稍等。',
        '必须结合民警原话里的地点、人数、行为、伤情、语言等细节，不要写通用模板。',
        '每条中文不超过 60 字，配一版自然英文；不要编造法条、金额、期限；',
        '只输出 JSON，格式：{"scripts":[{"zh":"...","en":"..."}]}，不要 markdown。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `匹配情形：${title}`,
        `民警原话：${input}`,
        `研判要点：${brief}`,
        `处置流程：${steps.map((s, i) => `${i + 1}. ${s}`).join(' ')}`,
        `可用条文：${arts.join('\n')}`,
      ].join('\n'),
    },
  ]);

  const raw = String(res?.choices?.[0]?.message?.content || '').trim();
  const jsonText = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed?.scripts)) return [];
  return parsed.scripts
    .filter((s) => s && typeof s.zh === 'string' && s.zh.trim())
    .slice(0, 3)
    .map((s) => ({
      zh: String(s.zh).trim().slice(0, 300),
      en: typeof s.en === 'string' ? s.en.trim().slice(0, 500) : '',
    }));
}

// ── 登录与会话 ──────────────────────────────────────────────
// 演示账号写在服务端，前端拿不到；令牌用 HMAC 签名，带 12 小时有效期。
const DEFAULT_SECRET = 'tongshi-demo-secret-change-me';
const SECRET = process.env.SESSION_SECRET || DEFAULT_SECRET;
const TTL = 12 * 3600 * 1000;

// 默认密钥只能用于本机演示；部署到公网必须另配，否则谁都能伪造令牌
if (SECRET === DEFAULT_SECRET && process.env.NODE_ENV === 'production') {
  console.error('拒绝启动：线上必须设置 SESSION_SECRET 环境变量。');
  process.exit(1);
}

const ACCOUNTS = {
  '001984': { password: 'tongshi', name: '外事通', unit: '派出所' },
  100234: { password: 'tongshi', name: '宋定宜', unit: '派出所' },
  100235: { password: 'tongshi', name: '刘丰硕', unit: '出入境管理部门' },
  100236: { password: 'tongshi', name: '刘腾龙', unit: '巡特警' },
};

// ── 手机号注册用户 ─────────────────────────────────────────
// 密码只存 scrypt 哈希与随机盐，不存明文；文件在 data/users.json。
const USERS_FILE = path.join(ROOT, 'data', 'users.json');

function readUsers() {
  try {
    const raw = readFileSync(USERS_FILE, 'utf8');
    const data = JSON.parse(raw);
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  } catch {
    return {};
  }
}

function writeUsers(users) {
  mkdirSync(path.dirname(USERS_FILE), { recursive: true });
  writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), {
    encoding: 'utf8',
    mode: 0o600,
  });
}

// 账号资料覆盖层：昵称、头像、修改后的密码哈希。
// 手机用户和内置警号都保存在这里，登录时合并到用户对象。
const PROFILES_FILE = path.join(ROOT, 'data', 'profiles.json');

function readProfiles() {
  try {
    const raw = readFileSync(PROFILES_FILE, 'utf8');
    const data = JSON.parse(raw);
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  } catch {
    return {};
  }
}

function writeProfiles(profiles) {
  mkdirSync(path.dirname(PROFILES_FILE), { recursive: true });
  writeFileSync(PROFILES_FILE, JSON.stringify(profiles, null, 2), {
    encoding: 'utf8',
    mode: 0o600,
  });
}

function accountKey(user) {
  return user?.phone ? `phone:${user.phone}` : `badge:${user?.badge || ''}`;
}

function mergeProfile(user, profile) {
  return {
    ...user,
    name: String(profile?.name || user.name || '').slice(0, 24),
    ...(profile?.avatar ? { avatar: String(profile.avatar) } : {}),
  };
}

function profileWithPassword(profile) {
  return profile && profile.hash && profile.salt ? profile : null;
}

// ── 登录设备会话 ─────────────────────────────────────────────
// token 里带 sid；服务端保存设备、IP、时间，用户可以在账号管理里逐个注销。
const SESSIONS_FILE = path.join(ROOT, 'data', 'sessions.json');

function readSessions() {
  try {
    const raw = readFileSync(SESSIONS_FILE, 'utf8');
    const data = JSON.parse(raw);
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  } catch {
    return {};
  }
}

function writeSessions(sessions) {
  mkdirSync(path.dirname(SESSIONS_FILE), { recursive: true });
  writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2), { encoding: 'utf8', mode: 0o600 });
}

function pruneSessions(sessions) {
  const now = Date.now();
  let changed = false;
  for (const [id, session] of Object.entries(sessions)) {
    if (!session || Number(session.expiresAt || 0) <= now) {
      delete sessions[id];
      changed = true;
    }
  }
  if (changed) writeSessions(sessions);
  return sessions;
}

function deviceLabel(ua) {
  const s = String(ua || '');
  const os = /iPhone/i.test(s)
    ? 'iPhone'
    : /iPad/i.test(s)
      ? 'iPad'
      : /Android/i.test(s)
        ? 'Android'
        : /Mac OS X|Macintosh/i.test(s)
          ? 'Mac'
          : /Windows/i.test(s)
            ? 'Windows'
            : /Linux/i.test(s)
              ? 'Linux'
              : '未知设备';
  const browser = /MicroMessenger/i.test(s)
    ? '微信'
    : /Edg\//i.test(s)
      ? 'Edge'
      : /Chrome\//i.test(s)
        ? 'Chrome'
        : /Firefox\//i.test(s)
          ? 'Firefox'
          : /Safari\//i.test(s)
            ? 'Safari'
            : '浏览器';
  return `${os} · ${browser}`;
}

function createSession(user, meta = {}) {
  const id = crypto.randomBytes(12).toString('hex');
  const now = Date.now();
  const sessions = pruneSessions(readSessions());
  sessions[id] = {
    id,
    key: accountKey(user),
    badge: String(user.badge || ''),
    phone: String(user.phone || ''),
    device: deviceLabel(meta.ua),
    ua: String(meta.ua || '').slice(0, 500),
    ip: String(meta.ip || 'unknown').slice(0, 80),
    createdAt: new Date(now).toISOString(),
    lastSeen: now,
    expiresAt: now + TTL,
  };
  writeSessions(sessions);
  return id;
}

function touchSession(sid) {
  const sessions = pruneSessions(readSessions());
  const session = sessions[sid];
  if (!session) return false;
  const now = Date.now();
  if (now - Number(session.lastSeen || 0) > 60_000) {
    session.lastSeen = now;
    writeSessions(sessions);
  }
  return true;
}

function revokeSessionsFor(key) {
  const sessions = readSessions();
  let changed = false;
  for (const [id, session] of Object.entries(sessions)) {
    if (session?.key === key) {
      delete sessions[id];
      changed = true;
    }
  }
  if (changed) writeSessions(sessions);
}

function makePassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return { salt, hash };
}

function checkPassword(password, user) {
  try {
    const candidate = crypto.scryptSync(String(password), String(user.salt), 64);
    const expected = Buffer.from(String(user.hash), 'hex');
    return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
  } catch {
    return false;
  }
}

function phoneBadge(phone) {
  return `U${crypto.createHash('sha256').update(String(phone)).digest('hex').slice(0, 12)}`;
}

function phoneUser(record) {
  return {
    badge: phoneBadge(record.phone),
    name: record.name || '手机用户',
    unit: record.unit || '个人用户',
    phone: record.phone,
    ...(record.email ? { email: record.email } : {}),
  };
}

function currentUserFromPayload(payload) {
  const phone = String(payload.phone || '');
  const record = phone ? readUsers()[phone] : null;
  return {
    badge: payload.badge,
    name: payload.name,
    unit: payload.unit,
    ...(phone ? { phone } : {}),
    ...(record?.email ? { email: record.email } : payload.email ? { email: payload.email } : {}),
  };
}

function phoneError(phone) {
  if (!/^1[3-9]\d{9}$/.test(phone)) return '请输入 11 位中国大陆手机号';
  return '';
}

function issueToken(user, meta = {}) {
  // 头像 data URL 可能很大，不放进 token；token 只保存身份字段。
  const { avatar, ...identity } = user;
  const sid = createSession(user, meta);
  const payload = { ...identity, sid, exp: Date.now() + TTL };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const mac = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return `${body}.${mac}`;
}

function verifyToken(token) {
  if (!token) return null;
  const [body, mac] = String(token).split('.');
  if (!body || !mac) return null;
  const expect = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  const a = Buffer.from(mac);
  const b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return payload.exp > Date.now() ? payload : null;
  } catch {
    return null;
  }
}

// ── 密码找回 ────────────────────────────────────────────────
const RESET_FILE = path.join(ROOT, 'data', 'reset-codes.json');

function readResetCodes() {
  try {
    const raw = readFileSync(RESET_FILE, 'utf8');
    const data = JSON.parse(raw);
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  } catch {
    return {};
  }
}

function writeResetCodes(data) {
  mkdirSync(path.dirname(RESET_FILE), { recursive: true });
  writeFileSync(RESET_FILE, JSON.stringify(data, null, 2), { encoding: 'utf8', mode: 0o600 });
}

function hashResetCode(code, salt) {
  return crypto.createHash('sha256').update(`${salt}:${code}`).digest('hex');
}

function maskEmail(email) {
  const [name, domain] = String(email || '').split('@');
  if (!domain) return '';
  return `${name.slice(0, 2)}***@${domain}`;
}

async function sendResetEmail(email, code) {
  const smtpUser = String(process.env.FEEDBACK_SMTP_USER || '').trim();
  const smtpPass = String(process.env.FEEDBACK_SMTP_PASS || '').trim();
  if (!smtpUser || !smtpPass) throw new Error('邮件通道尚未配置，请联系管理员');
  const dir = await mkdtemp(path.join(os.tmpdir(), 'tongshi-reset-'));
  const file = path.join(dir, 'reset.json');
  try {
    writeFileSync(file, JSON.stringify({ to: email, code }), 'utf8');
    await execFileAsync('/usr/bin/python3', [path.join(ROOT, 'server', 'send_reset_code.py'), file], {
      timeout: 30000,
      maxBuffer: 1024 * 1024,
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// ── HTTP ────────────────────────────────────────────────────
const MAX_BODY = 256 * 1024;
const HITS = new Map();

/** 简易限流：按 IP + 路径计数，窗口过期自动清理 */
function tooMany(ip, route, max, windowMs) {
  const key = `${ip}|${route}`;
  const now = Date.now();
  const arr = (HITS.get(key) || []).filter((t) => now - t < windowMs);
  arr.push(now);
  if (HITS.size > 5000) HITS.clear();
  HITS.set(key, arr);
  return arr.length > max;
}

async function readRawBody(req, max = MAX_BODY) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > max) throw new Error('body too large');
    chunks.push(c);
  }
  return Buffer.concat(chunks);
}

async function readBody(req) {
  return (await readRawBody(req)).toString('utf8');
}

// 线上部署时前端与接口同源：dist 由这里一并托管，省掉一层反向代理
const DIST = path.join(ROOT, 'dist');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function serveStatic(req, res) {
  if (!existsSync(DIST)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('前端还没构建，先执行 npm run build');
    return;
  }
  let p = decodeURIComponent((req.url || '/').split('?')[0]);
  if (p === '/' || p === '') p = '/index.html';
  const file = path.join(DIST, p.replace(/^[/\\]+/, ''));
  if (!file.startsWith(DIST) || !existsSync(file)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('not found');
    return;
  }
  const ext = path.extname(file).toLowerCase();

  // 页面本身不缓存，改完刷新就能看到；
  // assets 带内容哈希，可以长缓存；背景图名字固定，用短一点的缓存。
  const cache = ext === '.html'
    ? 'no-cache, must-revalidate'
    : file.includes(`${path.sep}assets${path.sep}`)
      ? 'public, max-age=31536000, immutable'
      : 'public, max-age=86400';

  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': cache,
  });
  res.end(readFileSync(file));
}

// 模型的 JSON 偶尔会在字符串里带真实换行或尾逗号，直接 JSON.parse 会失败。
// 先做轻量修复；仍失败时按字段抽取，避免把整段 JSON 当成“研判”展示给民警。
function parseModelJson(raw) {
  const text = String(raw || '').trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  const body = text.slice(start, end + 1);

  const candidates = [
    body,
    body.replace(/,\s*([}\]])/g, '$1'),
  ];

  // 把字符串内部的真实换行、回车、制表符转成合法的 JSON 转义
  let fixed = '';
  let inString = false;
  let escaped = false;
  for (const ch of body) {
    if (inString) {
      if (escaped) {
        escaped = false;
        fixed += ch;
      } else if (ch === '\\') {
        escaped = true;
        fixed += ch;
      } else if (ch === '"') {
        inString = false;
        fixed += ch;
      } else if (ch === '\n') {
        fixed += '\\n';
      } else if (ch === '\r') {
        fixed += '\\r';
      } else if (ch === '\t') {
        fixed += '\\t';
      } else {
        fixed += ch;
      }
    } else {
      if (ch === '"') inString = true;
      fixed += ch;
    }
  }
  candidates.push(fixed, fixed.replace(/,\s*([}\]])/g, '$1'));

  for (const candidate of candidates) {
    try {
      const value = JSON.parse(candidate);
      if (value && typeof value === 'object') return value;
    } catch {
      /* 继续尝试下一种修复 */
    }
  }
  return null;
}

function extractJsonString(raw, key) {
  const re = new RegExp(`"${key}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`, 's');
  const m = re.exec(String(raw || ''));
  return m ? m[1].replace(/\\n/g, '\n').replace(/\\"/g, '"') : '';
}

function extractJsonArray(raw, key) {
  const re = new RegExp(`"${key}"\\s*:\\s*\\[([\\s\\S]*?)\\]`, 's');
  const m = re.exec(String(raw || ''));
  if (!m) return [];
  return [...m[1].matchAll(/"((?:\\.|[^"\\])*)"/gs)]
    .map((x) => x[1].replace(/\\n/g, ' ').replace(/\\"/g, '"').trim())
    .filter(Boolean);
}

function structuredFallback(raw) {
  const judgement = extractJsonString(raw, 'judgement');
  const scriptZh = extractJsonString(raw, 'scriptZh');
  const scriptEn = extractJsonString(raw, 'scriptEn');
  const note = extractJsonString(raw, 'note');
  const steps = extractJsonArray(raw, 'steps');
  const citations = extractJsonArray(raw, 'citations');
  if (judgement || steps.length || scriptZh || note) {
    return { judgement, steps, scriptZh, scriptEn, citations, note };
  }
  return {
    judgement: '模型返回格式异常，本次未生成结构化研判，请稍后重试。',
    steps: [],
    scriptZh: '',
    scriptEn: '',
    citations: [],
    note: '原始回答未能解析，建议重新提问。',
  };
}

const ALLOWED_ORIGINS = new Set([
  'https://tongshizhifa.cn',
  'https://www.tongshizhifa.cn',
  'http://localhost:5180',
  'http://127.0.0.1:5180',
]);

const server = http.createServer(async (req, res) => {
  const origin = String(req.headers.origin || '');
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.writeHead(204).end();
    return;
  }

  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const ip = forwarded || req.socket.remoteAddress || 'unknown';
  const ua = String(req.headers['user-agent'] || '');

  if ((req.url || '').startsWith('/api/')) {
    // 接口路径，继续往下走
  } else if (req.method === 'GET' || req.method === 'HEAD') {
    serveStatic(req, res);
    return;
  }

  if (req.url === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        ok: true,
        law: LAW_KEY ? 'api' : 'local',
        corpus: LOCAL_CORPUS.length,
      lawCatalog: NATIONAL_LAW_CATALOG.length,
        llm: Boolean(LLM_KEY),
        model: LLM_KEY ? LLM_MODEL : null,
      }),
    );
    return;
  }

  // 语音输入：浏览器录音后直接发原始音频，由本地 ASR 自动识别语言。
  // engine=whisper 供翻译器处理阿拉伯语、俄语等多语种；默认走 SenseVoice。
  if (req.url.startsWith('/api/asr') && req.method === 'POST') {
    const auth = String(req.headers.authorization || '');
    const payload = verifyToken(auth.startsWith('Bearer ') ? auth.slice(7) : '');
    if (!payload) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: '登录已失效，请重新登录' }));
      return;
    }
    if (tooMany(ip, 'asr', 20, 60_000)) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: '语音识别过于频繁，请稍后再试' }));
      return;
    }

    let audio;
    try {
      audio = await readRawBody(req, 24 * 1024 * 1024);
    } catch {
      res.writeHead(413, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: '录音文件过大' }));
      return;
    }
    if (!audio.length) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: '没有收到录音' }));
      return;
    }

    try {
      const engine = new URL(req.url, 'http://tongshi.local').searchParams.get('engine') === 'whisper'
        ? 'whisper'
        : '';
      const upstream = await fetch(`http://127.0.0.1:8790/asr${engine ? `?engine=${engine}` : ''}`, {
        method: 'POST',
        headers: {
          'Content-Type': String(req.headers['content-type'] || 'application/octet-stream'),
        },
        body: audio,
        signal: AbortSignal.timeout(45000),
      });
      const body = await upstream.text();
      res.writeHead(upstream.status, {
        'Content-Type': 'application/json; charset=utf-8',
      });
      res.end(body);
    } catch (err) {
      res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ message: `语音识别服务暂不可用：${String(err?.message || err).slice(0, 80)}` }));
    }
    return;
  }

  let raw = '';
  try {
    raw = await readBody(req);
  } catch {
    res.writeHead(413, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: '请求体过大' }));
    return;
  }

  // 忘记密码：向绑定邮箱发送 6 位验证码
  if (req.url === '/api/password/request' && req.method === 'POST') {
    if (tooMany(ip, 'password-request', 5, 10 * 60_000)) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: '请求过于频繁，请稍后再试' }));
      return;
    }
    let body = {};
    try {
      body = JSON.parse(raw);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: '请求格式不对' }));
      return;
    }
    const phone = String(body.phone || '').replace(/\s+/g, '').trim();
    if (phoneError(phone)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: phoneError(phone) }));
      return;
    }
    const record = readUsers()[phone];
    if (!record) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: '这个手机号还没有注册' }));
      return;
    }
    if (!record.email) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: '该账号还没有绑定找回邮箱，请联系管理员' }));
      return;
    }

    const code = String(crypto.randomInt(100000, 1000000));
    const salt = crypto.randomBytes(12).toString('hex');
    const codes = readResetCodes();
    codes[phone] = {
      salt,
      hash: hashResetCode(code, salt),
      email: record.email,
      expiresAt: Date.now() + 10 * 60 * 1000,
      attempts: 0,
    };
    writeResetCodes(codes);
    try {
      await sendResetEmail(record.email, code);
    } catch (err) {
      delete codes[phone];
      writeResetCodes(codes);
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: String(err?.message || err).slice(0, 120) }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true, email: maskEmail(record.email) }));
    return;
  }

  // 忘记密码：校验验证码并重设密码
  if (req.url === '/api/password/reset' && req.method === 'POST') {
    if (tooMany(ip, 'password-reset', 5, 10 * 60_000)) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: '请求过于频繁，请稍后再试' }));
      return;
    }
    let body = {};
    try {
      body = JSON.parse(raw);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: '请求格式不对' }));
      return;
    }
    const phone = String(body.phone || '').replace(/\s+/g, '').trim();
    const code = String(body.code || '').trim();
    const password = String(body.password || '');
    if (password.length < 8 || password.length > 72) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: '新密码长度需为 8–72 位' }));
      return;
    }
    const codes = readResetCodes();
    const entry = codes[phone];
    if (!entry || Number(entry.expiresAt || 0) <= Date.now()) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: '验证码已过期，请重新获取' }));
      return;
    }
    if (Number(entry.attempts || 0) >= 5) {
      delete codes[phone];
      writeResetCodes(codes);
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: '验证码错误次数过多，请重新获取' }));
      return;
    }
    if (hashResetCode(code, entry.salt) !== entry.hash) {
      entry.attempts = Number(entry.attempts || 0) + 1;
      codes[phone] = entry;
      writeResetCodes(codes);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: '验证码不正确' }));
      return;
    }
    const users = readUsers();
    const record = users[phone];
    if (!record) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: '账号不存在' }));
      return;
    }
    const made = makePassword(password);
    record.salt = made.salt;
    record.hash = made.hash;
    writeUsers(users);
    const profiles = readProfiles();
    const profile = profiles[`phone:${phone}`];
    if (profile) {
      profile.salt = made.salt;
      profile.hash = made.hash;
      profiles[`phone:${phone}`] = profile;
      writeProfiles(profiles);
    }
    delete codes[phone];
    writeResetCodes(codes);
    revokeSessionsFor(`phone:${phone}`);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.url === '/api/register' && req.method === 'POST') {
    if (tooMany(ip, 'register', 5, 60_000)) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: '注册过于频繁，请稍后再试' }));
      return;
    }

    let body = {};
    try {
      body = JSON.parse(raw);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: '请求格式不对' }));
      return;
    }

    const phone = String(body.phone || '').replace(/\s+/g, '');
    const password = String(body.password || '');
    const name = String(body.name || '').trim().slice(0, 20) || '手机用户';
    const unit = String(body.unit || '').trim().slice(0, 30) || '个人用户';
    const email = String(body.email || '').trim().toLowerCase().slice(0, 120);
    const phoneMsg = phoneError(phone);
    if (phoneMsg) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: phoneMsg }));
      return;
    }
    if (password.length < 8 || password.length > 72) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: '密码长度需为 8–72 位' }));
      return;
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: '找回邮箱格式不正确' }));
      return;
    }

    const users = readUsers();
    if (users[phone]) {
      res.writeHead(409, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: '这个手机号已经注册，请直接登录' }));
      return;
    }

    const { salt, hash } = makePassword(password);
    users[phone] = {
      phone,
      name,
      unit,
      email,
      salt,
      hash,
      createdAt: new Date().toISOString(),
    };
    writeUsers(users);

    const user = phoneUser(users[phone]);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ token: issueToken(user, { ip, ua }), user }));
    return;
  }

  if (req.url === '/api/login' && req.method === 'POST') {
    if (tooMany(ip, 'login', 20, 60_000)) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: '尝试过于频繁，请稍后再试' }));
      return;
    }
    let badge = '';
    let phone = '';
    let password = '';
    try {
      ({ badge = '', phone = '', password = '' } = JSON.parse(raw));
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: '请求格式不对' }));
      return;
    }

    const account = String(phone || badge).replace(/\s+/g, '').trim();
    const profiles = readProfiles();
    if (/^1[3-9]\d{9}$/.test(account)) {
      const record = readUsers()[account];
      const profile = profiles[`phone:${account}`];
      const passwordRecord = profileWithPassword(profile) || record;
      if (!record || !checkPassword(password, passwordRecord)) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: '手机号或密码不正确' }));
        return;
      }
      const user = mergeProfile(phoneUser(record), profile);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ token: issueToken(user, { ip, ua }), user }));
      return;
    }

    const acc = ACCOUNTS[account];
    const profile = profiles[`badge:${account}`];
    const passwordRecord = profileWithPassword(profile);
    const passwordOk = passwordRecord
      ? checkPassword(password, passwordRecord)
      : Boolean(acc && acc.password === String(password));
    if (!acc || !passwordOk) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: '警号或密码不正确' }));
      return;
    }

    const user = mergeProfile({ badge: account, name: acc.name, unit: acc.unit }, profile);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ token: issueToken(user, { ip, ua }), user }));
    return;
  }

  const auth = String(req.headers.authorization || '');
  const payload = verifyToken(auth.startsWith('Bearer ') ? auth.slice(7) : '');
  if (!payload) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: '登录已失效，请重新登录' }));
    return;
  }
  // 新 token 带 sid；被用户注销的设备会在这里失效。旧 token 兼容放行。
  if (payload.sid && !touchSession(String(payload.sid))) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: '该登录设备已被注销，请重新登录' }));
    return;
  }
  const agentCfg = getAgentConfig(payload.badge);
  const agentReady = Boolean(agentCfg.base && agentCfg.model && agentCfg.apiKey);
  const setupMessage = '还没有配置 AI Agent。请先在「我的 → Agent 设置」选择服务商并填写你自己的 API Key。';

  // 当前账号资料：昵称、头像、手机号/警号
  if (req.url === '/api/account' && req.method === 'GET') {
    const profiles = readProfiles();
    const baseUser = currentUserFromPayload(payload);
    const user = mergeProfile(baseUser, profiles[accountKey(baseUser)]);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ user }));
    return;
  }

  // 登录设备列表
  if (req.url === '/api/account/sessions' && req.method === 'GET') {
    const profiles = readProfiles();
    const baseUser = currentUserFromPayload(payload);
    const key = accountKey(baseUser);
    const sessions = pruneSessions(readSessions());
    const list = Object.values(sessions)
      .filter((session) => session?.key === key)
      .sort((a, b) => Number(b.lastSeen || 0) - Number(a.lastSeen || 0))
      .map((session) => ({
        id: session.id,
        device: session.device,
        ip: session.ip,
        createdAt: session.createdAt,
        lastSeen: new Date(Number(session.lastSeen || 0)).toISOString(),
        current: session.id === payload.sid,
      }));
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ sessions: list, current: payload.sid || '' }));
    return;
  }

  // 注销某个登录设备
  if (req.url === '/api/account/sessions/revoke' && req.method === 'POST') {
    let sb = {};
    try {
      sb = JSON.parse(raw);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: '请求格式不对' }));
      return;
    }
    const baseUser = currentUserFromPayload(payload);
    const key = accountKey(baseUser);
    const id = String(sb.id || '');
    const sessions = readSessions();
    const target = sessions[id];
    if (!target || target.key !== key) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: '这个登录设备不存在或已注销' }));
      return;
    }
    const current = id === payload.sid;
    delete sessions[id];
    writeSessions(sessions);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true, current }));
    return;
  }

  // 退出当前设备（前端退出登录时调用）
  if (req.url === '/api/logout' && req.method === 'POST') {
    if (payload.sid) {
      const sessions = readSessions();
      delete sessions[String(payload.sid)];
      writeSessions(sessions);
    }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // 注销账号：只允许手机号注册账号，必须再次验证当前密码
  if (req.url === '/api/account/delete' && req.method === 'POST') {
    let db = {};
    try {
      db = JSON.parse(raw);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: '请求格式不对' }));
      return;
    }
    if (!payload.phone) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: '预置演示账号不能注销' }));
      return;
    }
    const password = String(db.password || '');
    const users = readUsers();
    const record = users[payload.phone];
    if (!record) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: '账号不存在或已注销' }));
      return;
    }
    const profiles = readProfiles();
    const key = accountKey({ badge: payload.badge, phone: payload.phone });
    const profile = profiles[key];
    const passwordRecord = profileWithPassword(profile) || record;
    if (!checkPassword(password, passwordRecord)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: '当前密码不正确' }));
      return;
    }
    delete users[payload.phone];
    writeUsers(users);
    delete profiles[key];
    writeProfiles(profiles);
    const configs = readAgentConfigs();
    delete configs[String(payload.badge || '')];
    writeAgentConfigs(configs);
    revokeSessionsFor(key);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // 修改昵称、头像、密码。改密码必须校验当前密码；客户端还要再确认一次。
  if (req.url === '/api/account' && req.method === 'PATCH') {
    if (tooMany(ip, 'account', 20, 60_000)) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: '操作过于频繁，请稍后再试' }));
      return;
    }
    let body = {};
    try {
      body = JSON.parse(raw);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: '请求格式不对' }));
      return;
    }

    const profiles = readProfiles();
    const baseUser = currentUserFromPayload(payload);
    const key = accountKey(baseUser);
    const profile = { ...(profiles[key] || {}) };
    let touched = false;

    if (body.name !== undefined) {
      const nextName = String(body.name || '').trim().slice(0, 24);
      if (!nextName) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: '昵称不能为空' }));
        return;
      }
      profile.name = nextName;
      touched = true;
    }

    if (body.avatar !== undefined) {
      const avatar = String(body.avatar || '');
      if (avatar) {
        if (!/^data:image\/(?:png|jpe?g|webp);base64,/i.test(avatar) || avatar.length > 200_000) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ message: '头像格式不支持或图片过大' }));
          return;
        }
        profile.avatar = avatar;
      } else {
        delete profile.avatar;
      }
      touched = true;
    }

    if (body.email !== undefined) {
      const email = String(body.email || '').trim().toLowerCase().slice(0, 120);
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: '找回邮箱格式不正确' }));
        return;
      }
      if (!payload.phone) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: '预置账号不支持绑定找回邮箱' }));
        return;
      }
      const users = readUsers();
      if (!users[payload.phone]) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: '账号不存在' }));
        return;
      }
      users[payload.phone].email = email;
      writeUsers(users);
      baseUser.email = email;
      touched = true;
    }

    const newPassword = String(body.newPassword || '');
    if (newPassword) {
      const currentPassword = String(body.currentPassword || '');
      if (!currentPassword) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: '请输入当前密码' }));
        return;
      }
      if (newPassword.length < 8 || newPassword.length > 72) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: '新密码长度需为 8–72 位' }));
        return;
      }

      const users = readUsers();
      const record = payload.phone ? users[payload.phone] : null;
      const profilePassword = profileWithPassword(profile);
      const accountPassword = ACCOUNTS[payload.badge];
      const passwordOk = profilePassword
        ? checkPassword(currentPassword, profilePassword)
        : record
          ? checkPassword(currentPassword, record)
          : Boolean(accountPassword && accountPassword.password === currentPassword);
      if (!passwordOk) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: '当前密码不正确' }));
        return;
      }

      const { salt, hash } = makePassword(newPassword);
      profile.salt = salt;
      profile.hash = hash;
      touched = true;
    }

    if (!touched) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: '没有需要保存的修改' }));
      return;
    }

    profiles[key] = profile;
    writeProfiles(profiles);

    // 刷新会话：旧 token 不作废其他设备，只把当前设备换成新 sid；
    // 改密码时则让所有旧设备全部失效。
    if (newPassword) {
      revokeSessionsFor(key);
    } else if (payload.sid) {
      const sessions = readSessions();
      delete sessions[String(payload.sid)];
      writeSessions(sessions);
    }

    if (payload.phone) {
      const users = readUsers();
      if (users[payload.phone] && profile.name) {
        users[payload.phone].name = profile.name;
        writeUsers(users);
      }
    }

    const user = mergeProfile(baseUser, profile);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ user, token: issueToken(user, { ip, ua }) }));
    return;
  }

  // 联系我们：落盘 + 可选 SMTP 自动发到反馈邮箱
  if (req.url === '/api/feedback' && req.method === 'POST') {
    if (tooMany(ip, 'feedback', 6, 60_000)) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: '提交过于频繁，请稍后再试' }));
      return;
    }

    let fb = {};
    try {
      fb = JSON.parse(raw);
    } catch {
      res.writeHead(400).end('bad json');
      return;
    }

    const message = String(fb.message || '').trim().slice(0, 2000);
    const contact = String(fb.contact || '').trim().slice(0, 200);
    if (message.length < 2) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: '请先写反馈内容' }));
      return;
    }

    const entry = {
      at: new Date().toISOString(),
      badge: String(payload.badge || ''),
      name: String(payload.name || ''),
      contact,
      message,
    };
    try {
      const result = await deliverFeedback(entry);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, ...result }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: String(err?.message || err) }));
    }
    return;
  }

  // Agent 连接设置：只改模型连接；法典库和执法人设固定注入，不可通过这里关闭。
  if (req.url === '/api/agent' && (req.method === 'GET' || req.method === 'POST')) {
    if (tooMany(ip, 'agent-config', 20, 60_000)) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: '操作过于频繁，请稍后再试' }));
      return;
    }
    const badge = String(payload.badge || '');
    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(agentView(badge)));
      return;
    }

    let ab = {};
    try {
      ab = JSON.parse(raw);
    } catch {
      res.writeHead(400).end('bad json');
      return;
    }

    const configs = readAgentConfigs();
    const existing = configs[badge] || {};
    const apiKey = typeof ab.apiKey === 'string' && ab.apiKey.trim()
      ? ab.apiKey.trim()
      : String(existing.apiKey || '');
    const base = String(ab.base || existing.base || '').trim().replace(/\/$/, '');
    const model = String(ab.model || existing.model || '').trim();
    if (!apiKey) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: '请先填写你自己的 API Key' }));
      return;
    }
    if (!base || !model) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: '请选择服务商或填写 API 地址和模型名称' }));
      return;
    }

    let parsed;
    try {
      parsed = new URL(base);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'API 地址格式不正确' }));
      return;
    }
    if (!['http:', 'https:'].includes(parsed.protocol) || !model) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'API 地址或模型名称不正确' }));
      return;
    }

    configs[badge] = {
      apiKey: apiKey.slice(0, 200),
      base: base.slice(0, 300),
      model: model.slice(0, 100),
    };
    writeAgentConfigs(configs);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(agentView(badge)));
    return;
  }

  if (req.url === '/api/agent/reset' && req.method === 'POST') {
    const badge = String(payload.badge || '');
    const configs = readAgentConfigs();
    delete configs[badge];
    writeAgentConfigs(configs);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(agentView(badge)));
    return;
  }

  // 查看/复制/删除用户自己的 API Key（系统默认 Key 不暴露给前端）
  if (req.url === '/api/agent/key') {
    const badge = String(payload.badge || '');
    const configs = readAgentConfigs();
    const custom = configs[badge] || {};

    if (req.method === 'GET') {
      if (!custom.apiKey) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: '还没有保存自己的 API Key，请先配置 Agent' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ apiKey: custom.apiKey }));
      return;
    }

    if (req.method === 'DELETE') {
      if (custom.apiKey) {
        delete custom.apiKey;
        if (Object.keys(custom).length) configs[badge] = custom;
        else delete configs[badge];
        writeAgentConfigs(configs);
      }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(agentView(badge)));
      return;
    }

    res.writeHead(405).end('method not allowed');
    return;
  }

  // 根据 API Key 自动识别服务商、API 地址和可用模型
  if (req.url === '/api/agent/probe' && req.method === 'POST') {
    if (tooMany(ip, 'agent-probe', 12, 60_000)) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: '识别过于频繁，请稍后再试' }));
      return;
    }

    let pb = {};
    try {
      pb = JSON.parse(raw);
    } catch {
      res.writeHead(400).end('bad json');
      return;
    }

    const cfg = getAgentConfig(payload.badge);
    const apiKey = String(pb.apiKey || cfg.apiKey || '').trim();
    if (!apiKey) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: '请先填写 API Key' }));
      return;
    }

    const guessed = guessAgentProvider(apiKey);
    const ordered = guessed
      ? [guessed, ...AGENT_PROVIDERS.filter((p) => p.id !== guessed.id)]
      : AGENT_PROVIDERS;

    // 并发探测：能认这个 Key 的 /models 就是对应的服务商
    const results = await Promise.all(
      ordered.map(async (provider) => ({ provider, hit: await probeProviderModels(provider, apiKey) })),
    );
    const found = results.find((r) => r.hit);

    const view = (provider, models, recommended, verified, detection) => ({
      ok: true,
      verified,
      detection,
      provider: { id: provider.id, name: provider.name, base: provider.base },
      models,
      recommended,
    });

    if (found?.hit) {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(view(found.provider, found.hit.models, found.hit.recommended, true, 'network')));
      return;
    }

    // 智谱等不开放 /models 的服务商：按 Key 格式给固定模型表，交给用户确认
    if (guessed && !guessed.verifyPath) {
      const { models, recommended } = cleanModelList(guessed, guessed.recommend);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(view(guessed, models, recommended, false, 'key')));
      return;
    }

    res.writeHead(422, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ message: '没能自动识别这个 Key，请手动选择服务商或填写 API 地址' }));
    return;
  }

  // 测试当前/待保存的模型连接
  if (req.url === '/api/agent/test' && req.method === 'POST') {
    if (tooMany(ip, 'agent-test', 10, 60_000)) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: '检测过于频繁，请稍后再试' }));
      return;
    }

    let tb = {};
    try {
      tb = JSON.parse(raw);
    } catch {
      res.writeHead(400).end('bad json');
      return;
    }

    const cfg = getAgentConfig(payload.badge);
    const apiKey = String(tb.apiKey || cfg.apiKey || '').trim();
    const base = String(tb.base || cfg.base || '').trim().replace(/\/$/, '');
    const model = String(tb.model || cfg.model || '').trim();
    let parsed;
    try {
      parsed = new URL(base);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'API 地址格式不正确' }));
      return;
    }
    if (!['http:', 'https:'].includes(parsed.protocol) || !apiKey || !model) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'API Key、地址或模型名称不完整' }));
      return;
    }

    try {
      const reply = await llmContext.run(
        { apiKey, base, model, custom: true, ownKey: apiKey },
        () => chat([{ role: 'user', content: '只回复两个字：正常' }], { maxTokens: 12 }),
      );
      const text = String(reply?.choices?.[0]?.message?.content || '').trim();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, model, reply: text.slice(0, 40) }));
    } catch (err) {
      res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ message: String(err?.message || err) }));
    }
    return;
  }

  // 神经语音合成：返回 MP3，前端用 audio 播放
  if (req.url === '/api/tts' && req.method === 'POST') {
    if (tooMany(ip, 'tts', 30, 60_000)) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: '语音请求过于频繁，请稍后再试' }));
      return;
    }

    let tb = {};
    try {
      tb = JSON.parse(raw);
    } catch {
      res.writeHead(400).end('bad json');
      return;
    }

    const text = String(tb.text || '').slice(0, 500).trim();
    const voice = String(tb.voice || '').trim();
    const rate = Math.max(-40, Math.min(40, Number(tb.rate) || 0));
    const pitch = Math.max(-60, Math.min(60, Number(tb.pitch) || 0));
    if (!text || !TTS_VOICES.has(voice)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: '缺少文本或音色不支持' }));
      return;
    }

    try {
      const audio = await synthesise(text, voice, rate, pitch);
      res.writeHead(200, {
        'Content-Type': 'audio/mpeg',
        'Content-Length': audio.length,
        'Cache-Control': 'no-store',
      });
      res.end(audio);
    } catch (err) {
      res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ message: String(err?.message || err) }));
    }
    return;
  }

  // 话术翻译：现场念给对方听，返回整段译文，不需要流式
  if (req.url === '/api/translate' && req.method === 'POST') {
    if (tooMany(ip, 'translate', 30, 60_000)) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: '请求过于频繁，请稍后再试' }));
      return;
    }

    let tb = {};
    try {
      tb = JSON.parse(raw);
    } catch {
      res.writeHead(400).end('bad json');
      return;
    }

    const text = String(tb.text || '').slice(0, 600);
    const lang = String(tb.lang || '').slice(0, 20);
    if (!text || !lang) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: '缺少话术或目标语言' }));
      return;
    }

    if (!agentReady) {
      res.writeHead(409, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: setupMessage }));
      return;
    }

    try {
      const code = String(tb.code || '');
      const detect = Boolean(tb.detect);

      const result = await llmContext.run(agentCfg, async () =>
        detect
          ? await translateAuto(text, lang, code)
          : { from: '', text: await translate(text, lang, code) },
      );

      if (!result.text) throw new Error('模型没有给出可用的译文，请换个语种或稍后重试');

      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(result));
    } catch (err) {
      res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ message: String(err?.message || err) }));
    }
    return;
  }

  // 按当前场景生成三条现场话术（非流式，返回 JSON）
  if (req.url === '/api/scripts' && req.method === 'POST') {
    if (tooMany(ip, 'scripts', 20, 60_000)) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: '请求过于频繁，请稍后再试' }));
      return;
    }

    let sb = {};
    try {
      sb = JSON.parse(raw);
    } catch {
      res.writeHead(400).end('bad json');
      return;
    }

    const input = String(sb.input || '').slice(0, 1000);
    if (!input) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: '缺少现场描述' }));
      return;
    }
    if (!agentReady) {
      res.writeHead(409, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: setupMessage }));
      return;
    }

    try {
      const scripts = await llmContext.run(agentCfg, () =>
        runScripts({
          input,
          title: String(sb.title || '').slice(0, 60),
          brief: String(sb.brief || '').slice(0, 400),
          steps: Array.isArray(sb.steps) ? sb.steps.slice(0, 8).map((s) => String(s).slice(0, 200)) : [],
          provisionIds: Array.isArray(sb.provisionIds)
            ? sb.provisionIds.slice(0, 6).map((s) => String(s))
            : [],
        }),
      );
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ scripts }));
    } catch (err) {
      res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ message: String(err?.message || err) }));
    }
    return;
  }

  if (req.url !== '/api/analyse' && req.url !== '/api/brief' && req.url !== '/api/chat') {
    res.writeHead(404).end('not found');
    return;
  }
  if (req.method !== 'POST') {
    res.writeHead(405).end('method not allowed');
    return;
  }
  if (tooMany(ip, 'analyse', 40, 60_000)) {
    res.writeHead(429, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: '请求过于频繁，请稍后再试' }));
    return;
  }

  let body = {};
  try {
    body = JSON.parse(raw);
  } catch {
    res.writeHead(400).end('bad json');
    return;
  }

  const isBrief = req.url === '/api/brief';
  const isChat = req.url === '/api/chat';
  const input = String(body.input || '').slice(0, 1000);

  const chatHistory = Array.isArray(body.history) ? body.history.slice(-12) : [];
  const lastAsk = String(chatHistory[chatHistory.length - 1]?.content || '').slice(0, 1000);
  const needInput = isChat ? lastAsk : input;

  if (!needInput) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: isChat ? '缺少追问内容' : '缺少现场描述' }));
    return;
  }
  if (!agentReady) {
    res.writeHead(409, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: setupMessage }));
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  const emit = (event) => res.write(`data: ${JSON.stringify(event)}\n\n`);

  try {
    await llmContext.run(agentCfg, async () => {
    if (isChat) {
      await runChat(
        {
          history: chatHistory,
          title: String(body.title || '').slice(0, 60),
          brief: String(body.brief || '').slice(0, 400),
          provisionIds: Array.isArray(body.provisionIds)
            ? body.provisionIds.slice(0, 6).map((s) => String(s))
            : [],
        },
        emit,
      );
    } else if (isBrief) {
      await runBrief(
        {
          input,
          title: String(body.title || '').slice(0, 60),
          brief: String(body.brief || '').slice(0, 400),
          steps: Array.isArray(body.steps) ? body.steps.slice(0, 8).map((s) => String(s).slice(0, 200)) : [],
          provisionIds: Array.isArray(body.provisionIds)
            ? body.provisionIds.slice(0, 6).map((s) => String(s))
            : [],
        },
        emit,
      );
    } else {
      await runAgent(input, emit);
    }
    });
  } catch (err) {
    emit({ type: 'error', message: String(err?.message || err) });
  }
  res.end();
});

server.listen(PORT, () => {
  console.log(`通事 agent 已启动 → http://localhost:${PORT}`);
  console.log(`  法规检索: ${LAW_KEY ? '元典在线检索' : `本地法条库（${LOCAL_CORPUS.length} 条）`}`);
  console.log(`  模型:     ${LLM_KEY ? LLM_MODEL : '未配置（模板输出）'}`);
});
