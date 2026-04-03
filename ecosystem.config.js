module.exports = {
  apps: [{
    name: 'trading-bot',
    script: 'src/index.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'development',
    },
    env_production: {
      NODE_ENV: 'production',
    },
    error_file: 'logs/err.log',
    out_file: 'logs/out.log',
    log_file: 'logs/combined.log',
    time: true,
    // Restart on memory limit
    max_memory_restart: '500M',
    // Graceful shutdown
    kill_timeout: 5000,
    // Wait for ready signal
    wait_ready: true,
    // Listen timeout for ready signal
    listen_timeout: 10000,
    // Increase restart delay
    exp_backoff_restart_delay: 100,
    // Cluster mode (if needed)
    // exec_mode: 'cluster',
    // instances: 'max',
  }],

  deploy: {
    production: {
      user: 'node',
      host: 'localhost',
      ref: 'origin/master',
      repo: 'git@github.com:yourusername/binance-trading-bot.git',
      path: '/var/www/trading-bot',
      'post-deploy': 'npm ci --only=production && pm2 reload ecosystem.config.js --env production',
      env: {
        NODE_ENV: 'production'
      }
    }
  }
};