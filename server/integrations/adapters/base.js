// server/integrations/adapters/base.js
class BaseAdapter {
  async getEstimate(estimateId) { throw new Error('Not implemented'); }
  async getPendingEstimates() { throw new Error('Not implemented'); }
  async createCustomer(customerData) { throw new Error('Not implemented'); }
  async createInvoice(jobData) { throw new Error('Not implemented'); }
  async sendInvoice(invoiceId) { throw new Error('Not implemented'); }
  async markProcessed(estimateId) { throw new Error('Not implemented'); }
  normalize(rawData) { throw new Error('Not implemented'); }
}
module.exports = BaseAdapter;
