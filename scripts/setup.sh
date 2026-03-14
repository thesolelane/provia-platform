#!/bin/bash
# scripts/setup.sh
# First-run setup wizard for Preferred Builders AI System
# Run: bash scripts/setup.sh

set -e

BLUE='\033[0;34m'
ORANGE='\033[0;33m'
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'
BOLD='\033[1m'

echo ""
echo -e "${BLUE}${BOLD}================================================${NC}"
echo -e "${BLUE}${BOLD}  PREFERRED BUILDERS AI — SETUP WIZARD         ${NC}"
echo -e "${BLUE}${BOLD}================================================${NC}"
echo ""
echo "This wizard will configure your system."
echo "You can re-run this anytime to update settings."
echo ""

# Check if .env already exists
if [ -f .env ]; then
  echo -e "${ORANGE}⚠️  .env file already exists.${NC}"
  read -p "Overwrite it? (y/N): " overwrite
  if [[ ! "$overwrite" =~ ^[Yy]$ ]]; then
    echo "Keeping existing .env — setup complete."
    exit 0
  fi
fi

# ── Copy template ────────────────────────────────────────────────────────────
cp .env.example .env
echo -e "${GREEN}✓ Created .env from template${NC}"
echo ""

# ── User accounts note ───────────────────────────────────────────────────────
echo -e "${BOLD}1. USER ACCOUNTS${NC}"
echo -e "  Two user accounts are seeded automatically when the app first starts:"
echo -e "  • Anthony Cooper  — cooper@preferredbuilders.com"
echo -e "  • Jackson Deaquino — jackson.deaquino@preferredbuildersusa.com"
echo -e "  Default temp password: ${BOLD}Preferred2024!${NC} — change after first login."
echo ""

# ── Anthropic API ────────────────────────────────────────────────────────────
echo -e "${BOLD}2. ANTHROPIC (Claude AI)${NC}"
echo "  Get your key at: https://console.anthropic.com"
read -p "  Anthropic API Key: " anthropic_key
sed -i "s/ANTHROPIC_API_KEY=.*/ANTHROPIC_API_KEY=$anthropic_key/" .env
echo -e "${GREEN}  ✓ Anthropic key saved${NC}"
echo ""

# ── Twilio WhatsApp ──────────────────────────────────────────────────────────
echo -e "${BOLD}3. TWILIO WHATSAPP${NC}"
echo "  Get credentials at: https://console.twilio.com"
read -p "  Twilio Account SID: " twilio_sid
read -p "  Twilio Auth Token: " twilio_token
read -p "  Twilio WhatsApp Number (e.g. +14155238886): " twilio_number
sed -i "s/TWILIO_ACCOUNT_SID=.*/TWILIO_ACCOUNT_SID=$twilio_sid/" .env
sed -i "s/TWILIO_AUTH_TOKEN=.*/TWILIO_AUTH_TOKEN=$twilio_token/" .env
sed -i "s/TWILIO_WHATSAPP_NUMBER=.*/TWILIO_WHATSAPP_NUMBER=$twilio_number/" .env
echo -e "${GREEN}  ✓ Twilio credentials saved${NC}"
echo ""

# ── Jackson's WhatsApp ───────────────────────────────────────────────────────
echo -e "${BOLD}4. TEAM WHATSAPP NUMBERS${NC}"
read -p "  Jackson's WhatsApp number (e.g. +19781234567): " jackson_number
read -p "  Owner's WhatsApp number: " owner_number
sed -i "s/JACKSON_WHATSAPP=.*/JACKSON_WHATSAPP=$jackson_number/" .env
sed -i "s/OWNER_WHATSAPP=.*/OWNER_WHATSAPP=$owner_number/" .env
echo -e "${GREEN}  ✓ Team numbers saved${NC}"
echo ""

# ── Mailgun ──────────────────────────────────────────────────────────────────
echo -e "${BOLD}5. MAILGUN (Email)${NC}"
echo "  Get credentials at: https://app.mailgun.com"
read -p "  Mailgun API Key: " mg_key
read -p "  Mailgun Domain (e.g. mg.preferredbuildersusa.com): " mg_domain
read -p "  Your email address: " pb_email
sed -i "s/MAILGUN_API_KEY=.*/MAILGUN_API_KEY=$mg_key/" .env
sed -i "s/MAILGUN_DOMAIN=.*/MAILGUN_DOMAIN=$mg_domain/" .env
sed -i "s/PB_FROM_EMAIL=.*/PB_FROM_EMAIL=$pb_email/" .env
echo -e "${GREEN}  ✓ Mailgun settings saved${NC}"
echo ""

# ── Integration platform ─────────────────────────────────────────────────────
echo -e "${BOLD}6. ESTIMATION PLATFORM${NC}"
echo "  Which platform are you using?"
echo "  1) Hearth (current)"
echo "  2) Wave (future)"
read -p "  Choice (1 or 2): " platform_choice
if [ "$platform_choice" = "2" ]; then
  sed -i "s/ESTIMATION_PLATFORM=.*/ESTIMATION_PLATFORM=wave/" .env
  echo -e "${GREEN}  ✓ Wave selected${NC}"
  read -p "  Wave Access Token: " wave_key
  sed -i "s/WAVE_ACCESS_TOKEN=.*/WAVE_ACCESS_TOKEN=$wave_key/" .env
  read -p "  Wave Business ID: " wave_biz
  sed -i "s/WAVE_BUSINESS_ID=.*/WAVE_BUSINESS_ID=$wave_biz/" .env
else
  sed -i "s/ESTIMATION_PLATFORM=.*/ESTIMATION_PLATFORM=hearth/" .env
  echo -e "${GREEN}  ✓ Hearth selected${NC}"
  read -p "  Hearth API Key (or press Enter to skip): " hearth_key
  if [ -n "$hearth_key" ]; then
    sed -i "s/HEARTH_API_KEY=.*/HEARTH_API_KEY=$hearth_key/" .env
    echo -e "${GREEN}  ✓ Hearth key saved${NC}"
  fi
fi
echo ""

# ── App URL ──────────────────────────────────────────────────────────────────
echo -e "${BOLD}7. APP URL${NC}"
echo "  Where will this app be hosted?"
echo "  (e.g. https://preferred-builders.replit.app or your VPS IP)"
read -p "  App URL: " app_url
sed -i "s|APP_URL=.*|APP_URL=$app_url|" .env
echo -e "${GREEN}  ✓ URL saved${NC}"
echo ""

# ── Webhook secret ───────────────────────────────────────────────────────────
# Generate a random webhook secret
WEBHOOK_SECRET=$(openssl rand -hex 32)
sed -i "s/WEBHOOK_SECRET=.*/WEBHOOK_SECRET=$WEBHOOK_SECRET/" .env
echo -e "${GREEN}✓ Webhook secret generated automatically${NC}"
echo ""

# ── Create required directories ───────────────────────────────────────────────
mkdir -p data uploads outputs knowledge-base docker/ssl
echo -e "${GREEN}✓ Data directories created${NC}"
echo ""

# ── Summary ──────────────────────────────────────────────────────────────────
echo -e "${BLUE}${BOLD}================================================${NC}"
echo -e "${GREEN}${BOLD}  ✅ SETUP COMPLETE!${NC}"
echo -e "${BLUE}${BOLD}================================================${NC}"
echo ""
echo -e "Start the app:  ${BOLD}docker-compose up -d${NC}"
echo -e "Admin panel:    ${BOLD}$app_url/admin${NC}"
echo ""
echo -e "${ORANGE}WEBHOOK URLS to configure in your platforms:${NC}"
echo -e "  Hearth webhook:   $app_url/webhook/hearth"
echo -e "  Wave webhook:     $app_url/webhook/wave"
echo -e "  Twilio webhook:   $app_url/webhook/whatsapp"
echo -e "  Mailgun webhook:  $app_url/webhook/email"
echo ""
echo -e "${ORANGE}Jackson's WhatsApp Field Guide:${NC}"
echo -e "  $app_url/guide"
echo ""
