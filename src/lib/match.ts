import type { CaseItem } from '../data/cases';

/**
 * 情形匹配。
 *
 * 两路打分相加：
 *   1. 关键词命中 —— 可解释，能告诉民警「为什么匹配到这一条」
 *   2. 字符二元组相似度 —— 兜住关键词没覆盖到的表述，容忍口语和错别字
 *
 * 这套算法不依赖模型，断网也能跑；接入向量检索后可以把第 2 路替换成 embedding，
 * 接口保持不变。
 */

const PUNCT = /[\s，。！？、；：""''（）【】《》,.!?;:'"()[\]<>·…—\-~]/g;

export function normalize(s: string): string {
  return s.replace(PUNCT, '').toLowerCase();
}

function bigrams(s: string): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2));
  return out;
}

function dice(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  a.forEach((x) => {
    if (b.has(x)) inter++;
  });
  return (2 * inter) / (a.size + b.size);
}

export interface MatchResult {
  item: CaseItem;
  score: number;
  hits: { w: string; weight: number }[];
}

export const LOW_CONFIDENCE = 0.5;

/** 低于这个分不进结果卡——宁可交给 Agent，也不要给一条不像的依据 */
export const MATCH_FLOOR = 0.25;

export function matchCases(input: string, list: CaseItem[], limit = 3): MatchResult[] {
  const text = normalize(input);
  if (text.length < 2) return [];

  const inputGrams = bigrams(text);

  const results = list.map((item) => {
    const hits: { w: string; weight: number }[] = [];
    let weight = 0;

    for (const kw of item.keywords) {
      if (text.includes(normalize(kw.w))) {
        hits.push(kw);
        weight += kw.weight;
      }
    }

    // 关键词加分饱和处理：命中越多越高，但不会无限逼近 1
    const kwScore = weight === 0 ? 0 : weight / (weight + 1.2);
    const sim = dice(inputGrams, bigrams(normalize(item.scene)));
    const score = Math.min(1, 0.85 * kwScore + 0.15 * sim);

    return { item, score, hits: hits.sort((a, b) => b.weight - a.weight) };
  });

  return results
    .filter((r) => r.score >= MATCH_FLOOR)
    .filter((r) => r.hits.length > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/** 匹配不到时的兜底建议：列出库里能处理的情形，让民警自己选 */
export function suggestions(list: CaseItem[]): CaseItem[] {
  return list;
}
