// PM2 ecosystem config for SIN JAPAN 営業自動化ダッシュボード
// Node.js 20.6+ の --env-file フラグで .env を直接読み込む

const APP_DIR = "/var/www/sinjapan-sales";

module.exports = {
  apps: [
    {
      name: "sinjapan-sales-api",
      script: `${APP_DIR}/artifacts/api-server/dist/index.mjs`,
      cwd: APP_DIR,
      instances: 1,
      exec_mode: "fork",
      // Node.js 20.6+ の --env-file で .env を読み込む
      node_args: [`--env-file=${APP_DIR}/.env`],
      env: {
        NODE_ENV: "production",
      },
      restart_delay: 3000,
      max_restarts: 10,
      min_uptime: "10s",
      kill_timeout: 5000,
      error_file: "/var/log/pm2/sinjapan-sales-error.log",
      out_file: "/var/log/pm2/sinjapan-sales-out.log",
      merge_logs: true,
      time: true,
    },
  ],
};
