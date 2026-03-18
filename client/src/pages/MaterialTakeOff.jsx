import { useState } from 'react';

const STEPS = ['Building', 'Spacing & HVAC', 'Rooms', 'Openings', 'Prices', 'Results'];

const DEFAULT_PRICES = {
  floorJoists: 9.00,
  rimBoard: 0.90,
  subfloor: 32.00,
  studs: 8.50,
  plates: 0.90,
  headers: 12.00,
  trusses: 28.00,
  wallSheathing: 22.00,
  roofSheathing: 22.00,
  roofingSquares: 110.00,
  underlayment: 35.00,
  insulation: 45.00,
  drywall: 16.00,
  paint: 35.00,
  flooring: 4.50,
  tile: 3.50,
  cabinetLinFt: 150.00,
  baseboard: 1.20,
  doorCasing: 1.20,
  windowCasing: 1.20,
  outlet: 3.50,
  gfiOutlet: 18.00,
  lightSwitch: 3.00,
  lightFixture: 45.00,
  recessedLight: 28.00,
  hvacFurnace: 2800.00,
  hvacCondenser: 3200.00,
  hvacDuctRun: 45.00,
  hvacVent: 12.00,
  hvacReturn: 18.00,
  hvacThermostat: 85.00,
  miniSplitHead: 950.00,
  miniSplitOutdoor: 2400.00,
  baseboardHeater: 85.00,
  radiantTubing: 1.50,
  boiler: 4500.00,
};

const ROOM_TYPES = ['Living Room', 'Bedroom', 'Bathroom', 'Kitchen', 'Dining Room', 'Office', 'Hallway', 'Garage', 'Other'];

function calcSlope(pitch) {
  return Math.sqrt(1 + Math.pow(pitch / 12, 2));
}

function runCalcs(building, studSpacing, trussSpacing, rooms, prices, heatingType) {
  const { length, width, floors, wallHeight, pitch, overhang } = building;
  const L = parseFloat(length) || 0;
  const W = parseFloat(width) || 0;
  const FL = parseInt(floors) || 1;
  const WH = parseFloat(wallHeight) || 9;
  const P = parseFloat(pitch) || 4;
  const OH = parseFloat(overhang) || 2;
  const studOC = studSpacing === '16' ? 16 : 24;
  const trussOC = trussSpacing === '16' ? 16 : 24;

  const perimeterExt = 2 * (L + W);

  const extWallArea = perimeterExt * WH * FL;
  const slopeMultiplier = calcSlope(P);
  const roofArea = (L + 2 * OH) * (W + 2 * OH) * slopeMultiplier;

  const studCount = Math.ceil((perimeterExt / (studOC / 12)) + perimeterExt / 8) * FL;
  const plateLinFt = perimeterExt * FL * 3;
  const roofTrusses = Math.ceil((L / (trussOC / 12)) + 1);
  const floorJoistCount = Math.ceil((L / (studOC / 12)) + 1) * FL;
  const rimBoardLinFt = perimeterExt * FL;

  const wallSheathingSheets = Math.ceil(extWallArea / 32);
  const roofSheathingSheets = Math.ceil(roofArea / 32);
  const subfloorSheets = Math.ceil((L * W * FL) / 32);

  const insulationRolls = Math.ceil(extWallArea / 40);

  let intWallArea = 0;
  let bathroomArea = 0;
  let totalFloorArea = 0;
  let totalDoors = 0;
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

  for (const room of rooms) {
    const rL = parseFloat(room.length) || 0;
    const rW = parseFloat(room.width) || 0;
    const rArea = rL * rW;
    const rPerim = 2 * (rL + rW);
    totalFloorArea += rArea;
    intWallArea += rPerim * WH;

    if (room.type === 'Bathroom' && room.isFullBath !== false) bathroomArea += rArea;
    if (room.type === 'Kitchen') cabinetLF += parseFloat(room.cabinetLength) || 0;

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

    for (const door of (room.doors || [])) {
      totalDoors++;
      headerCount++;
      const dW = parseFloat(door.width) / 12 || 3;
      const dH = parseFloat(door.height) / 12 || 7;
      doorCasingLF += 2 * dH + dW;
    }
    for (const win of (room.windows || [])) {
      totalWindows++;
      headerCount++;
      const wW = parseFloat(win.width) / 12 || 3;
      const wH = parseFloat(win.height) / 12 || 3;
      windowCasingLF += 2 * wH + wW;
    }
  }

  const drywallSheets = Math.ceil((extWallArea + intWallArea) / 32);
  const paintGallons = Math.ceil((extWallArea + intWallArea) / 350);
  const flooringArea = totalFloorArea > 0 ? totalFloorArea : L * W * FL;
  const roofingSquares = Math.ceil(roofArea / 100);
  const underlaymentRolls = roofArea > 0 ? Math.ceil(roofArea / 1000) : 0;
  const tileArea = bathroomArea;

  const baseboardLF = Math.ceil(
    rooms.reduce((acc, r) => acc + 2 * ((parseFloat(r.length) || 0) + (parseFloat(r.width) || 0)), 0) ||
    perimeterExt * FL
  );

  const totalBuildingSF = L * W * FL;
  const heatedRoomCount = rooms.filter(r => r.type !== 'Garage').length || Math.max(FL * 3, 1);

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
      { name: 'A/C Condenser (outdoor)', qty: condenserCount, unit: 'pcs', priceKey: 'hvacCondenser' },
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
      { name: 'Mini-Split Outdoor Unit', qty: outdoorUnits, unit: 'pcs', priceKey: 'miniSplitOutdoor' },
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
      { name: 'Radiant Floor Tubing (PEX)', qty: tubingLF, unit: 'lin ft', priceKey: 'radiantTubing' },
      { name: 'Boiler', qty: boilers, unit: 'pcs', priceKey: 'boiler' },
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

  const materials = [
    { group: '1 · Floor System', name: 'Floor Joists', qty: floorJoistCount, unit: 'pcs', priceKey: 'floorJoists' },
    { group: '1 · Floor System', name: 'Rim Board', qty: Math.ceil(rimBoardLinFt), unit: 'lin ft', priceKey: 'rimBoard' },
    { group: '1 · Floor System', name: 'Subfloor Sheathing', qty: subfloorSheets, unit: 'sheets', priceKey: 'subfloor' },
    { group: '2 · Wall Framing', name: 'Studs', qty: studCount, unit: 'pcs', priceKey: 'studs' },
    { group: '2 · Wall Framing', name: 'Plates (top & bottom)', qty: Math.ceil(plateLinFt), unit: 'lin ft', priceKey: 'plates' },
    { group: '2 · Wall Framing', name: 'Headers (doors & windows)', qty: headerCount, unit: 'pcs', priceKey: 'headers' },
    { group: '2 · Wall Framing', name: 'Wall Sheathing', qty: wallSheathingSheets, unit: 'sheets', priceKey: 'wallSheathing' },
    { group: '3 · Roof Structure', name: 'Roof Trusses', qty: roofTrusses, unit: 'pcs', priceKey: 'trusses' },
    { group: '3 · Roof Structure', name: 'Roof Sheathing', qty: roofSheathingSheets, unit: 'sheets', priceKey: 'roofSheathing' },
    { group: '4 · Roofing', name: 'Roofing', qty: roofingSquares, unit: 'squares', priceKey: 'roofingSquares' },
    { group: '4 · Roofing', name: 'Underlayment', qty: underlaymentRolls, unit: 'rolls', priceKey: 'underlayment' },
    { group: '5 · Insulation', name: 'Insulation', qty: insulationRolls, unit: 'rolls', priceKey: 'insulation' },
    { group: '6 · Drywall', name: 'Drywall', qty: drywallSheets, unit: 'sheets', priceKey: 'drywall' },
    { group: '7 · Paint', name: 'Paint', qty: paintGallons, unit: 'gal', priceKey: 'paint' },
    { group: '8 · Flooring', name: 'Flooring', qty: Math.ceil(flooringArea), unit: 'sq ft', priceKey: 'flooring' },
    { group: '8 · Flooring', name: 'Tile (Bathrooms)', qty: Math.ceil(tileArea), unit: 'sq ft', priceKey: 'tile' },
    { group: '9 · Electrical Rough-In', name: 'Standard Outlets', qty: totalOutlets, unit: 'pcs', priceKey: 'outlet' },
    { group: '9 · Electrical Rough-In', name: 'GFI Outlets (kitchen / bath / garage)', qty: totalGFI, unit: 'pcs', priceKey: 'gfiOutlet' },
    { group: '9 · Electrical Rough-In', name: 'Light Switches', qty: totalSwitches, unit: 'pcs', priceKey: 'lightSwitch' },
    { group: '9 · Electrical Rough-In', name: 'Light Fixtures (center mount)', qty: totalLightFixtures, unit: 'pcs', priceKey: 'lightFixture' },
    { group: '9 · Electrical Rough-In', name: 'Recessed Lights', qty: totalRecessedLights, unit: 'pcs', priceKey: 'recessedLight' },
    ...hvacItems.map(h => ({ group: '10 · HVAC / Heating', ...h })),
    { group: '11 · Cabinets', name: 'Kitchen Cabinets (rough layout)', qty: Math.ceil(cabinetLF), unit: 'lin ft', priceKey: 'cabinetLinFt' },
    { group: '12 · Trim / Molding', name: 'Baseboard (floor perimeter)', qty: baseboardLF, unit: 'lin ft', priceKey: 'baseboard' },
    { group: '12 · Trim / Molding', name: 'Door Casing', qty: Math.ceil(doorCasingLF), unit: 'lin ft', priceKey: 'doorCasing' },
    { group: '12 · Trim / Molding', name: 'Window Casing', qty: Math.ceil(windowCasingLF), unit: 'lin ft', priceKey: 'windowCasing' },
  ];

  return materials.map(m => ({
    ...m,
    unitPrice: prices[m.priceKey] ?? 0,
    total: (m.qty * (prices[m.priceKey] ?? 0)),
  }));
}

const sectionHeader = (label) => (
  <div style={{ fontSize: 13, fontWeight: 700, color: '#E07B2A', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12, borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: 6 }}>
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

const labelStyle = { fontSize: 12, color: 'rgba(255,255,255,0.7)', marginBottom: 4, display: 'block' };

function Field({ label, value, onChange, type = 'text', min, step, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={labelStyle}>{label}</label>
      {children || (
        <input
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
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
      <select value={value} onChange={e => onChange(e.target.value)} style={{ ...fieldStyle }}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
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
  const [building, setBuilding] = useState({ length: '', width: '', floors: '1', wallHeight: '9', pitch: '4', overhang: '2' });
  const [studSpacing, setStudSpacing] = useState('16');
  const [trussSpacing, setTrussSpacing] = useState('24');
  const [heatingType, setHeatingType] = useState('forced_air');
  const [rooms, setRooms] = useState([]);
  const [prices, setPrices] = useState({ ...DEFAULT_PRICES });
  const [results, setResults] = useState(null);
  const [newRoom, setNewRoom] = useState({ name: '', type: 'Bedroom', floor: '1', length: '', width: '', cabinetLength: '', isFullBath: true, lightingType: 'center', doors: [], windows: [] });
  const [newDoor, setNewDoor] = useState({ width: '36', height: '80', side: 'interior', type: 'Swing' });
  const [newWindow, setNewWindow] = useState({ width: '36', height: '48', kind: 'new' });
  const [editingRoom, setEditingRoom] = useState(null);

  const setB = (k, v) => setBuilding(b => ({ ...b, [k]: v }));

  function handleSubmit() {
    const r = runCalcs(building, studSpacing, trussSpacing, rooms, prices, heatingType);
    setResults(r);
    setStep(5);
  }

  function addRoom() {
    if (!newRoom.name) return;
    setRooms(prev => [...prev, { ...newRoom, id: Date.now() }]);
    setNewRoom({ name: '', type: 'Bedroom', floor: '1', length: '', width: '', cabinetLength: '', isFullBath: true, lightingType: 'center', doors: [], windows: [] });
  }

  function removeRoom(id) {
    setRooms(prev => prev.filter(r => r.id !== id));
  }

  function openEditRoom(room) {
    setEditingRoom({ ...room, doors: room.doors || [], windows: room.windows || [] });
  }

  function saveEditRoom() {
    setRooms(prev => prev.map(r => r.id === editingRoom.id ? editingRoom : r));
    setEditingRoom(null);
  }

  function addDoorToEdit() {
    setEditingRoom(r => ({ ...r, doors: [...(r.doors || []), { ...newDoor }] }));
  }

  function addWindowToEdit() {
    setEditingRoom(r => ({ ...r, windows: [...(r.windows || []), { ...newWindow }] }));
  }

  const grandTotal = results ? results.reduce((s, m) => s + m.total, 0) : 0;
  const groups = results ? [...new Set(results.map(m => m.group))] : [];

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
        <div key={s} style={{
          padding: '5px 14px',
          borderRadius: 20,
          fontSize: 12,
          fontWeight: 600,
          background: i === step ? '#E07B2A' : i < step ? 'rgba(224,123,42,0.3)' : 'rgba(255,255,255,0.1)',
          color: 'white',
          cursor: i < step ? 'pointer' : 'default',
        }} onClick={() => { if (i < step) setStep(i); }}>{s}</div>
      ))}
    </div>
  );

  return (
    <div style={{ padding: '32px 24px', background: '#f4f6fb', minHeight: '100vh' }}>
      <div style={{ maxWidth: 860, margin: '0 auto' }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1B3A6B', margin: 0 }}>📐 Material Take-Off</h1>
          <p style={{ fontSize: 13, color: '#666', marginTop: 6 }}>Enter building details to calculate material quantities and estimated costs.</p>
        </div>

        <div style={card}>
          {stepBar}

          {/* Step 0: Building Dimensions */}
          {step === 0 && (
            <div>
              {sectionHeader('Building Dimensions')}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
                <Field label="Building Length (ft)" type="number" min="1" value={building.length} onChange={v => setB('length', v)} />
                <Field label="Building Width (ft)" type="number" min="1" value={building.width} onChange={v => setB('width', v)} />
                <Field label="Number of Floors" type="number" min="1" value={building.floors} onChange={v => setB('floors', v)} />
                <Field label="Wall Height (ft)" type="number" min="1" step="0.5" value={building.wallHeight} onChange={v => setB('wallHeight', v)} />
                <Field label="Roof Pitch (x/12)" type="number" min="0" step="0.5" value={building.pitch} onChange={v => setB('pitch', v)} />
                <Field label="Roof Overhang (ft)" type="number" min="0" step="0.5" value={building.overhang} onChange={v => setB('overhang', v)} />
              </div>
              <div style={{ textAlign: 'right', marginTop: 8 }}>
                <button style={btnStyle(true)} onClick={() => setStep(1)}>Next: Spacing →</button>
              </div>
            </div>
          )}

          {/* Step 1: Spacing & Systems */}
          {step === 1 && (
            <div>
              {sectionHeader('Framing Spacing')}
              <Select label='Stud Spacing' value={studSpacing} onChange={setStudSpacing} options={[{ value: '16', label: '16" o.c.' }, { value: '24', label: '24" o.c.' }]} />
              <Select label='Truss Spacing' value={trussSpacing} onChange={setTrussSpacing} options={[{ value: '16', label: '16" o.c.' }, { value: '24', label: '24" o.c.' }]} />
              <div style={{ marginTop: 20 }}>{sectionHeader('Heating / HVAC System')}</div>
              <Select label='System Type' value={heatingType} onChange={setHeatingType} options={[
                { value: 'forced_air', label: 'Forced Air (furnace + A/C + ductwork)' },
                { value: 'mini_split', label: 'Mini-Split (indoor heads + outdoor unit)' },
                { value: 'baseboard', label: 'Electric Baseboard Heat' },
                { value: 'radiant', label: 'Radiant Floor (PEX tubing + boiler)' },
                { value: 'steam', label: 'Steam (boiler + radiators)' },
              ]} />
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: -8, marginBottom: 12, lineHeight: 1.5 }}>
                {heatingType === 'forced_air' && 'Standard ducted system — furnace, condenser, supply runs & returns per room.'}
                {heatingType === 'mini_split' && 'Ductless — one wall-mounted head per room, outdoor unit(s) sized to building.'}
                {heatingType === 'baseboard' && 'Electric baseboard heater in each room with individual thermostats.'}
                {heatingType === 'radiant' && 'In-floor PEX tubing loops connected to a boiler, zoned by floor.'}
                {heatingType === 'steam' && 'Steam boiler with radiators — less common in new construction.'}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                <button style={btnStyle(false)} onClick={() => setStep(0)}>← Back</button>
                <button style={btnStyle(true)} onClick={() => setStep(2)}>Next: Rooms →</button>
              </div>
            </div>
          )}

          {/* Step 2: Rooms */}
          {step === 2 && (
            <div>
              {sectionHeader('Floors & Rooms')}
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr auto', gap: 8, alignItems: 'end' }}>
                  <Field label="Room Name" value={newRoom.name} onChange={v => setNewRoom(r => ({ ...r, name: v }))} />
                  <Field label="Floor #" type="number" min="1" value={newRoom.floor} onChange={v => setNewRoom(r => ({ ...r, floor: v }))} />
                  <Field label="Length (ft)" type="number" min="1" value={newRoom.length} onChange={v => setNewRoom(r => ({ ...r, length: v }))} />
                  <Field label="Width (ft)" type="number" min="1" value={newRoom.width} onChange={v => setNewRoom(r => ({ ...r, width: v }))} />
                  <div style={{ marginBottom: 14 }}>
                    <label style={labelStyle}>Type</label>
                    <select value={newRoom.type} onChange={e => setNewRoom(r => ({ ...r, type: e.target.value }))} style={fieldStyle}>
                      {ROOM_TYPES.map(t => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                  <div style={{ marginBottom: 14 }}>
                    <label style={labelStyle}>&nbsp;</label>
                    <button style={{ ...btnStyle(true), padding: '8px 14px' }} onClick={addRoom}>+ Add</button>
                  </div>
                </div>
                {newRoom.type === 'Kitchen' && (
                  <div style={{ maxWidth: 250, marginTop: 4 }}>
                    <Field label="Cabinet Length (lin ft)" type="number" min="0" value={newRoom.cabinetLength} onChange={v => setNewRoom(r => ({ ...r, cabinetLength: v }))} />
                  </div>
                )}
                {newRoom.type === 'Bathroom' && (
                  <div style={{ marginTop: 4, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="checkbox" checked={newRoom.isFullBath} onChange={e => setNewRoom(r => ({ ...r, isFullBath: e.target.checked }))} id="newRoomFullBath" />
                    <label htmlFor="newRoomFullBath" style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>Full bathroom (includes tub/shower tile)</label>
                  </div>
                )}
                <div style={{ maxWidth: 280, marginTop: 4 }}>
                  <div style={{ marginBottom: 14 }}>
                    <label style={labelStyle}>Lighting Type</label>
                    <select value={newRoom.lightingType} onChange={e => setNewRoom(r => ({ ...r, lightingType: e.target.value }))} style={fieldStyle}>
                      <option value="center">Center Fixture (1 per room)</option>
                      <option value="recessed">Recessed Lighting (multiple)</option>
                    </select>
                  </div>
                </div>
              </div>

              {rooms.length > 0 && (
                <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 18, fontSize: 13 }}>
                  <thead>
                    <tr style={{ color: 'rgba(255,255,255,0.5)', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
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
                    {rooms.map(r => (
                      <tr key={r.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                        <td style={{ padding: '7px 8px' }}>{r.name}</td>
                        <td style={{ padding: '7px 8px', color: '#E07B2A' }}>{r.type}</td>
                        <td style={{ padding: '7px 8px', textAlign: 'center' }}>{r.floor || '1'}</td>
                        <td style={{ padding: '7px 8px', textAlign: 'center' }}>{r.length}×{r.width}</td>
                        <td style={{ padding: '7px 8px', textAlign: 'center' }}>{(r.doors || []).length}</td>
                        <td style={{ padding: '7px 8px', textAlign: 'center' }}>{(r.windows || []).length}</td>
                        <td style={{ padding: '7px 8px', fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
                          {r.type === 'Kitchen' && r.cabinetLength ? `Cab: ${r.cabinetLength}ft · ` : ''}
                          {r.type === 'Bathroom' ? (r.isFullBath ? 'Full bath · ' : 'Half bath · ') : ''}
                          {(r.lightingType || 'center') === 'recessed' ? '💡 Recessed' : '💡 Center'}
                        </td>
                        <td style={{ padding: '7px 8px', textAlign: 'right', display: 'flex', gap: 6 }}>
                          <button onClick={() => openEditRoom(r)} style={{ ...btnStyle(false), padding: '4px 10px', fontSize: 11 }}>Edit</button>
                          <button onClick={() => removeRoom(r.id)} style={{ ...btnStyle(false), padding: '4px 10px', fontSize: 11, background: 'rgba(200,60,60,0.3)' }}>✕</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {editingRoom && (
                <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, padding: 16, marginBottom: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Editing: {editingRoom.name} <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>(Floor {editingRoom.floor || '1'}, {editingRoom.type})</span></div>
                  {editingRoom.type === 'Kitchen' && (
                    <div style={{ maxWidth: 250, marginBottom: 12 }}>
                      <Field label="Cabinet Length (lin ft)" type="number" min="0" value={editingRoom.cabinetLength || ''} onChange={v => setEditingRoom(r => ({ ...r, cabinetLength: v }))} />
                    </div>
                  )}
                  {editingRoom.type === 'Bathroom' && (
                    <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input type="checkbox" checked={editingRoom.isFullBath !== false} onChange={e => setEditingRoom(r => ({ ...r, isFullBath: e.target.checked }))} id="editRoomFullBath" />
                      <label htmlFor="editRoomFullBath" style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>Full bathroom (includes tub/shower tile)</label>
                    </div>
                  )}
                  <div style={{ maxWidth: 280, marginBottom: 12 }}>
                    <div style={{ marginBottom: 14 }}>
                      <label style={labelStyle}>Lighting Type</label>
                      <select value={editingRoom.lightingType || 'center'} onChange={e => setEditingRoom(r => ({ ...r, lightingType: e.target.value }))} style={fieldStyle}>
                        <option value="center">Center Fixture (1 per room)</option>
                        <option value="recessed">Recessed Lighting (multiple)</option>
                      </select>
                    </div>
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 12, color: '#E07B2A', marginBottom: 8 }}>Add Door</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr auto', gap: 8, alignItems: 'end' }}>
                      <Field label='Width (in)' type="number" value={newDoor.width} onChange={v => setNewDoor(d => ({ ...d, width: v }))} />
                      <Field label='Height (in)' type="number" value={newDoor.height} onChange={v => setNewDoor(d => ({ ...d, height: v }))} />
                      <div style={{ marginBottom: 14 }}>
                        <label style={labelStyle}>Side</label>
                        <select value={newDoor.side} onChange={e => setNewDoor(d => ({ ...d, side: e.target.value }))} style={fieldStyle}>
                          <option value="interior">Interior</option>
                          <option value="exterior">Exterior</option>
                        </select>
                      </div>
                      <div style={{ marginBottom: 14 }}>
                        <label style={labelStyle}>Type</label>
                        <select value={newDoor.type} onChange={e => setNewDoor(d => ({ ...d, type: e.target.value }))} style={fieldStyle}>
                          <option>Swing</option><option>Pocket</option><option>Slider</option>
                        </select>
                      </div>
                      <div style={{ marginBottom: 14 }}>
                        <label style={labelStyle}>&nbsp;</label>
                        <button style={{ ...btnStyle(true), padding: '8px 12px' }} onClick={addDoorToEdit}>+</button>
                      </div>
                    </div>
                    {(editingRoom.doors || []).map((d, i) => (
                      <div key={i} style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginBottom: 3 }}>
                        Door {i+1}: {d.width}"×{d.height}" — {d.side}, {d.type}
                        <button onClick={() => setEditingRoom(r => ({ ...r, doors: r.doors.filter((_, j) => j !== i) }))} style={{ marginLeft: 8, background: 'none', border: 'none', color: '#f44', cursor: 'pointer', fontSize: 12 }}>✕</button>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 12, color: '#E07B2A', marginBottom: 8 }}>Add Window</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 8, alignItems: 'end' }}>
                      <Field label='Width (in)' type="number" value={newWindow.width} onChange={v => setNewWindow(w => ({ ...w, width: v }))} />
                      <Field label='Height (in)' type="number" value={newWindow.height} onChange={v => setNewWindow(w => ({ ...w, height: v }))} />
                      <div style={{ marginBottom: 14 }}>
                        <label style={labelStyle}>Kind</label>
                        <select value={newWindow.kind} onChange={e => setNewWindow(w => ({ ...w, kind: e.target.value }))} style={fieldStyle}>
                          <option value="new">New Construction</option>
                          <option value="replacement">Replacement</option>
                        </select>
                      </div>
                      <div style={{ marginBottom: 14 }}>
                        <label style={labelStyle}>&nbsp;</label>
                        <button style={{ ...btnStyle(true), padding: '8px 12px' }} onClick={addWindowToEdit}>+</button>
                      </div>
                    </div>
                    {(editingRoom.windows || []).map((w, i) => (
                      <div key={i} style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginBottom: 3 }}>
                        Window {i+1}: {w.width}"×{w.height}" — {w.kind}
                        <button onClick={() => setEditingRoom(r => ({ ...r, windows: r.windows.filter((_, j) => j !== i) }))} style={{ marginLeft: 8, background: 'none', border: 'none', color: '#f44', cursor: 'pointer', fontSize: 12 }}>✕</button>
                      </div>
                    ))}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <button style={btnStyle(true)} onClick={saveEditRoom}>Save Room</button>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                <button style={btnStyle(false)} onClick={() => setStep(1)}>← Back</button>
                <button style={btnStyle(true)} onClick={() => setStep(3)}>Next: Openings →</button>
              </div>
            </div>
          )}

          {/* Step 3: Doors & Windows summary / reminder */}
          {step === 3 && (
            <div>
              {sectionHeader('Doors & Windows Summary')}
              {rooms.length === 0 && (
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 18 }}>No rooms added. Go back to add rooms and attach doors/windows via the Edit button.</div>
              )}
              {rooms.map(r => (
                <div key={r.id} style={{ marginBottom: 14, padding: '12px 14px', background: 'rgba(255,255,255,0.05)', borderRadius: 8 }}>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>{r.name} <span style={{ fontSize: 11, color: '#E07B2A' }}>({r.type} · Floor {r.floor || '1'})</span></div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
                    {(r.doors || []).length === 0 ? 'No doors' : `${(r.doors || []).length} door(s): ${(r.doors || []).map(d => `${d.width}"×${d.height}"`).join(', ')}`}
                    &nbsp;·&nbsp;
                    {(r.windows || []).length === 0 ? 'No windows' : `${(r.windows || []).length} window(s): ${(r.windows || []).map(w => `${w.width}"×${w.height}"`).join(', ')}`}
                  </div>
                  <button onClick={() => { openEditRoom(r); setStep(2); }} style={{ ...btnStyle(false), padding: '4px 10px', fontSize: 11, marginTop: 8 }}>Edit Openings</button>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                <button style={btnStyle(false)} onClick={() => setStep(2)}>← Back</button>
                <button style={btnStyle(true)} onClick={() => setStep(4)}>Next: Prices →</button>
              </div>
            </div>
          )}

          {/* Step 4: Material Unit Prices */}
          {step === 4 && (
            <div>
              {sectionHeader('Material Unit Prices')}
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: -6, marginBottom: 16 }}>Pre-filled with typical defaults. Adjust as needed.</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
                {Object.entries(prices).map(([key, val]) => {
                  const labels = {
                    floorJoists: 'Floor Joists (per pc)', rimBoard: 'Rim Board (per lin ft)', subfloor: 'Subfloor (per sheet)',
                    studs: 'Studs (per pc)', plates: 'Plates (per lin ft)', headers: 'Headers (per pc)',
                    trusses: 'Trusses (per pc)',
                    wallSheathing: 'Wall Sheathing (per sheet)', roofSheathing: 'Roof Sheathing (per sheet)',
                    roofingSquares: 'Roofing (per square)', underlayment: 'Underlayment (per roll)',
                    insulation: 'Insulation (per roll)', drywall: 'Drywall (per sheet)',
                    paint: 'Paint (per gal)', flooring: 'Flooring (per sq ft)', tile: 'Tile (per sq ft)',
                    cabinetLinFt: 'Kitchen Cabinets (per lin ft)',
                    baseboard: 'Baseboard (per lin ft)', doorCasing: 'Door Casing (per lin ft)', windowCasing: 'Window Casing (per lin ft)',
                    outlet: 'Standard Outlet (per pc)', gfiOutlet: 'GFI Outlet (per pc)',
                    lightSwitch: 'Light Switch (per pc)', lightFixture: 'Light Fixture (per pc)', recessedLight: 'Recessed Light (per pc)',
                    hvacFurnace: 'Furnace / Air Handler', hvacCondenser: 'A/C Condenser (outdoor)',
                    hvacDuctRun: 'Duct Run (per supply)', hvacVent: 'Supply Vent / Register', hvacReturn: 'Return Air Grille',
                    hvacThermostat: 'Thermostat',
                    miniSplitHead: 'Mini-Split Indoor Head', miniSplitOutdoor: 'Mini-Split Outdoor Unit',
                    baseboardHeater: 'Baseboard Heater / Radiator', radiantTubing: 'Radiant PEX Tubing (per lin ft)',
                    boiler: 'Boiler',
                  };
                  return (
                    <Field key={key} label={labels[key] || key} type="number" step="0.01" value={val} onChange={v => setPrices(p => ({ ...p, [key]: parseFloat(v) || 0 }))} />
                  );
                })}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                <button style={btnStyle(false)} onClick={() => setStep(3)}>← Back</button>
                <button style={{ ...btnStyle(true), background: '#2a7e4f' }} onClick={handleSubmit}>Calculate →</button>
              </div>
            </div>
          )}

          {/* Step 5: Results */}
          {step === 5 && results && (
            <div>
              {sectionHeader('Material Take-Off Results')}
              {groups.map(group => (
                <div key={group} style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#E07B2A', marginBottom: 8 }}>{group}</div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ color: 'rgba(255,255,255,0.45)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                        <th style={{ textAlign: 'left', padding: '5px 8px' }}>Material</th>
                        <th style={{ textAlign: 'right', padding: '5px 8px' }}>Qty</th>
                        <th style={{ textAlign: 'left', padding: '5px 8px' }}>Unit</th>
                        <th style={{ textAlign: 'right', padding: '5px 8px' }}>Unit Price</th>
                        <th style={{ textAlign: 'right', padding: '5px 8px' }}>Line Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.filter(m => m.group === group).map((m, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                          <td style={{ padding: '7px 8px' }}>{m.name}</td>
                          <td style={{ padding: '7px 8px', textAlign: 'right', fontWeight: 600 }}>{m.qty.toLocaleString()}</td>
                          <td style={{ padding: '7px 8px', color: 'rgba(255,255,255,0.55)' }}>{m.unit}</td>
                          <td style={{ padding: '7px 8px', textAlign: 'right' }}>
                            <div style={{ display: 'inline-flex', alignItems: 'center' }}>
                              <span style={{ color: 'rgba(255,255,255,0.4)', marginRight: 2 }}>$</span>
                              <input
                                type="number"
                                step="0.01"
                                value={m.unitPrice}
                                onChange={e => {
                                  const newPrice = parseFloat(e.target.value) || 0;
                                  setPrices(p => ({ ...p, [m.priceKey]: newPrice }));
                                  setResults(prev => prev.map(r => r.priceKey === m.priceKey ? { ...r, unitPrice: newPrice, total: r.qty * newPrice } : r));
                                }}
                                style={{ width: 70, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 4, color: 'white', padding: '3px 6px', fontSize: 12, textAlign: 'right' }}
                              />
                            </div>
                          </td>
                          <td style={{ padding: '7px 8px', textAlign: 'right', color: '#E07B2A', fontWeight: 600 }}>
                            ${m.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}

              <div style={{ borderTop: '2px solid #E07B2A', paddingTop: 14, marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 700, fontSize: 16 }}>Grand Total</span>
                <span style={{ fontWeight: 700, fontSize: 20, color: '#E07B2A' }}>
                  ${grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: 20 }}>
                <button style={btnStyle(false)} onClick={() => { setStep(0); setResults(null); }}>← Start Over</button>
                <button style={{ ...btnStyle(false), marginLeft: 10 }} onClick={() => setStep(4)}>← Edit Prices</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
