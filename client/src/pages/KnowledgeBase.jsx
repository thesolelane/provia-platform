// client/src/pages/KnowledgeBase.jsx
import { useState, useEffect } from 'react';

const BLUE = '#1B3A6B';
const ORANGE = '#E07B2A';

const CATEGORY_LABELS = {
  codes: '📜 Building Codes',
  'scope-templates': '🔨 Scope Templates',
  legal: '⚖️ Legal',
  pricing: '💰 Pricing Reference',
  past_contracts: '📁 Past Contracts',
  faqs: '❓ FAQs'
};

export default function KnowledgeBase({ token }) {
  const [docs, setDocs] = useState([]);
  const [selected, setSelected] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [form, setForm] = useState({ title: '', category: 'codes', content: '' });
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadTitle, setUploadTitle] = useState('');
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(false);
  const headers = { 'x-auth-token': token };

  const load = () => {
    fetch('/api/knowledge', { headers }).then(r => r.json()).then(data => {
      setDocs(Array.isArray(data) ? data : []);
    });
  };

  useEffect(() => { load(); }, []);

  const filtered = filter === 'all' ? docs : docs.filter(d => d.category === filter);

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

  const uploadDoc = async () => {
    if (!uploadFile) return;
    setLoading(true);
    const fd = new FormData();
    fd.append('document', uploadFile);
    fd.append('title', uploadTitle || uploadFile.name);
    fd.append('category', 'past_contracts');
    await fetch('/api/knowledge/upload', { method: 'POST', headers, body: fd });
    setShowUpload(false);
    setUploadFile(null);
    setUploadTitle('');
    load();
    setLoading(false);
  };

  const deleteDoc = async (id) => {
    if (!window.confirm('Delete this document?')) return;
    await fetch(`/api/knowledge/${id}`, { method: 'DELETE', headers });
    if (selected?.id === id) setSelected(null);
    load();
  };

  return (
    <div style={{ padding: 32 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 'bold', color: BLUE, margin: 0 }}>📚 Knowledge Base</h1>
          <p style={{ color: '#888', fontSize: 13, marginTop: 4 }}>Documents the AI uses when generating proposals and contracts</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setShowUpload(true)}
            style={{ padding: '8px 16px', background: ORANGE, color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 'bold' }}>
            📄 Upload Past Invoice
          </button>
          <button onClick={() => setShowAdd(true)}
            style={{ padding: '8px 16px', background: BLUE, color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 'bold' }}>
            + Add Document
          </button>
        </div>
      </div>

      {/* Category filter */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {['all', ...Object.keys(CATEGORY_LABELS)].map(cat => (
          <button key={cat} onClick={() => setFilter(cat)}
            style={{ padding: '4px 12px', borderRadius: 20, border: `1px solid ${filter === cat ? BLUE : '#ddd'}`,
              background: filter === cat ? BLUE : 'white', color: filter === cat ? 'white' : '#555',
              cursor: 'pointer', fontSize: 12 }}>
            {cat === 'all' ? '🗂️ All' : CATEGORY_LABELS[cat]}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: selected ? '1fr 2fr' : '1fr', gap: 16 }}>
        {/* Doc list */}
        <div style={{ background: 'white', borderRadius: 10, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
          {filtered.length === 0 && (
            <div style={{ padding: 32, textAlign: 'center', color: '#888', fontSize: 13 }}>No documents in this category.</div>
          )}
          {filtered.map(doc => (
            <div key={doc.id}
              onClick={() => loadDoc(doc.id)}
              style={{
                padding: '12px 16px', cursor: 'pointer', borderBottom: '1px solid #f0f0f0',
                background: selected?.id === doc.id ? '#E3ECFF' : 'white',
                borderLeft: selected?.id === doc.id ? `3px solid ${BLUE}` : '3px solid transparent'
              }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: '500', color: '#222' }}>{doc.title}</div>
                  <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{CATEGORY_LABELS[doc.category] || doc.category}</div>
                </div>
                <button onClick={e => { e.stopPropagation(); deleteDoc(doc.id); }}
                  style={{ background: 'none', border: 'none', color: '#ccc', cursor: 'pointer', fontSize: 14 }}>✕</button>
              </div>
            </div>
          ))}
        </div>

        {/* Doc viewer */}
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

      {/* Add doc modal */}
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

      {/* Upload modal */}
      {showUpload && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', borderRadius: 12, padding: 32, width: 480 }}>
            <h2 style={{ color: BLUE, marginBottom: 8 }}>Upload Past Invoice / Contract</h2>
            <p style={{ fontSize: 13, color: '#888', marginBottom: 20 }}>The bot will learn your pricing and language style from previous jobs.</p>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: '#555', display: 'block', marginBottom: 4 }}>Document Title (optional)</label>
              <input value={uploadTitle} onChange={e => setUploadTitle(e.target.value)}
                placeholder="e.g. Smith Renovation 2024"
                style={{ width: '100%', padding: 10, border: '1px solid #ddd', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }} />
            </div>
            <div style={{ marginBottom: 20, border: '2px dashed #ddd', borderRadius: 8, padding: 24, textAlign: 'center' }}>
              <input type="file" accept=".pdf,.txt,.docx" onChange={e => setUploadFile(e.target.files[0])} />
              <div style={{ fontSize: 12, color: '#888', marginTop: 8 }}>PDF or text files supported</div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowUpload(false)} style={{ flex: 1, padding: 10, border: '1px solid #ddd', borderRadius: 6, cursor: 'pointer', background: 'white' }}>Cancel</button>
              <button onClick={uploadDoc} disabled={!uploadFile || loading}
                style={{ flex: 2, padding: 10, background: ORANGE, color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 'bold' }}>
                {loading ? 'Uploading...' : '📄 Upload & Train Bot'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
