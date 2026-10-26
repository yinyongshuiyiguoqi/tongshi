/**
 * 演示数据。
 *
 * 注意：provisions 里的 summary 是**要点摘录，不是条文原文**，条号也需要在提交前
 * 对照现行文本逐条核对。正式版应把这里换成经校验的法规库（JSON 或后端接口）。
 */

export interface Provision {
  id: string;
  law: string;
  article: string;
  topic: string;
  summary: string;
  tags: string[];
}

export interface AdviceLine {
  zh: string;
  en: string;
}

export interface Scenario {
  id: string;
  chip: string;
  title: string;
  place: string;
  lang: { name: string; code: string; confidence: number };
  transcript: string;
  translated: string;
  identity: { status: '待核验' | '已核验'; detail: string };
  provisionIds: string[];
  points: string[];
  lines: AdviceLine[];
  caution: string;
}

export const PROVISIONS: Provision[] = [
  {
    id: 'p-jc9',
    law: '中华人民共和国人民警察法',
    article: '第九条',
    topic: '当场盘问、检查',
    summary:
      '为维护社会治安秩序，对有违法犯罪嫌疑的人员，经出示相应证件，可以当场盘问、检查；符合法定情形的，可以带至公安机关继续盘问。',
    tags: ['盘问', '身份核验', '现场处置'],
  },
  {
    id: 'p-crj39',
    law: '中华人民共和国出境入境管理法',
    article: '第三十九条',
    topic: '外国人住宿登记',
    summary:
      '外国人在旅馆以外住所居住或住宿的，应当在入住后二十四小时内由本人或者留宿人，向居住地公安机关办理登记；在旅馆住宿的，由旅馆依旅馆业治安管理规定登记并报送信息。',
    tags: ['住宿登记', '留宿', '外国人管理'],
  },
  {
    id: 'p-crj71',
    law: '中华人民共和国出境入境管理法',
    article: '第七十一条',
    topic: '非法居留的处理',
    summary:
      '外国人非法居留的，依法给予警告、罚款；情节严重的可以拘留，具体幅度依照本条及裁量基准确定。查处的核心事实是停留期限与证件有效性。',
    tags: ['非法居留', '停留期限', '签证'],
  },
  {
    id: 'p-za4',
    law: '中华人民共和国治安管理处罚法',
    article: '第四条',
    topic: '涉外适用',
    summary:
      '在我国领域内发生的违反治安管理行为，除法律有特别规定的外，适用本法；享有外交特权和豁免权的外国人，通过外交途径解决。',
    tags: ['涉外适用', '豁免权', '治安案件'],
  },
];

export const SCENARIOS: Scenario[] = [
  {
    id: 'sc-street',
    chip: '街头盘查',
    title: '小区门口外籍人员无法出示证件',
    place: '居民小区东门 · 22:40',
    lang: { name: '英语', code: 'EN', confidence: 0.96 },
    transcript:
      "Excuse me, I'm waiting for my friend. I don't have my passport with me, but I have a photo of it on my phone.",
    translated:
      '打扰一下，我在等朋友。护照没带在身上，但手机里有照片。',
    identity: {
      status: '待核验',
      detail: '未携带护照原件，仅有照片；停留事由未说明，需核验签证与住宿登记',
    },
    provisionIds: ['p-jc9', 'p-crj71', 'p-za4'],
    points: [
      '先表明执法身份并出示证件，再要求对方配合，全程录音录像',
      '核验重点为护照原件、签证有效期与入境章，照片仅作辅助',
      '未携带证件本身不等于违法，不得据此直接采取强制措施',
    ],
    lines: [
      {
        zh: '您好，我是执勤民警。请出示您的护照或有效身份证件；如果没带原件，请先提供护照照片和签证信息，我们需要核实您的身份和停留事由。',
        en: "Hello, I'm a police officer on duty. Please show your passport or another valid ID. If you don't have the original with you, please provide a photo of your passport and visa so we can verify your identity and purpose of stay.",
      },
      {
        zh: '在核实期间请您留在这里配合，不会耽搁太久。核实完毕后您可以离开。',
        en: 'Please stay here while we verify this. It will not take long, and you may leave once it is done.',
      },
    ],
    caution:
      '对方仅未携带证件，属于待核验状态。核实身份应同步记录时间、地点与在场人员，避免在公共场所长时间滞留。',
  },
  {
    id: 'sc-hotel',
    chip: '住宿登记',
    title: '外籍租客入住七日未办理住宿登记',
    place: '某小区 3 号楼 · 15:20',
    lang: { name: '英语', code: 'EN', confidence: 0.93 },
    transcript:
      "I've been staying at my friend's apartment for a week. Nobody told me I had to register anywhere.",
    translated: '我在朋友家住了一周，没有人告诉过我需要去哪里登记。',
    identity: {
      status: '已核验',
      detail: '持有效护照与学习类居留许可；入住地址与登记地址不一致',
    },
    provisionIds: ['p-crj39', 'p-crj71'],
    points: [
      '先确认入住时间、住址与实际居住人，再判断是否超过二十四小时',
      '区分本人责任与留宿人责任，两者都有登记义务',
      '责令补办登记并留存材料，不宜一上来就按非法居留处理',
    ],
    lines: [
      {
        zh: '根据规定，外国人在旅馆以外的住所居住，需要在入住后二十四小时内到居住地公安机关办理住宿登记。您现在住的这个地方还没有登记，我们需要为您补办。',
        en: 'Under Chinese regulations, foreigners staying at a place other than a hotel must register with the local police within 24 hours of moving in. Your current address has not been registered, so we need to complete it now.',
      },
      {
        zh: '请提供护照、租房合同或房东的联系方式，登记完成后您就可以继续居住。',
        en: 'Please provide your passport and the lease or your host’s contact details. Once registration is done, you may continue to stay.',
      },
    ],
    caution:
      '住宿登记属于管理性义务，处理以补办为主；是否构成非法居留，要看停留期限而非登记状态，两者不可混同。',
  },
  {
    id: 'sc-dispute',
    chip: '涉外纠纷',
    title: '外卖骑手与外籍住户发生推搡',
    place: '某公寓大堂 · 19:05',
    lang: { name: '英语', code: 'EN', confidence: 0.89 },
    transcript:
      'He pushed me first! I just wanted to deliver the food. My bike is still outside.',
    translated: '是他先推的我！我只是想送餐，我的车还停在外面。',
    identity: {
      status: '待核验',
      detail: '双方均在现场，外籍一方持工作类居留许可，情绪激动',
    },
    provisionIds: ['p-za4', 'p-jc9'],
    points: [
      '先分离双方、控制现场，再分别听取陈述，避免当面对质',
      '涉外治安案件适用治安管理处罚法，先确认是否享有外交特权与豁免',
      '调解须双方自愿，调解不成的按程序受案，不得以语言不通为由拖延',
    ],
    lines: [
      {
        zh: '请两位先分开，各自说明情况。我们现在分别记录，不会只听一方。',
        en: 'Please separate for now and each of you explain what happened. We will take both accounts separately, not just one side.',
      },
      {
        zh: '如果双方愿意调解，我们可以在自愿的前提下组织调解；调解不成，我们会依法受案处理。',
        en: 'If both of you agree, we can arrange mediation on a voluntary basis. If not, we will formally accept the case and handle it according to law.',
      },
    ],
    caution:
      '先核实外籍一方是否享有外交特权与豁免；享有豁免的，通过外交途径解决，不适用治安处罚程序。',
  },
];

export function findScenario(id: string): Scenario {
  return SCENARIOS.find((s) => s.id === id) ?? SCENARIOS[0];
}

export function provisionsOf(ids: string[]): Provision[] {
  return PROVISIONS.filter((p) => ids.includes(p.id));
}
