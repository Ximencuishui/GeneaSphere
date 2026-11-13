/**
 * 后端进程。内存按常驻集（RSS）计算，吃到 1G 时 PM2 重启进程。
 * V8 堆上限仍是 512MB：堆溢出时进程会退出，PM2 同样会拉起来。
 * 1G 这条线主要接住 canvas / Tesseract 堆外内存，那种增长不会触发堆溢出。
 */
module.exports = {
  apps: [
    {
      name: 'geneasphere-server',
      cwd: __dirname,
      script: 'apps/server/dist/main.js',
      node_args: '--max-old-space-size=512',
      max_memory_restart: '1G',
      autorestart: true,
      exp_backoff_restart_delay: 1000,
      env_production: {
        NODE_ENV: 'production',
      },
    },
  ],
};
