/**
 * 法规检索层：元典开放平台（open.chineselaw.com）。
 *
 * 这是一层「可溯源」的底座：检索到的每一条都带法规名称、条号、时效性和效力级别，
 * 只保留「现行有效」的条目，避免把已废止的条文喂给模型。
 *
 * 配置方式（.env.local）：
 *   VITE_LAW_API_KEY=你的元典 API Key
 *
 * 接口：POST https://open.chineselaw.com/open/law_vector_search
 * 计价：15 点/次，新账号有免费额度。
 *
 * 注意：浏览器直连可能被 CORS 拦。真被拦了，加一层 Vercel Function 转发即可，
 * 形如 /api/law -> 上面这个地址，前端改成调自己的域名。
 */

const ENDPOINT = 'https://open.chineselaw.com/open/law_vector_search';
const KEY = import.meta.env.VITE_LAW_API_KEY as string | undefined;

export const hasLawApi = Boolean(KEY);

export interface LawArticle {
  id: string;
  law: string;
  num: string;
  content: string;
  status: string;
  level: string;
  score: number;
}

interface RawArticle {
  ftid?: string;
  fgtitle?: string[] | string;
  num?: string;
  content?: string;
  sxx?: string;
  effect1?: string;
  score?: number;
}

export async function searchLaw(query: string, limit = 6): Promise<LawArticle[]> {
  if (!KEY) return [];

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      Accept: 'application/json',
      'X-API-Key': KEY,
    },
    body: JSON.stringify({
      query,
      rewrite_flag: true,
      return_num: Math.min(45, Math.max(limit * 3, 12)),
      fatiao_filter: { sxx: ['现行有效'] },
    }),
  });

  if (!res.ok) throw new Error(`法规检索 ${res.status}`);

  const json = await res.json();
  if (json?.code !== 200) throw new Error(json?.msg || '法规检索失败');

  const list: RawArticle[] = json?.extra?.fatiao ?? [];

  return list.slice(0, limit).map((f) => ({
    id: String(f.ftid ?? ''),
    law: Array.isArray(f.fgtitle) ? (f.fgtitle[0] ?? '') : (f.fgtitle ?? ''),
    num: f.num ?? '',
    content: f.content ?? '',
    status: f.sxx ?? '',
    level: f.effect1 ?? '',
    score: typeof f.score === 'number' ? f.score : 0,
  }));
}
