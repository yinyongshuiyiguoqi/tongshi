#!/usr/bin/env bash
# 服务器一键初始化：装 Node 与 Caddy、解包、建服务、配反代
#
# 用法（在服务器上，先把 tongshi-deploy.tar.gz 和本脚本传到 ~/）：
#   sed -i 's/\r$//' server-setup.sh          # 从 Windows 传过来可能带 CRLF
#   bash server-setup.sh 你的域名
#
# 跑之前要做的两件事：
#   1. 域名 A 记录已经指向这台机器的公网 IP
#   2. 云控制台安全组放行 22 / 80 / 443

set -euo pipefail

DOMAIN="${1:-}"
if [ -z "$DOMAIN" ]; then
  echo "用法: bash server-setup.sh 你的域名"
  echo "      bash server-setup.sh none      # 先不配域名，用 IP:8787 验证"
  exit 1
fi

SKIP_CADDY=0
if [ "$DOMAIN" = "none" ]; then
  SKIP_CADDY=1
fi

APP_DIR=/srv/tongshi
PKG="$HOME/tongshi-deploy.tar.gz"

echo "==> 目标域名: $DOMAIN"
echo "==> 应用目录: $APP_DIR"

if [ ! -f "$PKG" ]; then
  echo "找不到 $PKG，先把 deploy/tongshi-deploy.tar.gz 传上来"
  exit 1
fi

echo "==> 安装基础工具"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl gnupg debian-keyring debian-archive-keyring apt-transport-https >/dev/null

if ! command -v node >/dev/null 2>&1; then
  echo "==> 安装 Node 22"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
echo "    node $(node -v)"

if [ "$SKIP_CADDY" = "0" ]; then
  if ! command -v caddy >/dev/null 2>&1; then
    echo "==> 安装 Caddy"
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
      | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
      > /etc/apt/sources.list.d/caddy-stable.list
    apt-get update -qq
    apt-get install -y -qq caddy >/dev/null
  fi
  echo "    caddy $(caddy version | head -1)"
fi

echo "==> 建运行用户与目录"
id -u tongshi >/dev/null 2>&1 || useradd -r -s /usr/sbin/nologin tongshi
mkdir -p "$APP_DIR"
tar -xzf "$PKG" -C "$APP_DIR"
chown -R tongshi:tongshi "$APP_DIR"

if [ ! -f "$APP_DIR/.env" ]; then
  cp "$APP_DIR/.env.example" "$APP_DIR/.env"
  SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
  sed -i "s|^SESSION_SECRET=.*|SESSION_SECRET=$SECRET|" "$APP_DIR/.env"
  chown tongshi:tongshi "$APP_DIR/.env"
  chmod 600 "$APP_DIR/.env"
  echo "==> 已生成 $APP_DIR/.env（SESSION_SECRET 随机填好），密钥还得你自己填"
fi

echo "==> 注册 systemd 服务"
cat > /etc/systemd/system/tongshi.service <<UNIT
[Unit]
Description=通事 涉外执法现场辅助
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=tongshi
Group=tongshi
WorkingDirectory=$APP_DIR
EnvironmentFile=$APP_DIR/.env
Environment=NODE_ENV=production
ExecStart=$(command -v node) server/agent.mjs
Restart=always
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true
ReadWritePaths=$APP_DIR

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable --now tongshi
sleep 2
systemctl is-active --quiet tongshi && echo "    服务已启动" || {
  echo "服务没起来，看日志：journalctl -u tongshi -n 40 --no-pager"
  exit 1
}

if [ "$SKIP_CADDY" = "1" ]; then
  echo "==> 跳过域名与 HTTPS（先用 IP:8787 验证）"
  echo ""
  echo "==> 本机自检"
  curl -s http://127.0.0.1:8787/api/health || echo "（接口没响应，看日志）"
  echo ""
  echo ""
  echo "完成。下一步："
  echo "  1. 编辑 $APP_DIR/.env 填 LLM_API_KEY / LAW_API_KEY，然后 systemctl restart tongshi"
  echo "  2. 轻量控制台防火墙放行 8787"
  echo "  3. 浏览器打开 http://<公网IP>:8787"
  exit 0
fi

echo "==> 配置 Caddy 反代 + 自动 HTTPS"
mkdir -p /etc/caddy
cat > /etc/caddy/Caddyfile <<CADDY
$DOMAIN {
	encode gzip zstd
	reverse_proxy 127.0.0.1:8787 {
		flush_interval -1
	}
	header {
		Strict-Transport-Security "max-age=31536000; includeSubDomains"
		X-Content-Type-Options nosniff
		Referrer-Policy strict-origin-when-cross-origin
		-Server
	}
}
CADDY

systemctl enable caddy >/dev/null 2>&1 || true
systemctl reload caddy 2>/dev/null || systemctl restart caddy

echo ""
echo "==> 本机自检"
curl -s http://127.0.0.1:8787/api/health || echo "（接口没响应，看日志）"
echo ""
echo ""
echo "完成。接下来："
echo "  1. 编辑 $APP_DIR/.env 填 LLM_API_KEY / LAW_API_KEY，然后 systemctl restart tongshi"
echo "  2. 浏览器打开 https://$DOMAIN"
echo "  3. 证书首次申请大约 10–30 秒，打不开就等一会儿再试"
