import json
import os
import smtplib
import sys
from email.header import Header
from email.mime.text import MIMEText

payload = json.load(open(sys.argv[1], encoding="utf-8"))
host = os.environ.get("FEEDBACK_SMTP_HOST", "smtp.qq.com")
port = int(os.environ.get("FEEDBACK_SMTP_PORT", "465"))
user = os.environ.get("FEEDBACK_SMTP_USER", "")
password = os.environ.get("FEEDBACK_SMTP_PASS", "")
to_addr = str(payload.get("to", "")).strip()
code = str(payload.get("code", "")).strip()
if not user or not password:
    raise SystemExit("FEEDBACK_SMTP_USER / FEEDBACK_SMTP_PASS 未配置")
if not to_addr or not code:
    raise SystemExit("missing recipient or code")

text = f"""你好，

你正在找回「通事」账号的登录密码。验证码：{code}

验证码 10 分钟内有效。如果不是你本人操作，请忽略这封邮件，不要向任何人转发验证码。

通事 TONGSHI
"""
msg = MIMEText(text, "plain", "utf-8")
msg["Subject"] = Header("通事 · 密码找回验证码", "utf-8")
msg["From"] = user
msg["To"] = to_addr

with smtplib.SMTP_SSL(host, port, timeout=20) as smtp:
    smtp.login(user, password)
    smtp.sendmail(user, [to_addr], msg.as_string())
