import type { Provision, Scenario } from '../data/scenarios';

/**
 * 大模型接入层。
 *
 * 现在默认走 Mock（没有配置 key 时）。拿到 key 后，在项目根目录建 `.env.local`：
 *
 *   VITE_LLM_BASE=https://api.deepseek.com
 *   VITE_LLM_KEY=sk-xxxx
 *   VITE_LLM_MODEL=deepseek-chat
 *
 * 接口按 OpenAI 兼容格式调用，DeepSeek、智谱、通义、Moonshot 都可以直接用。
 *
 * 安全提醒：前端直连会把 key 打进 bundle。比赛演示可以这样跑，但仓库必须
 * 只提交 `.env.example`，真 key 放本地 `.env.local` 并写进 .gitignore；
 * 正式上线要加一层后端代理（Next.js API Route 或 Vercel Edge Function）。
 */

const BASE = (import.meta.env.VITE_LLM_BASE as string | undefined) ?? 'https://api.deepseek.com';
const KEY = import.meta.env.VITE_LLM_KEY as string | undefined;
const MODEL = (import.meta.env.VITE_LLM_MODEL as string | undefined) ?? 'deepseek-chat';

export const hasLLM = Boolean(KEY);

export type ChatMessage = { role: 'system' | 'user'; content: string };

export function buildMessages(scenario: Scenario, provisions: Provision[]): ChatMessage[] {
  const basis = provisions
    .map((p) => `- ${p.law}${p.article}（${p.topic}）：${p.summary}`)
    .join('\n');

  return [
    {
      role: 'system',
      content: [
        '你是涉外执法现场辅助系统，服务对象是基层民警。',
        '只能依据给定的依据条目作答，不得自行补充法条、数额或期限。',
        '用中文输出，先给一句判断，再说处置顺序，控制在 120 字以内。',
        '不要使用“首先、其次、最后”这类套话，不要分点编号。',
        '如果给出的依据不足以支撑结论，直接说明需要补充核验什么。',
      ].join(''),
    },
    {
      role: 'user',
      content: [
        `场景：${scenario.title}（${scenario.place}）`,
        `对方语言：${scenario.lang.name}`,
        `现场转写：${scenario.transcript}`,
        `中文译文：${scenario.translated}`,
        `已核验信息：${scenario.identity.detail}`,
        '',
        '可援引的依据：',
        basis,
        '',
        '请给出处置判断。',
      ].join('\n'),
    },
  ];
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
    body: JSON.stringify({
      model: MODEL,
      messages,
      stream: true,
      temperature: 0.2,
    }),
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
