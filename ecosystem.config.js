module.exports = {
  apps: [
    {
      name: 'preferred-builders',
      script: 'server/index.js',
      cwd: 'C:\\Users\\theso\\Desktop\\preferred-builders-ai',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        PORT: 5000,
        TZ: 'America/New_York',
        APP_URL: 'https://preferredbuilders.duckdns.org',
        DISABLE_WHATSAPP_POLLER: 'false',
        DISABLE_WHATSAPP_WEBHOOK: 'false'
      }
    }
  ]
};
