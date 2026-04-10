// PM2 ecosystem config for SIN JAPAN 営業自動化ダッシュボード
// 使い方: pm2 start deployment/ecosystem.config.cjs

const path = require("path");
const APP_DIR = "/var/www/sinjapan-sales";

module.exports = {
  apps: [
    {
      name: "sinjapan-sales-api",
      script: path.join(APP_DIR, "artifacts/api-server/dist/index.mjs"),
      cwd: APP_DIR,
      instances: 1,
      exec_mode: "fork",
      node_args: [],
      env: {
        NODE_ENV: "production",
        PORT: "6050",
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
