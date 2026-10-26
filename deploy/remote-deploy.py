"""
从本机直接部署到云服务器（SSH + SFTP），省掉手动登录敲命令。

用法：
    uv run --with paramiko python deploy/remote-deploy.py <IP> <root密码> [域名]

做了这些事：
  1. 上传 deploy/tongshi-deploy.tar.gz 与 deploy/server-setup.sh
  2. 在服务器上执行一键脚本（装 Node、Caddy、解包、systemd、按域名配反代）
  3. 把本机 .env.local 里的 key 写进服务器的 .env
  4. 重启服务并自检 /api/health
"""

import os
import re
import sys

import paramiko

HOST = sys.argv[1]
PWD = sys.argv[2]
DOMAIN = sys.argv[3] if len(sys.argv) > 3 else "none"

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PKG = os.path.join(ROOT, "deploy", "tongshi-deploy.tar.gz")
SETUP = os.path.join(ROOT, "deploy", "server-setup.sh")
ENV_LOCAL = os.path.join(ROOT, ".env.local")


def read_local_env() -> dict:
    out = {}
    if not os.path.exists(ENV_LOCAL):
        return out
    for line in open(ENV_LOCAL, encoding="utf-8"):
        m = re.match(r"^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$", line)
        if m:
            out[m.group(1)] = m.group(2).strip()
    return out


def main():
    for f in (PKG, SETUP):
        if not os.path.exists(f):
            sys.exit(f"缺少文件：{f}")

    print(f"连接 {HOST} …")
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, 22, "root", PWD, timeout=25, banner_timeout=25, auth_timeout=25)
    print("已登录")

    def run(cmd, timeout=900):
        print(f"$ {cmd}")
        _, out, err = client.exec_command(cmd, timeout=timeout, get_pty=False)
        o = out.read().decode("utf-8", "replace")
        e = err.read().decode("utf-8", "replace")
        if o.strip():
            print(o.rstrip())
        if e.strip():
            print("[stderr]", e.rstrip())
        return o

    sftp = client.open_sftp()
    print("上传部署包…")
    sftp.put(PKG, "/root/tongshi-deploy.tar.gz")
    sftp.put(SETUP, "/root/server-setup.sh")
    sftp.close()

    run("sed -i 's/\\r$//' /root/server-setup.sh")
    run(f"bash /root/server-setup.sh {DOMAIN}", timeout=1800)

    # 把本机的 key 写进服务器 .env
    env = read_local_env()
    pairs = {
        "LLM_BASE": env.get("LLM_BASE", "https://api.deepseek.com"),
        "LLM_API_KEY": env.get("LLM_API_KEY", ""),
        "LLM_MODEL": env.get("LLM_MODEL", "deepseek-chat"),
        "LAW_API_KEY": env.get("LAW_API_KEY", ""),
    }
    if any(v for v in pairs.values()):
        print("写入模型与检索 key…")
        for k, v in pairs.items():
            if not v:
                continue
            run(f"sed -i 's|^#*{k}=.*|{k}={v}|' /srv/tongshi/.env || true")
        # 如果 .env 里没有这几行，补在末尾
        for k, v in pairs.items():
            if not v:
                continue
            run(
                f"grep -q '^{k}=' /srv/tongshi/.env || echo '{k}={v}' >> /srv/tongshi/.env"
            )
        run("chown tongshi:tongshi /srv/tongshi/.env && chmod 600 /srv/tongshi/.env")
        run("systemctl restart tongshi")
        run("sleep 2")

    print("自检：")
    run("curl -s http://127.0.0.1:8787/api/health || echo '（接口无响应）'")
    run("systemctl is-active tongshi")
    client.close()

    print("")
    if DOMAIN != "none":
        print(f"完成。浏览器打开 https://{DOMAIN}")
    else:
        print("完成（未配置域名）。临时验证：http://%s:8787" % HOST)
        print("记得在轻量控制台把 8787 端口放行，否则外网打不开。")


if __name__ == "__main__":
    main()
