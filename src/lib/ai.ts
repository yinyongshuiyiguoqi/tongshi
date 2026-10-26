import { provisionById, type CaseItem } from '../data/cases';

/**
 * 大模型接入层。
 *
 * 默认走本地模板（未配置 key 时）。拿到 key 后在项目根目录建 `.env.local`：
 *
 *   VITE_LLM_BASE=https://api.deepseek.com
 *   VITE_LLM_KEY=sk-xxxx
 *   VITE_LLM_MODEL=deepseek-chat
 *
 * 接口按 OpenAI 兼容格式，DeepSeek、智谱、通义、Moonshot 都可直接替换。
 *
 * 安全提醒：前端直连会把 key 打进 bundle，比赛演示可以这样跑。仓库只提交
 * `.env.example`，真 key 放 `.env.local`（已进 .gitignore）；正式上线要加一层
 * 后端代理，否则评审一查仓库就能看到。
 */

const BASE = (import.meta.env.VITE_LLM_BASE as string | undefined) ?? 'https://api.deepseek.com';
const KEY = import.meta.env.VITE_LLM_KEY as string | undefined;
const MODEL = (import.meta.env.VITE_LLM_MODEL as string | undefined) ?? 'deepseek-chat';

export const hasLLM = Boolean(KEY);

export type ChatMessage = { role: 'system' | 'user'; content: string };

export function buildMessages(item: CaseItem, input: string): ChatMessage[] {
  const provisions = item.provisionIds
    .map((id) => provisionById(id))
    .filter(Boolean)
    .map((p) => `- ${p!.law}${p!.article}（${p!.topic}）：${p!.summary}`)
    .join('\n');

  return [
    {
      role: 'system',
      content: [
        '你是涉外执法现场辅助系统，服务对象是基层民警。',
        '根据给定的情形条目与民警描述，给出一到两句研判意见，点明现场首先要核实的关键事项。',
        '不超过 80 字，不分点，不使用“首先、其次、最后”这类套话。',
        '不得补充依据条目之外的法规、数额或期限；依据不足时直接说明需要补充核验什么。',
      ].join(''),
    },
    {
      role: 'user',
      content: [
        `情形条目：${item.title}`,
        `民警描述：${input}`,
        '',
        '处置流程：',
        ...item.steps.map((s, i) => `${i + 1}. ${s}`),
        '',
        '可援引依据：',
        provisions,
        '',
        '请给出研判意见。',
      ].join('\n'),
    },
  ];
}

export async function streamAnalyse(
  item: CaseItem,
  input: string,
  onDelta: (text: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  return streamChat(buildMessages(item, input), onDelta, signal);
}

/** 流式调用，逐段回调。失败时抛出，由调用方决定是否回落到本地文本。 */
export async function streamChat(
  messages: ChatMessage[],
  onDelta: (text: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${BASE.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${KEY}`,
    },
    body: JSON.stringify({ model: MODEL, messages, stream: true, temperature: 0.2 }),
    signal,
  });

  if (!res.ok || !res.body) {
    throw new Error(`LLM ${res.status}: ${await res.text().catch(() => '')}`);
  }

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
        const json = JSON.parse(data);
        const delta = json?.choices?.[0]?.delta?.content;
        if (typeof delta === 'string' && delta) onDelta(delta);
      } catch {
        // 心跳或非法分片，跳过
      }
    }
  }
}
