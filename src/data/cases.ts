/**
 * 情形库。
 *
 * 这是匹配引擎的底座：每条情形有触发描述、关键词、处置步骤、依据、话术。
 * 用户输入什么，就落到哪一条上。
 *
 * 注意：provisions 的 summary 是要点摘录，不是条文原文；条号须对照现行文本核对。
 * 正式版应替换为经校验的法规库，并可在此结构上加入向量。
 */

export interface Provision {
  id: string;
  law: string;
  article: string;
  topic: string;
  summary: string;
}

export interface CaseItem {
  id: string;
  title: string;
  severity: '低' | '中' | '高';
  /** 用于相似度比较的完整描述 */
  scene: string;
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

export const PROVISIONS: Provision[] = [
  {
    id: 'p-jc9',
    law: '中华人民共和国人民警察法',
    article: '第九条',
    topic: '当场盘问、检查',
    summary:
      '为维护社会治安秩序，对有违法犯罪嫌疑的人员，经出示相应证件，可以当场盘问、检查；符合法定情形的，可以带至公安机关继续盘问。',
  },
  {
    id: 'p-crj39',
    law: '中华人民共和国出境入境管理法',
    article: '第三十九条',
    topic: '外国人住宿登记',
    summary:
      '外国人在旅馆以外住所居住或住宿的，应当在入住后二十四小时内由本人或者留宿人，向居住地公安机关办理登记；在旅馆住宿的，由旅馆按规定登记并报送信息。',
  },
  {
    id: 'p-crj71',
    law: '中华人民共和国出境入境管理法',
    article: '第七十一条',
    topic: '非法居留的处理',
    summary:
      '外国人非法居留的，依法给予警告、罚款；情节严重的可以拘留，具体幅度依本条及裁量基准确定。查处核心事实是停留期限与证件有效性。',
  },
  {
    id: 'p-za4',
    law: '中华人民共和国治安管理处罚法',
    article: '第四条',
    topic: '涉外适用',
    summary:
      '在我国领域内发生的违反治安管理行为，除法律有特别规定的外，适用本法；享有外交特权和豁免权的外国人，通过外交途径解决。',
  },
  {
    id: 'p-za15',
    law: '中华人民共和国治安管理处罚法',
    article: '第十五条',
    topic: '醉酒状态的处置',
    summary:
      '醉酒的人违反治安管理的，应当给予处罚；醉酒状态中对本人有危险或者对他人人身、财产、公共安全有威胁的，可以采取保护性约束措施至酒醒。',
  },
  {
    id: 'p-wj',
    law: '中华人民共和国外交特权与豁免条例',
    article: '',
    topic: '外交特权与豁免',
    summary:
      '享有外交特权与豁免的人员，其人身、寓所、文书档案不受侵犯，管辖与执行豁免；涉及其的案件应通过外交途径处理，不适用一般治安处罚程序。',
  },
];

export const CASES: CaseItem[] = [
  {
    id: 'c-id',
    title: '外籍人员无法出示证件',
    severity: '低',
    scene:
      '外籍人员在街面或者场所内被盘查时，无法出示护照、居留证件，只能提供照片、复印件，或者声称证件放在住处。',
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
    provisionIds: ['p-jc9', 'p-za4'],
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
    provisionIds: ['p-crj39', 'p-crj71'],
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
    provisionIds: ['p-crj71', 'p-za4'],
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
    provisionIds: ['p-crj71', 'p-za4'],
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
    provisionIds: ['p-za4', 'p-jc9'],
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
  {
    id: 'c-drunk',
    title: '外籍人员醉酒滋事',
    severity: '中',
    scene:
      '外籍人员处于醉酒状态，在公共场所大声喧哗、滋事，或者对自身及他人安全构成威胁，无法正常交流。',
    keywords: [
      { w: '醉酒', weight: 3 },
      { w: '喝醉', weight: 3 },
      { w: '耍酒疯', weight: 3 },
      { w: '喝多', weight: 2 },
      { w: '大声喧哗', weight: 2 },
      { w: '滋事', weight: 2 },
      { w: '闹事', weight: 2 },
      { w: '不省人事', weight: 2 },
      { w: '躺在地上', weight: 1 },
    ],
    steps: [
      '先控制现场、疏散围观，评估是否存在自伤或伤人风险',
      '对本人有危险或对他人有威胁的，采取保护性约束措施至酒醒',
      '核查身份与证件，联系同行人员或者使领馆',
      '酒醒后依法处理，全程录音录像并制作记录',
    ],
    provisionIds: ['p-za15', 'p-za4'],
    scripts: [
      {
        zh: '您现在处于醉酒状态，为了您和他人的安全，我们需要对您采取保护性措施，等您清醒后再处理相关事项。',
        en: 'You are intoxicated. For your safety and the safety of others, we need to take protective measures until you sober up.',
      },
    ],
    risk:
      '保护性约束不是处罚，不得使用械具过度限制，须持续观察身体状况，防止呕吐窒息等意外。',
    brief:
      '约束是为了安全，不是为了惩罚。清醒之前不谈责任，重点是看住人、防止呕吐窒息和自伤。',
    followUp: '是否有同行人员？有没有受伤或者财物损坏？',
  },
  {
    id: 'c-diplomat',
    title: '涉案人员自称外交人员',
    severity: '高',
    scene:
      '涉案外籍人员自称外交人员、领事官员或者国际组织人员，出示外交证件，可能享有外交特权与豁免。',
    keywords: [
      { w: '外交官', weight: 3 },
      { w: '外交人员', weight: 3 },
      { w: '外交豁免', weight: 3 },
      { w: '豁免', weight: 3 },
      { w: '使馆', weight: 3 },
      { w: '领事', weight: 2 },
      { w: '国际组织', weight: 2 },
      { w: '外交证件', weight: 2 },
    ],
    steps: [
      '立即停止一般处置程序，不得对其采取强制措施',
      '查验外交身份证件，通过外事部门核实身份与豁免范围',
      '逐级上报，通报外事部门，通过外交途径处理',
      '做好现场记录，全程留痕，避免与外方发生直接冲突',
    ],
    provisionIds: ['p-wj', 'p-za4'],
    scripts: [
      {
        zh: '我们需要先核实您的身份。请出示外交身份证件，我们将通过外事部门确认后依法处理。',
        en: 'We need to verify your identity first. Please show your diplomatic ID; we will confirm with the foreign affairs authorities before proceeding.',
      },
    ],
    risk:
      '豁免范围因身份类别不同而有别，不得自行判断。任何情况下都不得扣留外交人员或扣押其文书。',
    brief:
      '豁免不能由现场自行判断。停止一般处置、核实身份、逐级上报、走外事途径，顺序不能乱。',
    followUp: '对方出示的是什么证件？所属机构是使馆、领馆还是国际组织？',
  },
  {
    id: 'c-help',
    title: '外籍人员求助（迷路、失物、语言不通）',
    severity: '低',
    scene:
      '外籍人员因迷路、丢失财物、语言不通等原因向民警求助，本身不涉及违法行为，需要提供协助。',
    keywords: [
      { w: '迷路', weight: 3 },
      { w: '找不到', weight: 3 },
      { w: '找不着', weight: 3 },
      { w: '求助', weight: 3 },
      { w: '钱包被偷', weight: 3 },
      { w: '钱包丢', weight: 3 },
      { w: '被偷', weight: 2 },
      { w: '丢东西', weight: 2 },
      { w: '手机丢', weight: 2 },
      { w: '丢了', weight: 2 },
      { w: '语言不通', weight: 2 },
      { w: '不会中文', weight: 2 },
      { w: '不会说中文', weight: 2 },
      { w: '问路', weight: 2 },
      { w: '需要帮助', weight: 2 },
      { w: '需要帮忙', weight: 2 },
      { w: '走失', weight: 2 },
    ],
    steps: [
      '先确认对方诉求，判断是求助还是报警',
      '核实身份与证件，记录联系方式和住址',
      '属求助的，提供指引或协助联系；属财物丢失的，按程序受理并出具证明',
      '涉及使领馆协助的，告知其联系本国驻华使领馆',
    ],
    provisionIds: ['p-jc9'],
    scripts: [
      {
        zh: '请问您需要什么帮助？请慢慢说，我们会尽力协助。',
        en: 'How can we help you? Please take your time; we will do our best to assist.',
      },
    ],
    risk:
      '求助类警情以协助为主，不要动辄要求出示证件或者带离现场，避免引起误解。',
    brief:
      '先问清诉求，再判断是求助还是报警。求助类不要一上来就查证件，容易让人误以为被当成嫌疑人。',
    followUp: '对方具体需要什么帮助？是否涉及财物损失或者人身安全？',
  },
  {
    id: 'c-traffic',
    title: '涉外交通事故',
    severity: '中',
    scene:
      '外籍人员驾驶机动车、非机动车或者骑行车辆发生交通事故，涉及车辆剐蹭、碰撞、人员受伤，需要现场处置与责任认定。',
    keywords: [
      { w: '交通事故', weight: 3 },
      { w: '车祸', weight: 3 },
      { w: '剐蹭', weight: 3 },
      { w: '撞车', weight: 3 },
      { w: '追尾', weight: 2 },
      { w: '撞人', weight: 2 },
      { w: '司机', weight: 2 },
      { w: '骑车', weight: 1 },
      { w: '保险', weight: 1 },
      { w: '受伤', weight: 1 },
    ],
    steps: [
      '立即保护现场，设置警示，疏导交通，避免二次事故',
      '有人员受伤的先救助伤员并通知急救',
      '通知交警部门到场处理，涉外的同时报告出入境管理部门',
      '核查当事人身份、证件与车辆手续，固定现场证据',
    ],
    provisionIds: ['p-jc9', 'p-za4'],
    scripts: [
      {
        zh: '请先不要移动车辆，我们正在保护现场。有人员受伤吗？请出示您的驾驶证和护照。',
        en: 'Please do not move the vehicles. We are securing the scene. Is anyone injured? Please show your driving licence and passport.',
      },
    ],
    risk:
      '涉外交通事故的责任认定由交警部门依法作出，民警现场以救助、保护和核查为主，不要当场划分责任。',
    brief:
      '现场以救人、护场、核查为主，责任由交警认定。当场划责容易被理解为承诺，后面很难收回。',
    followUp: '是否有人受伤？车辆是否影响通行？对方是否持有有效驾驶证？',
  },
];

export function provisionById(id: string): Provision | undefined {
  return PROVISIONS.find((p) => p.id === id);
}
