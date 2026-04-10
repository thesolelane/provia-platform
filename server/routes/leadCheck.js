// server/routes/leadCheck.js
// GET /api/lead-check?town=FITCHBURG&street=MAIN%20ST&number=100
// Server-side proxy for leadsafehomes.mass.gov (CORS workaround).

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { checkLeadRecord } = require('../services/leadCheckService');

router.get('/', requireAuth, async (req, res) => {
  const { town, street, number } = req.query;
  if (!town || !street) {
    return res.status(400).json({ error: 'town and street are required' });
  }

  try {
    const result = await checkLeadRecord({ town, street, number });
    res.json(result);
  } catch (err) {
    console.error('[lead-check]', err.message);
    res.status(502).json({
      error: 'Failed to reach Lead Safe Homes database.',
      detail: err.message,
    });
  }
});

module.exports = router;
