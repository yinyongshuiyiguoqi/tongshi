"""通事本地语音识别服务。

优先使用 SenseVoice（sherpa-onnx，中文更准，输出简体），
模型缺失时回退到原来的 faster-whisper tiny。
Node 只负责鉴权和转发；模型常驻在这里，避免每次请求重新加载。
"""
import json
import os
import subprocess
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import numpy as np

try:
    from zhconv import convert as to_simplified
except Exception:  # pragma: no cover - 依赖缺失时不阻断识别
    def to_simplified(text, target="zh-cn"):
        return text

HOST = "127.0.0.1"
PORT = int(os.environ.get("ASR_PORT", "8790"))
MODEL_DIR = os.environ.get("ASR_MODEL_DIR", "/opt/tongshi/models")
SENSE_DIR = os.environ.get("ASR_SENSEVOICE_DIR", os.path.join(MODEL_DIR, "sensevoice"))
SENSE_MODEL = os.path.join(SENSE_DIR, "model.int8.onnx")
SENSE_TOKENS = os.path.join(SENSE_DIR, "tokens.txt")

lock = threading.Lock()
engine = ""
recognizer = None
whisper = None


def load_engine():
    global engine, recognizer, whisper
    if os.path.isfile(SENSE_MODEL) and os.path.isfile(SENSE_TOKENS):
        try:
            import sherpa_onnx

            print("loading sensevoice ...", flush=True)
            recognizer = sherpa_onnx.OfflineRecognizer.from_sense_voice(
                model=SENSE_MODEL,
                tokens=SENSE_TOKENS,
                num_threads=2,
                use_itn=True,
                language="auto",
                debug=False,
            )
            engine = "sensevoice"
            print("asr ready: sensevoice", flush=True)
            return
        except Exception as exc:
            print(f"sensevoice unavailable: {exc}", flush=True)

    from faster_whisper import WhisperModel

    print("loading faster-whisper tiny ...", flush=True)
    whisper = WhisperModel("tiny", device="cpu", compute_type="int8", download_root=MODEL_DIR)
    engine = "whisper"
    print("asr ready: whisper", flush=True)


def normalize_lang(raw):
    lang = (raw or "").strip().lower()
    for token in lang.replace("|", " ").replace("<", " ").replace(">", " ").split():
        if token in {"zh", "en", "yue", "ja", "ko"}:
            return token
    return "zh" if lang in {"zh", "zh-cn", "zh-tw"} else ""


def zh_text(text):
    text = (text or "").strip()
    if not text:
        return text
    text = to_simplified(text, "zh-cn")
    # 涉外执法高频词：模型偶尔把“居留”听成“拘留”，只在完整词组上纠正
    for wrong, right in (
        ("拘留证件", "居留证件"),
        ("拘留许可", "居留许可"),
        ("拘留登记", "居留登记"),
    ):
        text = text.replace(wrong, right)
    return text


def transcribe_sense(path):
    # 浏览器上传的是 webm/mp4，SenseVoice 需要 16k 单声道 float32 PCM
    proc = subprocess.run(
        [
            "ffmpeg",
            "-v",
            "error",
            "-i",
            path,
            "-f",
            "f32le",
            "-ac",
            "1",
            "-ar",
            "16000",
            "pipe:1",
        ],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=30,
        check=True,
    )
    samples = np.frombuffer(proc.stdout, dtype=np.float32)
    if samples.size == 0:
        raise RuntimeError("音频为空或解码失败")

    with lock:
        stream = recognizer.create_stream()
        stream.accept_waveform(16000, samples)
        recognizer.decode_stream(stream)
        result = stream.result

    text = zh_text(getattr(result, "text", ""))
    lang = normalize_lang(getattr(result, "lang", ""))
    if not lang:
        lang = "zh" if any("\u4e00" <= ch <= "\u9fff" for ch in text) else ""
    return {"text": text, "language": lang, "probability": 0.99, "engine": "sensevoice"}


def transcribe_whisper(path):
    with lock:
        segments, info = whisper.transcribe(
            path,
            beam_size=1,
            vad_filter=True,
            condition_on_previous_text=False,
            initial_prompt="以下是普通话的句子，请使用简体中文。",
        )
        text = "".join(seg.text for seg in segments).strip()
    return {
        "text": zh_text(text),
        "language": info.language or "",
        "probability": round(float(info.language_probability or 0), 3),
        "engine": "whisper",
    }


def transcribe(path):
    if engine == "sensevoice":
        return transcribe_sense(path)
    return transcribe_whisper(path)


def warmup():
    """首次 SenseVoice 推理要编译/预热；有 warmup.mp3 就用真实语音，避免第一个用户等 4–6 秒。"""
    if engine != "sensevoice":
        return
    try:
        warm_path = os.path.join(SENSE_DIR, "warmup.mp3")
        if os.path.isfile(warm_path):
            transcribe_sense(warm_path)
        else:
            with lock:
                stream = recognizer.create_stream()
                stream.accept_waveform(16000, np.zeros(8000, dtype=np.float32))
                recognizer.decode_stream(stream)
        print("asr warmup done", flush=True)
    except Exception as exc:
        print(f"asr warmup failed: {exc}", flush=True)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        print("asr", fmt % args, flush=True)

    def do_POST(self):
        if self.path != "/asr":
            self.send_response(404)
            self.end_headers()
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = 0
        if length <= 0 or length > 24 * 1024 * 1024:
            self.send_response(413)
            self.end_headers()
            return

        content_type = self.headers.get("Content-Type", "application/octet-stream")
        suffix = ".mp4" if "mp4" in content_type else ".webm"
        data = self.rfile.read(length)

        fd, path = tempfile.mkstemp(prefix="tongshi-asr-", suffix=suffix)
        try:
            with os.fdopen(fd, "wb") as f:
                f.write(data)
            payload = transcribe(path)
            body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except Exception as exc:
            body = json.dumps({"message": str(exc)[:200]}, ensure_ascii=False).encode("utf-8")
            self.send_response(500)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        finally:
            try:
                os.unlink(path)
            except OSError:
                pass


if __name__ == "__main__":
    load_engine()
    warmup()
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
