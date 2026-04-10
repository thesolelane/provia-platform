'use strict';

function requireFields(fields) {
  return (req, res, next) => {
    for (const field of fields) {
      const val = req.body[field];
      if (val === undefined || val === null || String(val).trim() === '') {
        return res.status(400).json({ error: `${field} is required` });
      }
    }
    next();
  };
}

function validateEmail(field) {
  return (req, res, next) => {
    const val = req.body[field];
    if (val === undefined || val === null || val === '') return next();
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRe.test(String(val).trim())) {
      return res.status(400).json({ error: `${field} must be a valid email address` });
    }
    next();
  };
}

function validateNumber(field, opts = {}) {
  return (req, res, next) => {
    const val = req.body[field];
    if (val === undefined || val === null) return next();
    const n = Number(val);
    if (!Number.isFinite(n)) {
      return res.status(400).json({ error: `${field} must be a number` });
    }
    if (opts.min !== undefined && n < opts.min) {
      return res.status(400).json({ error: `${field} must be at least ${opts.min}` });
    }
    if (opts.max !== undefined && n > opts.max) {
      return res.status(400).json({ error: `${field} must be at most ${opts.max}` });
    }
    next();
  };
}

function validateEnum(field, values) {
  return (req, res, next) => {
    const val = req.body[field];
    if (val === undefined || val === null) return next();
    if (!values.includes(val)) {
      return res.status(400).json({
        error: `${field} must be one of: ${values.join(', ')}`,
      });
    }
    next();
  };
}

function validateMinLength(field, min) {
  return (req, res, next) => {
    const val = req.body[field];
    if (val === undefined || val === null || val === '') return next();
    if (String(val).length < min) {
      return res.status(400).json({ error: `${field} must be at least ${min} characters` });
    }
    next();
  };
}

module.exports = { requireFields, validateEmail, validateNumber, validateEnum, validateMinLength };
