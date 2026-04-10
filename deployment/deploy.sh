#!/bin/bash
# ======================================================
# SIN JAPAN 営業自動化ダッシュボード - VPSデプロイスクリプト
# 実行: bash /var/www/sinjapan-sales/deployment/deploy.sh
# ======================================================
set -e

APP_DIR="/var/www/sinjapan-sales"
API_PORT=6050   # ← ポートが競合する場合は変更 (例: 6051, 6052)
GITHUB_REPO="https://github.com/SINJAPANLLC/SINJAPANEIGYOU.git"

echo "============================================"
echo "  ポート競合チェック"
echo "============================================"
echo "現在使用中のポート:"
ss -tlnp | grep LISTEN | awk '{print $4}' | cut -d: -f2 | sort -n | uniq | tr '\n' ' '
echo ""

if ss -tlnp 2>/dev/null | grep -q ":${API_PORT} "; then
  echo ""
  echo "⛔  ポート ${API_PORT} はすでに使用中です！"
  echo "    deploy.sh の API_PORT を別の番号に変更してください"
  echo "    例: API_PORT=6051"
  exit 1
fi
echo "✓  ポート ${API_PORT} は使用可能です"

echo ""
echo "============================================"
echo "  Node.js / pnpm バージョン確認"
echo "============================================"
node --version || { echo "❌ Node.jsが見つかりません。インストールしてください"; exit 1; }
pnpm --version 2>/dev/null || { echo "pnpmをインストール中..."; npm install -g pnpm; }
pm2 --version || { echo "PM2をインストール中..."; npm install -g pm2; }

echo ""
echo "============================================"
echo "  リポジトリ クローン / 更新"
echo "============================================"
mkdir -p "$APP_DIR"
if [ -d "$APP_DIR/.git" ]; then
  echo "既存リポジトリを最新に更新..."
  cd "$APP_DIR" && git pull origin main
else
  git clone "$GITHUB_REPO" "$APP_DIR"
  cd "$APP_DIR"
fi
cd "$APP_DIR"

echo ""
echo "============================================"
echo "  .env ファイル確認"
echo "============================================"
if [ ! -f "$APP_DIR/.env" ]; then
  echo "⚠️  .env ファイルが存在しません。テンプレートを作成します..."
  cat > "$APP_DIR/.env" << ENVEOF
NODE_ENV=production
PORT=${API_PORT}
APP_URL=https://YOUR_DOMAIN_HERE

NEON_DATABASE_URL=postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require
OPENAI_API_KEY=sk-xxx
SMTP_USER=info@sinjapan-sales.site
SMTP_PASS=YOUR_SMTP_PASSWORD
SESSION_SECRET=$(openssl rand -hex 32)
ENVEOF
  echo ""
  echo "📝 .env を作成しました: $APP_DIR/.env"
  echo "   以下の値を正しい値に編集してから、もう一度スクリプトを実行してください:"
  echo "   - APP_URL      : 実際のドメイン (例: https://sales.sinjapan.jp)"
  echo "   - NEON_DATABASE_URL : Neon PostgreSQL接続文字列"
  echo "   - OPENAI_API_KEY"
  echo "   - SMTP_PASS"
  echo ""
  echo "   編集コマンド: nano $APP_DIR/.env"
  exit 1
fi

# .env の PORT を API_PORT に同期
sed -i "s/^PORT=.*/PORT=${API_PORT}/" "$APP_DIR/.env"
echo "✓  .env の PORT を ${API_PORT} に設定しました"

echo ""
echo "============================================"
echo "  依存関係インストール"
echo "============================================"
pnpm install --frozen-lockfile

echo ""
echo "============================================"
echo "  ライブラリ型定義ビルド"
echo "============================================"
echo "  → @workspace/db"
(cd "$APP_DIR/lib/db" && npx tsc -p tsconfig.json)

echo "  → @workspace/api-zod"
(cd "$APP_DIR/lib/api-zod" && npx tsc -p tsconfig.json)

echo ""
echo "============================================"
echo "  APIサーバービルド"
echo "============================================"
(cd "$APP_DIR/artifacts/api-server" && pnpm run build)
echo "✓  dist/index.mjs 生成完了"

echo ""
echo "============================================"
echo "  フロントエンドビルド"
echo "============================================"
(cd "$APP_DIR/artifacts/sales-dashboard" && NODE_ENV=production BASE_PATH=/ PORT=18816 pnpm run build)
echo "✓  静的ファイル: $APP_DIR/artifacts/sales-dashboard/dist/public/"

echo ""
echo "============================================"
echo "  PM2 起動"
echo "============================================"
mkdir -p /var/log/pm2

# ecosystem.config の API_PORT を更新
sed -i "s/\"PORT\": \"[0-9]*\"/\"PORT\": \"${API_PORT}\"/" "$APP_DIR/deployment/ecosystem.config.cjs"

# 既存プロセスを停止してから起動
pm2 delete sinjapan-sales-api 2>/dev/null || true

# .env を読み込んでPM2起動
set -a
source "$APP_DIR/.env"
set +a

pm2 start "$APP_DIR/deployment/ecosystem.config.cjs"
pm2 save
echo "✓  PM2 起動完了"

echo ""
echo "============================================"
echo "  nginx 設定手順 (手動)"
echo "============================================"
echo ""
echo "  1. nginx設定ファイルをコピー:"
echo "     cp $APP_DIR/deployment/nginx.conf /etc/nginx/sites-available/sinjapan-sales"
echo ""
echo "  2. ドメイン名を編集:"
echo "     nano /etc/nginx/sites-available/sinjapan-sales"
echo "     (sales.sinjapan.jp を実際のドメインに変更)"
echo ""
echo "  3. 有効化:"
echo "     ln -sf /etc/nginx/sites-available/sinjapan-sales /etc/nginx/sites-enabled/"
echo "     nginx -t && systemctl reload nginx"
echo ""
echo "  4. SSL証明書 (Let's Encrypt):"
echo "     certbot --nginx -d YOUR_DOMAIN"
echo ""
echo "============================================"
echo "  ✅ デプロイ完了！"
echo "============================================"
pm2 status sinjapan-sales-api
