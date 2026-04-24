// modules/electrician/index.js — Electrical Contractor trade module

module.exports = {
  id:                'electrician',
  tradeLabel:        'Electrical Contractor',
  licenseTypeLabel:  'Licensed Electrical Contractor',
  licensePrefix:     'LEC',

  tradeContext: `licensed electrical contractor performing residential and commercial electrical work including panel upgrades, service changes, rewiring, EV charger installation, outlet and switch work, lighting installation, ceiling fans, smoke/CO detector installation, and electrical code compliance. All work performed to NEC and local electrical code requirements.`,

  rfqContext: `electrical subcontractor for licensed electrical rough and finish work`,

  contractClausesExtension: `All electrical work shall comply with the National Electrical Code (NEC) and applicable Massachusetts Electrical Code. A licensed Master Electrician shall supervise all work. Contractor shall obtain all required electrical permits and schedule all inspections prior to cover-up. Customer shall ensure clear, safe access to electrical panels and work areas.`,

  laborRates: {
    masterElectrician: { low: 95,   high: 130,  unit: 'hour',  label: 'Master Electrician Labor' },
    journeyman:        { low: 65,   high: 90,   unit: 'hour',  label: 'Journeyman Electrician' },
    apprentice:        { low: 40,   high: 60,   unit: 'hour',  label: 'Apprentice Labor' },
    panelUpgrade100:   { low: 1500, high: 2500, unit: 'fixed', label: 'Panel Upgrade (100A)' },
    panelUpgrade200:   { low: 2200, high: 4000, unit: 'fixed', label: 'Panel Upgrade (200A)' },
    serviceChange:     { low: 1800, high: 3500, unit: 'fixed', label: 'Service Change/Upgrade' },
    evChargerLevel2:   { low: 800,  high: 1500, unit: 'each',  label: 'EV Charger (Level 2) Install' },
    outletAdd:         { low: 150,  high: 275,  unit: 'each',  label: 'Outlet/Switch (add circuit)' },
    lightFixture:      { low: 85,   high: 175,  unit: 'each',  label: 'Light Fixture Install' },
    recessedLight:     { low: 125,  high: 225,  unit: 'each',  label: 'Recessed Light (new)' },
    ceilingFan:        { low: 150,  high: 300,  unit: 'each',  label: 'Ceiling Fan Install' },
    smokeCoDetector:   { low: 85,   high: 150,  unit: 'each',  label: 'Smoke/CO Detector' },
    gfciCircuit:       { low: 200,  high: 350,  unit: 'each',  label: 'GFCI Circuit (bath/kitchen)' },
    dedicatedCircuit:  { low: 300,  high: 600,  unit: 'each',  label: 'Dedicated Circuit (appliance)' },
  },

  allowances: {
    fixtures: {
      lightFixture: { amount: 125, unit: 'each', label: 'Light Fixture (supply)', notes: 'Contractor-supplied — mid-grade' },
      ceilingFan:   { amount: 200, unit: 'each', label: 'Ceiling Fan (supply)',   notes: 'Hunter or Hampton Bay — with light kit' },
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
