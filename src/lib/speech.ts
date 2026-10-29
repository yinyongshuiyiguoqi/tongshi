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

/** Edge 在线神经语音：真正换嗓子，不依赖 Windows 安装了几套系统语音 */
export interface NeuralVoice {
  id: string;
  label: string;
  hint: string;
  lang: string;
}

export const NEURAL_VOICES: NeuralVoice[] = [
  { id: 'zh-CN-XiaoxiaoNeural', label: '晓晓', hint: '女声 · 自然', lang: 'zh-CN' },
  { id: 'zh-CN-XiaoyiNeural', label: '晓伊', hint: '女声 · 温柔', lang: 'zh-CN' },
  { id: 'zh-CN-YunxiNeural', label: '云希', hint: '男声 · 年轻', lang: 'zh-CN' },
  { id: 'zh-CN-YunjianNeural', label: '云健', hint: '男声 · 浑厚', lang: 'zh-CN' },
  { id: 'zh-CN-YunyangNeural', label: '云扬', hint: '男声 · 新闻', lang: 'zh-CN' },
  { id: 'zh-CN-liaoning-XiaobeiNeural', label: '晓北', hint: '女声 · 东北', lang: 'zh-CN' },
  { id: 'zh-CN-shaanxi-XiaoniNeural', label: '晓妮', hint: '女声 · 陕西', lang: 'zh-CN' },
  { id: 'en-US-AriaNeural', label: 'Aria', hint: '女声 · 自然', lang: 'en-US' },
  { id: 'en-US-GuyNeural', label: 'Guy', hint: '男声 · 沉稳', lang: 'en-US' },
  { id: 'en-US-JennyNeural', label: 'Jenny', hint: '女声 · 亲切', lang: 'en-US' },
  { id: 'en-GB-SoniaNeural', label: 'Sonia', hint: '女声 · 英音', lang: 'en-GB' },
  { id: 'en-GB-RyanNeural', label: 'Ryan', hint: '男声 · 英音', lang: 'en-GB' },
  { id: 'ja-JP-NanamiNeural', label: '七海', hint: '女声 · 日语', lang: 'ja-JP' },
  { id: 'ko-KR-SunHiNeural', label: '善熙', hint: '女声 · 韩语', lang: 'ko-KR' },
  { id: 'fr-FR-DeniseNeural', label: '丹妮丝', hint: '女声 · 法语', lang: 'fr-FR' },
  { id: 'de-DE-KatjaNeural', label: '卡佳', hint: '女声 · 德语', lang: 'de-DE' },
  { id: 'es-ES-ElviraNeural', label: '艾尔维拉', hint: '女声 · 西班牙语', lang: 'es-ES' },
  { id: 'ru-RU-SvetlanaNeural', label: '斯维特兰娜', hint: '女声 · 俄语', lang: 'ru-RU' },
  { id: 'ar-SA-ZariyahNeural', label: '扎里亚', hint: '女声 · 阿拉伯语', lang: 'ar-SA' },
  { id: 'th-TH-PremwadeeNeural', label: '普琳', hint: '女声 · 泰语', lang: 'th-TH' },
  { id: 'vi-VN-HoaiMyNeural', label: '怀美', hint: '女声 · 越南语', lang: 'vi-VN' },
  { id: 'tr-TR-EmelNeural', label: '埃梅尔', hint: '女声 · 土耳其语', lang: 'tr-TR' },
  { id: 'tr-TR-AhmetNeural', label: '艾哈迈德', hint: '男声 · 土耳其语', lang: 'tr-TR' },
  { id: 'id-ID-GadisNeural', label: '加迪斯', hint: '女声 · 印尼语', lang: 'id-ID' },
  { id: 'id-ID-ArdiNeural', label: '阿尔迪', hint: '男声 · 印尼语', lang: 'id-ID' },
  { id: 'hi-IN-SwaraNeural', label: '斯瓦拉', hint: '女声 · 印地语', lang: 'hi-IN' },
  { id: 'hi-IN-MadhurNeural', label: '马杜尔', hint: '男声 · 印地语', lang: 'hi-IN' },
  { id: 'pt-BR-FranciscaNeural', label: '弗朗西斯卡', hint: '女声 · 葡萄牙语', lang: 'pt-BR' },
  { id: 'it-IT-ElsaNeural', label: '艾尔莎', hint: '女声 · 意大利语', lang: 'it-IT' },
];

/** 各外语试听句，避免统一点成英文 */
export const FOREIGN_PREVIEWS: Record<string, string> = {
  'en-US': "Hello, I'm a police officer on duty. Please show your passport and visa.",
  'en-GB': "Hello, I'm a police officer on duty. Please show your passport and visa.",
  'ja-JP': 'こんにちは、私は勤務中の警察官です。パスポートとビザを見せてください。',
  'ko-KR': '안녕하세요, 저는 근무 중인 경찰관입니다. 여권과 비자를 보여 주세요.',
  'fr-FR': 'Bonjour, je suis un agent de police en service. Veuillez présenter votre passeport et votre visa.',
  'de-DE': 'Guten Tag, ich bin ein Polizeibeamter im Dienst. Bitte zeigen Sie Ihren Reisepass und Ihr Visum.',
  'es-ES': 'Hola, soy un agente de policía en servicio. Por favor, muestre su pasaporte y su visado.',
  'ru-RU': 'Здравствуйте, я сотрудник полиции на службе. Пожалуйста, покажите ваш паспорт и визу.',
  'ar-SA': 'مرحباً، أنا ضابط شرطة في الخدمة. يرجى إظهار جواز سفرك وتأشيرتك.',
  'th-TH': 'สวัสดีครับ ผมเป็นเจ้าหน้าที่ตำรวจที่ปฏิบัติหน้าที่ กรุณาแสดงหนังสือเดินทางและวีซ่าของคุณ',
  'vi-VN': 'Xin chào, tôi là cảnh sát đang làm nhiệm vụ. Vui lòng xuất trình hộ chiếu và thị thực của bạn.',
  'tr-TR': 'Merhaba, ben görevli polis memuruyum. Lütfen pasaportunuzu ve vizenizi gösterin.',
  'id-ID': 'Halo, saya petugas polisi yang sedang bertugas. Silakan tunjukkan paspor dan visa Anda.',
  'hi-IN': 'नमस्ते, मैं ड्यूटी पर पुलिस अधिकारी हूँ। कृपया अपना पासपोर्ट और वीज़ा दिखाइए।',
  'pt-BR': 'Olá, sou um policial em serviço. Por favor, mostre seu passaporte e visto.',
  'it-IT': 'Salve, sono un agente di polizia in servizio. Per favore, mostri il suo passaporto e il suo visto.',
};

export function foreignPreview(lang: string): string {
  return FOREIGN_PREVIEWS[lang] || FOREIGN_PREVIEWS['en-US'];
}

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
  // 神经语音只需要 Audio；不能再因为 WebView 没有 speechSynthesis 就隐藏按钮。
  return typeof window !== 'undefined' && ('speechSynthesis' in window || 'Audio' in window);
}

/** 浏览器是否支持语音识别（安卓 Chrome/Edge 支持；iPhone Safari 多数版本不支持） */
export function speechSupport(): boolean {
  if (typeof window === 'undefined' || !window.isSecureContext) return false;
  const w = window as typeof window & {
    SpeechRecognition?: unknown;
    webkitSpeechRecognition?: unknown;
  };
  return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
}

/** 语音不能用时给用户一句可执行的原因，而不是按钮凭空消失 */
export function speechHint(): string {
  if (typeof window === 'undefined') return '';
  if (!window.isSecureContext) return '语音输入需要 HTTPS 才能使用';
  const w = window as typeof window & {
    SpeechRecognition?: unknown;
    webkitSpeechRecognition?: unknown;
  };
  if (w.SpeechRecognition || w.webkitSpeechRecognition) return '';
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) {
    return 'iPhone/iPad 的 Safari 不支持浏览器语音识别，请用文字输入，或换安卓 Chrome / Edge';
  }
  return '当前浏览器不支持语音识别，请用文字输入（推荐安卓 Chrome / Edge）';
}

export function speechErrorText(code?: string): string {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return '麦克风权限被拒绝，请在浏览器设置里允许麦克风后重试';
    case 'audio-capture':
      return '没有检测到麦克风，请检查设备或换一个浏览器';
    case 'network':
      return '语音识别网络失败，请检查网络后重试';
    case 'no-speech':
      return '没有听到声音，请靠近麦克风再说一次';
    case 'language-not-supported':
      return '当前浏览器不支持这个语言的语音识别';
    case 'aborted':
      return '';
    default:
      return '语音输入失败，请重试，或改用文字输入';
  }
}

/** 取系统里真实存在的音色。Edge/Chrome 的 getVoices 可能异步加载，UI 需监听 voiceschanged。 */
export function listVoices(lang: SpeakLang): SpeechSynthesisVoice[] {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return [];
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

let pendingSpeech = false;
let activeAudio: HTMLAudioElement | null = null;
let activeAudioUrl = '';
let speechGeneration = 0;
let lastSpeakKey = '';
let lastSpeakAt = 0;
let audioUnlocked = false;

// iOS Safari 会在 fetch 等异步操作后丢掉“用户手势”，只允许在手势同步栈里
// 首次 play 的 audio 元素继续播放。先用一个极短静音 WAV 解锁同一个元素，
// 等神经语音 MP3 回来后再换 src 播放。
const SILENT_WAV =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAIlYAAESsAAACABAAZGF0YQAAAAA=';

function primeAudio() {
  if (audioUnlocked || typeof Audio === 'undefined') return;
  try {
    if (!activeAudio) activeAudio = new Audio();
    const audio = activeAudio;
    audio.dataset.prime = '1';
    audio.muted = true;
    audio.src = SILENT_WAV;
    const started = audio.play();
    if (started?.then) {
      started
        .then(() => {
          if (activeAudio !== audio || audio.dataset.prime !== '1') return;
          delete audio.dataset.prime;
          audio.pause();
          audio.currentTime = 0;
          audio.muted = false;
          audioUnlocked = true;
        })
        .catch(() => {
          delete audio.dataset.prime;
          audio.muted = false;
        });
    }
  } catch {
    /* 浏览器拒绝解锁时仍走正常播放/回落 */
  }
}

function sessionToken(): string {
  try {
    const raw = localStorage.getItem('tongshi.session');
    if (!raw) return '';
    return String(JSON.parse(raw)?.token || '');
  } catch {
    return '';
  }
}

function defaultNeural(lang: SpeakLang): NeuralVoice | undefined {
  const key = langKey(lang);
  return NEURAL_VOICES.find((v) => v.lang.slice(0, 2).toLowerCase() === key);
}

function cleanupAudio() {
  pendingSpeech = false;
  if (activeAudio) {
    activeAudio.onended = null;
    activeAudio.onerror = null;
    try {
      activeAudio.pause();
      activeAudio.currentTime = 0;
    } catch {
      /* ignore */
    }
    activeAudio = null;
  }
  if (activeAudioUrl) {
    URL.revokeObjectURL(activeAudioUrl);
    activeAudioUrl = '';
  }
}

async function speakNeural(
  text: string,
  voice: string,
  lang: SpeakLang,
  rate = 0,
  pitch = 0,
  generation = speechGeneration,
) {
  if (generation !== speechGeneration) return;
  pendingSpeech = true;
  try {
    const token = sessionToken();
    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ text, voice, rate, pitch }),
    });
    if (!res.ok) throw new Error(`tts ${res.status}`);
    const blob = await res.blob();
    if (!pendingSpeech || generation !== speechGeneration) return;

    const url = URL.createObjectURL(blob);
    // 复用 primeAudio() 解锁的同一个 <audio>，不要在 await 之后新建元素
    const audio = activeAudio || new Audio();
    activeAudio = audio;
    activeAudioUrl = url;
    delete audio.dataset.prime;
    audio.muted = false;
    audio.src = url;
    const done = () => {
      if (activeAudio === audio) cleanupAudio();
    };
    audio.onended = done;
    audio.onerror = done;

    try {
      await audio.play();
    } catch {
      // 移动端可能拦截自动播放，回落到浏览器语音
      if (generation !== speechGeneration) return;
      done();
      speakBrowser(text, lang);
    }
  } catch {
    if (pendingSpeech && generation === speechGeneration) {
      cleanupAudio();
      speakBrowser(text, lang);
    }
  }
}

/** 当前是否还有语音在播（神经网络音频或浏览器语音） */
export function isSpeaking(): boolean {
  if (pendingSpeech) return true;
  if (activeAudio && !activeAudio.paused && !activeAudio.ended) return true;
  return 'speechSynthesis' in window && window.speechSynthesis.speaking;
}

/**
 * 播报。优先走 Edge 神经语音，失败再回落到浏览器 speechSynthesis。
 * voiceUri 传神经音色 ID 时会记住选择。
 */
export function speak(text: string, lang: SpeakLang, voiceUri?: string): boolean {
  if (!text.trim()) return false;

  const saved = voiceUri || loadVoiceUri(lang);
  const selected =
    NEURAL_VOICES.find((v) => v.id === saved && v.lang.slice(0, 2).toLowerCase() === langKey(lang)) ??
    defaultNeural(lang);

  // 同一按钮在极短时间内触发两次（触摸/冒泡/重复点击）时只播一遍
  const key = `${langKey(lang)}|${selected?.id || voiceUri || ''}|${text}`;
  const now = Date.now();
  if (key === lastSpeakKey && now - lastSpeakAt < 700) return true;
  lastSpeakKey = key;
  lastSpeakAt = now;

  if (selected) {
    saveVoiceUri(lang, selected.id);
    stopSpeaking();
    // 必须在点击事件同步栈内解锁 audio，不能等 fetch 回来才 new Audio().play()
    primeAudio();
    const generation = ++speechGeneration;
    const preset = voicePreset();
    const rate = Math.round((preset.rate - 1) * 100);
    const pitch = Math.round((preset.pitch - 1) * 40);
    void speakNeural(text, selected.id, lang, rate, pitch, generation);
    return true;
  }

  stopSpeaking();
  ++speechGeneration;
  return speakBrowser(text, lang, voiceUri);
}

function speakBrowser(text: string, lang: SpeakLang, voiceUri?: string): boolean {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return false;

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
  ++speechGeneration;
  cleanupAudio();
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}
