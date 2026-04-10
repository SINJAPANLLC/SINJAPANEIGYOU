// PM2 ecosystem config for SIN JAPAN 営業自動化ダッシュボード
// .env を source するシェルラッパー経由で起動

const APP_DIR = "/var/www/sinjapan-sales";

module.exports = {
  apps: [
    {
      name: "sinjapan-sales-api",
      script: `${APP_DIR}/start.sh`,
      interpreter: "bash",
      cwd: APP_DIR,
      instances: 1,
      exec_mode: "fork",
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
