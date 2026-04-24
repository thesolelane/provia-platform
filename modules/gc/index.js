// modules/gc/index.js — General Contractor trade module

module.exports = {
  id:                'gc',
  tradeLabel:        'General Contractor',
  licenseTypeLabel:  'Home Improvement Contractor',
  licensePrefix:     'HIC',

  // Injected into AI system prompts after company identity
  tradeContext: `licensed general contractor performing residential and commercial renovation, new construction, additions, and remodeling. Trades include framing, roofing, siding, electrical, plumbing, HVAC, drywall, insulation, painting, tile, flooring, excavation, concrete, and finish carpentry.`,

  // Injected into RFQ scope-writer prompt
  rfqContext: `general contractor managing trade subcontractors`,

  // Injected at end of contract before signature block (null = no addition)
  contractClausesExtension: null,

  // Labor rates used by the estimator
  laborRates: {
    framing:    { low: 12,  high: 16,  unit: 'sqft', label: 'Framing' },
    roofing:    { low: 10,  high: 15,  unit: 'sqft', label: 'Roofing' },
    siding:     { low: 8,   high: 12,  unit: 'sqft', label: 'Siding' },
    electrical: { low: 85,  high: 110, unit: 'hour', label: 'Electrical' },
    plumbing:   { low: 90,  high: 115, unit: 'hour', label: 'Plumbing' },
    hvac:       { low: 85,  high: 105, unit: 'hour', label: 'HVAC' },
    drywall:    { low: 3,   high: 5,   unit: 'sqft', label: 'Drywall' },
    insulation: { low: 2,   high: 4,   unit: 'sqft', label: 'Insulation' },
    painting:   { low: 2,   high: 3.5, unit: 'sqft', label: 'Painting' },
    tile:       { low: 12,  high: 18,  unit: 'sqft', label: 'Tile Work' },
    flooring:   { low: 5,   high: 8,   unit: 'sqft', label: 'Flooring Install' },
    excavation: { low: 95,  high: 130, unit: 'hour', label: 'Excavation' },
    concrete:   { low: 8,   high: 14,  unit: 'sqft', label: 'Concrete' },
    carpentry:  { low: 65,  high: 95,  unit: 'hour', label: 'Finish Carpentry' },
  },

  // Material allowances used in proposals
  allowances: {
    flooring: {
      lvp:                { amount: 6.50,  unit: 'sqft',  label: 'LVP Flooring',            notes: 'Supply only — Shaw, Armstrong or equiv' },
      engineeredHardwood: { amount: 8.00,  unit: 'sqft',  label: 'Engineered Hardwood',     notes: 'Supply only — oak or cost-effective equiv' },
      carpetBedroom:      { amount: 3.50,  unit: 'sqft',  label: 'Carpet',                  notes: 'Supply only — contractor grade' },
      tileBath:           { amount: 4.50,  unit: 'sqft',  label: 'Bath Floor Tile',         notes: '12x12 ceramic or porcelain, supply only' },
      tileShower:         { amount: 5.50,  unit: 'sqft',  label: 'Shower Wall Tile',        notes: 'Ceramic or porcelain, supply only' },
    },
    kitchen: {
      cabinets:           { amount: 12000, unit: 'fixed', label: 'Kitchen Cabinets',        notes: 'Stock/semi-stock — Kraftmaid, Yorktowne or equiv' },
      countertopQuartz:   { amount: 4250,  unit: 'fixed', label: 'Quartz Countertop',       notes: 'Up to 30 LF incl backsplash — Cambria, MSI or equiv' },
      countertopLaminate: { amount: 1800,  unit: 'fixed', label: 'Laminate Countertop',     notes: 'Budget option — Wilsonart or equiv' },
      faucet:             { amount: 250,   unit: 'each',  label: 'Kitchen Faucet',          notes: 'Moen, Delta or Kohler — pull-down single handle' },
      sink:               { amount: 350,   unit: 'each',  label: 'Kitchen Sink',            notes: 'Stainless undermount 60/40 double bowl' },
      disposal:           { amount: 150,   unit: 'each',  label: 'Garbage Disposal',        notes: 'InSinkErator 1/2 HP contractor grade' },
    },
    bathroom: {
      vanity:             { amount: 650,   unit: 'each',  label: 'Vanity Cabinet',          notes: '48"-60" stock — Kraftmaid, RSI or equiv' },
      vanitySmall:        { amount: 350,   unit: 'each',  label: 'Vanity Cabinet (small)',  notes: '24"-30" stock — RSI or equiv' },
      vanityTop:          { amount: 350,   unit: 'each',  label: 'Vanity Top/Sink',         notes: 'Cultured marble integrated' },
      faucet:             { amount: 180,   unit: 'each',  label: 'Bath Faucet',             notes: 'Moen Adler or Delta Foundations' },
      toilet:             { amount: 280,   unit: 'each',  label: 'Toilet',                  notes: 'Kohler Cimarron or Am Std Champion 1.28 GPF' },
      tub:                { amount: 850,   unit: 'each',  label: 'Bathtub',                 notes: 'Alcove 60" — American Standard or Kohler' },
      showerValve:        { amount: 350,   unit: 'each',  label: 'Shower Valve & Trim',     notes: 'Moen Posi-Temp or Delta Monitor' },
      showerDoor:         { amount: 250,   unit: 'each',  label: 'Shower Door',             notes: 'Frameless bypass or curtain rod' },
      accessories:        { amount: 150,   unit: 'set',   label: 'Bath Accessories',        notes: 'TP holder, towel bar, robe hook — matching set' },
      exhaustFan:         { amount: 85,    unit: 'each',  label: 'Exhaust Fan',             notes: 'Broan or Panasonic 80 CFM min (Stretch Code)' },
      mirrorMedicine:     { amount: 175,   unit: 'each',  label: 'Mirror/Medicine Cabinet', notes: 'Contractor grade — recessed or surface mount' },
    },
    doors: {
      interiorDoor:       { amount: 180,   unit: 'each',  label: 'Interior Door',           notes: 'Hollow/solid core — 6-panel primed — Masonite or equiv' },
      passageSet:         { amount: 45,    unit: 'each',  label: 'Passage Set (doorknob)',  notes: 'Kwikset or Schlage — satin nickel' },
      privacySet:         { amount: 55,    unit: 'each',  label: 'Privacy Set (bath/bed)',  notes: 'Kwikset or Schlage lockset' },
      dummySet:           { amount: 35,    unit: 'each',  label: 'Dummy Set',               notes: 'Non-locking pull' },
      bifoldDoor:         { amount: 175,   unit: 'each',  label: 'Bifold Door',             notes: '6-panel primed white' },
      bifoldHardware:     { amount: 35,    unit: 'set',   label: 'Bifold Hardware',         notes: 'Standard track & hardware set' },
    },
    trim: {
      baseMolding:        { amount: 1.85,  unit: 'lf',    label: 'Base Molding',            notes: '3-1/4" colonial or craftsman primed MDF' },
      doorCasing:         { amount: 1.65,  unit: 'lf',    label: 'Door/Window Casing',      notes: '2-1/4" colonial or craftsman primed MDF' },
      windowStool:        { amount: 85,    unit: 'each',  label: 'Window Stool & Apron',    notes: 'Primed MDF' },
      crownMolding:       { amount: 3.50,  unit: 'lf',    label: 'Crown Molding',           notes: 'If specified — primed MDF' },
      stairTread:         { amount: 45,    unit: 'each',  label: 'Stair Tread',             notes: 'Oak — satin finish' },
    },
  },

  // MA Stretch Code compliance (GC-specific — null for other trades)
  massCodes: {
    stretchCodeTowns: [
      'Ashby', 'Fitchburg', 'Leominster', 'Gardner', 'Westminster',
      'Winchendon', 'Athol', 'Orange', 'Templeton', 'Phillipston',
      'Royalston', 'Petersham', 'Barre', 'Hubbardston', 'Princeton',
      'Sterling', 'Bolton', 'Lancaster', 'Harvard', 'Shirley',
      'Lunenburg', 'Townsend', 'Pepperell', 'Groton', 'Ayer',
    ],
    hersTargetAllElectric:  45,
    hersTargetMixedFuel:    42,
    hersLowCarbonCredit:    3,
    minWallInsulation:      'R-20',
    minRoofInsulation:      'R-49',
    minFloorInsulation:     'R-30',
    wallFraming:            '2x6',
    ervRequired:            true,
    hersRaterRequired:      true,
    evReadyRequired:        true,
    solarReadyRequired:     true,
    climateZone:            '5A',
  },

  // Standard markup structure
  markup: {
    subOandP:    0.15,
    gcOandP:     0.25,
    contingency: 0.10,
    deposit:     0.33,
  },
};
