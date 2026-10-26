import type { LawArticle } from './legal';

/**
 * 后端 Agent 客户端。
 *
 * 请求 /api/analyse（开发时由 vite 代理到 localhost:8787），服务端按
 * 「规划 → 调工具 → 作答」的循环推进，用 SSE 把中间过程推回来。
 *
 * 服务端没启动时 fetch 会失败，调用方自行回落到前端直连。
 */

export type AgentEvent =
  | { type: 'step'; name: string; detail?: string }
  | {
      type: 'tool';
      name: string;
      query?: string;
      articles: LawArticle[];
      mock?: boolean;
      local?: boolean;
      fallback?: boolean;
      reason?: string;
    }
  | { type: 'delta'; text: string }
  | { type: 'verify'; unmatched: string[] }
  | { type: 'done'; mock?: boolean }
  | { type: 'error'; message: string };

export interface BriefContext {
  input: string;
  title: string;
  brief: string;
  steps: string[];
  provisionIds: string[];
}

function stream(
  url: string,
  body: unknown,
  token: string,
  onEvent: (e: AgentEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
    signal,
  }).then(async (res) => {
    if (!res.ok || !res.body) throw new Error(`agent ${res.status}`);

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
        try {
          onEvent(JSON.parse(line.slice(5).trim()) as AgentEvent);
        } catch {
          /* 分片不完整，跳过 */
        }
      }
    }
  });
}

/** 情形没命中时：整段交给 Agent 研判 */
export function runAgent(
  input: string,
  token: string,
  onEvent: (e: AgentEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  return stream('/api/analyse', { input }, token, onEvent, signal);
}

/** 情形已命中时：让模型结合民警原话，给出针对这一次的研判 */
export function runBrief(
  ctx: BriefContext,
  token: string,
  onEvent: (e: AgentEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  return stream('/api/brief', ctx, token, onEvent, signal);
}
