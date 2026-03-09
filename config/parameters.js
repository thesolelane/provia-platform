// ============================================
// config/parameters.js
// PREFERRED BUILDERS — DEFAULT PRICING CONFIG
// These are overridden by Admin Panel settings
// stored in the database
// ============================================

module.exports = {

  company: {
    name: "Preferred Builders General Services Inc.",
    license: "HIC-197400",
    address: "37 Duck Mill Road, Fitchburg, MA 01420",
    phone: "978-377-1784",
    email: "jackson.deaquino@preferredbuildersusa.com",
    botEmail: "estimates@preferredbuildersusa.com",
    website: "preferredbuildersusa.com"
  },

  team: {
    owner: {
      name: "Owner",
      email: process.env.OWNER_EMAIL || "owner@preferredbuildersusa.com",
      whatsapp: process.env.OWNER_WHATSAPP
    },
    jackson: {
      name: "Jackson Deaquino",
      email: "jackson.deaquino@preferredbuildersusa.com",
      whatsapp: process.env.JACKSON_WHATSAPP,
      preferredLanguage: "pt-BR"
    }
  },

  approvedSenders: [
    "jackson.deaquino@preferredbuildersusa.com",
    "owner@preferredbuildersusa.com"
  ],

  markup: {
    subOandP: 0.15,        // 15% sub overhead & profit on base cost
    gcOandP: 0.25,         // 25% GC overhead & profit on (base + sub O&P)
    contingency: 0.10,     // 10% contingency on subtotal
    deposit: 0.33          // 33% deposit on contract total
  },

  laborRates: {
    framing:    { low: 12,  high: 16,  unit: "sqft",  label: "Framing" },
    roofing:    { low: 10,  high: 15,  unit: "sqft",  label: "Roofing" },
    siding:     { low: 8,   high: 12,  unit: "sqft",  label: "Siding" },
    electrical: { low: 85,  high: 110, unit: "hour",  label: "Electrical" },
    plumbing:   { low: 90,  high: 115, unit: "hour",  label: "Plumbing" },
    hvac:       { low: 85,  high: 105, unit: "hour",  label: "HVAC" },
    drywall:    { low: 3,   high: 5,   unit: "sqft",  label: "Drywall" },
    insulation: { low: 2,   high: 4,   unit: "sqft",  label: "Insulation" },
    painting:   { low: 2,   high: 3.5, unit: "sqft",  label: "Painting" },
    tile:       { low: 12,  high: 18,  unit: "sqft",  label: "Tile Work" },
    flooring:   { low: 5,   high: 8,   unit: "sqft",  label: "Flooring Install" },
    excavation: { low: 95,  high: 130, unit: "hour",  label: "Excavation" },
    concrete:   { low: 8,   high: 14,  unit: "sqft",  label: "Concrete" },
    carpentry:  { low: 65,  high: 95,  unit: "hour",  label: "Finish Carpentry" }
  },

  allowances: {
    flooring: {
      lvp:                { amount: 6.50,  unit: "sqft",  label: "LVP Flooring",           notes: "Supply only — Shaw, Armstrong or equiv" },
      engineeredHardwood: { amount: 8.00,  unit: "sqft",  label: "Engineered Hardwood",    notes: "Supply only — oak or cost-effective equiv" },
      carpetBedroom:      { amount: 3.50,  unit: "sqft",  label: "Carpet",                 notes: "Supply only — contractor grade" },
      tileBath:           { amount: 4.50,  unit: "sqft",  label: "Bath Floor Tile",        notes: "12x12 ceramic or porcelain, supply only" },
      tileShower:         { amount: 5.50,  unit: "sqft",  label: "Shower Wall Tile",       notes: "Ceramic or porcelain, supply only" }
    },
    kitchen: {
      cabinets:           { amount: 12000, unit: "fixed", label: "Kitchen Cabinets",       notes: "Stock/semi-stock — Kraftmaid, Yorktowne or equiv" },
      countertopQuartz:   { amount: 4250,  unit: "fixed", label: "Quartz Countertop",      notes: "Up to 30 LF incl backsplash — Cambria, MSI or equiv" },
      countertopLaminate: { amount: 1800,  unit: "fixed", label: "Laminate Countertop",    notes: "Budget option — Wilsonart or equiv" },
      faucet:             { amount: 250,   unit: "each",  label: "Kitchen Faucet",         notes: "Moen, Delta or Kohler — pull-down single handle" },
      sink:               { amount: 350,   unit: "each",  label: "Kitchen Sink",           notes: "Stainless undermount 60/40 double bowl" },
      disposal:           { amount: 150,   unit: "each",  label: "Garbage Disposal",       notes: "InSinkErator 1/2 HP contractor grade" }
    },
    bathroom: {
      vanity:             { amount: 650,   unit: "each",  label: "Vanity Cabinet",         notes: "48\"-60\" stock — Kraftmaid, RSI or equiv" },
      vanitySmall:        { amount: 350,   unit: "each",  label: "Vanity Cabinet (small)", notes: "24\"-30\" stock — RSI or equiv" },
      vanityTop:          { amount: 350,   unit: "each",  label: "Vanity Top/Sink",        notes: "Cultured marble integrated" },
      faucet:             { amount: 180,   unit: "each",  label: "Bath Faucet",            notes: "Moen Adler or Delta Foundations" },
      toilet:             { amount: 280,   unit: "each",  label: "Toilet",                 notes: "Kohler Cimarron or Am Std Champion 1.28 GPF" },
      tub:                { amount: 850,   unit: "each",  label: "Bathtub",                notes: "Alcove 60\" — American Standard or Kohler" },
      showerValve:        { amount: 350,   unit: "each",  label: "Shower Valve & Trim",    notes: "Moen Posi-Temp or Delta Monitor" },
      showerDoor:         { amount: 250,   unit: "each",  label: "Shower Door",            notes: "Frameless bypass or curtain rod" },
      accessories:        { amount: 150,   unit: "set",   label: "Bath Accessories",       notes: "TP holder, towel bar, robe hook — matching set" },
      exhaustFan:         { amount: 85,    unit: "each",  label: "Exhaust Fan",            notes: "Broan or Panasonic 80 CFM min (Stretch Code)" },
      mirrorMedicine:     { amount: 175,   unit: "each",  label: "Mirror/Medicine Cabinet",notes: "Contractor grade — recessed or surface mount" }
    },
    doors: {
      interiorDoor:       { amount: 180,   unit: "each",  label: "Interior Door",          notes: "Hollow/solid core — 6-panel primed — Masonite or equiv" },
      passageSet:         { amount: 45,    unit: "each",  label: "Passage Set (doorknob)", notes: "Kwikset or Schlage — satin nickel" },
      privacySet:         { amount: 55,    unit: "each",  label: "Privacy Set (bath/bed)", notes: "Kwikset or Schlage lockset" },
      dummySet:           { amount: 35,    unit: "each",  label: "Dummy Set",              notes: "Non-locking pull" },
      bifoldDoor:         { amount: 175,   unit: "each",  label: "Bifold Door",            notes: "6-panel primed white" },
      bifoldHardware:     { amount: 35,    unit: "set",   label: "Bifold Hardware",        notes: "Standard track & hardware set" }
    },
    trim: {
      baseMolding:        { amount: 1.85,  unit: "lf",    label: "Base Molding",           notes: "3-1/4\" colonial or craftsman primed MDF" },
      doorCasing:         { amount: 1.65,  unit: "lf",    label: "Door/Window Casing",     notes: "2-1/4\" colonial or craftsman primed MDF" },
      windowStool:        { amount: 85,    unit: "each",  label: "Window Stool & Apron",   notes: "Primed MDF" },
      crownMolding:       { amount: 3.50,  unit: "lf",    label: "Crown Molding",          notes: "If specified — primed MDF" },
      stairTread:         { amount: 45,    unit: "each",  label: "Stair Tread",            notes: "Oak — satin finish" }
    }
  },

  massCodes: {
    stretchCodeTowns: [
      "Ashby", "Fitchburg", "Leominster", "Gardner", "Westminster",
      "Winchendon", "Athol", "Orange", "Templeton", "Phillipston",
      "Royalston", "Petersham", "Barre", "Hubbardston", "Princeton",
      "Sterling", "Bolton", "Lancaster", "Harvard", "Shirley",
      "Lunenburg", "Townsend", "Pepperell", "Groton", "Ayer"
    ],
    hersTargetAllElectric: 45,
    hersTargetMixedFuel: 42,
    hersLowCarbonCredit: 3,
    minWallInsulation: "R-20",
    minRoofInsulation: "R-49",
    minFloorInsulation: "R-30",
    wallFraming: "2x6",
    ervRequired: true,
    hersRaterRequired: true,
    evReadyRequired: true,
    solarReadyRequired: true,
    climateZone: "5A"
  },

  botBehavior: {
    maxClarificationRounds: 3,
    autoApplyStretchCode: true,
    flagVariancePercent: 15,
    requireReviewBeforeCustomer: true,
    defaultRatePoint: "mid",
    alwaysIncludeExhibitA: true,
    ccOwnerOnAll: true,
    proposalFirst: true,
    maxProcessingMinutes: 5
  }
};
