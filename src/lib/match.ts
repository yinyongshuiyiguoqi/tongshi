import type { CaseItem } from '../data/cases';

/**
 * 情形匹配。
 *
 * 只有和情形库里的「典型表述」几乎一致（≥95%）的输入，才直接调出预设卡片；
 * 其余一律交给 Agent 自主研判。所以打分以「和典型表述的相似度」为主，
 * 关键词只负责把分数抬高一点，不能单独把一个模糊描述推到阈值之上。
 *
 * 算法不依赖模型，断网也能跑；接入向量检索后可以替换相似度实现，接口不变。
 */

const PUNCT = /[\s，。！？、；：""''（）【】《》,.!?;:'"()[\]<>·…—\-~]/g;

export function normalize(s: string): string {
  return s.replace(PUNCT, '').toLowerCase();
}

/**
 * 相似度用的同义归一：只抹平称呼和常见说法差异，
 * 不做语义扩写——差得多的描述仍然应该落到 Agent 手里。
 */
const SYNONYMS: Array<[RegExp, string]> = [
  [/老外|外国人|外籍人士|外国友人|外籍人员/g, '外籍人员'],
  [/没带|没有带|未携带|没拿|未拿/g, '未带'],
  [/拿不出|无法出示|出示不了|出不了/g, '无法出示'],
  [/二十四小时/g, '24小时'],
];

function canonical(s: string): string {
  let out = normalize(s);
  for (const [re, to] of SYNONYMS) out = out.replace(re, to);
  return out;
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

/** 低于这个分直接丢弃，连候选都不进 */
export const MATCH_FLOOR = 0.25;

/** 达到这个相似度才允许调出情形库预设；低于它的交给 Agent */
export const HIT_THRESHOLD = 0.95;

/** 与情形库典型表述的最高相似度；没有 examples 时退回 scene */
function similarityToCases(text: string, item: CaseItem): number {
  const grams = bigrams(canonical(text));
  const refs = item.examples?.length ? item.examples : [item.scene];
  let best = 0;
  for (const ref of refs) best = Math.max(best, dice(grams, bigrams(canonical(ref))));
  return best;
}

export function matchCases(input: string, list: CaseItem[], limit = 3): MatchResult[] {
  const text = normalize(input);
  if (text.length < 2) return [];

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
    const sim = similarityToCases(text, item);
    // 相似度是主项；关键词只能把分数往上抬，不能把「只是有点像」抬过 95%
    const score = Math.min(1, Math.max(sim, 0.55 * sim + 0.45 * kwScore));

    return { item, score, hits: hits.sort((a, b) => b.weight - a.weight) };
  });

  return results
    .filter((r) => r.score >= MATCH_FLOOR)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/** 匹配不到时的兜底建议：列出库里能处理的情形，让民警自己选 */
export function suggestions(list: CaseItem[]): CaseItem[] {
  return list;
}
