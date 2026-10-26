/** 现场话术的语音播报，走浏览器自带的 speechSynthesis，不联网也不调接口 */

export type SpeakLang = string;

/**
 * 语气。
 *
 * 浏览器自带的语音合成不能保证每个系统都装了多套嗓子，所以把两件事分开：
 * - 「音色」选系统里实际存在的 voice（Xiaoxiao / Yunxi / Aria ...）；
 * - 「语气」只调 pitch / rate，让同一个音色也有沉稳、温和、播报等差别。
 *
 * 选中的音色和语气都记在本机。
 */
export interface VoicePreset {
  id: string;
  label: string;
  desc: string;
  pitch: number;
  rate: number;
}

export const VOICE_PRESETS: VoicePreset[] = [
  { id: 'default', label: '默认', desc: '系统原声，不加工', pitch: 1, rate: 1.02 },
  { id: 'calm', label: '沉稳', desc: '音调压低，语速稍慢', pitch: 0.72, rate: 0.93 },
  { id: 'warm', label: '温和', desc: '略高一点，语气放软', pitch: 1.12, rate: 0.94 },
  { id: 'bright', label: '清亮', desc: '偏高偏快，嘈杂现场也听得清', pitch: 1.3, rate: 1.06 },
  { id: 'steady', label: '从容', desc: '更慢，长句不容易听漏', pitch: 0.9, rate: 0.84 },
  { id: 'broadcast', label: '播报', desc: '接近广播腔，字句利落', pitch: 1.05, rate: 1.16 },
];

const VOICE_KEY = 'tongshi.voice';
const VOICE_URI_PREFIX = 'tongshi.voiceURI.';

function langKey(lang: SpeakLang): string {
  return String(lang || 'zh-CN')
    .replace('_', '-')
    .slice(0, 2)
    .toLowerCase();
}

export function loadVoiceId(): string {
  try {
    const id = localStorage.getItem(VOICE_KEY);
    return VOICE_PRESETS.some((v) => v.id === id) ? (id as string) : 'default';
  } catch {
    return 'default';
  }
}

export function saveVoiceId(id: string) {
  try {
    localStorage.setItem(VOICE_KEY, id);
  } catch {
    // 隐私模式写不进去，忽略
  }
}

export function voicePreset(id = loadVoiceId()): VoicePreset {
  return VOICE_PRESETS.find((v) => v.id === id) ?? VOICE_PRESETS[0];
}

export function canSpeak(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/** 取系统里真实存在的音色。Edge/Chrome 的 getVoices 可能异步加载，UI 需监听 voiceschanged。 */
export function listVoices(lang: SpeakLang): SpeechSynthesisVoice[] {
  if (!canSpeak()) return [];
  const want = langKey(lang);
  return window.speechSynthesis
    .getVoices()
    .filter((v) => String(v.lang || '').replace('_', '-').toLowerCase().startsWith(want))
    .sort((a, b) => {
      // 本地音色优先（在线音色偶尔会失败），再按名称排
      if (a.localService !== b.localService) return a.localService ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}

/** 把 Microsoft 的长名字压成适合按钮显示的两三个词 */
export function voiceLabel(voice: SpeechSynthesisVoice): string {
  const name = voice.name
    .replace(/^Microsoft\s+/i, '')
    .replace(/\s*-\s*.*$/, '')
    .replace(/\s*\((?:Online|Natural|Desktop|Local)[^)]*\)\s*/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return name || voice.name;
}

/** 粗分男/女，只用于提示，不保证所有系统都准确 */
export function voiceHint(voice: SpeechSynthesisVoice): string {
  const n = voice.name.toLowerCase();
  if (/(yunxi|yunjian|kangkang|guy|david|mark|liang|male)/.test(n)) return '男声';
  if (/(xiaoxiao|xiaoyi|huihui|yaoyao|aria|jenny|zira|samantha|female)/.test(n)) return '女声';
  return voice.localService ? '本地' : '在线';
}

function preferredVoiceNames(lang: SpeakLang): string[] {
  const key = langKey(lang);
  if (key === 'zh') return ['xiaoxiao', 'yunxi', 'yunjian', 'xiaoyi', 'huihui', 'yaoyao', 'kangkang'];
  if (key === 'en') return ['aria', 'guy', 'jenny', 'zira', 'david', 'mark', 'samantha'];
  return [];
}

export function loadVoiceUri(lang: SpeakLang): string {
  try {
    return localStorage.getItem(VOICE_URI_PREFIX + langKey(lang)) || '';
  } catch {
    return '';
  }
}

export function saveVoiceUri(lang: SpeakLang, uri: string) {
  try {
    if (uri) localStorage.setItem(VOICE_URI_PREFIX + langKey(lang), uri);
    else localStorage.removeItem(VOICE_URI_PREFIX + langKey(lang));
  } catch {
    // 隐私模式写不进去，忽略
  }
}

function pickVoice(lang: SpeakLang): SpeechSynthesisVoice | null {
  const voices = listVoices(lang);
  const saved = loadVoiceUri(lang);
  const savedVoice = voices.find((v) => v.voiceURI === saved);
  if (savedVoice) return savedVoice;

  for (const name of preferredVoiceNames(lang)) {
    const found = voices.find((v) => v.name.toLowerCase().includes(name));
    if (found) return found;
  }
  return voices[0] ?? null;
}

/**
 * 播报。voiceUri 为空时使用「本机保存的音色 → 语言推荐音色 → 系统第一个」。
 * 传了 voiceUri 则认为用户在音色列表里做了选择，顺手记住。
 */
export function speak(text: string, lang: SpeakLang, voiceUri?: string): boolean {
  if (!canSpeak() || !text.trim()) return false;

  const synth = window.speechSynthesis;
  synth.cancel();

  const preset = voicePreset();
  const chosen = voiceUri
    ? listVoices(lang).find((v) => v.voiceURI === voiceUri) ?? null
    : null;
  if (chosen) saveVoiceUri(lang, chosen.voiceURI);

  const voice = chosen ?? pickVoice(lang);

  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  // 音色给基准，英文再压慢一点，现场念得清
  u.rate = preset.rate * (langKey(lang) === 'en' ? 0.92 : 1);
  u.pitch = preset.pitch;
  if (voice) {
    u.voice = voice;
    // 某些浏览器必须同时设置 lang，否则还是回落到默认嗓子
    u.lang = voice.lang || lang;
  }

  synth.speak(u);
  return true;
}

export function stopSpeaking() {
  if (canSpeak()) window.speechSynthesis.cancel();
}
