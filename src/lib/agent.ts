import type { LawArticle } from './legal';
import { notifyAuthExpired } from './session';

/**
 * 后端 Agent 客户端。
 *
 * 请求 /api/analyse（开发时由 vite 代理到 localhost:8787），服务端按
 * 「规划 → 调工具 → 作答」的循环推进，用 SSE 把中间过程推回来。
 *
 * 服务端没启动时 fetch 会失败，调用方自行回落到前端直连。
 */

export interface AgentResult {
  title: string;
  judgement: string;
  steps: string[];
  scriptZh: string;
  scriptEn: string;
  note: string;
}

export interface IntlCase {
  id: string;
  title: string;
  en?: string;
  forum: string;
  year: number;
  issue: string;
  holding: string;
  relevance: string;
  source?: string;
}

export interface ChatAnswer {
  title?: string;
  judgement: string;
  steps: string[];
  scriptZh: string;
  scriptEn?: string;
  citations: string[];
  note: string;
  cases?: IntlCase[];
}

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
  | { type: 'result'; data: AgentResult; articles: LawArticle[] }
  | { type: 'chat'; data: ChatAnswer }
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
    if (res.status === 401) {
      notifyAuthExpired();
      throw new Error('登录已过期，请重新登录');
    }
    if (!res.ok || !res.body) {
      const data = (await res.json().catch(() => null)) as { message?: string } | null;
      throw new Error(data?.message || `agent ${res.status}`);
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

export interface ScriptPair {
  zh: string;
  en?: string;
}

/** 按当前情形和民警原话生成三条现场话术；失败返回空数组，由前端回落到标准话术 */
export async function generateScripts(
  ctx: BriefContext,
  token: string,
  signal?: AbortSignal,
): Promise<ScriptPair[]> {
  const res = await fetch('/api/scripts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(ctx),
    signal,
  });
  if (!res.ok) throw new Error(`scripts ${res.status}`);
  const data = (await res.json()) as { scripts?: ScriptPair[] };
  return Array.isArray(data.scripts) ? data.scripts : [];
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatContext {
  title?: string;
  brief?: string;
  provisionIds?: string[];
  baseScripts?: { zh: string; en?: string }[];
  baseSteps?: string[];
  history: ChatMessage[];
}

/** 把一段中文话术翻成目标语言，供现场念给对方听 */
export interface TranslateResult {
  text: string;
  /** 自动识别时模型给出的源语言名称 */
  from?: string;
}

export async function translateText(
  text: string,
  lang: string,
  token: string,
  signal?: AbortSignal,
  code?: string,
  detect?: boolean,
): Promise<TranslateResult> {
  const res = await fetch('/api/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ text, lang, code, detect }),
    signal,
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new Error(data?.message || `translate ${res.status}`);
  }
  const data = (await res.json()) as { text?: string; from?: string; message?: string };
  if (!data.text) throw new Error(data.message || '没有拿到译文');
  return { text: data.text, from: data.from };
}

/** 在一条已出的结果上继续追问 */
export function runChat(
  ctx: ChatContext,
  token: string,
  onEvent: (e: AgentEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  return stream('/api/chat', ctx, token, onEvent, signal);
}

export interface AgentConfigView {
  default: { base: string; model: string; hasKey: boolean };
  active: {
    base: string;
    model: string;
    hasKey: boolean;
    hasOwnKey: boolean;
    keyHint: string;
    isDefault: boolean;
    /** 演示账号使用的系统 Agent，仅演示账号为 true */
    isDemo?: boolean;
    /** 是否已保存自己的 base/model/API Key；新用户初始为 false */
    configured: boolean;
  };
  rules: { lawLibrary: string; persona: string; skills?: string[]; persistent?: string };
}

async function agentRequest(path: string, token: string, body?: unknown) {
  const res = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await res.json().catch(() => null)) as (AgentConfigView & { message?: string }) | null;
  if (!res.ok || !data) throw new Error(data?.message || 'Agent 设置请求失败');
  return data;
}

export function getAgentConfig(token: string): Promise<AgentConfigView> {
  return agentRequest('/api/agent', token);
}

export function saveAgentConfig(
  token: string,
  config: { apiKey?: string; base: string; model: string },
): Promise<AgentConfigView> {
  return agentRequest('/api/agent', token, config);
}

export function resetAgentConfig(token: string): Promise<AgentConfigView> {
  return agentRequest('/api/agent/reset', token, {});
}

export async function revealAgentKey(token: string): Promise<string> {
  const res = await fetch('/api/agent/key', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = (await res.json().catch(() => null)) as { apiKey?: string; message?: string } | null;
  if (!res.ok || !data?.apiKey) throw new Error(data?.message || '无法读取 API Key');
  return data.apiKey;
}

export async function clearAgentKey(token: string): Promise<AgentConfigView> {
  const res = await fetch('/api/agent/key', {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = (await res.json().catch(() => null)) as (AgentConfigView & { message?: string }) | null;
  if (!res.ok || !data) throw new Error(data?.message || '删除 API Key 失败');
  return data;
}

export async function testAgentConfig(
  token: string,
  config: { apiKey?: string; base: string; model: string },
): Promise<{ ok: boolean; model: string; reply: string }> {
  const res = await fetch('/api/agent/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(config),
  });
  const data = (await res.json().catch(() => null)) as
    | { ok?: boolean; model?: string; reply?: string; message?: string }
    | null;
  if (!res.ok || !data?.ok) throw new Error(data?.message || '连接检测失败');
  return { ok: true, model: data.model || config.model, reply: data.reply || '' };
}

export async function submitFeedback(
  token: string,
  payload: { message: string; contact?: string },
): Promise<{ sent: boolean; reason: string }> {
  const res = await fetch('/api/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  const data = (await res.json().catch(() => null)) as
    | { ok?: boolean; sent?: boolean; reason?: string; message?: string }
    | null;
  if (!res.ok || !data?.ok) throw new Error(data?.message || '提交失败');
  return { sent: Boolean(data.sent), reason: data.reason || '' };
}

export interface AsrResult {
  text: string;
  language: string;
  probability: number;
}

/** 上传录音，由服务端 Whisper 自动识别语言并转写 */
export async function transcribeAudio(blob: Blob, token: string): Promise<AsrResult> {
  const res = await fetch('/api/asr', {
    method: 'POST',
    headers: {
      'Content-Type': blob.type || 'application/octet-stream',
      Authorization: `Bearer ${token}`,
    },
    body: blob,
  });
  const data = (await res.json().catch(() => null)) as
    | (Partial<AsrResult> & { message?: string })
    | null;
  if (!res.ok) throw new Error(data?.message || '语音识别失败');
  return {
    text: String(data?.text || '').trim(),
    language: String(data?.language || ''),
    probability: Number(data?.probability || 0),
  };
}
