// server/routes/departments.js
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { getDb } = require('../db/database');

// GET /api/departments — return all depts with their sub-departments
router.get('/', requireAuth, (req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT dept_id, dept_name, dept_meaning, dept_sort,
           sub_id, sub_name, sub_meaning, sub_sort
    FROM departments
    ORDER BY dept_sort ASC, sub_sort ASC
  `).all();

  // Group into the same shape as departments.json
  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.dept_id)) {
      map.set(row.dept_id, {
        id: row.dept_id,
        name: row.dept_name,
        meaning: row.dept_meaning || '',
        subDepartments: [],
      });
    }
    map.get(row.dept_id).subDepartments.push({
      id: row.sub_id,
      name: row.sub_name,
      meaning: row.sub_meaning || '',
    });
  }

  res.json(Array.from(map.values()));
});

// PUT /api/departments/dept/:deptId — update a department's name and meaning
router.put('/dept/:deptId', requireAuth, (req, res) => {
  const db = getDb();
  const { deptId } = req.params;
  const { name, meaning } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  db.prepare(`
    UPDATE departments
    SET dept_name = ?, dept_meaning = ?, updated_at = CURRENT_TIMESTAMP
    WHERE dept_id = ?
  `).run(name, meaning || '', deptId);

  res.json({ success: true });
});

// PUT /api/departments/sub/:subId — update a sub-department's name and meaning
router.put('/sub/:subId', requireAuth, (req, res) => {
  const db = getDb();
  const { subId } = req.params;
  const { name, meaning } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  db.prepare(`
    UPDATE departments
    SET sub_name = ?, sub_meaning = ?, updated_at = CURRENT_TIMESTAMP
    WHERE sub_id = ?
  `).run(name, meaning || '', subId);

  res.json({ success: true });
});

module.exports = router;
