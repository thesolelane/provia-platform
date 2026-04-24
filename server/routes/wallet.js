// server/routes/wallet.js
// $CATH token wallet registration and discount status for Provia+.
// We receive and store ONLY the public key — private keys never touch this server.

const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { checkDiscount, snapshotThreshold, CATH_MINT, MIN_USD } = require('../services/cathService');
const tenant = require('../../config/tenant.config');

// ── Helpers ───────────────────────────────────────────────────────────────────

function getSetting(db, key) {
  return db.prepare("SELECT value FROM settings WHERE key = ?").get(key)?.value || null;
}

function setSetting(db, key, value, category = 'cath', label = '') {
  db.prepare(`
    INSERT INTO settings (key, value, category, label)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
  `).run(key, String(value), category, label);
}

// ── POST /api/wallet/register ─────────────────────────────────────────────────
// Body: { publicKey, encryptedKeyBundle, userEmail }
// Saves the public key, emails the encrypted bundle to the user, snapshots threshold.

router.post('/register', async (req, res) => {
  try {
    const { publicKey, encryptedKeyBundle, userEmail } = req.body;

    if (!publicKey || typeof publicKey !== 'string' || publicKey.length < 32) {
      return res.status(400).json({ error: 'Invalid public key.' });
    }
    if (!encryptedKeyBundle) {
      return res.status(400).json({ error: 'Encrypted key bundle required.' });
    }
    if (!userEmail) {
      return res.status(400).json({ error: 'User email required to send key bundle.' });
    }

    const db = getDb();

    // Check not already registered
    const existing = getSetting(db, 'cath.walletAddress');
    if (existing) {
      return res.status(409).json({ error: 'A wallet is already registered for this deployment.' });
    }

    // Snapshot threshold at registration time
    const threshold = await snapshotThreshold();

    // Persist public key + threshold
    setSetting(db, 'cath.walletAddress', publicKey, 'cath', 'CATH Wallet Public Key');
    setSetting(db, 'cath.thresholdUsd', threshold, 'cath', 'CATH Minimum USD Threshold');
    setSetting(db, 'cath.registeredAt', new Date().toISOString(), 'cath', 'CATH Wallet Registered At');

    // Email the encrypted key bundle to the user
    try {
      const { sendEmail } = require('../services/emailService');
      await sendEmail({
        to: [userEmail],
        subject: `🔑 Your Provia+ Wallet Key — Keep This Safe`,
        html: `
<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto">
  <div style="background:#1B3A6B;padding:20px 24px;border-radius:8px 8px 0 0">
    <h2 style="color:white;margin:0;font-size:18px">🔑 Your Provia+ Wallet Key Bundle</h2>
  </div>
  <div style="background:white;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">
    <p style="font-size:14px;color:#374151">Your Solana wallet has been generated in your browser and the private key was encrypted with your passphrase before leaving your device.</p>
    <p style="font-size:14px;color:#374151"><strong>This server never saw your private key.</strong> The encrypted bundle below can only be decrypted with your passphrase.</p>

    <div style="background:#F3F4F6;border-radius:6px;padding:14px;margin:16px 0">
      <div style="font-size:11px;color:#6B7280;margin-bottom:6px;font-weight:bold;text-transform:uppercase">Your Public Wallet Address</div>
      <code style="font-size:12px;color:#1B3A6B;word-break:break-all">${publicKey}</code>
    </div>

    <div style="background:#FEF3C7;border:1px solid #FCD34D;border-radius:6px;padding:14px;margin:16px 0">
      <div style="font-size:11px;color:#92400E;margin-bottom:6px;font-weight:bold;text-transform:uppercase">Encrypted Key Bundle</div>
      <code style="font-size:11px;color:#374151;word-break:break-all">${encryptedKeyBundle}</code>
    </div>

    <div style="background:#EFF6FF;border-radius:6px;padding:14px;margin:16px 0">
      <p style="font-size:13px;color:#1E40AF;margin:0 0 8px;font-weight:bold">Next Steps to Activate Your 50% Discount:</p>
      <ol style="font-size:13px;color:#374151;margin:0;padding-left:20px;line-height:1.8">
        <li>Save this email somewhere safe — this is your only copy of the encrypted key.</li>
        <li>Send <strong>$${threshold}+ worth of $CATH tokens</strong> to your wallet address above.</li>
        <li>Token contract: <code style="font-size:11px">${CATH_MINT}</code></li>
        <li>Return to Provia+ and click <strong>"Check My Balance"</strong> to activate your discount.</li>
      </ol>
    </div>

    <p style="font-size:12px;color:#9CA3AF;margin-top:20px">
      This email was sent by ${tenant.platform.name} on behalf of ${tenant.company.name}.<br>
      If you did not initiate this, contact your administrator immediately.
    </p>
  </div>
</div>`,
        emailType: 'system_alert',
      });
    } catch (emailErr) {
      console.warn('[Wallet] Key email failed:', emailErr.message);
      // Don't fail the registration — key is in the response too
    }

    res.json({
      ok: true,
      publicKey,
      thresholdUsd: threshold,
      mintAddress: CATH_MINT,
      message: `Wallet registered. Encrypted key bundle sent to ${userEmail}.`,
    });
  } catch (e) {
    console.error('[Wallet] Register error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/wallet/status ────────────────────────────────────────────────────
// Returns current wallet, balance, price, discount status.

router.get('/status', async (req, res) => {
  try {
    const db = getDb();
    const walletAddress = getSetting(db, 'cath.walletAddress');
    const thresholdUsd = parseFloat(getSetting(db, 'cath.thresholdUsd') || MIN_USD);
    const registeredAt = getSetting(db, 'cath.registeredAt');

    if (!walletAddress) {
      return res.json({ registered: false, discountActive: false, minUsd: MIN_USD, mintAddress: CATH_MINT });
    }

    const status = await checkDiscount(walletAddress, thresholdUsd);

    // Cache last check time
    setSetting(db, 'cath.lastCheckedAt', new Date().toISOString(), 'cath', 'CATH Last Balance Check');
    if (!status.uncertain) {
      setSetting(db, 'cath.discountActive', status.discountActive ? '1' : '0', 'cath', 'CATH Discount Active');
    }

    res.json({
      registered: true,
      walletAddress,
      registeredAt,
      thresholdUsd,
      mintAddress: CATH_MINT,
      ...status,
    });
  } catch (e) {
    console.error('[Wallet] Status error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── DELETE /api/wallet/unregister ─────────────────────────────────────────────
// Admin only — removes wallet registration (doesn't touch the actual wallet).

router.delete('/unregister', (req, res) => {
  try {
    const db = getDb();
    ['cath.walletAddress','cath.thresholdUsd','cath.registeredAt','cath.lastCheckedAt','cath.discountActive']
      .forEach(key => db.prepare('DELETE FROM settings WHERE key = ?').run(key));
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
