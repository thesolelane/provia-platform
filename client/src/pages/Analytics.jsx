import { useState, useEffect } from 'react';

const BLUE = '#1B3A6B';
const ORANGE = '#E07B2A';
const GREEN = '#2E7D32';
const RED = '#C62828';

const LOSS_COLORS = {
  lost_price: '#E53935',
  lost_timing: '#FB8C00',
  lost_competitor: '#8E24AA',
  ghosted: '#78909C',
};

export default function Analytics({ token }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState('all');

  const load = () => {
    const q = range !== 'all' ? `?range=${range}` : '';
    fetch(`/api/analytics/pipeline${q}`, { headers: { 'x-auth-token': token } })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { load(); }, [range]);

  if (loading) return <div style={{ padding: 40, color: '#888' }}>Loading analytics...</div>;
  if (!data) return <div style={{ padding: 40, color: RED }}>Failed to load analytics data.</div>;

  const { pipeline, winRate, lossBreakdown, proposalVelocity, monthlyRevenue, summary } = data;
  const totalActive = pipeline.reduce((s, p) => s + p.count, 0);
  const maxPipeline = Math.max(...pipeline.map(p => p.count), 1);
  const maxLoss = Math.max(...(lossBreakdown.map(l => l.count) || [0]), 1);
  const maxRevenue = Math.max(...(monthlyRevenue.map(r => r.value) || [0]), 1);

  const ranges = [
    { value: '30', label: '30 days' },
    { value: '90', label: '90 days' },
    { value: '365', label: '1 year' },
    { value: 'all', label: 'All time' },
  ];

  const formatMonth = (m) => {
    const [y, mo] = m.split('-');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[parseInt(mo) - 1]} ${y}`;
  };

  return (
    <div style={{ padding: 32 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 'bold', color: BLUE, margin: 0 }}>Analytics</h1>
          <p style={{ color: '#888', fontSize: 13, marginTop: 4 }}>Pipeline health, win rate, and business intelligence</p>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {ranges.map(r => (
            <button key={r.value} onClick={() => setRange(r.value)} style={{
              padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: range === r.value ? 'bold' : 'normal', cursor: 'pointer',
              background: range === r.value ? BLUE : 'white', color: range === r.value ? 'white' : '#555',
              border: range === r.value ? 'none' : '1px solid #ddd'
            }}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 20 }}>
          <StatCard icon="📋" label="Total Jobs (YTD)" value={summary.totalJobs} sub={`${summary.quotesYTD} quotes completed`} color={BLUE} />
          <StatCard icon="💰" label="Pipeline Value" value={`$${(summary.pipelineValue || 0).toLocaleString()}`} sub={`${totalActive} active jobs`} color={ORANGE} />
          <StatCard icon="📈" label="Won Revenue (YTD)" value={`$${(summary.wonRevenueYTD || 0).toLocaleString()}`} sub={`${winRate.won} jobs won`} color={GREEN} />
          <StatCard icon="🏆" label="Win Rate" value={winRate.rate !== null ? `${winRate.rate}%` : '—'} sub={winRate.total > 0 ? `${winRate.won}W / ${winRate.lost}L` : 'No closed jobs yet'} color={GREEN} />
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 28 }}>
        <StatCard icon="⚡" label="Intake → Proposal Sent" value={proposalVelocity.intakeToProposal !== null ? `${proposalVelocity.intakeToProposal}d` : '—'} sub={proposalVelocity.intakeToProposalCount > 0 ? `Based on ${proposalVelocity.intakeToProposalCount} won jobs` : 'Not enough data'} color={ORANGE} />
        <StatCard icon="📝" label="Proposal Sent → Signed" value={proposalVelocity.proposalToSigned !== null ? `${proposalVelocity.proposalToSigned}d` : '—'} sub={proposalVelocity.proposalToSignedCount > 0 ? `Based on ${proposalVelocity.proposalToSignedCount} won jobs` : 'Not enough data'} color="#8B5CF6" />
        {summary?.avgWonMargin !== null && (
          <StatCard icon="💵" label="Avg Won Margin" value={`${summary.avgWonMargin}%`} sub={`Across ${winRate.won} won jobs`} color={BLUE} />
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
        <div style={{ background: 'white', borderRadius: 12, padding: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
          <h3 style={{ fontSize: 15, fontWeight: 'bold', color: BLUE, margin: '0 0 16px 0' }}>Pipeline Funnel</h3>
          {totalActive === 0 ? (
            <EmptyState message="No active jobs in the pipeline yet." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {pipeline.map((stage, i) => {
                const prev = i > 0 ? pipeline[i - 1].count : null;
                const conversion = prev && prev > 0 ? Math.round((stage.count / prev) * 100) : null;
                return (
                  <div key={stage.status} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 110, fontSize: 11, color: '#555', textAlign: 'right', flexShrink: 0 }}>{stage.label}</div>
                    <div style={{ flex: 1, height: 22, background: '#f0f0f0', borderRadius: 4, overflow: 'hidden', position: 'relative' }}>
                      <div style={{
                        width: `${Math.max((stage.count / maxPipeline) * 100, stage.count > 0 ? 4 : 0)}%`,
                        height: '100%', background: `linear-gradient(90deg, ${BLUE}, #3B82F6)`, borderRadius: 4,
                        transition: 'width 0.3s'
                      }} />
                      {stage.count > 0 && (
                        <span style={{ position: 'absolute', left: 8, top: 3, fontSize: 11, fontWeight: 'bold', color: stage.count / maxPipeline > 0.3 ? 'white' : '#333' }}>
                          {stage.count}
                        </span>
                      )}
                    </div>
                    {conversion !== null && (
                      <div style={{ fontSize: 10, color: '#888', width: 40, flexShrink: 0 }}>{conversion}%</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ background: 'white', borderRadius: 12, padding: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
          <h3 style={{ fontSize: 15, fontWeight: 'bold', color: BLUE, margin: '0 0 16px 0' }}>Loss Reason Breakdown</h3>
          {lossBreakdown.length === 0 ? (
            <EmptyState message="No loss data recorded yet. Archive jobs with an outcome to start tracking." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {lossBreakdown.map(loss => (
                <div key={loss.reason} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 80, fontSize: 13, fontWeight: 600, color: LOSS_COLORS[loss.reason] || '#555' }}>{loss.label}</div>
                  <div style={{ flex: 1, height: 28, background: '#f5f5f5', borderRadius: 6, overflow: 'hidden', position: 'relative' }}>
                    <div style={{
                      width: `${Math.max((loss.count / maxLoss) * 100, 8)}%`,
                      height: '100%', background: LOSS_COLORS[loss.reason] || '#888', borderRadius: 6,
                      opacity: 0.8, transition: 'width 0.3s'
                    }} />
                    <span style={{ position: 'absolute', left: 10, top: 6, fontSize: 12, fontWeight: 'bold', color: 'white' }}>
                      {loss.count}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ background: 'white', borderRadius: 12, padding: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
        <h3 style={{ fontSize: 15, fontWeight: 'bold', color: BLUE, margin: '0 0 16px 0' }}>Revenue by Month (Won Jobs)</h3>
        {monthlyRevenue.length === 0 ? (
          <EmptyState message="No won revenue recorded yet. Jobs reaching Contract Signed or Complete status are counted as wins." />
        ) : (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 200, paddingTop: 10 }}>
            {monthlyRevenue.map(m => (
              <div key={m.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
                <div style={{ fontSize: 10, fontWeight: 'bold', color: BLUE, marginBottom: 4 }}>
                  ${m.value >= 1000 ? `${Math.round(m.value / 1000)}k` : m.value}
                </div>
                <div style={{
                  width: '100%', maxWidth: 50, borderRadius: '4px 4px 0 0',
                  background: `linear-gradient(180deg, ${GREEN}, #43A047)`,
                  height: `${Math.max((m.value / maxRevenue) * 160, 8)}px`,
                  transition: 'height 0.3s'
                }} />
                <div style={{ fontSize: 9, color: '#888', marginTop: 6, textAlign: 'center' }}>{formatMonth(m.month)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, sub, color }) {
  return (
    <div style={{ background: 'white', borderRadius: 10, padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
      <div style={{ fontSize: 24, marginBottom: 8 }}>{icon}</div>
      <div style={{ fontSize: 22, fontWeight: 'bold', color }}>{value}</div>
      <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>{label}</div>
      <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>{sub}</div>
    </div>
  );
}

function EmptyState({ message }) {
  return (
    <div style={{ textAlign: 'center', padding: '32px 16px', color: '#aaa' }}>
      <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>
      <div style={{ fontSize: 13 }}>{message}</div>
    </div>
  );
}
