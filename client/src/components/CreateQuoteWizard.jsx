import { useState, useEffect, useRef } from 'react';
import { showToast } from '../utils/toast';

const inputStyle = {
  width: '100%',
  padding: '9px 11px',
  border: '1px solid #ddd',
  borderRadius: 6,
  fontSize: 13,
  boxSizing: 'border-box',
  fontFamily: 'inherit',
  outline: 'none',
};

const labelStyle = {
  fontSize: 11,
  color: '#555',
  display: 'block',
  marginBottom: 4,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.03em',
};

// ── AI Questions step ──────────────────────────────────────────────────────
function AIQuestionsStep({ questions, answers, onAnswer, onBack, onNext }) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [localAnswer, setLocalAnswer] = useState('');
  const [localDemoCost, setLocalDemoCost] = useState('');
  const [waitingForDemoCost, setWaitingForDemoCost] = useState(false);

  const currentQ = questions[currentIdx];
  const totalQ = questions.length;
  const isLast = currentIdx === totalQ - 1;
  const existingAnswer = answers.find(a => a.questionId === currentQ?.id);

  useEffect(() => {
    setLocalAnswer(existingAnswer?.answer || '');
    setLocalDemoCost(existingAnswer?.demoCost || '');
    setWaitingForDemoCost(existingAnswer?.answer === 'no' && currentQ?.questionType === 'demo_check');
  }, [currentIdx]);

  if (!currentQ) return null;

  const handleChip = (val) => {
    setLocalAnswer(val);
    if (currentQ.questionType === 'demo_check' && val === 'no') {
      setWaitingForDemoCost(true);
    } else {
      setWaitingForDemoCost(false);
      setLocalDemoCost('');
    }
  };

  const canAdvance = () => {
    if (currentQ.answerType === 'text' && !localAnswer.trim()) return false;
    if (currentQ.answerType === 'yesno' && !localAnswer) return false;
    if (currentQ.questionType === 'demo_check' && localAnswer === 'no' && !localDemoCost.trim()) return false;
    return true;
  };

  const skipQuestion = () => {
    const record = {
      questionId: currentQ.id,
      question: currentQ.question,
      questionType: currentQ.questionType,
      trade: currentQ.trade,
      answer: 'skipped',
      demoCost: null,
    };
    const updated = [...answers.filter(a => a.questionId !== currentQ.id), record];
    onAnswer(updated);
    if (isLast) {
      onNext(updated);
    } else {
      setCurrentIdx(i => i + 1);
      setLocalAnswer('');
      setLocalDemoCost('');
      setWaitingForDemoCost(false);
    }
  };

  const saveAndAdvance = () => {
    const record = {
      questionId: currentQ.id,
      question: currentQ.question,
      questionType: currentQ.questionType,
      trade: currentQ.trade,
      answer: localAnswer,
      demoCost: localAnswer === 'no' && currentQ.questionType === 'demo_check'
        ? localDemoCost.replace(/[$,\s]/g, '') : null,
    };
    const updated = [...answers.filter(a => a.questionId !== currentQ.id), record];
    onAnswer(updated);
    if (isLast) {
      onNext(updated);
    } else {
      setCurrentIdx(i => i + 1);
      setLocalAnswer('');
      setLocalDemoCost('');
      setWaitingForDemoCost(false);
    }
  };

  const goBack = () => {
    if (currentIdx === 0) {
      onBack();
    } else {
      const prev = questions[currentIdx - 1];
      const prevAns = answers.find(a => a.questionId === prev?.id);
      setCurrentIdx(i => i - 1);
      setLocalAnswer(prevAns?.answer || '');
      setLocalDemoCost(prevAns?.demoCost || '');
      setWaitingForDemoCost(prevAns?.answer === 'no' && prev?.questionType === 'demo_check');
    }
  };

  return (
    <div style={{ padding: '24px 28px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#1B3A6B' }}>AI Clarifying Questions</h3>
        <span style={{ fontSize: 12, color: '#888' }}>{currentIdx + 1} of {totalQ}</span>
      </div>
      <p style={{ fontSize: 12, color: '#777', margin: '0 0 16px' }}>Answer each question to make sure the estimate is complete.</p>

      {/* Progress dots */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 18 }}>
        {questions.map((_, i) => (
          <div key={i} style={{
            width: 8, height: 8, borderRadius: '50%',
            background: i < currentIdx ? '#059669' : i === currentIdx ? '#1B3A6B' : '#e5e7eb',
          }} />
        ))}
      </div>

      {/* Question Card */}
      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 18, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
          <span style={{ fontSize: 20 }}>
            {currentQ.questionType === 'demo_check' ? '🏗️' : currentQ.questionType === 'trade_clarification' ? '🔧' : '📋'}
          </span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 500, color: '#1e293b', lineHeight: 1.5 }}>{currentQ.question}</div>
            {currentQ.hint && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>{currentQ.hint}</div>}
          </div>
        </div>

        {currentQ.answerType === 'yesno' && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[
              { val: 'yes', label: 'Yes — already included', color: '#059669' },
              { val: 'no', label: 'No — needs to be added', color: '#C62828' },
              { val: 'not_sure', label: 'Not sure', color: '#888' },
            ].map(opt => (
              <button
                key={opt.val}
                onClick={() => handleChip(opt.val)}
                style={{
                  padding: '8px 16px', borderRadius: 20, fontSize: 12, cursor: 'pointer',
                  border: `2px solid ${localAnswer === opt.val ? opt.color : '#e2e8f0'}`,
                  background: localAnswer === opt.val ? opt.color + '18' : 'white',
                  color: localAnswer === opt.val ? opt.color : '#64748b',
                  fontWeight: localAnswer === opt.val ? 700 : 400,
                  transition: 'all 0.15s',
                }}
              >{opt.label}</button>
            ))}
          </div>
        )}

        {currentQ.answerType === 'text' && (
          <textarea
            rows={3}
            value={localAnswer}
            onChange={e => setLocalAnswer(e.target.value)}
            placeholder="Type your answer..."
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        )}

        {waitingForDemoCost && currentQ.questionType === 'demo_check' && (
          <div style={{ marginTop: 14, padding: 14, background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: '#9a3412', marginBottom: 8 }}>
              What should we estimate for removing the existing {currentQ.trade}?
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: '#555', fontSize: 14, fontWeight: 'bold' }}>$</span>
              <input
                type="number"
                value={localDemoCost}
                onChange={e => setLocalDemoCost(e.target.value)}
                placeholder="e.g. 1500"
                style={{ flex: 1, padding: '8px 10px', border: '1px solid #fed7aa', borderRadius: 6, fontSize: 13 }}
              />
            </div>
            <div style={{ fontSize: 11, color: '#c2410c', marginTop: 6 }}>
              This will be added as a Demo line item in the estimate.
            </div>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
        <button onClick={goBack} style={{ padding: '10px 20px', border: '1px solid #ddd', borderRadius: 6, background: 'white', cursor: 'pointer', fontSize: 13, color: '#555' }}>
          ← Back
        </button>
        <div style={{ display: 'flex', gap: 8 }}>
          {currentQ.answerType === 'text' && (
            <button
              onClick={skipQuestion}
              style={{ padding: '10px 16px', borderRadius: 6, border: '1px solid #ddd', background: 'white', fontSize: 12, color: '#888', cursor: 'pointer' }}
            >
              Skip
            </button>
          )}
          <button
            onClick={saveAndAdvance}
            disabled={!canAdvance()}
            style={{
              padding: '10px 24px', borderRadius: 6, border: 'none', fontSize: 13, fontWeight: 700,
              background: canAdvance() ? '#1B3A6B' : '#c5ccd8',
              color: 'white',
              cursor: canAdvance() ? 'pointer' : 'not-allowed',
            }}
          >
            {isLast ? 'Review Estimate →' : 'Next →'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Review step (Phase 2 — includes Q&A summary and demo additions) ─────────
function ReviewStep({ contact, address, scope, budgetTarget, answers, onBack, onSubmit, busy }) {
  const demoAdditions = answers.filter(a => a.questionType === 'demo_check' && a.answer === 'no' && a.demoCost);
  const projectAddress = [address.street, address.city, address.state, address.zip].filter(Boolean).join(', ');

  const sections = [
    {
      label: 'Contact',
      rows: [
        { key: 'Name', value: contact.name },
        { key: 'Phone', value: contact.phone || '—' },
        { key: 'Email', value: contact.email || '—' },
      ],
    },
    {
      label: 'Job Address',
      rows: [{ key: '', value: projectAddress || '—' }],
    },
    {
      label: 'Scope of Work',
      rows: [
        { key: '', value: scope },
        ...(budgetTarget ? [{ key: 'Budget Target', value: '$' + Number(String(budgetTarget).replace(/,/g,'')).toLocaleString() + ' (±8% soft target)' }] : []),
      ],
    },
  ];

  return (
    <div style={{ padding: '24px 28px' }}>
      <p style={{ fontSize: 13, color: '#555', marginTop: 0, marginBottom: 16 }}>
        Review everything before generating the proposal.
      </p>

      {sections.map(section => (
        <div key={section.label} style={{ background: '#f8f9fc', borderRadius: 8, padding: '14px 16px', marginBottom: 12, border: '1px solid #e8eaf0' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#1B3A6B', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>{section.label}</div>
          {section.rows.map((row, i) => (
            <div key={i} style={{ fontSize: 13, color: '#333', marginBottom: row.key ? 4 : 0, whiteSpace: row.key ? 'normal' : 'pre-wrap' }}>
              {row.key ? <><span style={{ color: '#888', marginRight: 6 }}>{row.key}:</span>{row.value}</> : row.value}
            </div>
          ))}
        </div>
      ))}

      {demoAdditions.length > 0 && (
        <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, padding: '14px 16px', marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#c2410c', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Demo Work Added from Q&A</div>
          {demoAdditions.map((a, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#9a3412', marginBottom: 4 }}>
              <span>Demo — Remove {a.trade}</span>
              <span style={{ fontWeight: 700 }}>${Number(a.demoCost).toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}

      {answers.length > 0 && (
        <div style={{ background: '#f8f9fc', borderRadius: 8, padding: '14px 16px', marginBottom: 12, border: '1px solid #e8eaf0' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#1B3A6B', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>AI Q&A Answers</div>
          {answers.map((a, i) => (
            <div key={i} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: i < answers.length - 1 ? '1px solid #e2e8f0' : 'none' }}>
              <div style={{ fontSize: 12, color: '#64748b', marginBottom: 3 }}>{a.question}</div>
              <div style={{ fontSize: 13, fontWeight: 500, color: '#1e293b' }}>
                {a.answer === 'yes' ? '✓ Yes — already included'
                  : a.answer === 'no' ? `✗ No — demo added ($${Number(a.demoCost || 0).toLocaleString()})`
                  : a.answer === 'not_sure' ? '~ Not sure'
                  : a.answer}
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 4 }}>
        <button onClick={onBack} style={{ padding: '10px 20px', border: '1px solid #ddd', borderRadius: 6, background: 'white', cursor: 'pointer', fontSize: 13, color: '#555' }}>
          ← Back
        </button>
        <button
          onClick={onSubmit}
          disabled={busy}
          style={{
            padding: '10px 24px', borderRadius: 6, border: 'none', fontWeight: 700, fontSize: 14,
            background: busy ? '#888' : '#1B3A6B', color: 'white',
            cursor: busy ? 'not-allowed' : 'pointer',
          }}
        >
          {busy ? '⏳ Generating...' : '🤖 Generate Proposal'}
        </button>
      </div>
    </div>
  );
}

// ── Main wizard component ──────────────────────────────────────────────────
export default function CreateQuoteWizard({ token, onClose, onSubmitted }) {
  // STEPS: 0=Contact, 1=Job Address, 2=Scope, 3=AI Questions (dynamic), 4=Review
  const BASE_STEPS = ['Contact', 'Job Address', 'Scope of Work', 'Review'];

  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [fetchingQuestions, setFetchingQuestions] = useState(false);

  const [contact, setContact] = useState({ name: '', phone: '', email: '' });
  const [address, setAddress] = useState({ street: '', city: '', state: '', zip: '' });
  const [scope, setScope] = useState('');
  const [budgetTarget, setBudgetTarget] = useState('');

  const [wizardQuestions, setWizardQuestions] = useState([]);
  const [wizardAnswers, setWizardAnswers] = useState([]);
  const [aiStepInserted, setAiStepInserted] = useState(false);

  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestTimeout = useRef(null);
  const nameRef = useRef(null);

  const headers = { 'x-auth-token': token };

  const STEPS = aiStepInserted
    ? ['Contact', 'Job Address', 'Scope of Work', 'AI Questions', 'Review']
    : BASE_STEPS;

  const REVIEW_STEP = STEPS.length - 1;
  const AI_STEP = aiStepInserted ? 3 : -1;

  const fetchSuggestions = (query) => {
    clearTimeout(suggestTimeout.current);
    if (!query || query.length < 2) { setSuggestions([]); return; }
    suggestTimeout.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/contacts?search=${encodeURIComponent(query)}&limit=6`, { headers });
        const data = await res.json();
        setSuggestions(data.contacts || []);
      } catch { setSuggestions([]); }
    }, 250);
  };

  const applySuggestion = (c) => {
    setContact({ name: c.name || '', phone: c.phone || '', email: c.email || '' });
    if (c.address || c.city || c.state) {
      setAddress(prev => ({
        street: c.address || prev.street,
        city: c.city || prev.city,
        state: c.state || prev.state,
        zip: prev.zip,
      }));
    }
    setSuggestions([]);
    setShowSuggestions(false);
  };

  const handleNameChange = (val) => {
    setContact(prev => ({ ...prev, name: val }));
    setShowSuggestions(true);
    fetchSuggestions(val);
  };

  useEffect(() => {
    const handler = (e) => {
      if (nameRef.current && !nameRef.current.contains(e.target)) setShowSuggestions(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    return () => clearTimeout(suggestTimeout.current);
  }, []);

  const canNext = () => {
    if (step === 0) return contact.name.trim().length > 0;
    if (step === 1) return address.street.trim().length > 0 && address.city.trim().length > 0;
    if (step === 2) return scope.trim().length >= 20;
    return true;
  };

  const handleNextFromScope = async () => {
    setFetchingQuestions(true);
    try {
      const projectAddress = [address.street, address.city, address.state, address.zip].filter(Boolean).join(', ');
      const res = await fetch('/api/jobs/wizard/questions', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ scopeText: scope, projectAddress, budgetTarget: budgetTarget ? Number(budgetTarget.replace(/,/g,'')) : null }),
      });
      if (res.ok) {
        const data = await res.json();
        const questions = data.questions || [];
        if (questions.length > 0) {
          setWizardQuestions(questions);
          setWizardAnswers([]);
          setAiStepInserted(true);
          setStep(3);
        } else {
          setAiStepInserted(false);
          setStep(3);
        }
      } else {
        showToast('Could not load AI questions — you can still generate the proposal.', 'warning');
        setAiStepInserted(false);
        setStep(3);
      }
    } catch {
      showToast('Network error. Proceeding to review.', 'warning');
      setAiStepInserted(false);
      setStep(3);
    }
    setFetchingQuestions(false);
  };

  const handleQuestionsComplete = (finalAnswers) => {
    setWizardAnswers(finalAnswers);
    setStep(REVIEW_STEP);
  };

  const submit = async () => {
    setBusy(true);
    try {
      const projectAddress = [address.street, address.city, address.state, address.zip].filter(Boolean).join(', ');
      const res = await fetch('/api/jobs/wizard/submit', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: contact.name,
          customerPhone: contact.phone,
          customerEmail: contact.email,
          projectAddress,
          scopeText: scope,
          qaAnswers: wizardAnswers,
          budgetTarget: budgetTarget ? Number(budgetTarget.replace(/,/g,'')) : null,
        }),
      });
      const data = await res.json();
      setBusy(false);
      if (res.ok) {
        showToast('Quote submitted — processing now');
        onSubmitted();
        onClose();
      } else {
        showToast(data.error || 'Error submitting quote', 'error');
      }
    } catch {
      setBusy(false);
      showToast('Network error — please try again', 'error');
    }
  };

  const handleBack = () => {
    if (step === REVIEW_STEP && aiStepInserted) {
      setStep(AI_STEP);
    } else if (step > 0) {
      setStep(s => s - 1);
    } else {
      onClose();
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }}>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      <div style={{ background: 'white', borderRadius: 14, width: 560, maxHeight: '92vh', overflow: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>

        {/* Header */}
        <div style={{ padding: '24px 28px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 20, color: '#1B3A6B', fontWeight: 700 }}>Create Quote</h2>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: '#888' }}>Step {step + 1} of {STEPS.length} — {STEPS[step]}</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#aaa', lineHeight: 1, marginTop: -2 }}>×</button>
        </div>

        {/* Progress bar */}
        <div style={{ padding: '16px 28px 0' }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {STEPS.map((label, i) => (
              <div key={label} style={{ flex: 1 }}>
                <div style={{
                  height: 4, borderRadius: 2,
                  background: i <= step ? '#1B3A6B' : '#e5e7eb',
                  transition: 'background 0.2s',
                }} />
                <div style={{ fontSize: 10, color: i === step ? '#1B3A6B' : '#bbb', marginTop: 4, fontWeight: i === step ? 700 : 400, textAlign: 'center' }}>{label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* AI Questions step */}
        {step === AI_STEP && aiStepInserted ? (
          <AIQuestionsStep
            questions={wizardQuestions}
            answers={wizardAnswers}
            onAnswer={setWizardAnswers}
            onBack={handleBack}
            onNext={handleQuestionsComplete}
          />
        ) : step === REVIEW_STEP ? (
          <ReviewStep
            contact={contact}
            address={address}
            scope={scope}
            budgetTarget={budgetTarget}
            answers={wizardAnswers}
            onBack={handleBack}
            onSubmit={submit}
            busy={busy}
          />
        ) : (
          <>
            {/* Standard step content */}
            <div style={{ padding: '24px 28px' }}>

              {/* Step 0 — Contact */}
              {step === 0 && (
                <div>
                  <div ref={nameRef} style={{ position: 'relative', marginBottom: 14 }}>
                    <label style={labelStyle}>Name *</label>
                    <input
                      autoFocus
                      value={contact.name}
                      onChange={e => handleNameChange(e.target.value)}
                      onFocus={() => contact.name.length >= 2 && setShowSuggestions(true)}
                      placeholder="e.g. John Smith"
                      style={inputStyle}
                    />
                    {showSuggestions && suggestions.length > 0 && (
                      <div style={{
                        position: 'absolute', top: '100%', left: 0, right: 0, background: 'white',
                        border: '1px solid #ddd', borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                        zIndex: 10, maxHeight: 200, overflow: 'auto',
                      }}>
                        {suggestions.map(c => (
                          <div
                            key={c.id}
                            onMouseDown={() => applySuggestion(c)}
                            style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #f0f0f0' }}
                            onMouseEnter={e => e.currentTarget.style.background = '#f5f8ff'}
                            onMouseLeave={e => e.currentTarget.style.background = 'white'}
                          >
                            <div style={{ fontWeight: 600, fontSize: 13, color: '#1B3A6B' }}>{c.name}</div>
                            <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
                              {[c.phone, c.email].filter(Boolean).join(' · ')}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label style={labelStyle}>Phone</label>
                      <input value={contact.phone} onChange={e => setContact(p => ({ ...p, phone: e.target.value }))} placeholder="+1 555 000 0000" style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Email</label>
                      <input value={contact.email} onChange={e => setContact(p => ({ ...p, email: e.target.value }))} placeholder="john@email.com" type="email" style={inputStyle} />
                    </div>
                  </div>
                </div>
              )}

              {/* Step 1 — Job Address */}
              {step === 1 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div>
                    <label style={labelStyle}>Street *</label>
                    <input autoFocus value={address.street} onChange={e => setAddress(p => ({ ...p, street: e.target.value }))} placeholder="123 Main St" style={inputStyle} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12 }}>
                    <div>
                      <label style={labelStyle}>City *</label>
                      <input value={address.city} onChange={e => setAddress(p => ({ ...p, city: e.target.value }))} placeholder="Boston" style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>State</label>
                      <input value={address.state} onChange={e => setAddress(p => ({ ...p, state: e.target.value }))} placeholder="MA" style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Zip</label>
                      <input value={address.zip} onChange={e => setAddress(p => ({ ...p, zip: e.target.value }))} placeholder="02101" style={inputStyle} />
                    </div>
                  </div>
                </div>
              )}

              {/* Step 2 — Scope of Work */}
              {step === 2 && (
                <div>
                  <label style={labelStyle}>Scope of Work *</label>
                  <p style={{ fontSize: 12, color: '#777', margin: '0 0 8px' }}>
                    Describe the work — trades involved, rough scope, any specific materials? (minimum 20 characters)
                  </p>
                  <textarea
                    autoFocus
                    rows={8}
                    value={scope}
                    onChange={e => setScope(e.target.value)}
                    placeholder={`e.g. Kitchen remodel — install new cabinets, countertops, tile backsplash\nNew LVP flooring throughout main level\nBathroom: new vanity, toilet, shower tile`}
                    style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }}
                  />
                  <div style={{ marginTop: 14 }}>
                    <label style={labelStyle}>Budget Target <span style={{ fontWeight: 400, textTransform: 'none', color: '#999' }}>(optional — soft target, AI can go ±8%)</span></label>
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#555', fontSize: 13, fontWeight: 600 }}>$</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={budgetTarget}
                        onChange={e => setBudgetTarget(e.target.value.replace(/[^0-9,]/g, ''))}
                        placeholder="e.g. 150,000"
                        style={{ ...inputStyle, paddingLeft: 22 }}
                      />
                    </div>
                    <p style={{ fontSize: 11, color: '#aaa', margin: '4px 0 0' }}>
                      If set, AI will calibrate line items to reach this client-facing total.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Footer navigation for standard steps */}
            <div style={{ padding: '0 28px 24px', display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              <button
                onClick={step === 0 ? onClose : () => setStep(s => s - 1)}
                style={{ padding: '10px 20px', border: '1px solid #ddd', borderRadius: 6, background: 'white', cursor: 'pointer', fontSize: 13, color: '#555' }}
              >
                {step === 0 ? 'Cancel' : '← Back'}
              </button>

              {step === 2 ? (
                <button
                  onClick={handleNextFromScope}
                  disabled={fetchingQuestions || !canNext()}
                  style={{
                    padding: '10px 24px', borderRadius: 6, border: 'none',
                    background: fetchingQuestions || !canNext() ? '#c5ccd8' : '#1B3A6B',
                    color: 'white', fontWeight: 700, fontSize: 13,
                    cursor: fetchingQuestions || !canNext() ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}
                >
                  {fetchingQuestions ? (
                    <>
                      <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite', fontSize: 14 }}>⟳</span>
                      AI is thinking...
                    </>
                  ) : 'Next →'}
                </button>
              ) : (
                <button
                  onClick={() => setStep(s => s + 1)}
                  disabled={!canNext()}
                  style={{
                    padding: '10px 24px', borderRadius: 6, border: 'none',
                    background: canNext() ? '#1B3A6B' : '#c5ccd8',
                    color: 'white', fontWeight: 700, fontSize: 13,
                    cursor: canNext() ? 'pointer' : 'not-allowed',
                  }}
                >
                  Next →
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
