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
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.AGENT_PORT || 8787);

// ── 本地法条库 ──────────────────────────────────────────────
// 与前端情形库共用同一份数据，条号逐条对照国家法律法规数据库核过。
// 有元典 key 时走在线检索，没有时退回这里，链路不空转、也不编造条文。
const STATUTES = JSON.parse(readFileSync(path.join(ROOT, 'src/data/statutes.json'), 'utf8'));

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

async function searchLaw(query, limit = 6) {
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
      signal: AbortSignal.timeout(12000),
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
      .filter((x) => x.s >= 0.22)
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

/** 本地法条检索：关键词命中为主，主题字面重合为辅 */
function localSearch(query, limit = 4) {
  const q = String(query || '');

  const scored = STATUTES.map((s) => {
    let hit = 0;
    for (const k of s.keywords) if (q.includes(k)) hit += 1 + k.length / 4;
    let shared = 0;
    for (const ch of new Set(q)) if (s.topic.includes(ch)) shared += 0.2;
    return { s, hit, score: hit * 2 + shared };
  })
    // 必须命中至少一个关键词——只靠主题字面重合会把不相干的条文带进来
    .filter((x) => x.hit > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return {
    mock: false,
    local: true,
    articles: scored.map(({ s }) => ({
      id: s.id,
      law: s.law,
      num: s.article,
      content: s.text || s.gist,
      status: s.status,
      level: s.level,
    })),
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
async function chat(messages, { tools, toolChoice } = {}) {
  const body = {
    model: LLM_MODEL,
    messages,
    temperature: 0.2,
    ...(tools ? { tools, tool_choice: toolChoice || 'auto' } : {}),
  };

  const res = await fetch(`${LLM_BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${LLM_KEY}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) throw new Error(`模型 ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

async function chatStream(messages, onDelta) {
  const res = await fetch(`${LLM_BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${LLM_KEY}` },
    body: JSON.stringify({ model: LLM_MODEL, messages, temperature: 0.2, stream: true }),
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
const SYSTEM = [
  '你是涉外执法现场辅助系统，服务对象是基层民警。',
  '你可以调用 search_law 检索现行有效的中国法律条文。',
  '规则：',
  '1. 必须先调用 search_law 检索，拿到结果之后再作答，不要凭记忆回答；',
  '1.1 不要向民警反问或要求补充材料。信息不全时，按已知信息给出方向，并在末尾一句话说明还需核实什么；',
  '2. 只能依据检索回来的条文作答，不得编造法规名称、条号、罚款数额、期限；',
  '3. 输出先给一句判断，再说现场处置顺序，最后指出还需核实的事实，不超过 180 字；',
  '4. 检索结果不足以支撑判断时，直接说明还缺什么信息；',
  '5. 不分点编号，不用“首先、其次、最后”这类套话。',
].join('\n');

async function runAgent(input, emit) {
  const allArticles = [];
  const messages = [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: input },
  ];

  emit({ type: 'step', name: '理解现场描述' });

  if (!LLM_KEY) {
    // 无模型 key：仍然走一次真实检索，用模板组织回答，链路不空转
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

  // 第一轮：强制走一次检索，避免模型直接空谈
  const first = await chat(messages, {
    tools: TOOLS,
    toolChoice: { type: 'function', function: { name: 'search_law' } },
  });
  const msg = first?.choices?.[0]?.message ?? {};

  if (msg.tool_calls?.length) {
    // 模型有时一次发四五个检索请求；元典按次计费，只执行前两次，
    // assistant 消息同步截断，否则 tool_calls 与 tool 回包对不上会报错。
    const calls = msg.tool_calls.slice(0, 2);
    messages.push({ ...msg, tool_calls: calls });

    for (const call of calls) {
      let args = {};
      try {
        args = JSON.parse(call.function?.arguments || '{}');
      } catch {
        /* 参数解析失败就按原描述检索 */
      }
      const query = args.query || input;

      emit({ type: 'step', name: '检索法规', detail: query });
      const { articles, mock, local, fallback, reason } = await searchLaw(query);
      allArticles.push(...articles);
      emit({ type: 'tool', name: 'search_law', query, articles, mock, local, fallback, reason });

      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: articles.length
          ? articles
              .map((a) => `《${a.law}》${a.num}（${a.level}·${a.status}）：${a.content}`)
              .join('\n')
          : '未检索到相关条文',
      });
    }
  } else if (msg.content) {
    messages.push({ role: 'assistant', content: msg.content });
  }

  emit({ type: 'step', name: '组织研判' });
  let out = '';
  await chatStream(messages, (text) => {
    out += text;
    emit({ type: 'delta', text });
  });

  const bad = unmatchedCitations(out, allArticles);
  if (bad.length) emit({ type: 'verify', unmatched: bad });
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
  const allowed = new Set(articles.map((a) => `${normLaw(a.law)}|${artNum(a.num)}`));
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
    '你是涉外执法现场辅助系统，服务对象是基层民警。',
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
async function runChat({ history = [], title = '', brief = '', provisionIds = [] }, emit) {
  const arts = provisionIds
    .map((id) => STATUTES.find((s) => s.id === id))
    .filter(Boolean)
    .map((s) => ({ law: s.law, num: s.article, content: s.text || s.gist }));

  if (!LLM_KEY) {
    const text = '还没有配置模型，追问功能暂时不能用。先看上面的处置流程和依据。';
    for (const ch of text) emit({ type: 'delta', text: ch });
    emit({ type: 'done', mock: true });
    return;
  }

  const sys = [
    '你是涉外执法现场辅助系统，正在就一条已经给出处置方案的情形回答民警的追问。',
    title && `本轮情形：${title}`,
    brief && `已给的研判：${brief}`,
    arts.length ? `本案条文：${arts.map((a) => `《${a.law}》${a.num}：${a.content}`).join(' ')}` : '',
    '规则：',
    '1. 只依据上面的条文和已知信息回答，不得编造法规名称、条号、罚款数额、期限；',
    '2. 不要重复上面已经给过的处置流程，只回答这次追问的点；',
    '3. 不超过 150 字，不分点编号，不用“首先、其次、最后”这类套话；',
    '4. 不要向民警反问。信息不够就直接说还需要核实什么。',
    '5. 问题超出涉外执法范围的，说明不在本系统的服务范围。',
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
  emit({ type: 'step', name: '组织回答' });

  let out = '';
  await chatStream(messages, (t) => {
    out += t;
    emit({ type: 'delta', text: t });
  });

  const bad = unmatchedCitations(out, arts);
  if (bad.length) emit({ type: 'verify', unmatched: bad });
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
  100234: { password: 'tongshi', name: '宋定宜', unit: '派出所' },
  100235: { password: 'tongshi', name: '刘丰硕', unit: '出入境管理部门' },
  100236: { password: 'tongshi', name: '刘腾龙', unit: '巡特警' },
};

function issueToken(user) {
  const payload = { ...user, exp: Date.now() + TTL };
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

// ── HTTP ────────────────────────────────────────────────────
const MAX_BODY = 64 * 1024;
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

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > MAX_BODY) throw new Error('body too large');
    chunks.push(c);
  }
  return Buffer.concat(chunks).toString('utf8');
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
  res.writeHead(200, {
    'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
  });
  res.end(readFileSync(file));
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.writeHead(204).end();
    return;
  }

  const ip = req.socket.remoteAddress || 'unknown';

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
        corpus: STATUTES.length,
        llm: Boolean(LLM_KEY),
        model: LLM_KEY ? LLM_MODEL : null,
      }),
    );
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

  if (req.url === '/api/login' && req.method === 'POST') {
    if (tooMany(ip, 'login', 20, 60_000)) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: '尝试过于频繁，请稍后再试' }));
      return;
    }
    let badge = '';
    let password = '';
    try {
      ({ badge = '', password = '' } = JSON.parse(raw));
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: '请求格式不对' }));
      return;
    }

    const acc = ACCOUNTS[String(badge).trim()];
    if (!acc || acc.password !== String(password)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: '警号或密码不正确' }));
      return;
    }

    const user = { badge: String(badge).trim(), name: acc.name, unit: acc.unit };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ token: issueToken(user), user }));
    return;
  }

  const auth = String(req.headers.authorization || '');
  const payload = verifyToken(auth.startsWith('Bearer ') ? auth.slice(7) : '');
  if (!payload) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: '登录已失效，请重新登录' }));
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

    if (!LLM_KEY) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: '没有配置模型，暂时不能翻译' }));
      return;
    }

    try {
      const code = String(tb.code || '');
      const detect = Boolean(tb.detect);

      const result = detect
        ? await translateAuto(text, lang, code)
        : { from: '', text: await translate(text, lang, code) };

      if (!result.text) throw new Error('模型没有给出可用的译文，请换个语种或稍后重试');

      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(result));
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

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  const emit = (event) => res.write(`data: ${JSON.stringify(event)}\n\n`);

  try {
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
  } catch (err) {
    emit({ type: 'error', message: String(err?.message || err) });
  }
  res.end();
});

server.listen(PORT, () => {
  console.log(`通事 agent 已启动 → http://localhost:${PORT}`);
  console.log(`  法规检索: ${LAW_KEY ? '元典在线检索' : `本地法条库（${STATUTES.length} 条，已核验）`}`);
  console.log(`  模型:     ${LLM_KEY ? LLM_MODEL : '未配置（模板输出）'}`);
});
