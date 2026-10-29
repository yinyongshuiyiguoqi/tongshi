import { useCallback, useEffect, useRef, useState } from 'react';
import { transcribeAudio } from './agent';

const MAX_MS = 60_000;

/** 所有输入框统一使用同一套追加规则：有内容就补分隔符，不覆盖用户已写内容 */
export function appendVoiceText(current: string, text: string): string {
  const next = String(text || '').trim();
  if (!next) return current;
  if (!current) return next;
  const sep = /[\s，。！？,.!?]$/.test(current) ? '' : '，';
  return current + sep + next;
}

export function languageLabel(code: string): string {
  const key = String(code || '').slice(0, 2).toLowerCase();
  const names: Record<string, string> = {
    zh: '中文',
    en: '英语',
    ja: '日语',
    ko: '韩语',
    ru: '俄语',
    ar: '阿拉伯语',
    th: '泰语',
    vi: '越南语',
    fr: '法语',
    de: '德语',
    es: '西班牙语',
    pt: '葡萄牙语',
  };
  return names[key] || (code ? code.toUpperCase() : '');
}

function preferredMime(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  const options = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ];
  return options.find((m) => MediaRecorder.isTypeSupported(m)) || '';
}

function speechFailure(err: unknown): string {
  const name = (err as { name?: string })?.name || '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return '麦克风权限被拒绝，请在浏览器或系统设置里允许麦克风后重试';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return '没有检测到麦克风，请检查设备';
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return '麦克风被其他程序占用，请关闭录音/会议软件后重试';
  }
  return '麦克风启动失败，请检查权限后重试';
}

/**
 * 浏览器只负责录音，识别交给服务端 SenseVoice（模型缺失时回退 Whisper）。
 * 这样不依赖 Google / Edge 的在线语音服务，桌面和手机走同一条链路，也能自动识别语言。
 */
export function useVoiceInput({
  token,
  onText,
}: {
  token: string;
  onText: (text: string, language: string) => void;
}) {
  const [supported, setSupported] = useState(() => {
    if (typeof window === 'undefined') return false;
    return (
      window.isSecureContext &&
      !!navigator.mediaDevices?.getUserMedia &&
      typeof MediaRecorder !== 'undefined'
    );
  });
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [language, setLanguage] = useState('');
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<number | undefined>(undefined);
  const onTextRef = useRef(onText);
  onTextRef.current = onText;

  useEffect(() => {
    setSupported(
      typeof window !== 'undefined' &&
        window.isSecureContext &&
        !!navigator.mediaDevices?.getUserMedia &&
        typeof MediaRecorder !== 'undefined',
    );
    return () => {
      window.clearTimeout(timer.current);
      try {
        recorder.current?.stop();
      } catch {
        /* ignore */
      }
      stream.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const stop = useCallback(() => {
    window.clearTimeout(timer.current);
    const rec = recorder.current;
    if (rec && rec.state !== 'inactive') {
      try {
        rec.stop();
      } catch {
        setRecording(false);
      }
    }
  }, []);

  const start = useCallback(async () => {
    if (recording) {
      stop();
      return;
    }
    if (busy) return;
    if (!supported) {
      setError('当前浏览器不支持录音，请用文字输入');
      return;
    }

    setError('');
    setLanguage('');
    chunks.current = [];
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      stream.current = media;
      const mimeType = preferredMime();
      const rec = new MediaRecorder(media, mimeType ? { mimeType } : undefined);
      recorder.current = rec;

      rec.ondataavailable = (e) => {
        if (e.data.size) chunks.current.push(e.data);
      };
      rec.onerror = () => {
        setError('录音失败，请检查麦克风');
        setRecording(false);
      };
      rec.onstop = async () => {
        window.clearTimeout(timer.current);
        setRecording(false);
        media.getTracks().forEach((t) => t.stop());
        stream.current = null;

        const blob = new Blob(chunks.current, {
          type: rec.mimeType || mimeType || 'audio/webm',
        });
        if (blob.size < 800) {
          setError('录音太短了，请按住说完整一句');
          return;
        }

        setBusy(true);
        try {
          const result = await transcribeAudio(blob, token);
          if (!result.text) {
            setError('没有听清，请靠近麦克风再说一次');
            return;
          }
          setLanguage(result.language);
          onTextRef.current(result.text, result.language);
        } catch (err) {
          setError(err instanceof Error ? err.message : '语音识别失败，请重试');
        } finally {
          setBusy(false);
        }
      };

      rec.start();
      setRecording(true);
      timer.current = window.setTimeout(stop, MAX_MS);
    } catch (err) {
      stream.current?.getTracks().forEach((t) => t.stop());
      stream.current = null;
      setRecording(false);
      setError(speechFailure(err));
    }
  }, [busy, recording, stop, supported, token]);

  return { supported, recording, busy, error, language, start, stop };
}
