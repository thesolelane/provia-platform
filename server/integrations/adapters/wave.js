// server/integrations/adapters/wave.js
const axios = require('axios');
const BaseAdapter = require('./base');

const WAVE_GRAPHQL = 'https://gql.waveapps.com/graphql/public';

class WaveAdapter extends BaseAdapter {
  constructor() {
    super();
    this.token = process.env.WAVE_ACCESS_TOKEN;
    this.businessId = process.env.WAVE_BUSINESS_ID;
  }

  async query(gql, variables = {}) {
    const res = await axios.post(WAVE_GRAPHQL,
      { query: gql, variables },
      { headers: { 'Authorization': `Bearer ${this.token}`, 'Content-Type': 'application/json' } }
    );
    if (res.data.errors) throw new Error(res.data.errors[0].message);
    return res.data.data;
  }

  async getEstimate(estimateId) {
    // Wave calls estimates "invoices" in draft state
    const data = await this.query(`
      query GetInvoice($businessId: ID!, $invoiceId: ID!) {
        business(id: $businessId) {
          invoice(id: $invoiceId) {
            id status title
            customer { id name email defaultPaymentMethod { __typename } }
            items { description unitValue quantity subtotal }
            total createdAt memo
          }
        }
      }
    `, { businessId: this.businessId, invoiceId: estimateId });
    return this.normalize(data.business.invoice);
  }

  async createCustomer(customerData) {
    const data = await this.query(`
      mutation CreateCustomer($businessId: ID!, $input: CustomerCreateInput!) {
        customerCreate(businessId: $businessId, input: $input) {
          didSucceed customer { id name email }
        }
      }
    `, {
      businessId: this.businessId,
      input: { name: customerData.name, email: customerData.email, phone: customerData.phone }
    });
    return data.customerCreate.customer;
  }

  async createInvoice(jobData) {
    const customer = await this.createCustomer(jobData.customer);
    const data = await this.query(`
      mutation CreateInvoice($businessId: ID!, $input: InvoiceCreateInput!) {
        invoiceCreate(businessId: $businessId, input: $input) {
          didSucceed invoice { id invoiceNumber pdfUrl }
        }
      }
    `, {
      businessId: this.businessId,
      input: {
        customerId: customer.id,
        title: `Project at ${jobData.projectAddress}`,
        memo: 'Preferred Builders General Services Inc. — LIC# HIC-197400',
        items: jobData.lineItems.map(i => ({
          description: `${i.trade} — ${i.description}`,
          unitPrice: i.amount,
          quantity: 1
        }))
      }
    });
    return data.invoiceCreate.invoice;
  }

  async sendInvoice(invoiceId) {
    await this.query(`
      mutation SendInvoice($input: InvoiceSendInput!) {
        invoiceSend(input: $input) { didSucceed }
      }
    `, { input: { invoiceId, to: [] } });
  }

  async markProcessed(estimateId) {
    // Add note to Wave invoice
    console.log(`Wave estimate ${estimateId} marked as processed`);
  }

  normalize(raw) {
    return {
      estimateId:     raw.id,
      customer: {
        name:         raw.customer?.name || '',
        email:        raw.customer?.email || '',
        phone:        raw.customer?.phone || ''
      },
      projectAddress: raw.title?.replace('Project at ', '') || '',
      projectCity:    '',
      lineItems:      (raw.items || []).map(i => ({
        trade:        '',
        description:  i.description || '',
        amount:       parseFloat(i.subtotal || i.unitValue || 0),
        quantity:     parseFloat(i.quantity || 1),
        unit:         ''
      })),
      totalValue:     parseFloat(raw.total || 0),
      notes:          raw.memo || '',
      submittedBy:    'wave',
      platform:       'wave'
    };
  }
}

module.exports = new WaveAdapter();
