// client/src/pages/Setup.jsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const API = '/api';

const STEPS = [
  { id: 'platform',   title: 'Estimation Platform',   icon: '🔌' },
  { id: 'company',    title: 'Company Info',           icon: '🏢' },
  { id: 'team',       title: 'Team & Whitelist',       icon: '👥' },
  { id: 'markup',     title: 'Markup & Pricing',       icon: '💰' },
  { id: 'integrations', title: 'Integrations',         icon: '⚙️'  },
  { id: 'done',       title: 'Ready to Go',            icon: '✅' },
];

export default function Setup({ token }) {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  const [config, setConfig] = useState({
    platform: 'hearth',
    hearth_api_key: '',
    wave_api_key: '',
    company_name: 'Preferred Builders General Services Inc.',
    company_license: 'HIC-197400',
    company_address: '37 Duck Mill Road, Fitchburg, MA 01420',
    company_phone: '978-377-1784',
    owner_email: '',
    owner_whatsapp: '',
    jackson_email: 'jackson.deaquino@preferredbuildersusa.com',
    jackson_whatsapp: '',
    mailgun_domain: '',
    mailgun_api_key: '',
    twilio_sid: '',
    twilio_token: '',
    twilio_whatsapp: '',
    sub_op: '25',
    gc_op: '20',
    contingency: '10',
    deposit: '33',
  });

  const set = (k, v) => setConfig(c => ({ ...c, [k]: v }));

  const headers = { 'x-admin-token': token, 'Content-Type': 'application/json' };

  async function saveAndFinish() {
    setSaving(true);
    await fetch(`${API}/settings/bulk`, {
      method: 'POST', headers,
      body: JSON.stringify({
        'integration.platform': config.platform,
        'company.name': config.company_name,
        'company.license': config.company_license,
        'company.address': config.company_address,
        'company.phone': config.company_phone,
        'markup.subOP': String(Number(config.sub_op) / 100),
        'markup.gcOP': String(Number(config.gc_op) / 100),
        'markup.contingency': String(Number(config.contingency) / 100),
        'markup.deposit': String(Number(config.deposit) / 100),
        'setup.complete': 'true',
      })
    });
    setSaving(false);
    navigate('/');
  }

  const current = STEPS[step];

  return (
    <div className="max-w-2xl mx-auto">

      {/* Progress */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">System Setup</h1>
        <div className="flex gap-2">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex-1">
              <div className={`h-2 rounded-full ${i <= step ? 'bg-blue-900' : 'bg-gray-200'}`} />
              <div className={`text-xs mt-1 text-center ${i === step ? 'text-blue-900 font-bold' : 'text-gray-400'}`}>
                {s.icon}
              </div>
            </div>
          ))}
        </div>
        <p className="text-sm text-gray-500 mt-2">Step {step + 1} of {STEPS.length}: <strong>{current.title}</strong></p>
      </div>

      <div className="bg-white border rounded-lg p-8">

        {/* STEP: Platform */}
        {step === 0 && (
          <div className="space-y-6">
            <h2 className="text-xl font-bold text-gray-900">Choose Your Estimation Platform</h2>
            <p className="text-gray-500 text-sm">You can switch at any time from the admin settings.</p>
            {[
              { value:'hearth', label:'Hearth', desc:'Current platform — Jackson is familiar with it. ~$1,800/yr.', badge:'Active' },
              { value:'wave',   label:'Wave',   desc:'Free app. Similar features. API costs ~$192/yr. Save $1,600/yr.', badge:'Save money' },
              { value:'email',  label:'Email Only', desc:'No platform integration. Jackson emails PDFs manually.', badge:'Simple' },
            ].map(opt => (
              <label key={opt.value} className={`flex items-start gap-4 p-4 border-2 rounded-lg cursor-pointer transition-colors ${config.platform === opt.value ? 'border-blue-600 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}>
                <input type="radio" value={opt.value} checked={config.platform === opt.value}
                  onChange={e => set('platform', e.target.value)} className="mt-1" />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-gray-900">{opt.label}</span>
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{opt.badge}</span>
                  </div>
                  <p className="text-sm text-gray-500 mt-1">{opt.desc}</p>
                </div>
              </label>
            ))}
          </div>
        )}

        {/* STEP: Company */}
        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-gray-900">Company Information</h2>
            {[
              { key:'company_name',    label:'Company Name' },
              { key:'company_license', label:'HIC License Number' },
              { key:'company_address', label:'Address' },
              { key:'company_phone',   label:'Phone' },
            ].map(f => (
              <div key={f.key}>
                <label className="block text-xs font-medium text-gray-600 mb-1">{f.label}</label>
                <input value={config[f.key]} onChange={e => set(f.key, e.target.value)}
                  className="w-full border rounded px-3 py-2 text-sm" />
              </div>
            ))}
          </div>
        )}

        {/* STEP: Team */}
        {step === 2 && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-gray-900">Team & Contact Info</h2>
            <p className="text-sm text-gray-500">These will be added to the approved senders whitelist automatically.</p>
            {[
              { key:'owner_email',      label:'Owner Email',           placeholder:'you@preferredbuildersusa.com' },
              { key:'owner_whatsapp',   label:'Owner WhatsApp',        placeholder:'+1XXXXXXXXXX' },
              { key:'jackson_email',    label:"Jackson's Email",       placeholder:'jackson.deaquino@preferredbuildersusa.com' },
              { key:'jackson_whatsapp', label:"Jackson's WhatsApp",    placeholder:'+1XXXXXXXXXX' },
            ].map(f => (
              <div key={f.key}>
                <label className="block text-xs font-medium text-gray-600 mb-1">{f.label}</label>
                <input value={config[f.key]} onChange={e => set(f.key, e.target.value)}
                  className="w-full border rounded px-3 py-2 text-sm" placeholder={f.placeholder} />
              </div>
            ))}
          </div>
        )}

        {/* STEP: Markup */}
        {step === 3 && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-gray-900">Markup & Pricing Defaults</h2>
            <p className="text-sm text-gray-500">These apply to all generated contracts. Edit anytime in Settings.</p>
            {[
              { key:'sub_op',      label:'Subcontractor O&P %',  hint:'Standard: 25%' },
              { key:'gc_op',       label:'GC O&P %',             hint:'Standard: 20%' },
              { key:'contingency', label:'Contingency %',        hint:'Recommended: 10%' },
              { key:'deposit',     label:'Deposit %',            hint:'Preferred Builders standard: 33%' },
            ].map(f => (
              <div key={f.key}>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  {f.label} <span className="text-gray-400">({f.hint})</span>
                </label>
                <div className="flex items-center gap-3">
                  <input type="range" min="0" max="50" value={config[f.key]}
                    onChange={e => set(f.key, e.target.value)} className="flex-1" />
                  <span className="w-12 text-center font-bold text-blue-900">{config[f.key]}%</span>
                </div>
              </div>
            ))}
            <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm text-blue-800 mt-4">
              Combined markup: <strong>{Number(config.sub_op) + Number(config.gc_op)}%</strong> &nbsp;|&nbsp;
              Deposit: <strong>{config.deposit}%</strong>
            </div>
          </div>
        )}

        {/* STEP: Integrations */}
        {step === 4 && (
          <div className="space-y-6">
            <h2 className="text-xl font-bold text-gray-900">Integration Keys</h2>
            <p className="text-sm text-gray-500">These can be added now or later in Settings → Integrations. The system works without them in email-only mode.</p>

            <div className="space-y-3">
              <h3 className="font-medium text-gray-700">📧 Mailgun (Email)</h3>
              <input value={config.mailgun_domain} onChange={e => set('mailgun_domain', e.target.value)}
                className="w-full border rounded px-3 py-2 text-sm" placeholder="mg.preferredbuildersusa.com" />
              <input value={config.mailgun_api_key} onChange={e => set('mailgun_api_key', e.target.value)}
                className="w-full border rounded px-3 py-2 text-sm" placeholder="Mailgun API key" type="password" />
            </div>

            <div className="space-y-3">
              <h3 className="font-medium text-gray-700">💬 Twilio (WhatsApp)</h3>
              <input value={config.twilio_sid} onChange={e => set('twilio_sid', e.target.value)}
                className="w-full border rounded px-3 py-2 text-sm" placeholder="Twilio Account SID" />
              <input value={config.twilio_token} onChange={e => set('twilio_token', e.target.value)}
                className="w-full border rounded px-3 py-2 text-sm" placeholder="Twilio Auth Token" type="password" />
            </div>

            <div className="bg-yellow-50 border border-yellow-200 rounded p-3 text-sm text-yellow-800">
              ⚠️ Store all API keys in the <strong>.env</strong> file, not here. This setup wizard is for initial configuration only.
            </div>
          </div>
        )}

        {/* STEP: Done */}
        {step === 5 && (
          <div className="text-center space-y-4">
            <div className="text-6xl">🎉</div>
            <h2 className="text-xl font-bold text-gray-900">You're all set!</h2>
            <p className="text-gray-500 text-sm">
              Preferred Builders AI System is configured and ready.
              Platform: <strong>{config.platform.toUpperCase()}</strong>
            </p>
            <div className="text-left bg-gray-50 rounded p-4 space-y-2 text-sm">
              <p className="font-medium text-gray-700">Next steps:</p>
              <p>1. Add your API keys to the <code className="bg-gray-200 px-1 rounded">.env</code> file</p>
              <p>2. Upload past invoices to the Knowledge Base</p>
              <p>3. Have Jackson send a test estimate from Hearth</p>
              <p>4. Apply for WhatsApp Business API via Twilio</p>
            </div>
          </div>
        )}

      </div>

      {/* Navigation */}
      <div className="flex justify-between mt-6">
        <button onClick={() => setStep(s => s - 1)} disabled={step === 0}
          className="px-6 py-2 border border-gray-300 rounded text-gray-700 hover:bg-gray-50 disabled:opacity-30 text-sm">
          ← Back
        </button>
        {step < STEPS.length - 1 ? (
          <button onClick={() => setStep(s => s + 1)}
            className="px-6 py-2 bg-blue-900 text-white rounded hover:bg-blue-800 text-sm">
            Continue →
          </button>
        ) : (
          <button onClick={saveAndFinish} disabled={saving}
            className="px-6 py-2 bg-green-600 text-white rounded hover:bg-green-500 text-sm disabled:opacity-50">
            {saving ? 'Saving...' : 'Launch System ✅'}
          </button>
        )}
      </div>
    </div>
  );
}
