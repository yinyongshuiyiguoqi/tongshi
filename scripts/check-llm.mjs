/**
 * 联通检测：读 .env.local，真的发一次请求，告诉你卡在哪。
 *
 * 用法：npm run check
 */

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadEnv() {
  const file = path.join(ROOT, '.env.local');
  if (!existsSync(file)) {
    console.log('✗ 找不到 .env.local');
    console.log('  先把 .env.example 复制成 .env.local，再填 LLM_API_KEY');
    process.exit(1);
  }
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
  }
}
loadEnv();

const KEY = process.env.LLM_API_KEY || process.env.VITE_LLM_KEY || '';
const BASE = (process.env.LLM_BASE || 'https://api.deepseek.com').replace(/\/$/, '');
const MODEL = process.env.LLM_MODEL || 'deepseek-chat';

console.log(`模型：${MODEL}`);
console.log(`地址：${BASE}`);
console.log(`密钥：${KEY ? KEY.slice(0, 6) + '…' + KEY.slice(-4) : '（空）'}`);
console.log('');

if (!KEY) {
  console.log('✗ 没有填 LLM_API_KEY');
  console.log('  去 platform.deepseek.com 或 open.bigmodel.cn 拿一个，填进 .env.local');
  process.exit(1);
}

const t0 = Date.now();

try {
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: 'user', content: '只回复两个字：连通' }],
      max_tokens: 20,
    }),
    signal: AbortSignal.timeout(20000),
  });

  const ms = Date.now() - t0;

  if (!res.ok) {
    const body = await res.text();
    console.log(`✗ 接口返回 ${res.status}（${ms}ms）`);
    console.log('  ' + body.slice(0, 300));
    console.log('');
    if (res.status === 401) console.log('  → 密钥不对，或已被停用。重新复制一次，注意别带空格。');
    else if (res.status === 404) console.log(`  → 模型名 "${MODEL}" 在这个平台不存在。检查 LLM_MODEL。`);
    else if (res.status === 402) console.log('  → 余额不足。');
    else if (res.status === 429) console.log('  → 请求太频繁或额度用尽。');
    process.exit(1);
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content?.trim();
  console.log(`✓ 连通，${ms}ms`);
  console.log(`  回复：${text}`);
  console.log('');
  console.log('  现在启动 start.bat，顶部会显示「已接入模型」。');
} catch (err) {
  console.log('✗ 请求发不出去');
  console.log('  ' + String(err?.message || err));
  console.log('');
  console.log('  → 如果是 fetch failed，多半是网络或地址写错；公司/学校网络可能挡了境外域名。');
  process.exit(1);
}
