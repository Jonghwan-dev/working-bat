// Code refactoring JHKim w/ Claude  2026-04-15
// fix: add TZ=Asia/Seoul so PM2 log timestamps display in KST  2026-04-15 JHKim

module.exports = {
  apps: [{
    name:        'working-bat',
    script:      'app.js',
    cwd:         __dirname,
    watch:       false,
    autorestart: true,
    max_memory_restart: '300M',
    env: {
      NODE_ENV: 'production',
      TZ:       'Asia/Seoul',
    },
    error_file:      './logs/err.log',
    out_file:        './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
  }]
};
