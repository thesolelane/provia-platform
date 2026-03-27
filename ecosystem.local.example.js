// ecosystem.local.js — copy this file to ecosystem.local.js and fill in your values
// This file is in .gitignore — it will NEVER be overwritten by git pull
// Start with: pm2 start ecosystem.local.js

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
        DISABLE_WHATSAPP_WEBHOOK: 'false',
        SIGNED_CONTRACTS_DIR: 'C:\\Users\\theso\\Desktop\\Preferred Builders signed Contracts',
        SMTP_HOST: 'smtp.contactpreferred.com',
        SMTP_PORT: '587',
        SMTP_USER: 'noreply@contactpreferred.com',
        SMTP_PASS: 'FILL_IN',
        BOT_EMAIL: 'noreply@contactpreferred.com',
        OWNER_EMAIL: 'cooper@preferredbuildersusa.com',
        ANTHROPIC_API_KEY: 'FILL_IN',
        TWILIO_ACCOUNT_SID: 'FILL_IN',
        TWILIO_AUTH_TOKEN: 'FILL_IN',
        TWILIO_LIVE_ACCOUNT_SID: 'FILL_IN',
        TWILIO_LIVE_AUTH_TOKEN: 'FILL_IN',
        TWILIO_API_KEY: 'FILL_IN',
        TWILIO_API_SECRET: 'FILL_IN',
        TWILIO_WHATSAPP_NUMBER: 'whatsapp:+14155238886',
        OWNER_WHATSAPP: 'whatsapp:+19783201714',
        JACKSON_WHATSAPP: 'whatsapp:+19782278941'
      }
    }
  ]
};
