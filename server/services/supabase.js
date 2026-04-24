'use strict';
const { createClient } = require('@supabase/supabase-js');

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.SUPABASE_ANON_KEY;

if (!url || !serviceKey) {
  console.warn('[Supabase] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set — tenant features disabled');
}

// Admin client — full access, server-side only
const supabaseAdmin = url && serviceKey
  ? createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
  : null;

// Anon client — for public-facing operations
const supabase = url && anonKey
  ? createClient(url, anonKey)
  : null;

module.exports = { supabase, supabaseAdmin };
