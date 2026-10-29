let audio: AudioContext | null = null;

/**
 * 玻璃轻响：不用音频文件，Web Audio 现场合成一小段“叮”。
 * 必须在用户点击事件里调用，移动端才会允许 AudioContext 启动。
 */
export function playGlassTap(enabled = true): void {
  if (!enabled || typeof window === 'undefined') return;

  const Ctor =
    window.AudioContext ||
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return;

  try {
    audio ??= new Ctor();
    if (audio.state === 'suspended') void audio.resume();
    const ctx = audio;
    const now = ctx.currentTime;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.075, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
    gain.connect(ctx.destination);

    const high = ctx.createOscillator();
    high.type = 'sine';
    high.frequency.setValueAtTime(1320, now);
    high.frequency.exponentialRampToValueAtTime(880, now + 0.16);
    high.connect(gain);
    high.start(now);
    high.stop(now + 0.22);

    const low = ctx.createOscillator();
    low.type = 'triangle';
    low.frequency.setValueAtTime(660, now);
    low.frequency.exponentialRampToValueAtTime(440, now + 0.12);
    const lowGain = ctx.createGain();
    lowGain.gain.setValueAtTime(0.035, now);
    lowGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
    low.connect(lowGain);
    lowGain.connect(ctx.destination);
    low.start(now);
    low.stop(now + 0.18);
  } catch {
    // 浏览器不支持/被拦截时静默，不影响交互
  }
}
