import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';

const BLUE = '#1B3A6B';
const ORANGE = '#E07B2A';
const GREEN = '#2E7D32';
const RED = '#C62828';
const TEAL = '#0D9488';
const PURPLE = '#7C3AED';

const fmt = (n) =>
  `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const REPORT_TYPES = [
  { key: 'pl', icon: '📊', label: 'P&L Summary', desc: 'Revenue, costs, gross profit and margin' },
  {
    key: 'cashflow',
    icon: '💵',
    label: 'Cash Flow',
    desc: 'Money in vs out by month with running balance',
  },
  { key: 'ar', icon: '🧾', label: 'AR Aging', desc: 'Outstanding invoices by age' },
  {
    key: 'profitability',
    icon: '📈',
    label: 'Job Profitability',
    desc: 'Per-job revenue, costs and margin',
  },
  {
    key: 'passthrough',
    icon: '🔄',
    label: 'Pass-Through Balance',
    desc: 'Fronted costs vs reimbursements',
  },
  { key: 'deposits', icon: '🏦', label: 'Deposit Tracker', desc: 'Signed jobs and deposit status' },
  {
    key: 'customer',
    icon: '👤',
    label: 'Customer Report',
    desc: 'All jobs, invoices & payments by customer',
  },
  {
    key: 'purchase_orders',
    icon: '📦',
    label: 'Purchase Orders',
    desc: 'PO spend by category, job, and status',
  },
];

const PERIODS = [
  { key: 'mtd', label: 'Month to Date' },
  { key: 'qtd', label: 'Quarter to Date' },
  { key: 'ytd', label: 'Year to Date' },
  { key: '12mo', label: 'Last 12 Months' },
  { key: 'all', label: 'All Time' },
];

function periodLabel(p) {
  return PERIODS.find((x) => x.key === p)?.label || p;
}
function typeLabel(t) {
  return REPORT_TYPES.find((x) => x.key === t)?.label || t;
}
function typeIcon(t) {
  return REPORT_TYPES.find((x) => x.key === t)?.icon || '📋';
}

function fmtRunAt(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return (
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' ' +
    d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
  );
}

function fmtMonth(m) {
  const [y, mo] = m.split('-');
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  return `${months[parseInt(mo) - 1]} '${y.slice(2)}`;
}

const STATUS_LABELS = {
  received: 'Received',
  processing: 'Processing',
  proposal_ready: 'Proposal Ready',
  proposal_sent: 'Sent',
  proposal_approved: 'Approved',
  contract_ready: 'Ready',
  contract_sent: 'Contract Sent',
  contract_signed: 'Signed',
  complete: 'Complete',
};

function Badge({ status }) {
  const colors = {
    complete: GREEN,
    contract_signed: TEAL,
    contract_sent: '#3B82F6',
    proposal_approved: '#059669',
    proposal_sent: '#F59E0B',
  };
  const c = colors[status] || '#888';
  return (
    <span
      style={{
        fontSize: 10,
        padding: '2px 7px',
        borderRadius: 10,
        background: c + '22',
        color: c,
        fontWeight: 'bold',
        whiteSpace: 'nowrap',
      }}
    >
      {STATUS_LABELS[status] || status}
    </span>
  );
}

// ── Report renderers ──────────────────────────────────────────────────────────

function PLReport({ data }) {
  const margin = data.grossMargin;
  const marginColor = margin === null ? '#888' : margin >= 30 ? GREEN : margin >= 15 ? ORANGE : RED;
  const invTypeLabels = {
    contract_invoice: 'Contract',
    pass_through_invoice: 'Pass-Through',
    change_order: 'Change Order',
    combined_invoice: 'Combined',
  };

  return (
    <div>
      {/* KPI row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: 12,
          marginBottom: 24,
        }}
      >
        <KpiCard label="Contract Revenue" value={fmt(data.totalRevenue)} color={GREEN} />
        <KpiCard label="Direct Costs" value={fmt(data.totalCosts)} color={RED} />
        <KpiCard
          label="Gross Profit"
          value={fmt(data.grossProfit)}
          color={data.grossProfit >= 0 ? BLUE : RED}
        />
        <KpiCard
          label="Gross Margin"
          value={margin !== null ? `${margin}%` : '—'}
          color={marginColor}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        {/* Revenue by type */}
        <Section title="Revenue by Payment Type">
          {!data.revenueByType?.length ? (
            <Empty msg="No payments received in this period" />
          ) : (
            <DynTable
              rows={data.revenueByType}
              cols={[
                {
                  key: 'payment_type',
                  label: 'Type',
                  render: (v) => (
                    <span style={{ textTransform: 'capitalize' }}>
                      {v?.replace(/_/g, ' ') || '—'}
                    </span>
                  ),
                },
                {
                  key: 'total',
                  label: 'Amount',
                  align: 'right',
                  render: (v) => <strong style={{ color: GREEN }}>{fmt(v)}</strong>,
                },
              ]}
            />
          )}
        </Section>

        {/* Costs by category */}
        <Section title="Costs by Category">
          {!data.costsByCategory?.length ? (
            <Empty msg="No costs recorded in this period" />
          ) : (
            <DynTable
              rows={data.costsByCategory}
              cols={[
                {
                  key: 'category',
                  label: 'Category',
                  render: (v) => (
                    <span style={{ textTransform: 'capitalize' }}>
                      {v?.replace(/_/g, ' ') || '—'}
                    </span>
                  ),
                },
                {
                  key: 'total',
                  label: 'Amount',
                  align: 'right',
                  render: (v) => <strong style={{ color: RED }}>{fmt(v)}</strong>,
                },
              ]}
            />
          )}
        </Section>
      </div>

      {/* Pass-through row */}
      <Section title="Pass-Through Summary">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
          <KpiCard label="Fronted" value={fmt(data.ptFronted)} color={ORANGE} small />
          <KpiCard label="Reimbursed" value={fmt(data.ptReimbursed)} color={TEAL} small />
          <KpiCard
            label="Net Owed to PB"
            value={fmt(Math.max(0, data.ptFronted - data.ptReimbursed))}
            color={data.ptNet < 0 ? RED : BLUE}
            small
          />
        </div>
      </Section>

      {/* Invoice type breakdown */}
      {data.invoiceTypes?.length > 0 && (
        <Section title="Invoice Breakdown by Type" style={{ marginTop: 16 }}>
          <DynTable
            rows={data.invoiceTypes}
            cols={[
              { key: 'invoice_type', label: 'Type', render: (v) => invTypeLabels[v] || v },
              { key: 'count', label: 'Count', align: 'right' },
              { key: 'total', label: 'Billed', align: 'right', render: (v) => fmt(v) },
              {
                key: 'collected',
                label: 'Collected',
                align: 'right',
                render: (v) => <span style={{ color: GREEN }}>{fmt(v)}</span>,
              },
            ]}
          />
        </Section>
      )}
    </div>
  );
}

function CashFlowReport({ data }) {
  const rows = data.months || [];
  const maxIn = Math.max(...rows.map((r) => r.in), 1);
  const maxOut = Math.max(...rows.map((r) => r.out), 1);
  const maxAbs = Math.max(maxIn, maxOut);
  const BAR_H = 80;

  const totalIn = rows.reduce((s, r) => s + r.in, 0);
  const totalOut = rows.reduce((s, r) => s + r.out, 0);
  const netFlow = totalIn - totalOut;

  return (
    <div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px,1fr))',
          gap: 12,
          marginBottom: 24,
        }}
      >
        <KpiCard label="Total In" value={fmt(totalIn)} color={GREEN} />
        <KpiCard label="Total Out" value={fmt(totalOut)} color={RED} />
        <KpiCard label="Net Cash Flow" value={fmt(netFlow)} color={netFlow >= 0 ? BLUE : RED} />
        <KpiCard
          label="Ending Balance"
          value={fmt(rows[rows.length - 1]?.balance || 0)}
          color={BLUE}
        />
      </div>

      {/* Bar chart */}
      <Section title="Monthly Cash Flow (Last 13 Months)">
        <div style={{ overflowX: 'auto' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              gap: 6,
              minWidth: 700,
              paddingBottom: 8,
            }}
          >
            {rows.map((r) => (
              <div
                key={r.month}
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  minWidth: 40,
                }}
              >
                <div
                  style={{
                    fontSize: 9,
                    color: r.net >= 0 ? GREEN : RED,
                    fontWeight: 'bold',
                    marginBottom: 2,
                  }}
                >
                  {r.net !== 0 ? (r.net >= 0 ? '+' : '') + fmt(r.net) : '—'}
                </div>
                <div
                  style={{
                    width: '100%',
                    display: 'flex',
                    gap: 2,
                    alignItems: 'flex-end',
                    height: BAR_H,
                  }}
                >
                  <div
                    style={{
                      flex: 1,
                      borderRadius: '3px 3px 0 0',
                      background: GREEN + 'cc',
                      height: `${Math.max((r.in / maxAbs) * BAR_H, r.in > 0 ? 4 : 0)}px`,
                      transition: 'height 0.3s',
                    }}
                    title={`In: ${fmt(r.in)}`}
                  />
                  <div
                    style={{
                      flex: 1,
                      borderRadius: '3px 3px 0 0',
                      background: RED + 'cc',
                      height: `${Math.max((r.out / maxAbs) * BAR_H, r.out > 0 ? 4 : 0)}px`,
                      transition: 'height 0.3s',
                    }}
                    title={`Out: ${fmt(r.out)}`}
                  />
                </div>
                <div style={{ fontSize: 9, color: '#888', marginTop: 4, textAlign: 'center' }}>
                  {fmtMonth(r.month)}
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 8 }}>
            <span
              style={{ fontSize: 11, color: GREEN, display: 'flex', alignItems: 'center', gap: 4 }}
            >
              <span
                style={{
                  display: 'inline-block',
                  width: 12,
                  height: 12,
                  borderRadius: 2,
                  background: GREEN,
                }}
              />{' '}
              Money In
            </span>
            <span
              style={{ fontSize: 11, color: RED, display: 'flex', alignItems: 'center', gap: 4 }}
            >
              <span
                style={{
                  display: 'inline-block',
                  width: 12,
                  height: 12,
                  borderRadius: 2,
                  background: RED,
                }}
              />{' '}
              Money Out
            </span>
          </div>
        </div>
      </Section>

      {/* Table */}
      <Section title="Month-by-Month Detail" style={{ marginTop: 16 }}>
        <div style={{ overflowX: 'auto' }}>
          <DynTable
            rows={rows}
            cols={[
              { key: 'month', label: 'Month', render: (v) => fmtMonth(v) },
              {
                key: 'in',
                label: 'In',
                align: 'right',
                render: (v) => <span style={{ color: GREEN }}>{fmt(v)}</span>,
              },
              {
                key: 'out',
                label: 'Out',
                align: 'right',
                render: (v) => <span style={{ color: RED }}>{fmt(v)}</span>,
              },
              {
                key: 'net',
                label: 'Net',
                align: 'right',
                render: (v) => (
                  <strong style={{ color: v >= 0 ? BLUE : RED }}>
                    {(v >= 0 ? '+' : '') + fmt(v)}
                  </strong>
                ),
              },
              {
                key: 'balance',
                label: 'Balance',
                align: 'right',
                render: (v) => <strong style={{ color: v >= 0 ? BLUE : RED }}>{fmt(v)}</strong>,
              },
            ]}
          />
        </div>
      </Section>
    </div>
  );
}

function ARReport({ data }) {
  const invTypeLabels = {
    contract_invoice: 'Contract',
    pass_through_invoice: 'Pass-Through',
    change_order: 'Change Order',
    combined_invoice: 'Combined',
  };
  const bucketColors = ['#059669', ORANGE, '#F59E0B', RED];

  return (
    <div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px,1fr))',
          gap: 12,
          marginBottom: 24,
        }}
      >
        <KpiCard label="Total Outstanding" value={fmt(data.total)} color={RED} />
        {data.buckets?.map((b, i) => (
          <KpiCard
            key={b.key}
            label={b.label}
            value={fmt(b.total)}
            color={bucketColors[i] || '#888'}
            small
          />
        ))}
      </div>

      {/* By invoice type breakdown */}
      {data.byType && Object.keys(data.byType).length > 0 && (
        <Section title="Outstanding by Invoice Type" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {Object.entries(data.byType).map(([type, amt]) => (
              <div
                key={type}
                style={{
                  background: '#f8faff',
                  border: '1px solid #e2e8f0',
                  borderRadius: 8,
                  padding: '10px 16px',
                  minWidth: 140,
                }}
              >
                <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>
                  {invTypeLabels[type] || type}
                </div>
                <div style={{ fontSize: 16, fontWeight: 'bold', color: BLUE }}>{fmt(amt)}</div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Per bucket */}
      {data.buckets?.map(
        (bucket, bi) =>
          bucket.items?.length > 0 && (
            <Section
              key={bucket.key}
              title={`${bucket.label} — ${fmt(bucket.total)}`}
              style={{ marginBottom: 14 }}
              titleColor={bucketColors[bi]}
            >
              <DynTable
                rows={bucket.items}
                cols={[
                  {
                    key: 'invoice_number',
                    label: 'Invoice #',
                    render: (v) => (
                      <span style={{ fontFamily: 'monospace', fontWeight: 'bold', fontSize: 11 }}>
                        {v}
                      </span>
                    ),
                  },
                  { key: 'customer_name', label: 'Customer' },
                  { key: 'invoice_type', label: 'Type', render: (v) => invTypeLabels[v] || v },
                  { key: 'ageDays', label: 'Age', align: 'right', render: (v) => `${v}d` },
                  {
                    key: 'outstanding',
                    label: 'Outstanding',
                    align: 'right',
                    render: (v) => <strong style={{ color: RED }}>{fmt(v)}</strong>,
                  },
                  {
                    key: 'status',
                    label: 'Status',
                    render: (v) => (
                      <span style={{ textTransform: 'capitalize', fontSize: 11 }}>{v}</span>
                    ),
                  },
                ]}
              />
            </Section>
          ),
      )}

      {data.total === 0 && <Empty msg="No outstanding invoices — all paid up." />}
    </div>
  );
}

function ProfitabilityReport({ data }) {
  const jobs = data.jobs || [];
  const avgMargin = (() => {
    const valid = jobs.filter((j) => j.margin !== null);
    if (!valid.length) return null;
    return Math.round((valid.reduce((s, j) => s + j.margin, 0) / valid.length) * 10) / 10;
  })();
  const totalReceived = jobs.reduce((s, j) => s + j.received, 0);
  const totalCosts = jobs.reduce((s, j) => s + j.costs, 0);
  const totalProfit = totalReceived - totalCosts;

  return (
    <div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px,1fr))',
          gap: 12,
          marginBottom: 24,
        }}
      >
        <KpiCard label="Total Received" value={fmt(totalReceived)} color={GREEN} />
        <KpiCard label="Total Costs" value={fmt(totalCosts)} color={RED} />
        <KpiCard
          label="Gross Profit"
          value={fmt(totalProfit)}
          color={totalProfit >= 0 ? BLUE : RED}
        />
        <KpiCard
          label="Avg Job Margin"
          value={avgMargin !== null ? `${avgMargin}%` : '—'}
          color={avgMargin >= 30 ? GREEN : avgMargin >= 15 ? ORANGE : RED}
        />
      </div>

      {/* Cost by category */}
      {data.categoryBreakdown?.length > 0 && (
        <Section title="Cost Breakdown by Category" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {data.categoryBreakdown.map((c) => (
              <div
                key={c.category}
                style={{
                  background: '#fff5f5',
                  border: '1px solid #fecaca',
                  borderRadius: 8,
                  padding: '10px 16px',
                  minWidth: 130,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    color: '#888',
                    marginBottom: 4,
                    textTransform: 'capitalize',
                  }}
                >
                  {c.category?.replace(/_/g, ' ')}
                </div>
                <div style={{ fontSize: 15, fontWeight: 'bold', color: RED }}>{fmt(c.total)}</div>
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section title="Per-Job Breakdown">
        {!jobs.length ? (
          <Empty msg="No job data in this period" />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <DynTable
              rows={jobs}
              cols={[
                {
                  key: 'pbNumber',
                  label: 'Job #',
                  render: (v, row) => (
                    <Link
                      to={`/jobs/${row.id}`}
                      style={{
                        color: BLUE,
                        textDecoration: 'none',
                        fontFamily: 'monospace',
                        fontWeight: 'bold',
                        fontSize: 11,
                      }}
                    >
                      {v || row.id?.slice(0, 6)}
                    </Link>
                  ),
                },
                { key: 'customerName', label: 'Customer' },
                { key: 'status', label: 'Status', render: (v) => <Badge status={v} /> },
                { key: 'contractValue', label: 'Contract', align: 'right', render: (v) => fmt(v) },
                {
                  key: 'received',
                  label: 'Received',
                  align: 'right',
                  render: (v) => <span style={{ color: GREEN }}>{fmt(v)}</span>,
                },
                {
                  key: 'costs',
                  label: 'Costs',
                  align: 'right',
                  render: (v) => <span style={{ color: RED }}>{fmt(v)}</span>,
                },
                {
                  key: 'grossProfit',
                  label: 'Profit',
                  align: 'right',
                  render: (v) => <strong style={{ color: v >= 0 ? BLUE : RED }}>{fmt(v)}</strong>,
                },
                {
                  key: 'margin',
                  label: 'Margin',
                  align: 'right',
                  render: (v, row) => {
                    const m = v ?? row.estimatedMargin;
                    const est = v === null && row.estimatedMargin !== null;
                    const c = m === null ? '#888' : m >= 30 ? GREEN : m >= 15 ? ORANGE : RED;
                    return m !== null ? (
                      <span style={{ color: c, fontWeight: 'bold' }}>
                        {m}%{est ? <span style={{ fontSize: 9, color: '#aaa' }}> est</span> : ''}
                      </span>
                    ) : (
                      <span style={{ color: '#aaa' }}>—</span>
                    );
                  },
                },
                {
                  key: 'ptOwed',
                  label: 'PT Owed',
                  align: 'right',
                  render: (v) =>
                    v > 0 ? (
                      <span style={{ color: ORANGE }}>{fmt(v)}</span>
                    ) : (
                      <span style={{ color: '#aaa' }}>—</span>
                    ),
                },
              ]}
            />
          </div>
        )}
      </Section>
    </div>
  );
}

function PassThroughReport({ data }) {
  return (
    <div>
      <div
        style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 24 }}
      >
        <KpiCard label="Total Fronted by PB" value={fmt(data.totalFronted)} color={ORANGE} />
        <KpiCard label="Total Reimbursed" value={fmt(data.totalReimbursed)} color={TEAL} />
        <KpiCard
          label="Outstanding Owed to PB"
          value={fmt(data.totalOutstanding)}
          color={data.totalOutstanding > 0 ? RED : GREEN}
        />
      </div>

      {data.byCategory?.length > 0 && (
        <Section title="By Category" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {data.byCategory.map((c) => (
              <div
                key={c.category}
                style={{
                  background: '#fffbeb',
                  border: '1px solid #fde68a',
                  borderRadius: 8,
                  padding: '10px 16px',
                  minWidth: 130,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    color: '#92400e',
                    marginBottom: 4,
                    textTransform: 'capitalize',
                  }}
                >
                  {c.category?.replace(/_/g, ' ')}
                </div>
                <div style={{ fontSize: 15, fontWeight: 'bold', color: ORANGE }}>
                  {fmt(c.fronted)}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section title="Per-Job Pass-Through Detail">
        {!data.jobs?.length ? (
          <Empty msg="No pass-through activity" />
        ) : (
          <DynTable
            rows={data.jobs}
            cols={[
              {
                key: 'pbNumber',
                label: 'Job #',
                render: (v, row) => (
                  <Link
                    to={`/jobs/${row.id}`}
                    style={{
                      color: BLUE,
                      textDecoration: 'none',
                      fontFamily: 'monospace',
                      fontWeight: 'bold',
                      fontSize: 11,
                    }}
                  >
                    {v || row.id?.slice(0, 6)}
                  </Link>
                ),
              },
              { key: 'customerName', label: 'Customer' },
              { key: 'status', label: 'Status', render: (v) => <Badge status={v} /> },
              {
                key: 'fronted',
                label: 'Fronted',
                align: 'right',
                render: (v) => <span style={{ color: ORANGE }}>{fmt(v)}</span>,
              },
              {
                key: 'reimbursed',
                label: 'Reimbursed',
                align: 'right',
                render: (v) => <span style={{ color: TEAL }}>{fmt(v)}</span>,
              },
              {
                key: 'outstanding',
                label: 'Outstanding',
                align: 'right',
                render: (v) => (
                  <strong style={{ color: v > 0 ? RED : GREEN }}>
                    {v > 0 ? fmt(v) : 'Settled'}
                  </strong>
                ),
              },
            ]}
          />
        )}
      </Section>
    </div>
  );
}

function DepositsReport({ data }) {
  const { jobs = [], summary = {}, depositPct = 0.33 } = data;

  return (
    <div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px,1fr))',
          gap: 12,
          marginBottom: 24,
        }}
      >
        <KpiCard label="Total Jobs Tracked" value={summary.total} color={BLUE} />
        <KpiCard label="Deposit Received" value={summary.withDeposit} color={GREEN} />
        <KpiCard
          label="Missing Deposit"
          value={summary.missing}
          color={summary.missing > 0 ? RED : GREEN}
        />
        <KpiCard
          label="Total Shortfall"
          value={fmt(summary.shortfall)}
          color={summary.shortfall > 0 ? RED : GREEN}
        />
      </div>
      <div
        style={{
          background: '#fffbeb',
          border: '1px solid #fde68a',
          borderRadius: 6,
          padding: '8px 14px',
          marginBottom: 16,
          fontSize: 12,
          color: '#92400e',
        }}
      >
        Expected deposit rate: <strong>{Math.round(depositPct * 100)}%</strong> of contract value
        (pulled from system settings — updates automatically)
      </div>
      <Section title="All Tracked Jobs">
        {!jobs.length ? (
          <Empty msg="No signed/active jobs found" />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <DynTable
              rows={jobs}
              cols={[
                {
                  key: 'pbNumber',
                  label: 'Job #',
                  render: (v, row) => (
                    <Link
                      to={`/jobs/${row.id}`}
                      style={{
                        color: BLUE,
                        textDecoration: 'none',
                        fontFamily: 'monospace',
                        fontWeight: 'bold',
                        fontSize: 11,
                      }}
                    >
                      {v || row.id?.slice(0, 6)}
                    </Link>
                  ),
                },
                { key: 'customerName', label: 'Customer' },
                { key: 'status', label: 'Status', render: (v) => <Badge status={v} /> },
                { key: 'contractValue', label: 'Contract', align: 'right', render: (v) => fmt(v) },
                {
                  key: 'expectedDeposit',
                  label: 'Expected',
                  align: 'right',
                  render: (v) => fmt(v),
                },
                {
                  key: 'depositReceived',
                  label: 'Received',
                  align: 'right',
                  render: (v) => <span style={{ color: GREEN }}>{fmt(v)}</span>,
                },
                {
                  key: 'shortfall',
                  label: 'Shortfall',
                  align: 'right',
                  render: (v, row) =>
                    row.depositMet ? (
                      <span style={{ color: GREEN, fontWeight: 'bold' }}>✓ Met</span>
                    ) : (
                      <strong style={{ color: RED }}>{fmt(v)}</strong>
                    ),
                },
              ]}
            />
          </div>
        )}
      </Section>
    </div>
  );
}

// ── Shared UI primitives ──────────────────────────────────────────────────────

function KpiCard({ label, value, color, small }) {
  return (
    <div
      style={{
        background: 'white',
        borderRadius: 10,
        padding: small ? '12px 14px' : '16px 18px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
        borderTop: `3px solid ${color}`,
      }}
    >
      <div style={{ fontSize: small ? 18 : 22, fontWeight: 'bold', color }}>{value}</div>
      <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>{label}</div>
    </div>
  );
}

function Section({ title, titleColor, children, style }) {
  return (
    <div
      style={{
        background: 'white',
        borderRadius: 10,
        padding: '16px 18px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
        ...style,
      }}
    >
      {title && (
        <div
          style={{
            fontSize: 12,
            fontWeight: 'bold',
            color: titleColor || BLUE,
            marginBottom: 12,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          {title}
        </div>
      )}
      {children}
    </div>
  );
}

function Empty({ msg }) {
  return (
    <div style={{ color: '#aaa', fontSize: 13, padding: '16px 0', textAlign: 'center' }}>{msg}</div>
  );
}

function DynTable({ rows, cols }) {
  if (!rows?.length) return <Empty msg="No data" />;
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
      <thead>
        <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
          {cols.map((c) => (
            <th
              key={c.key}
              style={{
                padding: '7px 10px',
                textAlign: c.align || 'left',
                fontSize: 11,
                color: '#888',
                fontWeight: 600,
                whiteSpace: 'nowrap',
              }}
            >
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr
            key={i}
            style={{
              borderBottom: '1px solid #f0f0f0',
              background: i % 2 === 0 ? 'white' : '#fafafa',
            }}
          >
            {cols.map((c) => (
              <td
                key={c.key}
                style={{
                  padding: '8px 10px',
                  textAlign: c.align || 'left',
                  verticalAlign: 'middle',
                }}
              >
                {c.render ? c.render(row[c.key], row) : (row[c.key] ?? '—')}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── Main renderer — dispatches to the right report component ──────────────────
function PurchaseOrdersReport({ data }) {
  const { totals, byCategory, openByJob, byStatus, recent } = data || {};
  const STATUS_COLORS_PO = { draft: '#888', issued: '#F59E0B', received: '#3B82F6', closed: GREEN };
  const STATUS_LABEL_PO = {
    draft: 'Draft',
    issued: 'Issued',
    received: 'Received',
    closed: 'Closed',
  };

  return (
    <div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px,1fr))',
          gap: 12,
          marginBottom: 24,
        }}
      >
        <KpiCard label="Total Active Spend" value={fmt(totals?.total_spend)} color={BLUE} />
        <KpiCard label="Open (Draft+Issued)" value={fmt(totals?.open_total)} color={ORANGE} small />
        <KpiCard label="Received" value={fmt(totals?.received)} color={GREEN} small />
        <KpiCard label="Closed" value={fmt(totals?.closed)} color="#888" small />
        <KpiCard label="Total POs" value={totals?.count || 0} color={PURPLE} small />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        <Section title="Spend by Category">
          {!byCategory?.length ? (
            <Empty msg="No PO data" />
          ) : (
            <DynTable
              rows={byCategory}
              cols={[
                {
                  key: 'category',
                  label: 'Category',
                  render: (v) => <span style={{ textTransform: 'capitalize' }}>{v || '—'}</span>,
                },
                { key: 'count', label: 'POs', align: 'right' },
                {
                  key: 'total',
                  label: 'Amount',
                  align: 'right',
                  render: (v) => <strong style={{ color: BLUE }}>{fmt(v)}</strong>,
                },
              ]}
            />
          )}
        </Section>

        <Section title="Spend by Status">
          {!byStatus?.length ? (
            <Empty msg="No PO data" />
          ) : (
            <DynTable
              rows={byStatus}
              cols={[
                {
                  key: 'status',
                  label: 'Status',
                  render: (v) => (
                    <span style={{ color: STATUS_COLORS_PO[v] || '#555', fontWeight: 600 }}>
                      {STATUS_LABEL_PO[v] || v || '—'}
                    </span>
                  ),
                },
                { key: 'count', label: 'POs', align: 'right' },
                {
                  key: 'total',
                  label: 'Amount',
                  align: 'right',
                  render: (v) => <strong>{fmt(v)}</strong>,
                },
              ]}
            />
          )}
        </Section>
      </div>

      <Section title="Open PO Spend by Job (Not Closed)" style={{ marginBottom: 16 }}>
        {!openByJob?.length ? (
          <Empty msg="No open POs linked to jobs" />
        ) : (
          <DynTable
            rows={openByJob}
            cols={[
              {
                key: 'pb_number',
                label: 'PB #',
                render: (v, row) => (
                  <a
                    href={`/jobs/${row.job_id}`}
                    style={{ color: BLUE, fontWeight: 700, textDecoration: 'none', fontSize: 11 }}
                  >
                    {v || '—'}
                  </a>
                ),
              },
              { key: 'customer_name', label: 'Customer' },
              {
                key: 'project_address',
                label: 'Address',
                render: (v) => <span style={{ color: '#555', fontSize: 11 }}>{v || '—'}</span>,
              },
              { key: 'po_count', label: 'Open POs', align: 'right' },
              {
                key: 'po_total',
                label: 'Open Spend',
                align: 'right',
                render: (v) => <strong style={{ color: BLUE }}>{fmt(v)}</strong>,
              },
            ]}
          />
        )}
      </Section>

      <Section title="Recent Purchase Orders">
        {!recent?.length ? (
          <Empty msg="No POs in this period" />
        ) : (
          <DynTable
            rows={recent}
            cols={[
              {
                key: 'po_number',
                label: 'PO #',
                render: (v, row) => (
                  <a
                    href={`/jobs/${row.job_id}`}
                    style={{ color: BLUE, fontWeight: 700, textDecoration: 'none' }}
                  >
                    {v}
                  </a>
                ),
              },
              { key: 'pb_number', label: 'Job' },
              {
                key: 'description',
                label: 'Description',
                render: (v) => <span style={{ fontSize: 11 }}>{v}</span>,
              },
              { key: 'vendor_name', label: 'Vendor', render: (v) => v || '—' },
              {
                key: 'category',
                label: 'Category',
                render: (v) => (
                  <span style={{ textTransform: 'capitalize', fontSize: 11 }}>{v}</span>
                ),
              },
              {
                key: 'status',
                label: 'Status',
                render: (v) => (
                  <span
                    style={{ color: STATUS_COLORS_PO[v] || '#555', fontWeight: 600, fontSize: 11 }}
                  >
                    {STATUS_LABEL_PO[v] || v}
                  </span>
                ),
              },
              { key: 'amount', label: 'Amount', align: 'right', render: (v) => fmt(v) },
            ]}
          />
        )}
      </Section>
    </div>
  );
}

function ReportView({ type, data }) {
  if (!data) return null;
  if (type === 'pl') return <PLReport data={data} />;
  if (type === 'cashflow') return <CashFlowReport data={data} />;
  if (type === 'ar') return <ARReport data={data} />;
  if (type === 'profitability') return <ProfitabilityReport data={data} />;
  if (type === 'passthrough') return <PassThroughReport data={data} />;
  if (type === 'deposits') return <DepositsReport data={data} />;
  if (type === 'purchase_orders') return <PurchaseOrdersReport data={data} />;
  return <div style={{ color: '#888', padding: 24 }}>Unknown report type.</div>;
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Reports({ token }) {
  const [selectedType, setSelectedType] = useState('pl');
  const [selectedPeriod, setSelectedPeriod] = useState('ytd');
  const [running, setRunning] = useState(false);
  const [current, setCurrent] = useState(null);
  const [saved, setSaved] = useState([]);
  const [loadingSaved, setLoadingSaved] = useState(true);
  const [viewingSaved, setViewingSaved] = useState(null);

  const [custQuery, setCustQuery] = useState('');
  const [custResults, setCustResults] = useState([]);
  const [custLoading, setCustLoading] = useState(false);
  const [custSelected, setCustSelected] = useState(null);

  const searchCustomer = async (q) => {
    setCustQuery(q);
    setCustSelected(null);
    if (!q.trim()) {
      setCustResults([]);
      return;
    }
    setCustLoading(true);
    try {
      const r = await fetch(`/api/reports/customer/search?q=${encodeURIComponent(q)}`, {
        headers: { 'x-auth-token': token },
      });
      const d = await r.json();
      setCustResults(d.customers || []);
    } catch {
      setCustResults([]);
    }
    setCustLoading(false);
  };

  const openCustomerPDF = () => {
    if (!custSelected) return;
    const params =
      custSelected.type === 'contact'
        ? `contact_id=${encodeURIComponent(custSelected.id)}`
        : `customer_name=${encodeURIComponent(custSelected.name)}`;
    window.open(`/api/reports/customer/pdf?${params}&token=${encodeURIComponent(token)}`, '_blank');
  };

  const headers = { 'x-auth-token': token, 'Content-Type': 'application/json' };

  const loadSaved = useCallback(() => {
    setLoadingSaved(true);
    fetch('/api/reports/saved', { headers: { 'x-auth-token': token } })
      .then((r) => r.json())
      .then((d) => {
        setSaved(d.reports || []);
        setLoadingSaved(false);
      })
      .catch(() => setLoadingSaved(false));
  }, [token]);

  useEffect(() => {
    loadSaved();
  }, [loadSaved]);

  const runReport = async () => {
    setRunning(true);
    setViewingSaved(null);

    // Auto-save the current report before replacing it
    const savePrev = current
      ? {
          type: current.type,
          period: current.period,
          label: current.label,
          data: current.data,
          runAt: current.runAt,
        }
      : null;

    try {
      const res = await fetch('/api/reports/run', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          type: selectedType,
          period: selectedPeriod,
          savePrevious: savePrev,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed');

      const label = `${typeLabel(selectedType)} — ${periodLabel(selectedPeriod)}`;
      setCurrent({
        type: selectedType,
        period: selectedPeriod,
        data: body.data,
        runAt: body.runAt,
        label,
      });
      if (savePrev) loadSaved(); // refresh saved list if we just saved one
    } catch (e) {
      alert('Error running report: ' + e.message);
    }
    setRunning(false);
  };

  const openSaved = async (id) => {
    try {
      const res = await fetch(`/api/reports/saved/${id}`, { headers: { 'x-auth-token': token } });
      const body = await res.json();
      if (res.ok) setViewingSaved(body.report);
    } catch (_e) {
      /* non-critical — saved report may not exist */
    }
  };

  const deleteSaved = async (id, e) => {
    e.stopPropagation();
    if (!window.confirm('Delete this saved report?')) return;
    await fetch(`/api/reports/saved/${id}`, { method: 'DELETE', headers });
    loadSaved();
    if (viewingSaved?.id === id) setViewingSaved(null);
  };

  // What's currently displayed
  const display = viewingSaved
    ? {
        type: viewingSaved.type,
        period: viewingSaved.period,
        data: viewingSaved.data,
        label: viewingSaved.label,
        runAt: viewingSaved.run_at,
        isSaved: true,
      }
    : current
      ? { ...current, isSaved: false }
      : null;

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
      {/* Page header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 'bold', color: BLUE, margin: 0 }}>
          Financial Reports
        </h1>
        <p style={{ color: '#888', fontSize: 13, margin: '4px 0 0' }}>
          Select a report, pick a period, and click Run. Each report is auto-saved when you run a
          new one. New payment types and categories added to the system appear in reports
          automatically.
        </p>
      </div>

      <div
        style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 20, alignItems: 'start' }}
      >
        {/* ── Left panel: controls + saved list ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Report picker */}
          <div
            style={{
              background: 'white',
              borderRadius: 10,
              padding: 16,
              boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 'bold',
                color: BLUE,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                marginBottom: 12,
              }}
            >
              Choose Report
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 14 }}>
              {REPORT_TYPES.map((rt) => (
                <button
                  key={rt.key}
                  onClick={() => setSelectedType(rt.key)}
                  style={{
                    background: selectedType === rt.key ? BLUE : 'transparent',
                    color: selectedType === rt.key ? 'white' : '#333',
                    border: selectedType === rt.key ? 'none' : '1px solid #e2e8f0',
                    borderRadius: 8,
                    padding: '9px 12px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10,
                    transition: 'all 0.15s',
                  }}
                >
                  <span style={{ fontSize: 16, flexShrink: 0 }}>{rt.icon}</span>
                  <span>
                    <div style={{ fontWeight: 600, fontSize: 12 }}>{rt.label}</div>
                    <div style={{ fontSize: 10, opacity: 0.7, marginTop: 1 }}>{rt.desc}</div>
                  </span>
                </button>
              ))}
            </div>

            {selectedType !== 'customer' && (
              <>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 'bold',
                    color: BLUE,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    marginBottom: 8,
                  }}
                >
                  Period
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 14 }}>
                  {PERIODS.map((p) => (
                    <button
                      key={p.key}
                      onClick={() => setSelectedPeriod(p.key)}
                      style={{
                        background: selectedPeriod === p.key ? ORANGE + '18' : 'transparent',
                        color: selectedPeriod === p.key ? ORANGE : '#555',
                        border:
                          selectedPeriod === p.key
                            ? `1px solid ${ORANGE}44`
                            : '1px solid transparent',
                        borderRadius: 6,
                        padding: '7px 10px',
                        cursor: 'pointer',
                        textAlign: 'left',
                        fontSize: 12,
                        fontWeight: selectedPeriod === p.key ? 'bold' : 'normal',
                      }}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <button
                  onClick={runReport}
                  disabled={running}
                  style={{
                    width: '100%',
                    padding: '11px',
                    background: running ? '#aaa' : GREEN,
                    color: 'white',
                    border: 'none',
                    borderRadius: 8,
                    cursor: running ? 'not-allowed' : 'pointer',
                    fontWeight: 'bold',
                    fontSize: 13,
                    letterSpacing: '0.02em',
                  }}
                >
                  {running ? 'Running...' : '▶  Run Report'}
                </button>
                {current && !running && (
                  <div style={{ fontSize: 10, color: '#aaa', textAlign: 'center', marginTop: 6 }}>
                    Running a new report auto-saves the current one
                  </div>
                )}
              </>
            )}
          </div>

          {/* Saved reports */}
          <div
            style={{
              background: 'white',
              borderRadius: 10,
              padding: 16,
              boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 'bold',
                color: BLUE,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                marginBottom: 10,
              }}
            >
              Saved Reports{' '}
              {saved.length > 0 && (
                <span style={{ color: '#888', fontWeight: 'normal' }}>({saved.length})</span>
              )}
            </div>
            {loadingSaved ? (
              <div style={{ color: '#aaa', fontSize: 12 }}>Loading...</div>
            ) : saved.length === 0 ? (
              <div style={{ color: '#aaa', fontSize: 12 }}>
                Reports auto-save when you run a new one.
              </div>
            ) : (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  maxHeight: 340,
                  overflowY: 'auto',
                }}
              >
                {saved.map((r) => (
                  <div
                    key={r.id}
                    onClick={() => openSaved(r.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 8,
                      padding: '8px 10px',
                      borderRadius: 7,
                      cursor: 'pointer',
                      transition: 'background 0.1s',
                      background: viewingSaved?.id === r.id ? BLUE + '12' : '#f8faff',
                      border:
                        viewingSaved?.id === r.id ? `1px solid ${BLUE}33` : '1px solid #e9edf4',
                    }}
                  >
                    <span style={{ fontSize: 14, flexShrink: 0 }}>{typeIcon(r.type)}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 11,
                          fontWeight: 'bold',
                          color: BLUE,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {r.label}
                      </div>
                      <div style={{ fontSize: 10, color: '#999', marginTop: 2 }}>
                        {fmtRunAt(r.run_at)}
                      </div>
                    </div>
                    <button
                      onClick={(e) => deleteSaved(r.id, e)}
                      title="Delete"
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#ccc',
                        cursor: 'pointer',
                        fontSize: 13,
                        padding: '0 2px',
                        flexShrink: 0,
                        lineHeight: 1,
                      }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Right panel ── */}
        <div>
          {selectedType === 'customer' ? (
            <div
              style={{
                background: 'white',
                borderRadius: 12,
                padding: 24,
                boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
                <span style={{ fontSize: 22 }}>👤</span>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 'bold', color: BLUE }}>
                    Customer Report
                  </div>
                  <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                    Search by name, customer #, email or phone — generates a full PDF with all jobs,
                    invoices, change orders and payments
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
                <input
                  value={custQuery}
                  onChange={(e) => searchCustomer(e.target.value)}
                  placeholder="Search by name, customer #, email, or phone…"
                  style={{
                    flex: 1,
                    padding: '9px 12px',
                    border: '1px solid #ddd',
                    borderRadius: 8,
                    fontSize: 13,
                    outline: 'none',
                  }}
                />
                <button
                  onClick={openCustomerPDF}
                  disabled={!custSelected}
                  style={{
                    padding: '9px 18px',
                    background: custSelected ? BLUE : '#ccc',
                    color: 'white',
                    border: 'none',
                    borderRadius: 8,
                    cursor: custSelected ? 'pointer' : 'not-allowed',
                    fontWeight: 'bold',
                    fontSize: 13,
                    whiteSpace: 'nowrap',
                  }}
                >
                  Generate PDF
                </button>
              </div>
              {custLoading && (
                <div style={{ color: '#aaa', fontSize: 13, padding: '8px 0' }}>Searching…</div>
              )}
              {!custLoading && custResults.length > 0 && (
                <div
                  style={{
                    border: '1px solid #e2e8f0',
                    borderRadius: 8,
                    overflow: 'hidden',
                    marginBottom: 12,
                  }}
                >
                  {custResults.map((c, i) => {
                    const isSel = custSelected?.id === c.id && custSelected?.name === c.name;
                    return (
                      <div
                        key={c.id || c.name}
                        onClick={() => setCustSelected(c)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          padding: '10px 14px',
                          cursor: 'pointer',
                          borderBottom: i < custResults.length - 1 ? '1px solid #f0f0f0' : 'none',
                          background: isSel ? BLUE + '12' : i % 2 === 0 ? 'white' : '#fafafa',
                          borderLeft: isSel ? `3px solid ${BLUE}` : '3px solid transparent',
                        }}
                      >
                        <span style={{ fontSize: 16, flexShrink: 0 }}>👤</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{ fontSize: 13, fontWeight: 600, color: isSel ? BLUE : '#222' }}
                          >
                            {c.name || '—'}
                            {c.pb_customer_number && (
                              <span
                                style={{
                                  fontFamily: 'monospace',
                                  fontSize: 10,
                                  background: '#e0e8ff',
                                  color: BLUE,
                                  padding: '1px 6px',
                                  borderRadius: 4,
                                  marginLeft: 8,
                                  fontWeight: 'bold',
                                }}
                              >
                                {c.pb_customer_number}
                              </span>
                            )}
                            {c.type === 'unlinked' && (
                              <span
                                style={{
                                  fontSize: 10,
                                  background: '#fff3e0',
                                  color: '#e65100',
                                  padding: '1px 6px',
                                  borderRadius: 4,
                                  marginLeft: 6,
                                }}
                              >
                                unlinked
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
                            {[c.email, c.phone, `${c.job_count} job${c.job_count !== 1 ? 's' : ''}`]
                              .filter(Boolean)
                              .join(' · ')}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {!custLoading && custQuery && custResults.length === 0 && (
                <div style={{ color: '#aaa', fontSize: 13, padding: '8px 0' }}>
                  No customers found matching "{custQuery}"
                </div>
              )}
              {custSelected && (
                <div
                  style={{
                    background: '#f0f4ff',
                    borderRadius: 8,
                    padding: '10px 14px',
                    fontSize: 12,
                    color: BLUE,
                  }}
                >
                  Selected: <strong>{custSelected.name}</strong>
                  {custSelected.pb_customer_number
                    ? ` (${custSelected.pb_customer_number})`
                    : ''} — {custSelected.job_count} job{custSelected.job_count !== 1 ? 's' : ''}{' '}
                  &nbsp;·&nbsp; Click <strong>Generate PDF</strong> to open the full report.
                </div>
              )}
              {!custQuery && (
                <div style={{ textAlign: 'center', padding: '40px 0', color: '#bbb' }}>
                  <div style={{ fontSize: 36, marginBottom: 10 }}>👤</div>
                  <div style={{ fontSize: 13 }}>Start typing a customer name or number above</div>
                </div>
              )}
            </div>
          ) : !display ? (
            <div
              style={{
                background: 'white',
                borderRadius: 12,
                padding: 60,
                textAlign: 'center',
                boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
              }}
            >
              <div style={{ fontSize: 48, marginBottom: 16 }}>📊</div>
              <div style={{ fontSize: 16, fontWeight: 'bold', color: BLUE, marginBottom: 8 }}>
                No Report Running
              </div>
              <div style={{ fontSize: 13, color: '#888' }}>
                Select a report type and period, then click Run Report.
              </div>
            </div>
          ) : (
            <div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 16,
                  flexWrap: 'wrap',
                  gap: 8,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 22 }}>{typeIcon(display.type)}</span>
                  <div>
                    <h2 style={{ margin: 0, fontSize: 17, fontWeight: 'bold', color: BLUE }}>
                      {display.label}
                    </h2>
                    <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>
                      {display.isSaved ? 'Saved report — ' : 'Run at '}
                      {fmtRunAt(display.runAt)}
                      {display.isSaved && (
                        <span
                          style={{
                            marginLeft: 8,
                            background: '#e0e8ff',
                            color: BLUE,
                            padding: '1px 7px',
                            borderRadius: 10,
                            fontSize: 10,
                            fontWeight: 'bold',
                          }}
                        >
                          SAVED
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                {display.isSaved && (
                  <button
                    onClick={() => setViewingSaved(null)}
                    style={{
                      fontSize: 11,
                      padding: '5px 12px',
                      background: BLUE + '11',
                      color: BLUE,
                      border: `1px solid ${BLUE}33`,
                      borderRadius: 6,
                      cursor: 'pointer',
                    }}
                  >
                    ← Back to Current
                  </button>
                )}
              </div>
              <ReportView type={display.type} data={display.data} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
