// server/routes/remoteUpdate.js
// Secure endpoint to trigger git pull + rebuild + restart from anywhere
// Only active on the Windows server (not Replit)

const express = require('express');
const router = express.Router();
const { exec } = require('child_process');
const path = require('path');

const UPDATE_SECRET = process.env.UPDATE_SECRET;
const PROJECT_DIR = path.resolve(__dirname, '../../');
const IS_WINDOWS = process.platform === 'win32';

router.post('/', (req, res) => {
  if (!UPDATE_SECRET) {
    return res.status(503).json({ error: 'Remote update not configured (UPDATE_SECRET not set)' });
  }

  const secret = req.headers['x-update-secret'] || req.body?.secret;
  if (!secret || secret !== UPDATE_SECRET) {
    return res.status(403).json({ error: 'Invalid secret' });
  }

  res.json({ ok: true, message: 'Update started — check back in 60 seconds' });

  const cmd = IS_WINDOWS
    ? `cd /d "${PROJECT_DIR}" && git pull && npm install && cd client && npm install && npm run build && cd .. && pm2 restart preferred-builders`
    : `cd "${PROJECT_DIR}" && git pull && npm install && cd client && npm install && npm run build && cd .. && pm2 restart preferred-builders`;

  const shell = IS_WINDOWS ? 'cmd' : '/bin/sh';
  const shellFlag = IS_WINDOWS ? '/c' : '-c';

  exec(`${shell} ${shellFlag} "${cmd}"`, { timeout: 180000 }, (err, stdout, stderr) => {
    if (err) {
      console.error('[RemoteUpdate] Failed:', err.message);
      console.error('[RemoteUpdate] stderr:', stderr);
    } else {
      console.log('[RemoteUpdate] Success:', stdout.slice(-500));
    }
  });
});

router.get('/status', (req, res) => {
  const secret = req.headers['x-update-secret'] || req.query.secret;
  if (!UPDATE_SECRET || !secret || secret !== UPDATE_SECRET) {
    return res.status(403).json({ error: 'Invalid secret' });
  }
  const { execSync } = require('child_process');
  try {
    const hash = execSync('git rev-parse --short HEAD', { cwd: PROJECT_DIR }).toString().trim();
    const msg = execSync('git log -1 --pretty=%s', { cwd: PROJECT_DIR }).toString().trim();
    const date = execSync('git log -1 --pretty=%cd --date=format:"%Y-%m-%d %H:%M"', { cwd: PROJECT_DIR }).toString().trim();
    res.json({ commit: hash, message: msg, date, platform: process.platform });
  } catch (e) {
    res.json({ error: e.message });
  }
});

module.exports = router;
