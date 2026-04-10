import { useState, useEffect } from 'react';

const STEPS = ['Building', 'Spacing & HVAC', 'Rooms', 'Openings', 'Prices', 'Results'];

const DEFAULT_PRICES = {
  concrete: 165.0,
  floorJoists: 9.0,
  rimBoard: 0.9,
  subfloor: 32.0,
  studs: 8.5,
  plates: 0.9,
  headers: 12.0,
  trusses: 28.0,
  wallSheathing: 22.0,
  roofSheathing: 22.0,
  roofingSquares: 110.0,
  underlayment: 35.0,
  insulation: 45.0,
  sprayFoamWall: 3.5,
  sprayFoamRoof: 5.0,
  drywall: 16.0,
  blueBoard: 18.0,
  jointCompound: 18.0,
  skimCoat: 22.0,
  primer: 28.0,
  paint: 35.0,
  ceilingPaint: 28.0,
  hardwood: 6.5,
  vinylPlank: 3.2,
  carpetSY: 28.0,
  tile: 3.5,
  // (legacy 'flooring' key removed — use vinylPlank/carpetSY/hardwood/tile)
  typeXDrywall: 20.0,
  greenBoard: 19.0,
  hwBaseboard: 25.0,
  expansionTank: 150.0,
  circulatorPump: 350.0,
  cabinetLinFt: 150.0,
  baseboard: 1.2,
  doorCasing: 1.2,
  windowCasing: 1.2,
  passageSet: 45.0,
  privacySet: 55.0,
  keyedSet: 110.0,
  garageDoor: 1200.0,
  garageDoorOpener: 380.0,
  outlet: 3.5,
  gfiOutlet: 18.0,
  lightSwitch: 3.0,
  lightFixture: 45.0,
  recessedLight: 28.0,
  hvacFurnace: 2800.0,
  hvacCondenser: 3200.0,
  hvacDuctRun: 45.0,
  hvacVent: 12.0,
  hvacReturn: 18.0,
  hvacThermostat: 85.0,
  miniSplitHead: 950.0,
  miniSplitOutdoor: 2400.0,
  baseboardHeater: 85.0,
  radiantTubing: 1.5,
  boiler: 4500.0,
};

const ROOM_TYPES = [
  'Living Room',
  'Bedroom',
  'Bathroom',
  'Kitchen',
  'Dining Room',
  'Office',
  'Hallway',
  'Garage',
  'Other',
];

function calcSlope(pitch) {
  return Math.sqrt(1 + Math.pow(pitch / 12, 2));
}

function parseFtIn(val) {
  // Accepts decimal feet (19.25) or "19'3\"" style — returns decimal feet
  if (typeof val === 'string' && val.includes("'")) {
    const parts = val.split("'");
    const ft = parseFloat(parts[0]) || 0;
    const inches = parseFloat(parts[1]) || 0;
    return ft + inches / 12;
  }
  return parseFloat(val) || 0;
}

function getJoistSize(span) {
  if (span <= 12) return '2×8';
  if (span <= 16) return '2×10';
  if (span <= 20) return '2×12';
  return 'LVL / Engineered';
}

function runCalcs(
  building,
  studSpacing,
  trussSpacing,
  rooms,
  prices,
  heatingType,
  insulationType,
  studSize,
  wallFinishType,
  joistType,
) {
  const { length, width, floors, wallHeight, pitch, overhang, slabThickness, hasSlab } = building;
  const L = parseFtIn(length);
  const W = parseFtIn(width);
  const FL = parseInt(floors) || 1;
  const WH = parseFloat(wallHeight) || 9;
  const P = parseFloat(pitch) || 4;
  const OH = parseFloat(overhang) || 2;
  const slabIn = parseFloat(slabThickness) || 4;
  const includeSlab = hasSlab !== false;
  const studOC = studSpacing === '16' ? 16 : 24;
  const trussOC = trussSpacing === '16' ? 16 : 24;
  const sSize = studSize || '2x6';
  const jType = joistType || 'auto';
  const JOIST_LABELS = {
    auto: getJoistSize(W),
    '2x8': '2×8',
    '2x10': '2×10',
    '2x12': '2×12',
    tji_95: 'TJI® 9½"',
    tji_118: 'TJI® 11⅞"',
    tji_14: 'TJI® 14"',
    tji_16: 'TJI® 16"',
  };
  const joistSize = JOIST_LABELS[jType] || getJoistSize(W);
  const isTJI = jType.startsWith('tji');
  const wallHft = Math.ceil(WH) + 1;
  const studLabel = `${sSize} × ${wallHft}' Stud`;
  const plateLabel = `${sSize} Plate`;
  const joistLabel = isTJI
    ? `${joistSize} TJI® Joist × ${Math.ceil(W + 2)}' (engineered)`
    : `${joistSize} Floor Joist × ${Math.ceil(W + 2)}'`;
  const rimLabel = isTJI ? `${joistSize} TJI® Rim / Blocking` : `${joistSize} Rim Board`;

  const perimeterExt = 2 * (L + W);

  const extWallArea = perimeterExt * WH * FL;
  const slopeMultiplier = calcSlope(P);
  const roofArea = (L + 2 * OH) * (W + 2 * OH) * slopeMultiplier;

  const studCount = Math.ceil(perimeterExt / (studOC / 12) + perimeterExt / 8) * FL;
  const plateLinFt = perimeterExt * FL * 3;
  const roofTrusses = Math.ceil(L / (trussOC / 12) + 1);
  const floorJoistCount = Math.ceil(L / (studOC / 12) + 1) * FL;
  const rimBoardLinFt = perimeterExt * FL;

  const wallSheathingSheets = Math.ceil(extWallArea / 32);
  const roofSheathingSheets = Math.ceil(roofArea / 32);
  const subfloorSheets = Math.ceil((L * W * FL) / 32);

  const insulationRolls = Math.ceil(extWallArea / 40);
  const sprayFoamWallSF = Math.ceil(extWallArea);
  const sprayFoamRoofSF = Math.ceil(roofArea);
  const concreteCY = includeSlab ? Math.ceil(((L * W * (slabIn / 12)) / 27) * 1.1) : 0;

  let intWallArea = 0;
  let bathroomArea = 0;
  let totalFloorArea = 0;
  let totalDoors = 0;
  let garageDoorCount = 0;
  let totalWindows = 0;
  let doorCasingLF = 0;
  let windowCasingLF = 0;
  let headerCount = 0;
  let cabinetLF = 0;
  let totalOutlets = 0;
  let totalGFI = 0;
  let totalSwitches = 0;
  let totalLightFixtures = 0;
  let totalRecessedLights = 0;
  let fullBathCount = 0;
  let halfBathCount = 0;
  let kitchenCount = 0;
  let passageDoors = 0;
  let privacyDoors = 0;
  let keyedDoors = 0;
  let vinylPlankSF = 0;
  let carpetSF = 0;
  let hardwoodSF = 0;
  let tileSF = 0;

  for (const room of rooms) {
    const rL = parseFloat(room.length) || 0;
    const rW = parseFloat(room.width) || 0;
    const rArea = rL * rW;
    const rPerim = 2 * (rL + rW);
    totalFloorArea += rArea;
    intWallArea += rPerim * WH;

    if (room.type === 'Bathroom') {
      if (room.isFullBath !== false) {
        bathroomArea += rArea;
        fullBathCount++;
      } else halfBathCount++;
    }
    if (room.type === 'Kitchen') {
      cabinetLF += parseFloat(room.cabinetLength) || 0;
      kitchenCount++;
    }

    // Flooring by type
    const defaultFT =
      room.type === 'Bathroom'
        ? 'tile'
        : room.type === 'Bedroom'
          ? 'carpet'
          : room.type === 'Garage'
            ? 'concrete'
            : 'vinyl_plank';
    const ft = room.flooringType || defaultFT;
    if (ft === 'tile') tileSF += rArea;
    else if (ft === 'carpet') carpetSF += rArea;
    else if (ft === 'vinyl_plank') vinylPlankSF += rArea;
    else if (ft === 'hardwood') hardwoodSF += rArea;

    const wallOutlets = rPerim > 0 ? Math.ceil(rPerim / 6) : 0;

    const needsGFI = room.type === 'Bathroom' || room.type === 'Kitchen' || room.type === 'Garage';
    if (needsGFI) {
      let gfiCount = 1;
      if (room.type === 'Kitchen') {
        const cabLen = parseFloat(room.cabinetLength) || 0;
        gfiCount = Math.max(2, Math.ceil(cabLen / 4));
      }
      if (room.type === 'Bathroom') gfiCount = 1;
      if (room.type === 'Garage') gfiCount = 1;
      totalGFI += gfiCount;
      totalOutlets += Math.max(wallOutlets - gfiCount, 0);
    } else {
      totalOutlets += wallOutlets;
    }

    totalSwitches += Math.max((room.doors || []).length, 1);

    const lighting = room.lightingType || 'center';
    if (lighting === 'recessed') {
      const recessedCount = Math.max(Math.ceil(rArea / 25), 2);
      totalRecessedLights += recessedCount;
    } else {
      totalLightFixtures += 1;
    }

    for (const door of room.doors || []) {
      totalDoors++;
      headerCount++;
      // Hardware auto-assignment
      if (door.type === 'Exterior') {
        keyedDoors++;
      } else if (door.type === 'Bifold' || door.type === 'Overhead (Garage)') {
        // bifold/overhead — no standard lockset, skip hardware
      } else if (room.type === 'Bedroom' || room.type === 'Bathroom') {
        privacyDoors++;
      } else {
        passageDoors++;
      }
      if (door.type === 'Overhead (Garage)') {
        garageDoorCount++;
      } else {
        const dW = parseFloat(door.width) / 12 || 3;
        const dH = parseFloat(door.height) / 12 || 7;
        doorCasingLF += 2 * dH + dW;
      }
    }
    for (const win of room.windows || []) {
      totalWindows++;
      headerCount++;
      const wW = parseFloat(win.width) / 12 || 3;
      const wH = parseFloat(win.height) / 12 || 3;
      windowCasingLF += 2 * wH + wW;
    }
  }

  // Drywall — walls vs ceiling separate
  const ceilingArea = totalFloorArea > 0 ? totalFloorArea : L * W * FL;
  const wallDrywallSF = extWallArea + intWallArea;
  const wallDrywallSheets = Math.ceil(wallDrywallSF / 32);
  const ceilingDrywallSheets = Math.ceil(ceilingArea / 32);
  const totalDrywallSF = wallDrywallSF + ceilingArea;
  const jointCompoundBags = Math.ceil(totalDrywallSF / 300);
  const skimCoatBags = Math.ceil(totalDrywallSF / 100);

  // Paint — wall primer + finish, ceiling separate
  const wallPaintGal = Math.ceil(wallDrywallSF / 175);
  const primerGal = Math.ceil(wallDrywallSF / 300);
  const ceilingPaintGal = Math.ceil(ceilingArea / 350);

  // Flooring — by type from rooms; fallback if no rooms entered
  const hasRoomFlooring = vinylPlankSF + carpetSF + hardwoodSF + tileSF > 0;
  const fallbackFlooringArea = hasRoomFlooring ? 0 : L * W * FL;
  const carpetSY = Math.ceil(carpetSF / 9);

  const roofingSquares = Math.ceil(roofArea / 100);
  const underlaymentRolls = roofArea > 0 ? Math.ceil(roofArea / 1000) : 0;
  const tileArea = bathroomArea;

  const baseboardLF = Math.ceil(
    rooms.reduce(
      (acc, r) => acc + 2 * ((parseFloat(r.length) || 0) + (parseFloat(r.width) || 0)),
      0,
    ) || perimeterExt * FL,
  );

  const totalBuildingSF = L * W * FL;
  const heatedRoomCount = rooms.filter((r) => r.type !== 'Garage').length || Math.max(FL * 3, 1);

  let hvacItems = [];
  const ht = heatingType || 'forced_air';

  if (ht === 'forced_air') {
    const furnaceCount = Math.max(Math.ceil(totalBuildingSF / 2500), 1);
    const condenserCount = furnaceCount;
    const ductRuns = heatedRoomCount;
    const vents = heatedRoomCount;
    const returns = Math.max(Math.ceil(heatedRoomCount / 3), FL);
    const thermostats = Math.max(FL, 1);
    hvacItems = [
      { name: 'Furnace / Air Handler', qty: furnaceCount, unit: 'pcs', priceKey: 'hvacFurnace' },
      {
        name: 'A/C Condenser (outdoor)',
        qty: condenserCount,
        unit: 'pcs',
        priceKey: 'hvacCondenser',
      },
      { name: 'Duct Runs (supply)', qty: ductRuns, unit: 'runs', priceKey: 'hvacDuctRun' },
      { name: 'Supply Vents / Registers', qty: vents, unit: 'pcs', priceKey: 'hvacVent' },
      { name: 'Return Air Grilles', qty: returns, unit: 'pcs', priceKey: 'hvacReturn' },
      { name: 'Thermostat', qty: thermostats, unit: 'pcs', priceKey: 'hvacThermostat' },
    ];
  } else if (ht === 'mini_split') {
    const heads = heatedRoomCount;
    const outdoorUnits = Math.max(Math.ceil(heads / 5), 1);
    hvacItems = [
      { name: 'Mini-Split Indoor Head', qty: heads, unit: 'pcs', priceKey: 'miniSplitHead' },
      {
        name: 'Mini-Split Outdoor Unit',
        qty: outdoorUnits,
        unit: 'pcs',
        priceKey: 'miniSplitOutdoor',
      },
      { name: 'Thermostat / Remote', qty: outdoorUnits, unit: 'pcs', priceKey: 'hvacThermostat' },
    ];
  } else if (ht === 'baseboard') {
    const heaters = heatedRoomCount;
    const thermostats = heatedRoomCount;
    hvacItems = [
      { name: 'Electric Baseboard Heater', qty: heaters, unit: 'pcs', priceKey: 'baseboardHeater' },
      { name: 'Thermostat (per room)', qty: thermostats, unit: 'pcs', priceKey: 'hvacThermostat' },
    ];
  } else if (ht === 'radiant') {
    const tubingLF = Math.ceil(totalBuildingSF * 1.2);
    const boilers = Math.max(Math.ceil(totalBuildingSF / 3000), 1);
    const thermostats = Math.max(FL, 1);
    hvacItems = [
      {
        name: 'Radiant Floor Tubing (PEX)',
        qty: tubingLF,
        unit: 'lin ft',
        priceKey: 'radiantTubing',
      },
      { name: 'Boiler', qty: boilers, unit: 'pcs', priceKey: 'boiler' },
      { name: 'Thermostat (per zone)', qty: thermostats, unit: 'pcs', priceKey: 'hvacThermostat' },
    ];
  } else if (ht === 'fhw_boiler') {
    const boilers = Math.max(Math.ceil(totalBuildingSF / 3500), 1);
    const hwBaseboardLF = Math.ceil(totalBuildingSF / 8);
    const circulators = Math.max(FL, 1);
    const thermostats = Math.max(FL, 1);
    hvacItems = [
      { name: 'Hot Water Boiler (gas/oil)', qty: boilers, unit: 'pcs', priceKey: 'boiler' },
      {
        name: 'Hot Water Baseboard (fin-tube)',
        qty: hwBaseboardLF,
        unit: 'lin ft',
        priceKey: 'hwBaseboard',
      },
      { name: 'Expansion Tank', qty: boilers, unit: 'pcs', priceKey: 'expansionTank' },
      { name: 'Circulator Pump', qty: circulators, unit: 'pcs', priceKey: 'circulatorPump' },
      { name: 'Thermostat (per zone)', qty: thermostats, unit: 'pcs', priceKey: 'hvacThermostat' },
    ];
  } else if (ht === 'steam') {
    const boilers = Math.max(Math.ceil(totalBuildingSF / 3000), 1);
    const radiators = heatedRoomCount;
    hvacItems = [
      { name: 'Steam Boiler', qty: boilers, unit: 'pcs', priceKey: 'boiler' },
      { name: 'Steam Radiator', qty: radiators, unit: 'pcs', priceKey: 'baseboardHeater' },
      { name: 'Thermostat', qty: Math.max(FL, 1), unit: 'pcs', priceKey: 'hvacThermostat' },
    ];
  }

  const iType = insulationType || 'batt';
  const insulationItems = [];
  if (iType === 'batt' || iType === 'batt_roof_foam') {
    insulationItems.push({
      group: '5 · Insulation',
      name: 'Batt Insulation — Walls (rolls)',
      qty: insulationRolls,
      unit: 'rolls',
      priceKey: 'insulation',
    });
  }
  if (iType === 'spray_walls' || iType === 'spray_all') {
    insulationItems.push({
      group: '5 · Insulation',
      name: 'Spray Foam — Walls (closed cell)',
      qty: sprayFoamWallSF,
      unit: 'sq ft',
      priceKey: 'sprayFoamWall',
    });
  }
  if (iType === 'spray_roof' || iType === 'spray_all' || iType === 'batt_roof_foam') {
    insulationItems.push({
      group: '5 · Insulation',
      name: 'Spray Foam — Hot Roof (closed cell)',
      qty: sprayFoamRoofSF,
      unit: 'sq ft',
      priceKey: 'sprayFoamRoof',
    });
  }
  if (iType === 'batt' || iType === 'spray_walls') {
    insulationItems.push({
      group: '5 · Insulation',
      name: 'Batt Insulation — Roof/Ceiling (rolls)',
      qty: Math.ceil(roofSheathingSheets * 1.1),
      unit: 'rolls',
      priceKey: 'insulation',
    });
  }

  const toiletCount = fullBathCount + halfBathCount;
  const vanityCount = fullBathCount + halfBathCount;
  const tubShowerCount = fullBathCount;
  const cabinetCount = cabinetLF > 0 ? Math.round(cabinetLF / 2) : 0;
  const plumbingItems = [
    ...(toiletCount > 0
      ? [
          {
            group: '14 · Plumbing Fixtures',
            name: 'Toilet',
            qty: toiletCount,
            unit: 'pcs',
            priceKey: null,
          },
        ]
      : []),
    ...(vanityCount > 0
      ? [
          {
            group: '14 · Plumbing Fixtures',
            name: 'Vanity / Sink',
            qty: vanityCount,
            unit: 'pcs',
            priceKey: null,
          },
        ]
      : []),
    ...(tubShowerCount > 0
      ? [
          {
            group: '14 · Plumbing Fixtures',
            name: 'Tub / Shower Unit',
            qty: tubShowerCount,
            unit: 'pcs',
            priceKey: null,
          },
        ]
      : []),
    ...(kitchenCount > 0
      ? [
          {
            group: '14 · Plumbing Fixtures',
            name: 'Kitchen Sink',
            qty: kitchenCount,
            unit: 'pcs',
            priceKey: null,
          },
        ]
      : []),
  ];

  const materials = [
    ...(concreteCY > 0
      ? [
          {
            group: '0 · Foundation / Slab',
            name: `Concrete Slab (${slabIn}" thick, +10% waste)`,
            qty: concreteCY,
            unit: 'CY',
            priceKey: 'concrete',
          },
        ]
      : []),
    {
      group: '1 · Floor System',
      name: joistLabel,
      qty: floorJoistCount,
      unit: 'pcs',
      priceKey: 'floorJoists',
    },
    {
      group: '1 · Floor System',
      name: rimLabel,
      qty: Math.ceil(rimBoardLinFt),
      unit: 'lin ft',
      priceKey: 'rimBoard',
    },
    {
      group: '1 · Floor System',
      name: '¾" Tongue-&-Groove Subfloor (4×8)',
      qty: subfloorSheets,
      unit: 'sheets',
      priceKey: 'subfloor',
    },
    { group: '2 · Wall Framing', name: studLabel, qty: studCount, unit: 'pcs', priceKey: 'studs' },
    {
      group: '2 · Wall Framing',
      name: `${plateLabel} (top & bottom)`,
      qty: Math.ceil(plateLinFt),
      unit: 'lin ft',
      priceKey: 'plates',
    },
    {
      group: '2 · Wall Framing',
      name: 'Header (LVL / doubled)',
      qty: headerCount,
      unit: 'pcs',
      priceKey: 'headers',
    },
    {
      group: '2 · Wall Framing',
      name: '7/16" OSB Wall Sheathing (4×8)',
      qty: wallSheathingSheets,
      unit: 'sheets',
      priceKey: 'wallSheathing',
    },
    {
      group: '3 · Roof Structure',
      name: `Pre-Fab Roof Truss (${trussOC}" o.c.)`,
      qty: roofTrusses,
      unit: 'pcs',
      priceKey: 'trusses',
    },
    {
      group: '3 · Roof Structure',
      name: '7/16" OSB Roof Sheathing (4×8)',
      qty: roofSheathingSheets,
      unit: 'sheets',
      priceKey: 'roofSheathing',
    },
    {
      group: '4 · Roofing',
      name: 'Roofing',
      qty: roofingSquares,
      unit: 'squares',
      priceKey: 'roofingSquares',
    },
    {
      group: '4 · Roofing',
      name: 'Underlayment',
      qty: underlaymentRolls,
      unit: 'rolls',
      priceKey: 'underlayment',
    },
    ...insulationItems,
    // Drywall / Finish — by wall finish type
    ...(wallFinishType === 'blueboard'
      ? [
          {
            group: '6 · Drywall / Blue Board',
            name: '½" Blue Board — Walls (4×8 sheets)',
            qty: wallDrywallSheets,
            unit: 'sheets',
            priceKey: 'blueBoard',
          },
          {
            group: '6 · Drywall / Blue Board',
            name: '½" Blue Board — Ceiling (4×8 sheets)',
            qty: ceilingDrywallSheets,
            unit: 'sheets',
            priceKey: 'blueBoard',
          },
          {
            group: '6 · Drywall / Blue Board',
            name: 'Veneer Plaster / Skim Coat (50 lb bag)',
            qty: skimCoatBags,
            unit: 'bags',
            priceKey: 'skimCoat',
          },
        ]
      : wallFinishType === 'type_x'
        ? [
            {
              group: '6 · Drywall',
              name: '5/8" Type X (Fire-Rated) — Walls (4×8 sheets)',
              qty: wallDrywallSheets,
              unit: 'sheets',
              priceKey: 'typeXDrywall',
            },
            {
              group: '6 · Drywall',
              name: '5/8" Type X (Fire-Rated) — Ceiling (4×8 sheets)',
              qty: ceilingDrywallSheets,
              unit: 'sheets',
              priceKey: 'typeXDrywall',
            },
            {
              group: '6 · Drywall',
              name: 'Joint Compound (4.5 gal all-purpose)',
              qty: jointCompoundBags,
              unit: 'bags',
              priceKey: 'jointCompound',
            },
          ]
        : wallFinishType === 'green_board'
          ? [
              {
                group: '6 · Drywall',
                name: 'Green Board / Purple Board — Walls (4×8 sheets)',
                qty: wallDrywallSheets,
                unit: 'sheets',
                priceKey: 'greenBoard',
              },
              {
                group: '6 · Drywall',
                name: 'Green Board / Purple Board — Ceiling (4×8 sheets)',
                qty: ceilingDrywallSheets,
                unit: 'sheets',
                priceKey: 'greenBoard',
              },
              {
                group: '6 · Drywall',
                name: 'Joint Compound (4.5 gal all-purpose)',
                qty: jointCompoundBags,
                unit: 'bags',
                priceKey: 'jointCompound',
              },
            ]
          : [
              {
                group: '6 · Drywall',
                name: `${wallFinishType === 'lightweight' ? '½" Lightweight Drywall' : '½" Drywall'} — Walls (4×8 sheets)`,
                qty: wallDrywallSheets,
                unit: 'sheets',
                priceKey: 'drywall',
              },
              {
                group: '6 · Drywall',
                name: `${wallFinishType === 'lightweight' ? '½" Lightweight Drywall' : '½" Drywall'} — Ceiling (4×8 sheets)${totalRecessedLights > 0 ? ' — incl. recessed backing' : ''}`,
                qty: ceilingDrywallSheets,
                unit: 'sheets',
                priceKey: 'drywall',
              },
              {
                group: '6 · Drywall',
                name: 'Joint Compound (4.5 gal all-purpose)',
                qty: jointCompoundBags,
                unit: 'bags',
                priceKey: 'jointCompound',
              },
            ]),
    // Paint
    {
      group: '7 · Paint',
      name: 'Primer (wall surfaces)',
      qty: primerGal,
      unit: 'gal',
      priceKey: 'primer',
    },
    {
      group: '7 · Paint',
      name: 'Wall Paint — finish coat (2 coats)',
      qty: wallPaintGal,
      unit: 'gal',
      priceKey: 'paint',
    },
    {
      group: '7 · Paint',
      name: 'Ceiling Paint — flat (1–2 coats)',
      qty: ceilingPaintGal,
      unit: 'gal',
      priceKey: 'ceilingPaint',
    },
    // Flooring — by type
    ...(vinylPlankSF > 0
      ? [
          {
            group: '8 · Flooring',
            name: 'Vinyl Plank LVP',
            qty: Math.ceil(vinylPlankSF),
            unit: 'sq ft',
            priceKey: 'vinylPlank',
          },
        ]
      : []),
    ...(hardwoodSF > 0
      ? [
          {
            group: '8 · Flooring',
            name: 'Hardwood Flooring',
            qty: Math.ceil(hardwoodSF),
            unit: 'sq ft',
            priceKey: 'hardwood',
          },
        ]
      : []),
    ...(carpetSY > 0
      ? [
          {
            group: '8 · Flooring',
            name: 'Carpet + Pad',
            qty: carpetSY,
            unit: 'sq yd',
            priceKey: 'carpetSY',
          },
        ]
      : []),
    ...(tileSF > 0
      ? [
          {
            group: '8 · Flooring',
            name: 'Floor Tile',
            qty: Math.ceil(tileSF),
            unit: 'sq ft',
            priceKey: 'tile',
          },
        ]
      : []),
    ...(fallbackFlooringArea > 0
      ? [
          {
            group: '8 · Flooring',
            name: 'Flooring (add rooms for type breakdown)',
            qty: Math.ceil(fallbackFlooringArea),
            unit: 'sq ft',
            priceKey: 'vinylPlank',
          },
        ]
      : []),
    {
      group: '9 · Electrical Rough-In',
      name: 'Standard Outlets',
      qty: totalOutlets,
      unit: 'pcs',
      priceKey: 'outlet',
    },
    {
      group: '9 · Electrical Rough-In',
      name: 'GFI Outlets (kitchen / bath / garage)',
      qty: totalGFI,
      unit: 'pcs',
      priceKey: 'gfiOutlet',
    },
    {
      group: '9 · Electrical Rough-In',
      name: 'Light Switches',
      qty: totalSwitches,
      unit: 'pcs',
      priceKey: 'lightSwitch',
    },
    {
      group: '9 · Electrical Rough-In',
      name: 'Light Fixtures (center mount)',
      qty: totalLightFixtures,
      unit: 'pcs',
      priceKey: 'lightFixture',
    },
    {
      group: '9 · Electrical Rough-In',
      name: 'Recessed Lights',
      qty: totalRecessedLights,
      unit: 'pcs',
      priceKey: 'recessedLight',
    },
    ...hvacItems.map((h) => ({ group: '10 · HVAC / Heating', ...h })),
    ...(cabinetLF > 0
      ? [
          {
            group: '11 · Cabinets',
            name: `Kitchen Cabinets — ${Math.ceil(cabinetLF)} lin ft (~${cabinetCount} boxes)`,
            qty: Math.ceil(cabinetLF),
            unit: 'lin ft',
            priceKey: 'cabinetLinFt',
          },
        ]
      : []),
    {
      group: '12 · Trim / Molding',
      name: 'Baseboard (floor perimeter)',
      qty: baseboardLF,
      unit: 'lin ft',
      priceKey: 'baseboard',
    },
    {
      group: '12 · Trim / Molding',
      name: 'Door Casing',
      qty: Math.ceil(doorCasingLF),
      unit: 'lin ft',
      priceKey: 'doorCasing',
    },
    {
      group: '12 · Trim / Molding',
      name: 'Window Casing',
      qty: Math.ceil(windowCasingLF),
      unit: 'lin ft',
      priceKey: 'windowCasing',
    },
    ...(garageDoorCount > 0
      ? [
          {
            group: '13 · Garage Doors',
            name: 'Overhead Garage Door',
            qty: garageDoorCount,
            unit: 'pcs',
            priceKey: 'garageDoor',
          },
          {
            group: '13 · Garage Doors',
            name: 'Garage Door Opener',
            qty: garageDoorCount,
            unit: 'pcs',
            priceKey: 'garageDoorOpener',
          },
        ]
      : []),
    ...plumbingItems,
    ...(passageDoors > 0
      ? [
          {
            group: '15 · Door Hardware',
            name: 'Passage Set — Hall / Closet (no lock)',
            qty: passageDoors,
            unit: 'pcs',
            priceKey: 'passageSet',
          },
        ]
      : []),
    ...(privacyDoors > 0
      ? [
          {
            group: '15 · Door Hardware',
            name: 'Privacy Set — Bedroom / Bathroom (push-button lock)',
            qty: privacyDoors,
            unit: 'pcs',
            priceKey: 'privacySet',
          },
        ]
      : []),
    ...(keyedDoors > 0
      ? [
          {
            group: '15 · Door Hardware',
            name: 'Keyed Entry Set — Exterior',
            qty: keyedDoors,
            unit: 'pcs',
            priceKey: 'keyedSet',
          },
        ]
      : []),
    // Openings summary
    ...(totalDoors > 0
      ? [
          {
            group: '16 · Openings Count',
            name: `Interior + Exterior Doors (total)`,
            qty: totalDoors,
            unit: 'doors',
            priceKey: null,
          },
        ]
      : []),
    ...(garageDoorCount > 0
      ? [
          {
            group: '16 · Openings Count',
            name: 'Overhead / Garage Doors',
            qty: garageDoorCount,
            unit: 'doors',
            priceKey: null,
          },
        ]
      : []),
    ...(totalWindows > 0
      ? [
          {
            group: '16 · Openings Count',
            name: 'Windows (all sizes)',
            qty: totalWindows,
            unit: 'windows',
            priceKey: null,
          },
        ]
      : []),
  ];

  return materials
    .filter((m) => m.qty > 0)
    .map((m) => ({
      ...m,
      unitPrice: m.priceKey ? (prices[m.priceKey] ?? 0) : null,
      total: m.priceKey ? m.qty * (prices[m.priceKey] ?? 0) : null,
    }));
}

const sectionHeader = (label) => (
  <div
    style={{
      fontSize: 13,
      fontWeight: 700,
      color: '#E07B2A',
      textTransform: 'uppercase',
      letterSpacing: 1,
      marginBottom: 12,
      borderBottom: '1px solid rgba(255,255,255,0.08)',
      paddingBottom: 6,
    }}
  >
    {label}
  </div>
);

const fieldStyle = {
  background: 'rgba(255,255,255,0.07)',
  border: '1px solid rgba(255,255,255,0.18)',
  borderRadius: 6,
  color: 'white',
  padding: '8px 10px',
  fontSize: 13,
  width: '100%',
  boxSizing: 'border-box',
};

const labelStyle = {
  fontSize: 12,
  color: 'rgba(255,255,255,0.7)',
  marginBottom: 4,
  display: 'block',
};

function Field({ label, value, onChange, type = 'text', min, step, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={labelStyle}>{label}</label>
      {children || (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          min={min}
          step={step}
          style={fieldStyle}
        />
      )}
    </div>
  );
}

function Select({ label, value, onChange, options }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={labelStyle}>{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} style={{ ...fieldStyle }}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function btnStyle(primary) {
  return {
    padding: '9px 22px',
    borderRadius: 7,
    border: 'none',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
    background: primary ? '#E07B2A' : 'rgba(255,255,255,0.1)',
    color: 'white',
  };
}

export default function MaterialTakeOff() {
  const [step, setStep] = useState(0);
  const [building, setBuilding] = useState({
    length: '',
    width: '',
    floors: '1',
    wallHeight: '9',
    pitch: '4',
    overhang: '2',
    hasSlab: true,
    slabThickness: '4',
  });
  const [studSpacing, setStudSpacing] = useState('16');
  const [trussSpacing, setTrussSpacing] = useState('24');
  const [studSize, setStudSize] = useState('2x6');
  const [joistType, setJoistType] = useState('auto');
  const [wallFinishType, setWallFinishType] = useState('drywall');
  const [heatingType, setHeatingType] = useState('forced_air');
  const [insulationType, setInsulationType] = useState('batt');
  const [rooms, setRooms] = useState([]);
  const [prices, setPrices] = useState({ ...DEFAULT_PRICES });
  const [results, setResults] = useState(null);
  const [newRoom, setNewRoom] = useState({
    name: '',
    type: 'Bedroom',
    floor: '1',
    length: '',
    width: '',
    cabinetLength: '',
    isFullBath: true,
    lightingType: 'center',
    flooringType: '',
    doors: [],
    windows: [],
  });
  const [newDoor, setNewDoor] = useState({
    width: '36',
    height: '80',
    side: 'interior',
    type: 'Swing',
  });
  const [newWindow, setNewWindow] = useState({ width: '36', height: '48', kind: 'new' });
  const [editingRoom, setEditingRoom] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [saveJobId, setSaveJobId] = useState('');
  const [saveStatus, setSaveStatus] = useState('');

  const setB = (k, v) => setBuilding((b) => ({ ...b, [k]: v }));

  useEffect(() => {
    const t = localStorage.getItem('pb_token');
    if (!t) return;
    fetch('/api/jobs', { headers: { 'x-auth-token': t } })
      .then((r) => r.json())
      .then((d) => setJobs(d.jobs || []))
      .catch(() => {});
  }, []);

  function handleSubmit() {
    const r = runCalcs(
      building,
      studSpacing,
      trussSpacing,
      rooms,
      prices,
      heatingType,
      insulationType,
      studSize,
      wallFinishType,
      joistType,
    );
    setResults(r);
    setSaveStatus('');
    setStep(5);
  }

  async function handleSaveToJob() {
    if (!saveJobId) return;
    setSaveStatus('saving');
    const t = localStorage.getItem('pb_token');
    const payload = {
      results,
      building,
      rooms,
      prices,
      heatingType,
      insulationType,
      studSize,
      joistType,
      wallFinishType,
      grandTotal,
    };
    const res = await fetch(`/api/jobs/${saveJobId}/takeoff`, {
      method: 'PATCH',
      headers: { 'x-auth-token': t, 'Content-Type': 'application/json' },
      body: JSON.stringify({ takeoffData: payload }),
    });
    setSaveStatus(res.ok ? 'saved' : 'error');
  }

  function addRoom() {
    if (!newRoom.name) return;
    setRooms((prev) => [...prev, { ...newRoom, id: Date.now() }]);
    setNewRoom({
      name: '',
      type: 'Bedroom',
      floor: '1',
      length: '',
      width: '',
      cabinetLength: '',
      isFullBath: true,
      lightingType: 'center',
      flooringType: '',
      doors: [],
      windows: [],
    });
  }

  function removeRoom(id) {
    setRooms((prev) => prev.filter((r) => r.id !== id));
  }

  function openEditRoom(room) {
    setEditingRoom({ ...room, doors: room.doors || [], windows: room.windows || [] });
  }

  function saveEditRoom() {
    setRooms((prev) => prev.map((r) => (r.id === editingRoom.id ? editingRoom : r)));
    setEditingRoom(null);
  }

  function addDoorToEdit() {
    setEditingRoom((r) => ({ ...r, doors: [...(r.doors || []), { ...newDoor }] }));
  }

  function addWindowToEdit() {
    setEditingRoom((r) => ({ ...r, windows: [...(r.windows || []), { ...newWindow }] }));
  }

  const grandTotal = results ? results.reduce((s, m) => s + (m.total ?? 0), 0) : 0;
  const groups = results ? [...new Set(results.map((m) => m.group))] : [];

  const card = {
    background: '#1B3A6B',
    borderRadius: 12,
    padding: '28px 32px',
    color: 'white',
    maxWidth: 800,
    margin: '0 auto',
  };

  const stepBar = (
    <div style={{ display: 'flex', gap: 6, marginBottom: 28, flexWrap: 'wrap' }}>
      {STEPS.map((s, i) => (
        <div
          key={s}
          style={{
            padding: '5px 14px',
            borderRadius: 20,
            fontSize: 12,
            fontWeight: 600,
            background:
              i === step ? '#E07B2A' : i < step ? 'rgba(224,123,42,0.3)' : 'rgba(255,255,255,0.1)',
            color: 'white',
            cursor: i < step ? 'pointer' : 'default',
          }}
          onClick={() => {
            if (i < step) setStep(i);
          }}
        >
          {s}
        </div>
      ))}
    </div>
  );

  return (
    <div style={{ padding: '32px 24px', background: '#f4f6fb', minHeight: '100vh' }}>
      <div style={{ maxWidth: 860, margin: '0 auto' }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1B3A6B', margin: 0 }}>
            📐 Material Take-Off
          </h1>
          <p style={{ fontSize: 13, color: '#666', marginTop: 6 }}>
            Enter building details to calculate material quantities and estimated costs.
          </p>
        </div>

        <div style={card}>
          {stepBar}

          {/* Step 0: Building Dimensions */}
          {step === 0 && (
            <div>
              {sectionHeader('Building Dimensions')}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
                <Field
                  label={`Building Length (ft or ft'in")`}
                  type="text"
                  value={building.length}
                  onChange={(v) => setB('length', v)}
                />
                <Field
                  label={`Building Width (ft or ft'in")`}
                  type="text"
                  value={building.width}
                  onChange={(v) => setB('width', v)}
                />
                <Field
                  label="Number of Floors"
                  type="number"
                  min="1"
                  value={building.floors}
                  onChange={(v) => setB('floors', v)}
                />
                <Field
                  label="Wall Height (ft)"
                  type="number"
                  min="1"
                  step="0.5"
                  value={building.wallHeight}
                  onChange={(v) => setB('wallHeight', v)}
                />
                <Field
                  label="Roof Pitch (x/12)"
                  type="number"
                  min="0"
                  step="0.5"
                  value={building.pitch}
                  onChange={(v) => setB('pitch', v)}
                />
                <Field
                  label="Roof Overhang (ft)"
                  type="number"
                  min="0"
                  step="0.5"
                  value={building.overhang}
                  onChange={(v) => setB('overhang', v)}
                />
              </div>
              <div style={{ marginTop: 16 }}>{sectionHeader('Concrete Slab / Foundation')}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 14 }}>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    fontSize: 13,
                    color: 'white',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={building.hasSlab !== false}
                    onChange={(e) => setB('hasSlab', e.target.checked)}
                  />
                  Include concrete slab pour in take-off
                </label>
              </div>
              {building.hasSlab !== false && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
                  <div style={{ marginBottom: 14 }}>
                    <label style={labelStyle}>Slab Thickness (inches)</label>
                    <select
                      value={building.slabThickness || '4'}
                      onChange={(e) => setB('slabThickness', e.target.value)}
                      style={fieldStyle}
                    >
                      <option value="3.5">3.5" (light slab)</option>
                      <option value="4">4" (standard garage / studio)</option>
                      <option value="5">5" (heavy load / equipment)</option>
                      <option value="6">6" (commercial / truck)</option>
                    </select>
                  </div>
                  <div style={{ marginBottom: 14 }}>
                    <label style={labelStyle}>Slab Area</label>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', paddingTop: 10 }}>
                      Uses building footprint ({parseFtIn(building.length).toFixed(2)}' ×{' '}
                      {parseFtIn(building.width).toFixed(2)}' ={' '}
                      {(parseFtIn(building.length) * parseFtIn(building.width)).toFixed(0)} sq ft)
                      +10% waste
                    </div>
                  </div>
                </div>
              )}
              <div style={{ marginTop: 16 }}>{sectionHeader('Floor Joist System')}</div>
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>Floor Joist Type</label>
                <select
                  value={joistType}
                  onChange={(e) => setJoistType(e.target.value)}
                  style={fieldStyle}
                >
                  <option value="auto">Auto — size by span (2×8 / 2×10 / 2×12)</option>
                  <option value="2x8">2×8 Solid Lumber</option>
                  <option value="2x10">2×10 Solid Lumber</option>
                  <option value="2x12">2×12 Solid Lumber</option>
                  <option value="tji_95">TJI® 9½" (11⅞" flange — light residential)</option>
                  <option value="tji_118">TJI® 11⅞" (standard residential)</option>
                  <option value="tji_14">TJI® 14" (long spans / commercial)</option>
                  <option value="tji_16">TJI® 16" (deep depth — long clear-span)</option>
                </select>
                <div
                  style={{
                    fontSize: 11,
                    color: 'rgba(255,255,255,0.4)',
                    marginTop: 5,
                    lineHeight: 1.5,
                  }}
                >
                  {joistType === 'auto' &&
                    'Auto-selects 2×8 (≤12 ft span), 2×10 (≤16 ft), 2×12 (≤20 ft), or LVL/Engineered for wider buildings.'}
                  {joistType.startsWith('tji') &&
                    'TJI® (I-Joist) engineered lumber — lighter, stronger, longer spans than solid lumber. Price per pc reflects TJI material cost.'}
                </div>
              </div>
              <div style={{ textAlign: 'right', marginTop: 8 }}>
                <button style={btnStyle(true)} onClick={() => setStep(1)}>
                  Next: Spacing →
                </button>
              </div>
            </div>
          )}

          {/* Step 1: Spacing & Systems */}
          {step === 1 && (
            <div>
              {sectionHeader('Wall Finish')}
              <Select
                label="Wall & Ceiling Finish"
                value={wallFinishType}
                onChange={setWallFinishType}
                options={[
                  { value: 'drywall', label: '½" Standard Drywall / Sheetrock (joint compound)' },
                  {
                    value: 'lightweight',
                    label: '½" Lightweight Drywall (same finish process, lighter weight)',
                  },
                  {
                    value: 'type_x',
                    label: '5/8" Type X / Type C — Fire-Rated (garage, basement, mechanical)',
                  },
                  {
                    value: 'green_board',
                    label:
                      'Green Board / Purple Board — Moisture-Resistant (bath, kitchen, basement)',
                  },
                  {
                    value: 'blueboard',
                    label: 'Blue Board (Plaster Baseboard) + Veneer Plaster / Skim Coat',
                  },
                ]}
              />
              <div
                style={{
                  fontSize: 11,
                  color: 'rgba(255,255,255,0.45)',
                  marginTop: -8,
                  marginBottom: 16,
                  lineHeight: 1.5,
                }}
              >
                {wallFinishType === 'drywall' &&
                  'Standard ½" gypsum board — interior walls and ceilings in living areas. Taped and finished with all-purpose joint compound.'}
                {wallFinishType === 'lightweight' &&
                  '½" lightweight gypsum — same finish process as standard, roughly 25% lighter. Easier to handle and cut.'}
                {wallFinishType === 'type_x' &&
                  '5/8" Type X / Type C fire-rated gypsum — required for garages (attached), basements, and mechanical rooms. Also provides better soundproofing.'}
                {wallFinishType === 'green_board' &&
                  'Moisture-resistant gypsum (green or purple face) — for bathrooms, kitchens, and basements. NOT a tile backer — use cement board behind tile.'}
                {wallFinishType === 'blueboard' &&
                  'Blue board (plaster base) with skim coat / veneer plaster finish — harder, more durable surface common in New England renovations.'}
              </div>
              <div style={{ marginTop: 4 }}>{sectionHeader('Framing')}</div>
              <Select
                label="Stud Size"
                value={studSize}
                onChange={setStudSize}
                options={[
                  { value: '2x4', label: '2×4 Studs (partition walls / low-load)' },
                  { value: '2x6', label: '2×6 Studs (exterior walls — standard MA)' },
                ]}
              />
              <Select
                label="Stud Spacing"
                value={studSpacing}
                onChange={setStudSpacing}
                options={[
                  { value: '16', label: '16" o.c.' },
                  { value: '24', label: '24" o.c.' },
                ]}
              />
              <Select
                label="Truss Spacing"
                value={trussSpacing}
                onChange={setTrussSpacing}
                options={[
                  { value: '16', label: '16" o.c.' },
                  { value: '24', label: '24" o.c.' },
                ]}
              />
              <div style={{ marginTop: 20 }}>{sectionHeader('Heating / HVAC System')}</div>
              <Select
                label="System Type"
                value={heatingType}
                onChange={setHeatingType}
                options={[
                  { value: 'forced_air', label: 'Forced Air (furnace + A/C + ductwork)' },
                  {
                    value: 'fhw_boiler',
                    label: 'Forced Hot Water (boiler + hot water baseboards)',
                  },
                  { value: 'mini_split', label: 'Mini-Split (indoor heads + outdoor unit)' },
                  { value: 'baseboard', label: 'Electric Baseboard Heat' },
                  { value: 'radiant', label: 'Radiant Floor (PEX tubing + boiler)' },
                  { value: 'steam', label: 'Steam (boiler + radiators)' },
                ]}
              />
              <div
                style={{
                  fontSize: 11,
                  color: 'rgba(255,255,255,0.45)',
                  marginTop: -8,
                  marginBottom: 12,
                  lineHeight: 1.5,
                }}
              >
                {heatingType === 'forced_air' &&
                  'Standard ducted system — furnace, condenser, supply runs & returns per room.'}
                {heatingType === 'fhw_boiler' &&
                  'Forced hot water (hydronic) — gas or oil boiler heats water circulated through fin-tube baseboard heaters. Very common in New England. Includes expansion tank, circulator pump, and zone thermostats.'}
                {heatingType === 'mini_split' &&
                  'Ductless — one wall-mounted head per room, outdoor unit(s) sized to building.'}
                {heatingType === 'baseboard' &&
                  'Electric baseboard heater in each room with individual thermostats.'}
                {heatingType === 'radiant' &&
                  'In-floor PEX tubing loops connected to a boiler, zoned by floor.'}
                {heatingType === 'steam' &&
                  'Steam boiler with radiators — less common in new construction.'}
              </div>
              <div style={{ marginTop: 20 }}>{sectionHeader('Insulation Type')}</div>
              <Select
                label="Insulation Strategy"
                value={insulationType}
                onChange={setInsulationType}
                options={[
                  { value: 'batt', label: 'Batt / Fiberglass — Walls & Ceiling (standard)' },
                  { value: 'spray_roof', label: 'Batt Walls + Spray Foam Hot Roof (Stretch Code)' },
                  { value: 'spray_walls', label: 'Spray Foam Walls (closed cell) + Batt Ceiling' },
                  {
                    value: 'spray_all',
                    label: 'Full Spray Foam — Walls & Hot Roof (max performance)',
                  },
                  {
                    value: 'batt_roof_foam',
                    label: 'Batt Walls + Spray Foam Roof Deck (common MA detail)',
                  },
                ]}
              />
              <div
                style={{
                  fontSize: 11,
                  color: 'rgba(255,255,255,0.45)',
                  marginTop: -8,
                  marginBottom: 12,
                  lineHeight: 1.5,
                }}
              >
                {insulationType === 'batt' &&
                  'Standard fiberglass batt in walls and ceiling — lowest cost, meets base code.'}
                {insulationType === 'spray_roof' &&
                  'Hot roof detail — closed cell spray foam on roof deck eliminates attic venting. Meets MA Stretch Code air sealing requirements.'}
                {insulationType === 'spray_walls' &&
                  'Closed cell foam in wall cavities for max R-value and air barrier. Ceiling remains batt.'}
                {insulationType === 'spray_all' &&
                  'Full spray foam envelope — highest performance, air-sealed, Stretch Code compliant. Best for studio / conditioned space.'}
                {insulationType === 'batt_roof_foam' &&
                  'Common MA detail: batt walls with spray foam on roof deck. Good balance of cost and Stretch Code compliance.'}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                <button style={btnStyle(false)} onClick={() => setStep(0)}>
                  ← Back
                </button>
                <button style={btnStyle(true)} onClick={() => setStep(2)}>
                  Next: Rooms →
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Rooms */}
          {step === 2 && (
            <div>
              {sectionHeader('Floors & Rooms')}
              <div style={{ marginBottom: 16 }}>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr auto',
                    gap: 8,
                    alignItems: 'end',
                  }}
                >
                  <Field
                    label="Room Name"
                    value={newRoom.name}
                    onChange={(v) => setNewRoom((r) => ({ ...r, name: v }))}
                  />
                  <Field
                    label="Floor #"
                    type="number"
                    min="1"
                    value={newRoom.floor}
                    onChange={(v) => setNewRoom((r) => ({ ...r, floor: v }))}
                  />
                  <Field
                    label="Length (ft)"
                    type="number"
                    min="1"
                    value={newRoom.length}
                    onChange={(v) => setNewRoom((r) => ({ ...r, length: v }))}
                  />
                  <Field
                    label="Width (ft)"
                    type="number"
                    min="1"
                    value={newRoom.width}
                    onChange={(v) => setNewRoom((r) => ({ ...r, width: v }))}
                  />
                  <div style={{ marginBottom: 14 }}>
                    <label style={labelStyle}>Type</label>
                    <select
                      value={newRoom.type}
                      onChange={(e) => setNewRoom((r) => ({ ...r, type: e.target.value }))}
                      style={fieldStyle}
                    >
                      {ROOM_TYPES.map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                  <div style={{ marginBottom: 14 }}>
                    <label style={labelStyle}>&nbsp;</label>
                    <button style={{ ...btnStyle(true), padding: '8px 14px' }} onClick={addRoom}>
                      + Add
                    </button>
                  </div>
                </div>
                {newRoom.type === 'Kitchen' && (
                  <div style={{ maxWidth: 250, marginTop: 4 }}>
                    <Field
                      label="Cabinet Length (lin ft)"
                      type="number"
                      min="0"
                      value={newRoom.cabinetLength}
                      onChange={(v) => setNewRoom((r) => ({ ...r, cabinetLength: v }))}
                    />
                  </div>
                )}
                {newRoom.type === 'Bathroom' && (
                  <div
                    style={{
                      marginTop: 4,
                      marginBottom: 10,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={newRoom.isFullBath}
                      onChange={(e) => setNewRoom((r) => ({ ...r, isFullBath: e.target.checked }))}
                      id="newRoomFullBath"
                    />
                    <label
                      htmlFor="newRoomFullBath"
                      style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}
                    >
                      Full bathroom (includes tub/shower tile)
                    </label>
                  </div>
                )}
                <div style={{ maxWidth: 280, marginTop: 4 }}>
                  <div style={{ marginBottom: 14 }}>
                    <label style={labelStyle}>Lighting Type</label>
                    <select
                      value={newRoom.lightingType}
                      onChange={(e) => setNewRoom((r) => ({ ...r, lightingType: e.target.value }))}
                      style={fieldStyle}
                    >
                      <option value="center">Center Fixture (1 per room)</option>
                      <option value="recessed">Recessed Lighting (multiple)</option>
                    </select>
                    <label style={{ ...labelStyle, marginTop: 10 }}>Flooring Type</label>
                    <select
                      value={newRoom.flooringType}
                      onChange={(e) => setNewRoom((r) => ({ ...r, flooringType: e.target.value }))}
                      style={fieldStyle}
                    >
                      <option value="">Auto (by room type)</option>
                      <option value="vinyl_plank">Vinyl Plank / LVP</option>
                      <option value="carpet">Carpet + Pad</option>
                      <option value="hardwood">Hardwood</option>
                      <option value="tile">Floor Tile</option>
                      <option value="concrete">Concrete / No Flooring</option>
                    </select>
                  </div>
                </div>
              </div>

              {rooms.length > 0 && (
                <table
                  style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    marginBottom: 18,
                    fontSize: 13,
                  }}
                >
                  <thead>
                    <tr
                      style={{
                        color: 'rgba(255,255,255,0.5)',
                        borderBottom: '1px solid rgba(255,255,255,0.1)',
                      }}
                    >
                      <th style={{ textAlign: 'left', padding: '6px 8px' }}>Room</th>
                      <th style={{ textAlign: 'left', padding: '6px 8px' }}>Type</th>
                      <th style={{ padding: '6px 8px' }}>Floor</th>
                      <th style={{ padding: '6px 8px' }}>Dims</th>
                      <th style={{ padding: '6px 8px' }}>Doors</th>
                      <th style={{ padding: '6px 8px' }}>Windows</th>
                      <th style={{ padding: '6px 8px' }}>Notes</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rooms.map((r) => (
                      <tr key={r.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                        <td style={{ padding: '7px 8px' }}>{r.name}</td>
                        <td style={{ padding: '7px 8px', color: '#E07B2A' }}>{r.type}</td>
                        <td style={{ padding: '7px 8px', textAlign: 'center' }}>
                          {r.floor || '1'}
                        </td>
                        <td style={{ padding: '7px 8px', textAlign: 'center' }}>
                          {r.length}×{r.width}
                        </td>
                        <td style={{ padding: '7px 8px', textAlign: 'center' }}>
                          {(r.doors || []).length}
                        </td>
                        <td style={{ padding: '7px 8px', textAlign: 'center' }}>
                          {(r.windows || []).length}
                        </td>
                        <td
                          style={{
                            padding: '7px 8px',
                            fontSize: 11,
                            color: 'rgba(255,255,255,0.5)',
                          }}
                        >
                          {r.type === 'Kitchen' && r.cabinetLength
                            ? `Cab: ${r.cabinetLength}ft · `
                            : ''}
                          {r.type === 'Bathroom'
                            ? r.isFullBath
                              ? 'Full bath · '
                              : 'Half bath · '
                            : ''}
                          {(r.lightingType || 'center') === 'recessed'
                            ? '💡 Recessed'
                            : '💡 Center'}
                        </td>
                        <td
                          style={{
                            padding: '7px 8px',
                            textAlign: 'right',
                            display: 'flex',
                            gap: 6,
                          }}
                        >
                          <button
                            onClick={() => openEditRoom(r)}
                            style={{ ...btnStyle(false), padding: '4px 10px', fontSize: 11 }}
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => removeRoom(r.id)}
                            style={{
                              ...btnStyle(false),
                              padding: '4px 10px',
                              fontSize: 11,
                              background: 'rgba(200,60,60,0.3)',
                            }}
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {editingRoom && (
                <div
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.15)',
                    borderRadius: 8,
                    padding: 16,
                    marginBottom: 16,
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>
                    Editing: {editingRoom.name}{' '}
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
                      (Floor {editingRoom.floor || '1'}, {editingRoom.type})
                    </span>
                  </div>
                  {editingRoom.type === 'Kitchen' && (
                    <div style={{ maxWidth: 250, marginBottom: 12 }}>
                      <Field
                        label="Cabinet Length (lin ft)"
                        type="number"
                        min="0"
                        value={editingRoom.cabinetLength || ''}
                        onChange={(v) => setEditingRoom((r) => ({ ...r, cabinetLength: v }))}
                      />
                    </div>
                  )}
                  {editingRoom.type === 'Bathroom' && (
                    <div
                      style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}
                    >
                      <input
                        type="checkbox"
                        checked={editingRoom.isFullBath !== false}
                        onChange={(e) =>
                          setEditingRoom((r) => ({ ...r, isFullBath: e.target.checked }))
                        }
                        id="editRoomFullBath"
                      />
                      <label
                        htmlFor="editRoomFullBath"
                        style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}
                      >
                        Full bathroom (includes tub/shower tile)
                      </label>
                    </div>
                  )}
                  <div style={{ maxWidth: 280, marginBottom: 12 }}>
                    <div style={{ marginBottom: 14 }}>
                      <label style={labelStyle}>Lighting Type</label>
                      <select
                        value={editingRoom.lightingType || 'center'}
                        onChange={(e) =>
                          setEditingRoom((r) => ({ ...r, lightingType: e.target.value }))
                        }
                        style={fieldStyle}
                      >
                        <option value="center">Center Fixture (1 per room)</option>
                        <option value="recessed">Recessed Lighting (multiple)</option>
                      </select>
                      <label style={{ ...labelStyle, marginTop: 10 }}>Flooring Type</label>
                      <select
                        value={editingRoom.flooringType || ''}
                        onChange={(e) =>
                          setEditingRoom((r) => ({ ...r, flooringType: e.target.value }))
                        }
                        style={fieldStyle}
                      >
                        <option value="">Auto (by room type)</option>
                        <option value="vinyl_plank">Vinyl Plank / LVP</option>
                        <option value="carpet">Carpet + Pad</option>
                        <option value="hardwood">Hardwood</option>
                        <option value="tile">Floor Tile</option>
                        <option value="concrete">Concrete / No Flooring</option>
                      </select>
                    </div>
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 12, color: '#E07B2A', marginBottom: 8 }}>Add Door</div>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr 1fr 1fr auto',
                        gap: 8,
                        alignItems: 'end',
                      }}
                    >
                      <Field
                        label="Width (in)"
                        type="number"
                        value={newDoor.width}
                        onChange={(v) => setNewDoor((d) => ({ ...d, width: v }))}
                      />
                      <Field
                        label="Height (in)"
                        type="number"
                        value={newDoor.height}
                        onChange={(v) => setNewDoor((d) => ({ ...d, height: v }))}
                      />
                      <div style={{ marginBottom: 14 }}>
                        <label style={labelStyle}>Side</label>
                        <select
                          value={newDoor.side}
                          onChange={(e) => setNewDoor((d) => ({ ...d, side: e.target.value }))}
                          style={fieldStyle}
                        >
                          <option value="interior">Interior</option>
                          <option value="exterior">Exterior</option>
                        </select>
                      </div>
                      <div style={{ marginBottom: 14 }}>
                        <label style={labelStyle}>Type</label>
                        <select
                          value={newDoor.type}
                          onChange={(e) => {
                            const t = e.target.value;
                            setNewDoor((d) => ({
                              ...d,
                              type: t,
                              width: t === 'Overhead (Garage)' ? '108' : d.width,
                              height: t === 'Overhead (Garage)' ? '84' : d.height,
                              side: t === 'Overhead (Garage)' ? 'exterior' : d.side,
                            }));
                          }}
                          style={fieldStyle}
                        >
                          <option>Swing</option>
                          <option>Pocket</option>
                          <option>Slider</option>
                          <option>Overhead (Garage)</option>
                        </select>
                      </div>
                      <div style={{ marginBottom: 14 }}>
                        <label style={labelStyle}>&nbsp;</label>
                        <button
                          style={{ ...btnStyle(true), padding: '8px 12px' }}
                          onClick={addDoorToEdit}
                        >
                          +
                        </button>
                      </div>
                    </div>
                    {(editingRoom.doors || []).map((d, i) => (
                      <div
                        key={i}
                        style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginBottom: 3 }}
                      >
                        Door {i + 1}: {d.width}"×{d.height}" — {d.side}, {d.type}
                        <button
                          onClick={() =>
                            setEditingRoom((r) => ({
                              ...r,
                              doors: r.doors.filter((_, j) => j !== i),
                            }))
                          }
                          style={{
                            marginLeft: 8,
                            background: 'none',
                            border: 'none',
                            color: '#f44',
                            cursor: 'pointer',
                            fontSize: 12,
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 12, color: '#E07B2A', marginBottom: 8 }}>
                      Add Window
                    </div>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr 1fr auto',
                        gap: 8,
                        alignItems: 'end',
                      }}
                    >
                      <Field
                        label="Width (in)"
                        type="number"
                        value={newWindow.width}
                        onChange={(v) => setNewWindow((w) => ({ ...w, width: v }))}
                      />
                      <Field
                        label="Height (in)"
                        type="number"
                        value={newWindow.height}
                        onChange={(v) => setNewWindow((w) => ({ ...w, height: v }))}
                      />
                      <div style={{ marginBottom: 14 }}>
                        <label style={labelStyle}>Kind</label>
                        <select
                          value={newWindow.kind}
                          onChange={(e) => setNewWindow((w) => ({ ...w, kind: e.target.value }))}
                          style={fieldStyle}
                        >
                          <option value="new">New Construction</option>
                          <option value="replacement">Replacement</option>
                        </select>
                      </div>
                      <div style={{ marginBottom: 14 }}>
                        <label style={labelStyle}>&nbsp;</label>
                        <button
                          style={{ ...btnStyle(true), padding: '8px 12px' }}
                          onClick={addWindowToEdit}
                        >
                          +
                        </button>
                      </div>
                    </div>
                    {(editingRoom.windows || []).map((w, i) => (
                      <div
                        key={i}
                        style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginBottom: 3 }}
                      >
                        Window {i + 1}: {w.width}"×{w.height}" — {w.kind}
                        <button
                          onClick={() =>
                            setEditingRoom((r) => ({
                              ...r,
                              windows: r.windows.filter((_, j) => j !== i),
                            }))
                          }
                          style={{
                            marginLeft: 8,
                            background: 'none',
                            border: 'none',
                            color: '#f44',
                            cursor: 'pointer',
                            fontSize: 12,
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <button style={btnStyle(true)} onClick={saveEditRoom}>
                      Save Room
                    </button>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                <button style={btnStyle(false)} onClick={() => setStep(1)}>
                  ← Back
                </button>
                <button style={btnStyle(true)} onClick={() => setStep(3)}>
                  Next: Openings →
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Doors & Windows summary / reminder */}
          {step === 3 && (
            <div>
              {sectionHeader('Doors & Windows Summary')}
              {rooms.length === 0 && (
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 18 }}>
                  No rooms added. Go back to add rooms and attach doors/windows via the Edit button.
                </div>
              )}
              {rooms.map((r) => (
                <div
                  key={r.id}
                  style={{
                    marginBottom: 14,
                    padding: '12px 14px',
                    background: 'rgba(255,255,255,0.05)',
                    borderRadius: 8,
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>
                    {r.name}{' '}
                    <span style={{ fontSize: 11, color: '#E07B2A' }}>
                      ({r.type} · Floor {r.floor || '1'})
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
                    {(r.doors || []).length === 0
                      ? 'No doors'
                      : `${(r.doors || []).length} door(s): ${(r.doors || []).map((d) => `${d.width}"×${d.height}"`).join(', ')}`}
                    &nbsp;·&nbsp;
                    {(r.windows || []).length === 0
                      ? 'No windows'
                      : `${(r.windows || []).length} window(s): ${(r.windows || []).map((w) => `${w.width}"×${w.height}"`).join(', ')}`}
                  </div>
                  <button
                    onClick={() => {
                      openEditRoom(r);
                      setStep(2);
                    }}
                    style={{ ...btnStyle(false), padding: '4px 10px', fontSize: 11, marginTop: 8 }}
                  >
                    Edit Openings
                  </button>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                <button style={btnStyle(false)} onClick={() => setStep(2)}>
                  ← Back
                </button>
                <button style={btnStyle(true)} onClick={() => setStep(4)}>
                  Next: Prices →
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Material Unit Prices */}
          {step === 4 && (
            <div>
              {sectionHeader('Material Unit Prices')}
              <p
                style={{
                  fontSize: 12,
                  color: 'rgba(255,255,255,0.55)',
                  marginTop: -6,
                  marginBottom: 16,
                }}
              >
                Pre-filled with typical defaults. Adjust as needed.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
                {Object.entries(prices).map(([key, val]) => {
                  const labels = {
                    concrete: 'Concrete Ready-Mix (per CY)',
                    floorJoists: 'Floor Joists (per pc)',
                    rimBoard: 'Rim Board (per lin ft)',
                    subfloor: 'Subfloor (per sheet)',
                    studs: 'Studs (per pc)',
                    plates: 'Plates (per lin ft)',
                    headers: 'Headers (per pc)',
                    trusses: 'Trusses (per pc)',
                    wallSheathing: 'Wall Sheathing (per sheet)',
                    roofSheathing: 'Roof Sheathing (per sheet)',
                    roofingSquares: 'Roofing (per square)',
                    underlayment: 'Underlayment (per roll)',
                    insulation: 'Batt Insulation (per roll)',
                    sprayFoamWall: 'Spray Foam — Walls (per sq ft)',
                    sprayFoamRoof: 'Spray Foam — Hot Roof (per sq ft)',
                    drywall: '½" Drywall (per sheet)',
                    blueBoard: '½" Blue Board (per sheet)',
                    typeXDrywall: '5/8" Type X Fire-Rated (per sheet)',
                    greenBoard: 'Green/Purple Board (per sheet)',
                    jointCompound: 'Joint Compound 4.5 gal (per bag)',
                    skimCoat: 'Veneer Plaster / Skim Coat (per bag)',
                    primer: 'Primer (per gal)',
                    paint: 'Wall Paint — finish (per gal)',
                    ceilingPaint: 'Ceiling Paint — flat (per gal)',
                    hardwood: 'Hardwood Flooring (per sq ft)',
                    vinylPlank: 'Vinyl Plank LVP (per sq ft)',
                    carpetSY: 'Carpet + Pad (per sq yard)',
                    tile: 'Floor Tile (per sq ft)',
                    cabinetLinFt: 'Kitchen Cabinets (per lin ft)',
                    baseboard: 'Baseboard (per lin ft)',
                    doorCasing: 'Door Casing (per lin ft)',
                    windowCasing: 'Window Casing (per lin ft)',
                    outlet: 'Standard Outlet (per pc)',
                    gfiOutlet: 'GFI Outlet (per pc)',
                    lightSwitch: 'Light Switch (per pc)',
                    lightFixture: 'Light Fixture (per pc)',
                    recessedLight: 'Recessed Light (per pc)',
                    hvacFurnace: 'Furnace / Air Handler',
                    hvacCondenser: 'A/C Condenser (outdoor)',
                    hvacDuctRun: 'Duct Run (per supply)',
                    hvacVent: 'Supply Vent / Register',
                    hvacReturn: 'Return Air Grille',
                    hvacThermostat: 'Thermostat',
                    miniSplitHead: 'Mini-Split Indoor Head',
                    miniSplitOutdoor: 'Mini-Split Outdoor Unit',
                    baseboardHeater: 'Electric Baseboard Heater / Steam Radiator',
                    radiantTubing: 'Radiant PEX Tubing (per lin ft)',
                    boiler: 'Boiler (steam / radiant / hot water)',
                    hwBaseboard: 'Hot Water Baseboard Fin-Tube (per lin ft)',
                    expansionTank: 'Expansion Tank',
                    circulatorPump: 'Circulator Pump',
                    passageSet: 'Passage Set — Hall / Closet (per pc)',
                    privacySet: 'Privacy Set — Bedroom / Bath (per pc)',
                    keyedSet: 'Keyed Entry Set — Exterior (per pc)',
                    garageDoor: 'Overhead Garage Door (per door)',
                    garageDoorOpener: 'Garage Door Opener (per opener)',
                  };
                  return (
                    <div key={key} style={{ marginBottom: 14 }}>
                      <label style={labelStyle}>{labels[key] || key}</label>
                      <div style={{ position: 'relative' }}>
                        <span
                          style={{
                            position: 'absolute',
                            left: 10,
                            top: '50%',
                            transform: 'translateY(-50%)',
                            color: 'rgba(255,255,255,0.6)',
                            fontSize: 13,
                            pointerEvents: 'none',
                          }}
                        >
                          $
                        </span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={val}
                          onChange={(e) =>
                            setPrices((p) => ({ ...p, [key]: parseFloat(e.target.value) || 0 }))
                          }
                          style={{ ...fieldStyle, paddingLeft: 22 }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                <button style={btnStyle(false)} onClick={() => setStep(3)}>
                  ← Back
                </button>
                <button style={{ ...btnStyle(true), background: '#2a7e4f' }} onClick={handleSubmit}>
                  Calculate →
                </button>
              </div>
            </div>
          )}

          {/* Step 5: Results */}
          {step === 5 && results && (
            <div>
              {sectionHeader('Material Take-Off Results')}

              {/* Save to Job panel */}
              <div
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  borderRadius: 8,
                  padding: '12px 16px',
                  marginBottom: 20,
                  display: 'flex',
                  gap: 10,
                  alignItems: 'center',
                  flexWrap: 'wrap',
                }}
              >
                <span
                  style={{
                    fontSize: 12,
                    color: 'rgba(255,255,255,0.7)',
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                  }}
                >
                  💾 Save to Job:
                </span>
                <select
                  value={saveJobId}
                  onChange={(e) => {
                    setSaveJobId(e.target.value);
                    setSaveStatus('');
                  }}
                  style={{ ...fieldStyle, flex: 1, minWidth: 180, maxWidth: 340 }}
                >
                  <option value="">— Select a job —</option>
                  {jobs.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.pb_number ? `${j.pb_number} · ` : ''}
                      {j.customer_name || '—'}
                      {j.project_address ? ` · ${j.project_address}` : ''}
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleSaveToJob}
                  disabled={!saveJobId || saveStatus === 'saving'}
                  style={{
                    ...btnStyle(true),
                    padding: '8px 18px',
                    background:
                      saveStatus === 'saved'
                        ? '#059669'
                        : saveStatus === 'error'
                          ? '#C62828'
                          : '#E07B2A',
                    opacity: !saveJobId || saveStatus === 'saving' ? 0.5 : 1,
                  }}
                >
                  {saveStatus === 'saving'
                    ? 'Saving…'
                    : saveStatus === 'saved'
                      ? '✓ Saved'
                      : saveStatus === 'error'
                        ? '✗ Error'
                        : 'Save'}
                </button>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
                  Attaches full take-off data to the selected job.
                </span>
              </div>

              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 12 }}>
                ✏️ Qty and Unit are editable — adjust any row to fine-tune. Unit price edits update
                all rows sharing that price.
              </div>

              {groups.map((group) => (
                <div key={group} style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#E07B2A', marginBottom: 8 }}>
                    {group}
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr
                        style={{
                          color: 'rgba(255,255,255,0.45)',
                          borderBottom: '1px solid rgba(255,255,255,0.08)',
                        }}
                      >
                        <th style={{ textAlign: 'left', padding: '5px 8px' }}>Material</th>
                        <th style={{ textAlign: 'right', padding: '5px 8px' }}>Qty</th>
                        <th style={{ textAlign: 'left', padding: '5px 8px' }}>Unit</th>
                        <th style={{ textAlign: 'right', padding: '5px 8px' }}>Unit Price</th>
                        <th style={{ textAlign: 'right', padding: '5px 8px' }}>Line Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.map((m, globalIdx) =>
                        m.group !== group ? null : (
                          <tr
                            key={globalIdx}
                            style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
                          >
                            <td style={{ padding: '7px 8px' }}>{m.name}</td>
                            <td style={{ padding: '5px 8px', textAlign: 'right' }}>
                              <input
                                type="number"
                                min="0"
                                step="1"
                                value={m.qty}
                                onChange={(e) => {
                                  const newQty = Math.max(0, parseFloat(e.target.value) || 0);
                                  setResults((prev) =>
                                    prev.map((r, ri) =>
                                      ri === globalIdx
                                        ? {
                                            ...r,
                                            qty: newQty,
                                            total:
                                              r.unitPrice != null ? newQty * r.unitPrice : r.total,
                                          }
                                        : r,
                                    ),
                                  );
                                }}
                                style={{
                                  width: 68,
                                  background: 'rgba(255,255,255,0.07)',
                                  border: '1px solid rgba(255,255,255,0.15)',
                                  borderRadius: 4,
                                  color: 'white',
                                  padding: '3px 6px',
                                  fontSize: 12,
                                  textAlign: 'right',
                                  fontWeight: 600,
                                }}
                              />
                            </td>
                            <td style={{ padding: '5px 8px' }}>
                              <select
                                value={m.unit}
                                onChange={(e) =>
                                  setResults((prev) =>
                                    prev.map((r, ri) =>
                                      ri === globalIdx ? { ...r, unit: e.target.value } : r,
                                    ),
                                  )
                                }
                                style={{
                                  background: 'rgba(255,255,255,0.07)',
                                  border: '1px solid rgba(255,255,255,0.15)',
                                  borderRadius: 4,
                                  color: 'white',
                                  padding: '3px 5px',
                                  fontSize: 11,
                                }}
                              >
                                {[
                                  'pcs',
                                  'lin ft',
                                  'sq ft',
                                  'sq yd',
                                  'sheets',
                                  'rolls',
                                  'bags',
                                  'gal',
                                  'CY',
                                  'squares',
                                  'runs',
                                  'doors',
                                  'windows',
                                ].map((u) => (
                                  <option key={u} value={u}>
                                    {u}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td style={{ padding: '7px 8px', textAlign: 'right' }}>
                              {m.priceKey ? (
                                <div style={{ display: 'inline-flex', alignItems: 'center' }}>
                                  <span style={{ color: 'rgba(255,255,255,0.4)', marginRight: 2 }}>
                                    $
                                  </span>
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={m.unitPrice}
                                    onChange={(e) => {
                                      const newPrice = parseFloat(e.target.value) || 0;
                                      setPrices((p) => ({ ...p, [m.priceKey]: newPrice }));
                                      setResults((prev) =>
                                        prev.map((r) =>
                                          r.priceKey === m.priceKey
                                            ? { ...r, unitPrice: newPrice, total: r.qty * newPrice }
                                            : r,
                                        ),
                                      );
                                    }}
                                    style={{
                                      width: 70,
                                      background: 'rgba(255,255,255,0.07)',
                                      border: '1px solid rgba(255,255,255,0.15)',
                                      borderRadius: 4,
                                      color: 'white',
                                      padding: '3px 6px',
                                      fontSize: 12,
                                      textAlign: 'right',
                                    }}
                                  />
                                </div>
                              ) : (
                                <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>
                                  see sub
                                </span>
                              )}
                            </td>
                            <td
                              style={{
                                padding: '7px 8px',
                                textAlign: 'right',
                                color: '#E07B2A',
                                fontWeight: 600,
                              }}
                            >
                              {m.total !== null
                                ? `$${m.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                : '—'}
                            </td>
                          </tr>
                        ),
                      )}
                    </tbody>
                  </table>
                </div>
              ))}

              <div
                style={{
                  borderTop: '2px solid #E07B2A',
                  paddingTop: 14,
                  marginTop: 8,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span style={{ fontWeight: 700, fontSize: 16 }}>Grand Total</span>
                <span style={{ fontWeight: 700, fontSize: 20, color: '#E07B2A' }}>
                  $
                  {grandTotal.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: 20 }}>
                <button
                  style={btnStyle(false)}
                  onClick={() => {
                    setStep(0);
                    setResults(null);
                    setSaveStatus('');
                  }}
                >
                  ← Start Over
                </button>
                <button style={{ ...btnStyle(false), marginLeft: 10 }} onClick={() => setStep(4)}>
                  ← Edit Prices
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
