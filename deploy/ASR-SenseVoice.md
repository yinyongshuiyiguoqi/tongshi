# SenseVoice 语音识别部署

网站语音输入默认使用 **SenseVoice int8（sherpa-onnx）**，中文识别和简体输出优于 tiny Whisper。
模型缺失或加载失败时，`server/asr_server.py` 会自动回退到 faster-whisper tiny。

## 1. 安装依赖

```bash
sudo apt-get update
sudo apt-get install -y ffmpeg
python3 -m pip install sherpa-onnx zhconv
```

## 2. 放模型

```text
/opt/tongshi/models/sensevoice/
├── model.int8.onnx
├── tokens.txt
└── warmup.mp3        # 可选，启动预热用
```

模型文件较大（约 240MB），不要提交到 Git 仓库。

## 3. 重启服务

```bash
sudo systemctl restart tongshi-asr
journalctl -u tongshi-asr -n 20 --no-pager
```

看到：

```text
asr ready: sensevoice
asr warmup done
```

说明加载成功。

## 4. 验证

登录后调用：

```bash
curl -sS -X POST https://tongshizhifa.cn/api/asr \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: audio/webm" \
  --data-binary @sample.webm
```

预期返回：

```json
{"text":"请问您是否携带护照和居留证件？","language":"zh","probability":0.99,"engine":"sensevoice"}
```

## 5. 回退

如果模型文件不存在、`sherpa-onnx` 未安装或加载失败，服务会自动使用 faster-whisper tiny，
接口字段不变，只是 `engine` 变成 `whisper`。

## 6. 注意

- 浏览器上传的是 `webm`/`mp4`，服务端用 `ffmpeg` 转 16k 单声道 PCM。
- 识别结果统一经 `zhconv` 转简体。
- 已修正“拘留证件 → 居留证件”等涉外执法高频误识别。
- 迁移服务器时，`/opt/tongshi/models/sensevoice` 必须一起迁移。
