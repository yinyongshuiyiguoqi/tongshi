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
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.AGENT_PORT || 8787);

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

// ── 工具：元典法条检索 ──────────────────────────────────────
async function searchLaw(query, limit = 6) {
  if (!LAW_KEY) return { mock: true, articles: mockArticles(query) };

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

  if (!res.ok) throw new Error(`元典 ${res.status}`);
  const json = await res.json();
  if (json?.code !== 200) throw new Error(json?.msg || '元典返回异常');

  const list = json?.extra?.fatiao ?? [];
  return {
    mock: false,
    articles: list.slice(0, limit).map((f) => ({
      id: String(f.ftid ?? ''),
      law: Array.isArray(f.fgtitle) ? f.fgtitle[0] : f.fgtitle,
      num: f.num ?? '',
      content: (f.content ?? '').replace(/\s+/g, ' ').slice(0, 300),
      status: f.sxx ?? '',
      level: f.effect1 ?? '',
    })),
  };
}

function mockArticles(query) {
  return [
    {
      id: 'mock-1',
      law: '中华人民共和国出境入境管理法',
      num: '第三十九条',
      content:
        '（示例数据，未接入检索）外国人在旅馆以外住所居住或住宿的，应当在入住后二十四小时内由本人或者留宿人，向居住地公安机关办理登记。',
      status: '现行有效',
      level: '法律',
    },
    {
      id: 'mock-2',
      law: '中华人民共和国人民警察法',
      num: '第九条',
      content:
        '（示例数据，未接入检索）为维护社会治安秩序，对有违法犯罪嫌疑的人员，经出示相应证件，可以当场盘问、检查。',
      status: '现行有效',
      level: '法律',
    },
  ];
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
async function chat(messages, { tools } = {}) {
  const body = {
    model: LLM_MODEL,
    messages,
    temperature: 0.2,
    ...(tools ? { tools, tool_choice: 'auto' } : {}),
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
  '1. 涉及法律判断时，必须先调用 search_law，不要凭记忆回答；',
  '2. 只能依据检索回来的条文作答，不得编造法规名称、条号、罚款数额、期限；',
  '3. 输出先给一句判断，再说现场处置顺序，最后指出还需核实的事实，不超过 180 字；',
  '4. 检索结果不足以支撑判断时，直接说明还缺什么信息；',
  '5. 不分点编号，不用“首先、其次、最后”这类套话。',
].join('\n');

async function runAgent(input, emit) {
  const messages = [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: input },
  ];

  emit({ type: 'step', name: '理解现场描述' });

  if (!LLM_KEY) {
    // 无模型 key：仍然走一次真实检索，用模板组织回答，链路不空转
    emit({ type: 'step', name: '检索法规' });
    const { articles, mock } = await searchLaw(input);
    emit({ type: 'tool', name: 'search_law', articles, mock });
    emit({ type: 'step', name: '组织研判' });

    const list = articles.map((a) => `《${a.law}》${a.num}`).join('、');
    const text = articles.length
      ? `未配置模型 key，以下为基于检索结果的模板输出。本次共命中 ${articles.length} 条现行依据，涉及 ${list}。建议先核实对方身份与事由，再对照上述条款确定处置方式。`
      : '未检索到相关条文，建议补充对方身份、具体行为与现场情况后重试。';
    for (const ch of text) emit({ type: 'delta', text: ch });
    emit({ type: 'done', mock: true });
    return;
  }

  // 第一轮：让模型决定要不要查、查什么
  const first = await chat(messages, { tools: TOOLS });
  const msg = first?.choices?.[0]?.message ?? {};

  if (msg.tool_calls?.length) {
    messages.push(msg);

    for (const call of msg.tool_calls) {
      let args = {};
      try {
        args = JSON.parse(call.function?.arguments || '{}');
      } catch {
        /* 参数解析失败就按原描述检索 */
      }
      const query = args.query || input;

      emit({ type: 'step', name: '检索法规', detail: query });
      const { articles, mock } = await searchLaw(query);
      emit({ type: 'tool', name: 'search_law', query, articles, mock });

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
  await chatStream(messages, (text) => emit({ type: 'delta', text }));
  emit({ type: 'done', mock: false });
}

// ── HTTP ────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.writeHead(204).end();
    return;
  }

  if (req.url === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, law: Boolean(LAW_KEY), llm: Boolean(LLM_KEY) }));
    return;
  }

  if (req.url !== '/api/analyse' || req.method !== 'POST') {
    res.writeHead(404).end('not found');
    return;
  }

  let raw = '';
  for await (const chunk of req) raw += chunk;

  let input = '';
  try {
    input = String(JSON.parse(raw).input || '').slice(0, 1000);
  } catch {
    res.writeHead(400).end('bad json');
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  const emit = (event) => res.write(`data: ${JSON.stringify(event)}\n\n`);

  try {
    await runAgent(input, emit);
  } catch (err) {
    emit({ type: 'error', message: String(err?.message || err) });
  }
  res.end();
});

server.listen(PORT, () => {
  console.log(`通事 agent 已启动 → http://localhost:${PORT}`);
  console.log(`  法规检索: ${LAW_KEY ? '已配置' : '未配置（示例数据）'}`);
  console.log(`  模型:     ${LLM_KEY ? LLM_MODEL : '未配置（模板输出）'}`);
});
