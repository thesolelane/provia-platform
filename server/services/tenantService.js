'use strict';
const { supabaseAdmin } = require('./supabase');

async function getTenantById(tenantId) {
  if (!supabaseAdmin) return null;
  const { data, error } = await supabaseAdmin
    .from('tenants')
    .select('*')
    .eq('id', tenantId)
    .single();
  if (error) return null;
  return data;
}

async function getTenantBySlug(slug) {
  if (!supabaseAdmin) return null;
  const { data, error } = await supabaseAdmin
    .from('tenants')
    .select('*')
    .eq('slug', slug)
    .single();
  if (error) return null;
  return data;
}

async function createTenant({ name, slug, license, hicLicense, address, city, state, zip, phone, email, website }) {
  if (!supabaseAdmin) throw new Error('Supabase not configured');
  const { data, error } = await supabaseAdmin
    .from('tenants')
    .insert([{
      name,
      slug: slug || name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-'),
      license:     license     || '',
      hic_license: hicLicense  || '',
      address:     address     || '',
      city:        city        || '',
      state:       state       || '',
      zip:         zip         || '',
      phone:       phone       || '',
      email:       email       || '',
      website:     website     || '',
      provia_plus: false,
      active:      true,
    }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function updateTenant(tenantId, updates) {
  if (!supabaseAdmin) throw new Error('Supabase not configured');
  const { data, error } = await supabaseAdmin
    .from('tenants')
    .update(updates)
    .eq('id', tenantId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function listTenants() {
  if (!supabaseAdmin) return [];
  const { data, error } = await supabaseAdmin
    .from('tenants')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) return [];
  return data;
}

async function deleteTenant(tenantId) {
  if (!supabaseAdmin) throw new Error('Supabase not configured');
  const { error } = await supabaseAdmin
    .from('tenants')
    .delete()
    .eq('id', tenantId);
  if (error) throw error;
  return true;
}

module.exports = { getTenantById, getTenantBySlug, createTenant, updateTenant, listTenants, deleteTenant };
