// client/src/pages/KnowledgeBase.jsx
import { useState, useEffect, useRef } from 'react';

const BLUE = '#1B3A6B';
const ORANGE = '#E07B2A';
const GREEN = '#2E7D32';

const CATEGORY_LABELS = {
  codes: '📜 Building Codes',
  'scope-templates': '🔨 Scope Templates',
  legal: '⚖️ Legal',
  pricing: '💰 Pricing Reference',
  past_contracts: '📁 Past Contracts',
  faqs: '❓ FAQs'
};

function MarkdownReport({ text }) {
  const lines = text.split('\n');
  return (
    <div style={{ fontSize: 13, lineHeight: 1.8, color: '#222' }}>
      {lines.map((line, i) => {
        if (line.startsWith('# ')) return <h2 key={i} style={{ color: BLUE, fontSize: 18, marginTop: 24, marginBottom: 8, borderBottom: `2px solid ${BLUE}`, paddingBottom: 4 }}>{line.slice(2)}</h2>;
        if (line.startsWith('## ')) return <h3 key={i} style={{ color: ORANGE, fontSize: 15, marginTop: 16, marginBottom: 6 }}>{line.slice(3)}</h3>;
        if (line.startsWith('### ')) return <h4 key={i} style={{ color: '#444', fontSize: 13, fontWeight: 'bold', marginTop: 12, marginBottom: 4 }}>{line.slice(4)}</h4>;
        if (line.startsWith('---')) return <hr key={i} style={{ border: 'none', borderTop: '1px solid #eee', margin: '16px 0' }} />;
        if (line.match(/^\d+\./)) return <p key={i} style={{ margin: '6px 0 6px 16px', fontWeight: '500' }}>{line}</p>;
        if (line.startsWith('- ')) return <p key={i} style={{ margin: '4px 0 4px 16px', color: '#444' }}>• {line.slice(2)}</p>;
        if (line.trim() === '') return <div key={i} style={{ height: 6 }} />;
        return <p key={i} style={{ margin: '4px 0' }}>{line}</p>;
      })}
    </div>
  );
}

export default function KnowledgeBase({ token }) {
  const [docs, setDocs] = useState([]);
  const [selected, setSelected] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [form, setForm] = useState({ title: '', category: 'codes', content: '' });
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('docs'); // 'docs' | 'assessment'

  // Bulk import state
  const [bulkFiles, setBulkFiles] = useState([]);
  const [importing, setImporting] = useState(false);
  const [importResults, setImportResults] = useState(null);
  const fileInputRef = useRef();

  // Assessment state
  const [assessment, setAssessment] = useState(null);
  const [assessmentLoading, setAssessmentLoading] = useState(false);
  const [assessmentDate, setAssessmentDate] = useState(null);

  const headers = { 'x-auth-token': token };

  const load = () => {
    fetch('/api/knowledge', { headers }).then(r => r.json()).then(data => {
      setDocs(Array.isArray(data) ? data : []);
    });
  };

  const loadAssessment = () => {
    fetch('/api/knowledge/assessment', { headers }).then(r => r.json()).then(data => {
      if (data.report) {
        setAssessment(data.report);
        setAssessmentDate(data.updatedAt);
      }
    });
  };

  useEffect(() => { load(); loadAssessment(); }, []);

  const filtered = filter === 'all' ? docs : docs.filter(d => d.category === filter);
  const pastContractCount = docs.filter(d => d.category === 'past_contracts').length;

  const loadDoc = (id) => {
    fetch(`/api/knowledge/${id}`, { headers }).then(r => r.json()).then(setSelected);
  };

  const addDoc = async () => {
    setLoading(true);
    await fetch('/api/knowledge', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(form)
    });
    setShowAdd(false);
    setForm({ title: '', category: 'codes', content: '' });
    load();
    setLoading(false);
  };

  const deleteDoc = async (id) => {
    if (!window.confirm('Delete this document?')) return;
    await fetch(`/api/knowledge/${id}`, { method: 'DELETE', headers });
    if (selected?.id === id) setSelected(null);
    load();
  };

  const handleFileDrop = (e) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer?.files || e.target.files || [])
      .filter(f => f.type === 'application/pdf' || f.name.endsWith('.txt'));
    setBulkFiles(prev => [...prev, ...files]);
  };

  const removeFile = (idx) => {
    setBulkFiles(prev => prev.filter((_, i) => i !== idx));
  };

  const runBulkImport = async () => {
    if (!bulkFiles.length) return;
    setImporting(true);
    setImportResults(null);

    const fd = new FormData();
    bulkFiles.forEach(f => fd.append('documents', f));

    try {
      const res = await fetch('/api/knowledge/bulk-import', {
        method: 'POST', headers, body: fd
      });
      const data = await res.json();
      setImportResults(data);
      if (data.imported > 0) {
        load();
        setBulkFiles([]);
      }
    } catch (err) {
      setImportResults({ error: err.message });
    }
    setImporting(false);
  };

  const generateAssessment = async () => {
    setAssessmentLoading(true);
    try {
      const res = await fetch('/api/knowledge/assessment', { method: 'POST', headers });
      const data = await res.json();
      if (data.report) {
        setAssessment(data.report);
        setAssessmentDate(new Date().toISOString());
      } else {
        alert(data.error || 'Failed to generate report');
      }
    } catch (err) {
      alert(err.message);
    }
    setAssessmentLoading(false);
  };

  return (
    <div style={{ padding: 32 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 'bold', color: BLUE, margin: 0 }}>📚 Knowledge Base</h1>
          <p style={{ color: '#888', fontSize: 13, marginTop: 4 }}>Documents the AI uses when generating proposals and contracts</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => { setShowBulkImport(true); setImportResults(null); }}
            style={{ padding: '8px 16px', background: ORANGE, color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 'bold' }}>
            📦 Bulk Import Invoices
          </button>
          <button onClick={() => setShowAdd(true)}
            style={{ padding: '8px 16px', background: BLUE, color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 'bold' }}>
            + Add Document
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '2px solid #eee' }}>
        {[
          { key: 'docs', label: `📄 Documents (${docs.length})` },
          { key: 'assessment', label: `📊 Assessment Report${assessment ? ' ✓' : ''}` }
        ].map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            style={{
              padding: '10px 20px', background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: activeTab === tab.key ? 'bold' : 'normal',
              color: activeTab === tab.key ? BLUE : '#888',
              borderBottom: activeTab === tab.key ? `3px solid ${BLUE}` : '3px solid transparent',
              marginBottom: -2
            }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── DOCUMENTS TAB ── */}
      {activeTab === 'docs' && (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            {['all', ...Object.keys(CATEGORY_LABELS)].map(cat => (
              <button key={cat} onClick={() => setFilter(cat)}
                style={{
                  padding: '4px 12px', borderRadius: 20, border: `1px solid ${filter === cat ? BLUE : '#ddd'}`,
                  background: filter === cat ? BLUE : 'white', color: filter === cat ? 'white' : '#555',
                  cursor: 'pointer', fontSize: 12
                }}>
                {cat === 'all' ? `🗂️ All (${docs.length})` : `${CATEGORY_LABELS[cat]} (${docs.filter(d => d.category === cat).length})`}
              </button>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: selected ? '300px 1fr' : '1fr', gap: 16 }}>
            <div style={{ background: 'white', borderRadius: 10, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
              {filtered.length === 0 && (
                <div style={{ padding: 32, textAlign: 'center', color: '#888', fontSize: 13 }}>No documents in this category.</div>
              )}
              {filtered.map(doc => (
                <div key={doc.id} onClick={() => loadDoc(doc.id)}
                  style={{
                    padding: '12px 16px', cursor: 'pointer', borderBottom: '1px solid #f0f0f0',
                    background: selected?.id === doc.id ? '#E3ECFF' : 'white',
                    borderLeft: selected?.id === doc.id ? `3px solid ${BLUE}` : '3px solid transparent'
                  }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: '500', color: '#222', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{doc.title}</div>
                      <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{CATEGORY_LABELS[doc.category] || doc.category}</div>
                    </div>
                    <button onClick={e => { e.stopPropagation(); deleteDoc(doc.id); }}
                      style={{ background: 'none', border: 'none', color: '#ccc', cursor: 'pointer', fontSize: 14, flexShrink: 0 }}>✕</button>
                  </div>
                </div>
              ))}
            </div>

            {selected && (
              <div style={{ background: 'white', borderRadius: 10, padding: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div>
                    <h2 style={{ fontSize: 16, fontWeight: 'bold', color: BLUE, margin: 0 }}>{selected.title}</h2>
                    <span style={{ fontSize: 11, color: '#888' }}>{CATEGORY_LABELS[selected.category]}</span>
                  </div>
                  <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#888' }}>✕</button>
                </div>
                <pre style={{ fontSize: 12, color: '#333', whiteSpace: 'pre-wrap', lineHeight: 1.6, maxHeight: 500, overflow: 'auto' }}>
                  {selected.content}
                </pre>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── ASSESSMENT TAB ── */}
      {activeTab === 'assessment' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div>
              <p style={{ color: '#555', fontSize: 13, margin: 0 }}>
                AI-generated competitive analysis based on your {pastContractCount} imported invoice{pastContractCount !== 1 ? 's' : ''}.
              </p>
              {assessmentDate && (
                <p style={{ color: '#aaa', fontSize: 11, margin: '4px 0 0' }}>
                  Last generated: {new Date(assessmentDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
              )}
            </div>
            <button
              onClick={generateAssessment}
              disabled={assessmentLoading || pastContractCount === 0}
              style={{
                padding: '10px 20px', background: pastContractCount === 0 ? '#ccc' : GREEN,
                color: 'white', border: 'none', borderRadius: 6, cursor: pastContractCount === 0 ? 'not-allowed' : 'pointer',
                fontSize: 13, fontWeight: 'bold'
              }}>
              {assessmentLoading ? '⏳ Analyzing...' : assessment ? '🔄 Regenerate Report' : '📊 Generate Report'}
            </button>
          </div>

          {pastContractCount === 0 && (
            <div style={{ background: '#FFF8E1', border: '1px solid #FFD54F', borderRadius: 10, padding: 24, textAlign: 'center' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📦</div>
              <h3 style={{ color: '#F57F17', margin: '0 0 8px' }}>No invoices imported yet</h3>
              <p style={{ color: '#795548', fontSize: 13, margin: '0 0 16px' }}>Import your old invoices first using "Bulk Import Invoices" — then come back here to generate your competitive assessment report.</p>
              <button onClick={() => { setShowBulkImport(true); setImportResults(null); }}
                style={{ padding: '10px 20px', background: ORANGE, color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 'bold' }}>
                📦 Import Invoices Now
              </button>
            </div>
          )}

          {assessmentLoading && (
            <div style={{ background: 'white', borderRadius: 10, padding: 48, textAlign: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
              <div style={{ fontSize: 40, marginBottom: 16 }}>🤖</div>
              <h3 style={{ color: BLUE }}>Analyzing your invoices...</h3>
              <p style={{ color: '#888', fontSize: 13 }}>Claude is reviewing {pastContractCount} contracts to assess your market position, pricing strategy, and scope language. This takes about 30 seconds.</p>
            </div>
          )}

          {!assessmentLoading && assessment && (
            <div style={{ background: 'white', borderRadius: 10, padding: 32, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', maxWidth: 900 }}>
              <MarkdownReport text={assessment} />
            </div>
          )}
        </div>
      )}

      {/* ── ADD DOC MODAL ── */}
      {showAdd && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', borderRadius: 12, padding: 32, width: 560, maxHeight: '90vh', overflow: 'auto' }}>
            <h2 style={{ color: BLUE, marginBottom: 20 }}>Add Knowledge Document</h2>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: '#555', display: 'block', marginBottom: 4 }}>Title</label>
              <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
                style={{ width: '100%', padding: 10, border: '1px solid #ddd', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: '#555', display: 'block', marginBottom: 4 }}>Category</label>
              <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}
                style={{ width: '100%', padding: 10, border: '1px solid #ddd', borderRadius: 6, fontSize: 13 }}>
                {Object.entries(CATEGORY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, color: '#555', display: 'block', marginBottom: 4 }}>Content</label>
              <textarea rows={10} value={form.content} onChange={e => setForm({ ...form, content: e.target.value })}
                style={{ width: '100%', padding: 10, border: '1px solid #ddd', borderRadius: 6, fontSize: 13, boxSizing: 'border-box', resize: 'vertical' }} />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowAdd(false)} style={{ flex: 1, padding: 10, border: '1px solid #ddd', borderRadius: 6, cursor: 'pointer', background: 'white' }}>Cancel</button>
              <button onClick={addDoc} disabled={loading} style={{ flex: 2, padding: 10, background: BLUE, color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 'bold' }}>
                {loading ? 'Saving...' : 'Add to Knowledge Base'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── BULK IMPORT MODAL ── */}
      {showBulkImport && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', borderRadius: 12, padding: 32, width: 600, maxHeight: '90vh', overflow: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <h2 style={{ color: BLUE, margin: 0 }}>📦 Bulk Import Old Invoices</h2>
              <button onClick={() => { setShowBulkImport(false); setBulkFiles([]); setImportResults(null); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#888' }}>✕</button>
            </div>
            <p style={{ fontSize: 13, color: '#666', marginBottom: 20 }}>
              Drop your old PDF invoices here. Claude will read each one and extract pricing data, scope language, and project details into the knowledge base.
            </p>

            {!importResults && (
              <>
                {/* Drop zone */}
                <div
                  onDragOver={e => e.preventDefault()}
                  onDrop={handleFileDrop}
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    border: '2px dashed #ccc', borderRadius: 10, padding: 36,
                    textAlign: 'center', cursor: 'pointer', marginBottom: 16,
                    background: '#FAFAFA', transition: 'border-color 0.2s'
                  }}
                  onDragEnter={e => e.currentTarget.style.borderColor = BLUE}
                  onDragLeave={e => e.currentTarget.style.borderColor = '#ccc'}>
                  <div style={{ fontSize: 36, marginBottom: 8 }}>📄</div>
                  <div style={{ fontSize: 14, color: '#555', fontWeight: '500' }}>Click or drag & drop PDFs here</div>
                  <div style={{ fontSize: 12, color: '#aaa', marginTop: 4 }}>Multiple files supported • PDF only</div>
                  <input ref={fileInputRef} type="file" multiple accept=".pdf,.txt"
                    style={{ display: 'none' }} onChange={handleFileDrop} />
                </div>

                {/* File list */}
                {bulkFiles.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 12, color: '#555', marginBottom: 8, fontWeight: '600' }}>
                      {bulkFiles.length} file{bulkFiles.length !== 1 ? 's' : ''} ready to import:
                    </div>
                    <div style={{ maxHeight: 200, overflow: 'auto', border: '1px solid #eee', borderRadius: 8 }}>
                      {bulkFiles.map((f, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid #f5f5f5' }}>
                          <div>
                            <span style={{ fontSize: 13, color: '#333' }}>{f.name}</span>
                            <span style={{ fontSize: 11, color: '#aaa', marginLeft: 8 }}>{(f.size / 1024).toFixed(0)} KB</span>
                          </div>
                          <button onClick={() => removeFile(i)}
                            style={{ background: 'none', border: 'none', color: '#ccc', cursor: 'pointer', fontSize: 16 }}>✕</button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {importing && (
                  <div style={{ background: '#E3F2FD', borderRadius: 8, padding: 16, marginBottom: 16, textAlign: 'center' }}>
                    <div style={{ fontSize: 13, color: '#1565C0', fontWeight: '500' }}>
                      ⏳ Importing {bulkFiles.length} invoice{bulkFiles.length !== 1 ? 's' : ''}...
                    </div>
                    <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>Claude is reading each file. This may take a minute.</div>
                  </div>
                )}

                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => { setShowBulkImport(false); setBulkFiles([]); }}
                    style={{ flex: 1, padding: 10, border: '1px solid #ddd', borderRadius: 6, cursor: 'pointer', background: 'white' }}>
                    Cancel
                  </button>
                  <button onClick={runBulkImport} disabled={!bulkFiles.length || importing}
                    style={{
                      flex: 2, padding: 10,
                      background: bulkFiles.length && !importing ? ORANGE : '#ccc',
                      color: 'white', border: 'none', borderRadius: 6,
                      cursor: bulkFiles.length && !importing ? 'pointer' : 'not-allowed', fontWeight: 'bold'
                    }}>
                    {importing ? '⏳ Importing...' : `📥 Import ${bulkFiles.length} Invoice${bulkFiles.length !== 1 ? 's' : ''}`}
                  </button>
                </div>
              </>
            )}

            {/* Results screen */}
            {importResults && !importResults.error && (
              <div>
                <div style={{ textAlign: 'center', marginBottom: 20 }}>
                  <div style={{ fontSize: 48 }}>{importResults.failed === 0 ? '✅' : '⚠️'}</div>
                  <h3 style={{ color: importResults.failed === 0 ? GREEN : ORANGE, margin: '8px 0' }}>
                    {importResults.imported} of {importResults.total} imported successfully
                  </h3>
                </div>

                <div style={{ border: '1px solid #eee', borderRadius: 8, overflow: 'hidden', marginBottom: 20 }}>
                  {importResults.results.map((r, i) => (
                    <div key={i} style={{
                      padding: '10px 14px', borderBottom: '1px solid #f5f5f5',
                      background: r.success ? '#F1F8E9' : '#FFF3E0'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <span style={{ fontSize: 12, fontWeight: '600', color: r.success ? GREEN : '#E65100' }}>
                            {r.success ? '✓' : '✗'} {r.filename}
                          </span>
                          {r.success && r.extracted && (
                            <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>
                              {r.extracted.projectType} •
                              {r.extracted.totalContractValue ? ` $${r.extracted.totalContractValue.toLocaleString()} •` : ''}
                              {r.extracted.tradesCount} trades •
                              Position: {r.extracted.marketPosition || 'unknown'}
                            </div>
                          )}
                          {!r.success && <div style={{ fontSize: 11, color: '#c62828', marginTop: 2 }}>{r.error}</div>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => { setShowBulkImport(false); setImportResults(null); setBulkFiles([]); }}
                    style={{ flex: 1, padding: 10, border: '1px solid #ddd', borderRadius: 6, cursor: 'pointer', background: 'white' }}>
                    Done
                  </button>
                  {importResults.imported > 0 && (
                    <button onClick={() => { setShowBulkImport(false); setImportResults(null); setBulkFiles([]); setActiveTab('assessment'); }}
                      style={{ flex: 2, padding: 10, background: GREEN, color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 'bold' }}>
                      📊 Generate Assessment Report →
                    </button>
                  )}
                </div>
              </div>
            )}

            {importResults?.error && (
              <div style={{ background: '#FFEBEE', borderRadius: 8, padding: 16, textAlign: 'center' }}>
                <div style={{ color: '#c62828', fontSize: 13 }}>Error: {importResults.error}</div>
                <button onClick={() => setImportResults(null)}
                  style={{ marginTop: 12, padding: '8px 16px', background: '#c62828', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
                  Try Again
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
