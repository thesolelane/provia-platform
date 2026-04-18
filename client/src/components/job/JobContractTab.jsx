import React from 'react';
import { BLUE } from './constants';

export default function JobContractTab({ contractData, job }) {
  return (
    <div>
      {!contractData ? (
        <div style={{ color: '#888', textAlign: 'center', padding: 40 }}>
          {['proposal_ready', 'proposal_sent'].includes(job.status)
            ? 'Send the proposal for customer signature first. The contract will auto-generate upon approval.'
            : job.status === 'proposal_approved'
              ? 'Contract is being generated… refresh in a moment.'
              : 'No contract generated yet.'}
        </div>
      ) : (
        <div>
          <h3 style={{ color: BLUE, marginBottom: 16 }}>Contract Summary</h3>
          <pre
            style={{
              background: '#f4f6fb',
              borderRadius: 8,
              padding: 16,
              fontSize: 11,
              overflow: 'auto',
              maxHeight: 400,
            }}
          >
            {JSON.stringify(contractData, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
