/** 录音中的实时声纹。5 根短柱跟随麦克风音量起伏。 */
export function VoiceWave({ levels }: { levels?: number[] }) {
  const bars = Array.from({ length: 5 }, (_, i) => Math.max(0.08, Math.min(1, levels?.[i] ?? 0.08)));
  return (
    <span className="voice-wave" aria-hidden="true">
      {bars.map((level, i) => (
        <i key={i} style={{ height: `${Math.round(3 + level * 15)}px` }} />
      ))}
    </span>
  );
}
