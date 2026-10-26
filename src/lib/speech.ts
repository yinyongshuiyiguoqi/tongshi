/** 现场话术的语音播报，走浏览器自带的 speechSynthesis，不联网也不调接口 */

export type SpeakLang = string;

/**
 * 音色。
 *
 * 浏览器自带的语音合成只能调音高和语速，不能真正换嗓子，
 * 所以这里做的是几套「听起来像不同人」的参数：低而慢偏沉稳，高而快偏播报。
 * 参考 Siri 的几种语音人格命名，选中的记在本机。
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

function pickVoice(lang: SpeakLang): SpeechSynthesisVoice | null {
  const want = lang.slice(0, 2).toLowerCase();
  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find((v) => v.lang.replace('_', '-').toLowerCase() === lang.toLowerCase()) ??
    voices.find((v) => v.lang.toLowerCase().startsWith(want)) ??
    null
  );
}

export function speak(text: string, lang: SpeakLang): boolean {
  if (!canSpeak() || !text.trim()) return false;

  const synth = window.speechSynthesis;
  synth.cancel();

  const preset = voicePreset();

  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  // 音色给基准，英文再压慢一点，现场念得清
  u.rate = preset.rate * (lang.toLowerCase().startsWith('en') ? 0.92 : 1);
  u.pitch = preset.pitch;

  const voice = pickVoice(lang);
  if (voice) u.voice = voice;

  synth.speak(u);
  return true;
}

export function stopSpeaking() {
  if (canSpeak()) window.speechSynthesis.cancel();
}
