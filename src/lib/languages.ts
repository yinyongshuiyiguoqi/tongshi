export interface LangOption {
  /** 中文名称，界面上按这个显示 */
  label: string;
  /** 翻译时告诉模型的名称 */
  name: string;
  /** 语音合成的语言代码 */
  code: string;
}

/** 世界主要语言，够现场应付绝大多数对象国 */
export const LANGUAGES: LangOption[] = [
  { label: '英语', name: '英语', code: 'en-US' },
  { label: '日语', name: '日语', code: 'ja-JP' },
  { label: '韩语', name: '韩语', code: 'ko-KR' },
  { label: '俄语', name: '俄语', code: 'ru-RU' },
  { label: '阿拉伯语', name: '阿拉伯语', code: 'ar-SA' },
  { label: '法语', name: '法语', code: 'fr-FR' },
  { label: '德语', name: '德语', code: 'de-DE' },
  { label: '西班牙语', name: '西班牙语', code: 'es-ES' },
  { label: '葡萄牙语', name: '葡萄牙语', code: 'pt-BR' },
  { label: '意大利语', name: '意大利语', code: 'it-IT' },
  { label: '泰语', name: '泰语', code: 'th-TH' },
  { label: '越南语', name: '越南语', code: 'vi-VN' },
  { label: '土耳其语', name: '土耳其语', code: 'tr-TR' },
  { label: '印尼语', name: '印尼语', code: 'id-ID' },
  { label: '印地语', name: '印地语', code: 'hi-IN' },
];

export function langByCode(code: string): LangOption | undefined {
  return LANGUAGES.find((l) => l.code === code);
}
