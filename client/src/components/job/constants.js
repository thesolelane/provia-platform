export const BLUE = '#1B3A6B';
export const ORANGE = '#E07B2A';
export const GREEN = '#2E7D32';
export const RED = '#C62828';

export const STATUS_COLORS = {
  received: '#888',
  processing: ORANGE,
  clarification: '#F59E0B',
  review_pending: '#E07B2A',
  proposal_ready: '#3B82F6',
  proposal_sent: '#8B5CF6',
  proposal_approved: '#059669',
  proposal_declined: RED,
  contract_ready: '#0D9488',
  contract_sent: '#047857',
  contract_signed: '#1B3A6B',
  complete: '#111827',
  error: RED,
};

export const STATUS_LABELS = {
  received: 'Received',
  processing: 'Processing',
  clarification: 'Needs Clarification',
  review_pending: 'Review Line Items',
  proposal_ready: 'Proposal Ready',
  proposal_sent: 'Sent for Approval',
  proposal_approved: 'Proposal Approved ✓',
  proposal_declined: 'Changes Requested',
  contract_ready: 'Contract Ready',
  contract_sent: 'Contract Sent',
  contract_signed: 'Contract Signed ✓',
  complete: 'Complete',
  error: 'Error',
};
