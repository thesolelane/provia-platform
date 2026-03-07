// server/integrations/adapters/hearth.js
const axios = require('axios');
const BaseAdapter = require('./base');

class HearthAdapter extends BaseAdapter {
  constructor() {
    super();
    this.baseURL = 'https://api.gethearth.com/v1';
    this.apiKey = process.env.HEARTH_API_KEY;
  }

  headers() {
    return { 'Authorization': `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' };
  }

  async getEstimate(estimateId) {
    const res = await axios.get(`${this.baseURL}/estimates/${estimateId}`, { headers: this.headers() });
    return this.normalize(res.data);
  }

  async getPendingEstimates() {
    const res = await axios.get(`${this.baseURL}/estimates?status=completed`, { headers: this.headers() });
    return (res.data.estimates || []).map(e => this.normalize(e));
  }

  async createCustomer(customerData) {
    // Hearth manages customers internally — no-op
    return { id: customerData.email };
  }

  async createInvoice(jobData) {
    // Hearth invoice creation — adapt to actual Hearth API
    const res = await axios.post(`${this.baseURL}/invoices`, {
      customer_email: jobData.customerEmail,
      amount: jobData.totalValue,
      description: `Project at ${jobData.projectAddress}`,
      line_items: jobData.lineItems
    }, { headers: this.headers() });
    return res.data;
  }

  async sendInvoice(invoiceId) {
    await axios.post(`${this.baseURL}/invoices/${invoiceId}/send`, {}, { headers: this.headers() });
  }

  async markProcessed(estimateId) {
    // Tag estimate as processed in Hearth
    try {
      await axios.patch(`${this.baseURL}/estimates/${estimateId}`, { tags: ['pb_processed'] }, { headers: this.headers() });
    } catch (e) {
      console.log('Could not mark Hearth estimate as processed:', e.message);
    }
  }

  normalize(raw) {
    // Adapt field names to match actual Hearth API response structure
    return {
      estimateId:     raw.id || raw.estimate_id,
      customer: {
        name:         raw.customer?.name || raw.client_name || '',
        email:        raw.customer?.email || raw.client_email || '',
        phone:        raw.customer?.phone || raw.client_phone || ''
      },
      projectAddress: raw.project_address || raw.address || '',
      projectCity:    raw.city || '',
      lineItems:      (raw.line_items || raw.items || []).map(i => ({
        trade:        i.category || i.trade || '',
        description:  i.name || i.description || '',
        amount:       parseFloat(i.amount || i.price || i.total || 0),
        quantity:     parseFloat(i.quantity || 1),
        unit:         i.unit || ''
      })),
      totalValue:     parseFloat(raw.total || raw.total_amount || 0),
      notes:          raw.notes || raw.description || '',
      submittedBy:    raw.created_by || 'hearth',
      platform:       'hearth'
    };
  }
}

module.exports = new HearthAdapter();
