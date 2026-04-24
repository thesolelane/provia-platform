// modules/plumber/index.js — Plumbing Contractor trade module

module.exports = {
  id:                'plumber',
  tradeLabel:        'Plumbing Contractor',
  licenseTypeLabel:  'Licensed Plumbing Contractor',
  licensePrefix:     'MP',

  tradeContext: `licensed plumbing contractor performing residential and commercial plumbing work including fixture installation and replacement, supply and drain pipe repair and replacement, water heater installation, sump pump installation, drain cleaning, leak repair, gas line work, and Massachusetts Plumbing Code compliance. All work performed by or under the supervision of a licensed Master Plumber.`,

  rfqContext: `plumbing subcontractor for licensed plumbing rough and finish work`,

  contractClausesExtension: `All plumbing work shall comply with the Massachusetts State Plumbing Code (248 CMR) and applicable local amendments. A licensed Master Plumber shall supervise all work. Contractor shall obtain all required plumbing permits and schedule all inspections. Customer shall ensure water shut-off access and clear work area prior to start. Contractor is not responsible for pre-existing pipe corrosion, hidden damage, or code violations in existing plumbing uncovered during work.`,

  laborRates: {
    masterPlumber:  { low: 95,   high: 130,  unit: 'hour',  label: 'Master Plumber Labor' },
    journeyman:     { low: 65,   high: 90,   unit: 'hour',  label: 'Journeyman Plumber' },
    drainCleaning:  { low: 175,  high: 400,  unit: 'each',  label: 'Drain Cleaning (snake/hydro)' },
    toiletInstall:  { low: 200,  high: 350,  unit: 'each',  label: 'Toilet Install (labor only)' },
    faucetInstall:  { low: 150,  high: 275,  unit: 'each',  label: 'Faucet/Fixture Install (labor)' },
    waterHeaterGas: { low: 800,  high: 1600, unit: 'each',  label: 'Gas Water Heater Install' },
    waterHeaterElec:{ low: 700,  high: 1400, unit: 'each',  label: 'Electric Water Heater Install' },
    tankless:       { low: 1800, high: 3500, unit: 'each',  label: 'Tankless Water Heater Install' },
    sumpPump:       { low: 600,  high: 1200, unit: 'each',  label: 'Sump Pump Install' },
    pipingCopper:   { low: 35,   high: 65,   unit: 'lf',    label: 'Copper Supply Piping' },
    pipingPex:      { low: 20,   high: 40,   unit: 'lf',    label: 'PEX Supply Piping' },
    drainPipe:      { low: 25,   high: 50,   unit: 'lf',    label: 'Drain/Waste Piping' },
    showerInstall:  { low: 400,  high: 800,  unit: 'each',  label: 'Shower Valve & Trim (labor)' },
    tubInstall:     { low: 350,  high: 700,  unit: 'each',  label: 'Tub Install (labor only)' },
  },

  allowances: {
    fixtures: {
      toilet:      { amount: 280, unit: 'each', label: 'Toilet',              notes: 'Kohler Cimarron or Am Std Champion 1.28 GPF' },
      bathroomFaucet:{ amount: 180, unit: 'each', label: 'Bath Faucet',       notes: 'Moen Adler or Delta Foundations' },
      kitchenFaucet: { amount: 250, unit: 'each', label: 'Kitchen Faucet',    notes: 'Moen, Delta or Kohler — pull-down' },
      showerValve:   { amount: 350, unit: 'each', label: 'Shower Valve & Trim',notes: 'Moen Posi-Temp or Delta Monitor' },
      tub:           { amount: 850, unit: 'each', label: 'Bathtub',           notes: 'Alcove 60" — American Standard or Kohler' },
      waterHeaterGas:{ amount: 900, unit: 'each', label: 'Gas Water Heater',  notes: '40–50 gal — Rheem or AO Smith' },
      waterHeaterElec:{ amount: 700, unit: 'each', label: 'Electric Water Heater', notes: '40–50 gal — Rheem or AO Smith' },
    },
  },

  massCodes: null,

  markup: {
    subOandP:    0.10,
    gcOandP:     0.20,
    contingency: 0.08,
    deposit:     0.33,
  },
};
