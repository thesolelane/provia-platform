export const getStatusStyle = (status) => {
  const s = (status || '').toLowerCase();

  if (s.includes('lost') || s.includes('rejected') || s.includes('declined')) {
    return { bg: '#ef4444', color: '#fff', label: 'Rejected / Lost' };
  }
  if (s.includes('proposal_signed') || s.includes('proposal_approved')) {
    return { bg: '#86efac', color: '#166534', label: 'Proposal Signed' };
  }
  if (s.includes('contract_signed') || s.includes('completed') || s.includes('won')) {
    return { bg: '#16a34a', color: '#fff', label: 'Contract Signed' };
  }
  if (s.includes('proposal_sent') || s.includes('pending')) {
    return { bg: '#eab308', color: '#fff', label: 'Proposal Sent' };
  }
  return { bg: '#64748b', color: '#fff', label: status || 'Unknown' };
};
