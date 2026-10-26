/** 现场话术的语音播报，走浏览器自带的 speechSynthesis，不联网也不调接口 */

export type SpeakLang = string;

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

  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  // 中文按正常语速，英文稍慢一点，现场念得清
  u.rate = lang === 'zh-CN' ? 1.02 : 0.92;
  u.pitch = 1;

  const voice = pickVoice(lang);
  if (voice) u.voice = voice;

  synth.speak(u);
  return true;
}

export function stopSpeaking() {
  if (canSpeak()) window.speechSynthesis.cancel();
}
