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
to_addr = os.environ.get("FEEDBACK_TO", "1957074568@qq.com")
if not user or not password:
    raise SystemExit("FEEDBACK_SMTP_USER / FEEDBACK_SMTP_PASS 未配置")

msg = MIMEText(payload.get("message", ""), "plain", "utf-8")
msg["Subject"] = Header(f"通事反馈 - {payload.get('badge', '')}", "utf-8")
msg["From"] = user
msg["To"] = to_addr
msg["Reply-To"] = payload.get("contact") or user

with smtplib.SMTP_SSL(host, port, timeout=20) as smtp:
    smtp.login(user, password)
    smtp.sendmail(user, [to_addr], msg.as_string())
