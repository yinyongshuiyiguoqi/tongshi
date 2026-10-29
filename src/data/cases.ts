/**
 * 情形库。
 *
 * 这是匹配引擎的底座：每条情形有触发描述、关键词、处置步骤、依据、话术。
 * 用户输入什么，就落到哪一条上。
 *
 * 法条原文放在 statutes.json，逐条对照国家法律法规数据库、中国人大网核对过，
 * 与情形库共用 id。改条号只改那一处，两边同时生效。
 */

import statutes from './statutes.json';

export interface Provision {
  id: string;
  law: string;
  article: string;
  topic: string;
  /** 要点摘录，用于卡片展示 */
  summary: string;
  /** 条文原文，逐字核对 */
  text: string;
  status: string;
  level: string;
  source: string;
}

export interface CaseItem {
  id: string;
  title: string;
  severity: '低' | '中' | '高';
  /** 用于相似度比较的完整描述 */
  scene: string;
  /** 典型表述：只有和这里几乎一致（≥95%）的输入才直接调出预设 */
  examples?: string[];
  /** 关键词及权重，命中即加分 */
  keywords: { w: string; weight: number }[];
  steps: string[];
  provisionIds: string[];
  scripts: { zh: string; en?: string }[];
  risk: string;
  /** 一句研判要点：不重复流程，指出这类情形的处理重心 */
  brief: string;
  /** 未命中时给用户的追问 */
  followUp: string;
}

export const PROVISIONS: Provision[] = statutes.map((s) => ({
  id: s.id,
  law: s.law,
  article: s.article,
  topic: s.topic,
  summary: s.gist,
  text: s.text,
  status: s.status,
  level: s.level,
  source: s.source,
}));

export const CASES: CaseItem[] = [
  {
    id: 'c-id',
    title: '外籍人员无法出示证件',
    severity: '低',
    scene:
      '外籍人员在街面或者场所内被盘查时，无法出示护照、居留证件，只能提供照片、复印件，或者声称证件放在住处。',
    examples: [
      '小区门口一个外国人拿不出护照，只会说英语，问他来干什么也说不清',
      '外籍人员没带护照，也拿不出居留证件',
      '街面盘查时外国人无法出示护照和签证',
      '老外说护照放在家里了，手机里只有照片',
    ],
    keywords: [
      { w: '没带护照', weight: 3 },
      { w: '护照没带', weight: 3 },
      { w: '没带证件', weight: 3 },
      { w: '未携带', weight: 3 },
      { w: '拿不出', weight: 2 },
      { w: '无法出示', weight: 2 },
      { w: '只有照片', weight: 2 },
      { w: '复印件', weight: 1 },
      { w: '护照在', weight: 1 },
      { w: '查证件', weight: 2 },
      { w: '盘查', weight: 2 },
    ],
    steps: [
      '表明执法身份，出示人民警察证，说明盘查事由',
      '核验护照原件、签证有效期与入境章；照片和复印件只作辅助，不能替代原件',
      '通过出入境管理系统核对身份信息与停留事由',
      '能够核实且无其他违法情形的，说明情况后放行；无法核实的，依法带至公安机关继续盘问',
    ],
    provisionIds: ['crj-38', 'jc-9'],
    scripts: [
      {
        zh: '您好，我是执勤民警。请出示您的护照或有效身份证件；如果没带原件，请先提供护照照片和签证信息，我们需要核实您的身份和停留事由。',
        en: "Hello, I'm a police officer on duty. Please show your passport or another valid ID. If you don't have the original with you, please provide a photo of your passport and visa so we can verify your identity and purpose of stay.",
      },
      {
        zh: '核实期间请您留在这里配合，不会耽搁太久。',
        en: 'Please stay here while we verify this. It will not take long.',
      },
    ],
    risk:
      '未携带证件本身不等于违法，不得据此直接采取强制措施。核实过程应全程录音录像，避免在公共场所长时间滞留。',
    brief:
      '这类情形的处理重心在核实身份，不在追究未携带证件本身。身份查清、没有其他违法情形的，说明情况即可放行。',
    followUp: '对方是否说明了停留事由？签证或居留许可是否在有效期内？',
  },
  {
    id: 'c-reg',
    title: '外籍人员住宿未登记',
    severity: '低',
    scene:
      '外籍人员在旅馆以外的住所居住或者住宿，超过二十四小时未到公安机关办理住宿登记，住在朋友家、租住的房屋或者单位宿舍。',
    examples: [
      '有个老外住在朋友家一个多星期了，一直没去派出所登记住宿',
      '外国人在朋友家住了超过二十四小时没有办理住宿登记',
      '房东没有给租房的外籍租客做住宿登记',
    ],
    keywords: [
      { w: '没登记', weight: 3 },
      { w: '未登记', weight: 3 },
      { w: '住宿登记', weight: 3 },
      { w: '住在朋友家', weight: 2 },
      { w: '租房', weight: 2 },
      { w: '旅馆以外', weight: 2 },
      { w: '二十四小时', weight: 2 },
      { w: '24小时', weight: 2 },
      { w: '房东', weight: 1 },
      { w: '入住', weight: 1 },
      { w: '居留', weight: 1 },
    ],
    steps: [
      '确认入住时间、实际住址与居住人，判断是否超过二十四小时',
      '区分本人责任与留宿人责任，两者都负有登记义务',
      '责令补办登记，登记完成后一般不再作处罚',
      '留存护照信息、住址与联系方式，录入系统',
    ],
    provisionIds: ['crj-39', 'crj-76'],
    scripts: [
      {
        zh: '根据规定，外国人在旅馆以外的住所居住，需要在入住后二十四小时内到居住地公安机关办理住宿登记。您现在的住址还没有登记，我们需要为您补办。',
        en: 'Under Chinese regulations, foreigners staying at a place other than a hotel must register with the local police within 24 hours of moving in. Your current address has not been registered, so we need to complete it now.',
      },
    ],
    risk:
      '住宿登记属于管理性义务，处理以补办为主。是否构成非法居留要看停留期限，不能把未登记直接等同于非法居留。',
    brief:
      '先确认入住时间与实际住址，再看留宿人是否知情。补办完成后一般不再处罚，重点是让下一次住得合规。',
    followUp: '实际入住是哪一天？房东是否知情并同意留宿？',
  },
  {
    id: 'c-overstay',
    title: '外籍人员签证过期、非法居留',
    severity: '中',
    scene:
      '外籍人员超过签证或者居留许可允许的停留期限仍在中国境内停留，所持签证已经过期，或者没有按期续签。',
    examples: [
      '外籍人员的签证过期了还留在境内',
      '一个老外的签证已经过期半个多月，一直没有续签',
      '外国人超过停留期限没有离境',
    ],
    keywords: [
      { w: '签证过期', weight: 3 },
      { w: '过期', weight: 3 },
      { w: '超期', weight: 2 },
      { w: '逾期', weight: 2 },
      { w: '超过停留期限', weight: 3 },
      { w: '居留许可过期', weight: 3 },
      { w: '非法居留', weight: 3 },
      { w: '没续签', weight: 2 },
      { w: '黑下来', weight: 2 },
      { w: '遣返', weight: 2 },
    ],
    steps: [
      '核对护照、签证、入境章与停留期限，确认超期天数',
      '查明超期原因，区分不可抗力、机关原因与本人原因',
      '固定证据：证件复印件、出入境记录、询问笔录',
      '依裁量基准确定处罚幅度，并依法作出限期离境或者遣送出境的处理',
    ],
    provisionIds: ['crj-78', 'crj-81', 'za-10'],
    scripts: [
      {
        zh: '您的签证已超过允许停留的期限。我们需要核对您的出入境记录，请您配合说明超期原因，并出示相关证明材料。',
        en: 'Your visa has expired beyond the permitted stay. We need to check your entry and exit records. Please explain the reason and provide any supporting documents.',
      },
    ],
    risk:
      '超期天数必须以出入境记录为准，不能凭口述认定。涉及遣送出境的，须严格履行审批与告知程序。',
    brief:
      '超期天数认记录不认口述。查明原因之后才谈处罚幅度，不可抗力与机关原因要单独考虑。',
    followUp: '超期多少天？是否已申请延期或者正在办理？',
  },
  {
    id: 'c-work',
    title: '外籍人员非法就业',
    severity: '中',
    scene:
      '外籍人员持旅游、探亲等非工作类签证在中国境内从事有报酬的劳动、经营或者提供劳务，没有取得工作许可。',
    examples: [
      '外国人在餐厅打工，拿的是旅游签证，没有工作许可',
      '外籍人员持旅游签证送外卖赚钱',
      '老外没有工作许可在培训机构教英语',
    ],
    keywords: [
      { w: '打工', weight: 3 },
      { w: '非法就业', weight: 3 },
      { w: '没有工作许可', weight: 3 },
      { w: '工作许可', weight: 2 },
      { w: '旅游签证', weight: 2 },
      { w: '送外卖', weight: 2 },
      { w: '教英语', weight: 2 },
      { w: '开店', weight: 1 },
      { w: '做翻译', weight: 1 },
      { w: '兼职', weight: 2 },
      { w: '赚钱', weight: 1 },
    ],
    steps: [
      '确认所持签证类别与是否取得工作许可',
      '固定用工事实：工作场所、报酬支付记录、用工方陈述',
      '区分受雇方与用工单位的责任，两者分别处理',
      '依法作出处理，并通报人社、市场监管部门',
    ],
    provisionIds: ['crj-43', 'crj-80'],
    scripts: [
      {
        zh: '您目前持有的签证不允许在中国境内工作。请说明您在这里从事的具体工作和报酬情况，我们需要核实。',
        en: 'Your current visa does not permit employment in China. Please explain the work you have been doing and how you are paid.',
      },
    ],
    risk:
      '注意区分“非法就业”与“无偿帮忙”“实习”。报酬与用工管理关系是认定的关键，单凭在场不能认定。',
    brief:
      '认定靠报酬和用工关系，不靠在不在场。先把谁安排工作、怎么结算查清，再谈对受雇方和用工单位分别处理。',
    followUp: '是否收取报酬？由谁安排工作、如何结算？',
  },
  {
    id: 'c-dispute',
    title: '涉外纠纷、肢体冲突',
    severity: '中',
    scene:
      '外籍人员与中国公民或者另一名外籍人员发生口角、推搡、撕扯等肢体冲突，尚未造成明显伤害，现场有人围观。',
    examples: [
      '两个外国人和中国人在路边打架，有人围观',
      '外籍人员和店主发生口角推搡，没有明显受伤',
      '老外和邻居吵架动手撕扯',
    ],
    keywords: [
      { w: '打架', weight: 3 },
      { w: '推搡', weight: 3 },
      { w: '冲突', weight: 3 },
      { w: '纠纷', weight: 3 },
      { w: '吵架', weight: 2 },
      { w: '口角', weight: 2 },
      { w: '动手', weight: 2 },
      { w: '撕扯', weight: 2 },
      { w: '受伤', weight: 1 },
      { w: '围观', weight: 1 },
    ],
    steps: [
      '先分离双方、控制现场，再分别听取陈述，避免当面对质',
      '核实外籍一方是否享有外交特权与豁免',
      '查看伤情，需要验伤的送医并固定证据',
      '双方自愿的可以组织调解；调解不成或伤情较重的，依法受案',
    ],
    provisionIds: ['za-5', 'za-9', 'za-51', 'xing-234'],
    scripts: [
      {
        zh: '请两位先分开，各自说明情况。我们现在分别记录，不会只听一方。',
        en: 'Please separate for now and each of you explain what happened. We will take both accounts separately.',
      },
      {
        zh: '如果双方愿意调解，我们可以在自愿的前提下组织调解；调解不成，我们会依法受案处理。',
        en: 'If both of you agree, we can arrange mediation. If not, we will formally accept the case and handle it according to law.',
      },
    ],
    risk:
      '先核实豁免身份。调解必须双方自愿，不得因语言不通而拖延受案。',
    brief:
      '先分开双方、分别取证，当面争辩只会激化。豁免身份要在这之前核实，否则后面所有程序都可能作废。',
    followUp: '有没有人受伤？伤情如何？双方是否同意调解？',
  },
];

export function provisionById(id: string): Provision | undefined {
  return PROVISIONS.find((p) => p.id === id);
}
