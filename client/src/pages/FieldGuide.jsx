// client/src/pages/FieldGuide.jsx
// Help Guide — bilingual estimate checklist — no auth required
// Can be bookmarked on his phone

import { useState } from 'react';

const BLUE = '#1B3A6B';
const ORANGE = '#E07B2A';
const GREEN = '#2E7D32';
const RED = '#C62828';

const sections = [
  {
    title: 'Before You Start / Antes de Começar',
    icon: '📋',
    items: [
      { en: 'Customer full name', pt: 'Nome completo do cliente', required: true },
      { en: 'Customer email address', pt: 'Email do cliente', required: true },
      { en: 'Customer phone number', pt: 'Telefone do cliente', required: true },
      { en: 'Full project address (street, city, zip)', pt: 'Endereço completo da obra (rua, cidade, CEP)', required: true },
      { en: 'Is this a new build or renovation?', pt: 'É construção nova ou reforma?', required: true },
      { en: 'Total square footage', pt: 'Metragem total', required: true },
      { en: 'Number of stories / floors', pt: 'Número de andares', required: true },
    ]
  },
  {
    title: 'Site & Foundation / Terreno e Fundação',
    icon: '🏗️',
    items: [
      { en: 'Is there an existing structure?', pt: 'Já existe alguma estrutura no local?', required: false },
      { en: 'Foundation type: slab, crawlspace, basement?', pt: 'Tipo de fundação: laje, subsolo, porão?', required: true },
      { en: 'Will customer do sitework themselves?', pt: 'O cliente vai fazer a terraplanagem?', required: true },
      { en: 'Is there well and septic needed?', pt: 'Precisa de poço e fossa?', required: true },
      { en: 'Electrical: underground or overhead?', pt: 'Elétrica: subterrânea ou aérea?', required: true },
    ]
  },
  {
    title: 'Framing / Estrutura',
    icon: '🔨',
    items: [
      { en: 'Exterior wall framing: 2x4 or 2x6?', pt: 'Paredes externas: 2x4 ou 2x6?', required: true },
      { en: 'Floor system: TJI, lumber, or LVL?', pt: 'Sistema de piso: TJI, madeira ou LVL?', required: true },
      { en: 'Roof framing: trusses or stick frame (rafters)?', pt: 'Estrutura do telhado: treliças ou ripas?', required: true },
      { en: 'Roof pitch (e.g. 3:12, 4:12, 6:12)', pt: 'Inclinação do telhado (ex: 3:12, 4:12, 6:12)', required: true },
      { en: 'Cathedral / vaulted ceilings anywhere?', pt: 'Teto catedral em algum cômodo?', required: true },
      { en: 'Deck: yes/no — if yes, what size?', pt: 'Deck: sim/não — se sim, qual tamanho?', required: false },
      { en: 'Fireplace: yes/no', pt: 'Lareira: sim/não', required: false },
      { en: 'Total garage bays (1, 2, or 3)?', pt: 'Quantas vagas na garagem (1, 2 ou 3)?', required: false },
    ]
  },
  {
    title: 'Roof & Siding / Telhado e Revestimento',
    icon: '🏠',
    items: [
      { en: 'Roofing material: metal standing seam, metal corrugated, or architectural shingles?', pt: 'Material do telhado: metal seam, metal corrugado ou telha asfáltica?', required: true },
      { en: 'Siding: board & batten, vinyl, or other?', pt: 'Revestimento: board & batten, vinyl ou outro?', required: true },
      { en: 'Number and size of windows (e.g. 12 windows, 3040 size)', pt: 'Número e tamanho das janelas (ex: 12 janelas, tamanho 3040)', required: true },
      { en: 'Number of exterior doors', pt: 'Número de portas externas', required: true },
      { en: 'Garage door size and quantity', pt: 'Tamanho e quantidade de portas de garagem', required: false },
    ]
  },
  {
    title: 'Mechanical / Elétrica e Hidráulica',
    icon: '⚡',
    items: [
      { en: 'HVAC type: mini splits, forced air, or other?', pt: 'HVAC: mini splits, ar forçado ou outro?', required: true },
      { en: 'Number of mini split heads needed', pt: 'Quantas cabeças de mini split?', required: false },
      { en: 'Number of full bathrooms', pt: 'Número de banheiros completos', required: true },
      { en: 'Number of half baths', pt: 'Número de lavabos', required: true },
      { en: 'Kitchen: yes/no', pt: 'Cozinha: sim/não', required: true },
      { en: 'Laundry hookup needed?', pt: 'Precisa de ponto de lavanderia?', required: false },
      { en: 'Water heater type: tank or tankless?', pt: 'Aquecedor de água: reservatório ou instantâneo?', required: false },
    ]
  },
  {
    title: 'Insulation & Drywall / Isolamento e Drywall',
    icon: '🧱',
    items: [
      { en: 'Insulation type: fiberglass batt or spray foam?', pt: 'Isolamento: lã de vidro ou spray foam?', required: true },
      { en: 'Is garage being drywalled? (not required for CO)', pt: 'A garagem vai ter drywall? (não obrigatório para CO)', required: true },
      { en: 'Blueboard & plaster or drywall & tape?', pt: 'Blueboard e gesso ou drywall e fita?', required: true },
    ]
  },
  {
    title: 'Finishes / Acabamentos',
    icon: '✨',
    items: [
      { en: 'Flooring type: LVP, hardwood, carpet, tile?', pt: 'Piso: LVP, madeira, carpete, azulejo?', required: true },
      { en: 'Kitchen cabinet style preference', pt: 'Estilo de armários de cozinha', required: false },
      { en: 'Countertop: quartz, laminate, or other?', pt: 'Bancada: quartzo, laminado ou outro?', required: false },
      { en: 'Paint: customer doing themselves?', pt: 'Pintura: o cliente vai fazer sozinho?', required: true },
      { en: 'Customer selecting own appliances?', pt: 'O cliente escolhe os próprios eletrodomésticos?', required: true },
    ]
  },
  {
    title: '⚠️ Common Mistakes / Erros Comuns',
    icon: '❌',
    items: [
      { en: 'ALWAYS note the roof pitch — missing roof pitch causes delays', pt: 'SEMPRE anote a inclinação do telhado — falta da inclinação causa atrasos', required: true, warning: true },
      { en: 'ALWAYS confirm if town is a Stretch Code town (Ashby, Fitchburg, etc.)', pt: 'SEMPRE confirme se a cidade é Stretch Code (Ashby, Fitchburg, etc.)', required: true, warning: true },
      { en: 'ALWAYS note framing type (2x6 required in Stretch Code towns)', pt: 'SEMPRE anote o tipo de estrutura (2x6 obrigatório em cidades Stretch Code)', required: true, warning: true },
      { en: 'NEVER include well, septic, underground electric, or appliances unless customer explicitly requests', pt: 'NUNCA inclua poço, fossa, elétrica subterrânea ou eletrodomésticos sem o cliente pedir explicitamente', required: true, warning: true },
      { en: 'ALWAYS note square footage per floor separately', pt: 'SEMPRE anote a metragem por andar separadamente', required: true, warning: true },
    ]
  }
];

export default function FieldGuide() {
  const [checked, setChecked] = useState({});
  const [lang, setLang] = useState('both');

  const toggle = (key) => setChecked(prev => ({ ...prev, [key]: !prev[key] }));

  const totalItems = sections.flatMap(s => s.items).filter(i => i.required).length;
  const checkedCount = Object.values(checked).filter(Boolean).length;
  const progress = Math.round((checkedCount / totalItems) * 100);

  return (
    <div style={{ minHeight: '100vh', background: '#f4f6fb', fontFamily: 'Arial, sans-serif' }}>
      {/* Header */}
      <div style={{ background: BLUE, color: 'white', padding: '20px 20px 16px' }}>
        <div style={{ fontSize: 18, fontWeight: 'bold' }}>📋 Estimate Checklist</div>
        <div style={{ fontSize: 13, opacity: 0.8, marginTop: 2 }}>Guia de Estimativas — Preferred Builders</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          {['both', 'en', 'pt'].map(l => (
            <button key={l} onClick={() => setLang(l)}
              style={{ padding: '4px 12px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 'bold',
                background: lang === l ? ORANGE : 'rgba(255,255,255,0.2)', color: 'white' }}>
              {l === 'both' ? '🇺🇸🇧🇷' : l === 'en' ? '🇺🇸 EN' : '🇧🇷 PT'}
            </button>
          ))}
        </div>
      </div>

      {/* Progress */}
      <div style={{ background: 'white', padding: '12px 20px', borderBottom: '1px solid #eee' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12 }}>
          <span style={{ color: '#555' }}>{checkedCount} of {totalItems} required items checked</span>
          <span style={{ fontWeight: 'bold', color: progress === 100 ? GREEN : BLUE }}>{progress}%</span>
        </div>
        <div style={{ background: '#eee', borderRadius: 10, height: 8 }}>
          <div style={{ background: progress === 100 ? GREEN : BLUE, height: 8, borderRadius: 10, width: `${progress}%`, transition: 'width 0.3s' }} />
        </div>
        {progress === 100 && (
          <div style={{ color: GREEN, fontSize: 12, fontWeight: 'bold', marginTop: 6 }}>✅ Ready to submit estimate!</div>
        )}
      </div>

      {/* Sections */}
      <div style={{ padding: 16 }}>
        {sections.map(section => (
          <div key={section.title} style={{ background: 'white', borderRadius: 10, marginBottom: 12, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
            <div style={{ background: BLUE, color: 'white', padding: '10px 16px', fontWeight: 'bold', fontSize: 13 }}>
              {section.icon} {lang === 'pt' ? section.title.split('/')[1]?.trim() || section.title : section.title}
            </div>
            <div style={{ padding: '8px 0' }}>
              {section.items.map((item, i) => {
                const key = `${section.title}-${i}`;
                const isChecked = checked[key];
                return (
                  <div key={key}
                    onClick={() => toggle(key)}
                    style={{
                      display: 'flex', alignItems: 'flex-start', gap: 12,
                      padding: '10px 16px', cursor: 'pointer',
                      background: isChecked ? '#f0fff4' : item.warning ? '#fff8f0' : 'white',
                      borderLeft: item.warning ? `3px solid ${ORANGE}` : '3px solid transparent',
                      borderBottom: '1px solid #f5f5f5'
                    }}>
                    <div style={{
                      width: 20, height: 20, borderRadius: 4, flexShrink: 0, marginTop: 1,
                      border: `2px solid ${isChecked ? GREEN : '#ccc'}`,
                      background: isChecked ? GREEN : 'white',
                      display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                      {isChecked && <span style={{ color: 'white', fontSize: 12, fontWeight: 'bold' }}>✓</span>}
                    </div>
                    <div style={{ flex: 1 }}>
                      {(lang === 'both' || lang === 'en') && (
                        <div style={{ fontSize: 13, color: item.warning ? RED : '#222', fontWeight: item.warning ? 'bold' : 'normal' }}>
                          {item.required && <span style={{ color: RED, fontSize: 10, marginRight: 4 }}>*</span>}
                          {item.en}
                        </div>
                      )}
                      {(lang === 'both' || lang === 'pt') && (
                        <div style={{ fontSize: 12, color: '#666', marginTop: lang === 'both' ? 2 : 0 }}>
                          {item.pt}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {/* Reset button */}
        <button
          onClick={() => setChecked({})}
          style={{ width: '100%', padding: 14, background: 'white', border: `2px solid ${BLUE}`, borderRadius: 10, color: BLUE, fontWeight: 'bold', cursor: 'pointer', marginBottom: 32 }}
        >
          🔄 Reset Checklist / Reiniciar
        </button>
      </div>
    </div>
  );
}
