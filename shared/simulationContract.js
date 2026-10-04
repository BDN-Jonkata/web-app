import { CITIES, SITES, NUCLEAR, SEASONS } from './energy.js';

const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const number = value => typeof value === 'number' && Number.isFinite(value);
const amount = value => number(value) && value >= 0;
const text = value => (typeof value === 'string' ? value.trim() : '');
const clamp = (value, min, max, fallback) => (number(value) ? Math.max(min, Math.min(max, value)) : fallback);

const MAX_FRAMES = 200;
const MAX_LIST_ITEMS = 50;
const SOURCES = ['solar', 'wind', 'hydro', 'other'];
// Sector colors are fixed here, never taken from the payload: they reach inline styles in the browser.
const SECTOR_COLORS = { 'Индустрия': '#14201c', 'Домакинства': '#53615b', 'Услуги и търговия': '#8b9791', 'Транспорт и селско ст.': '#c0c8c3' };
const DEFAULT_SECTOR_COLOR = '#53615b';
// Frames inherit these maps from the previous frame and merge them per key.
const MERGED_KEYS = ['mw', 'sectors', 'sites', 'cities', 'notes'];

const validSiteIds = new Set(SITES.map(s => s.id));
const validCityIds = new Set(CITIES.map(c => c.id));
const validEntityIds = new Set([...validSiteIds, ...validCityIds, NUCLEAR.id]);

const clock = hour => `${String(Math.floor(hour)).padStart(2, '0')}:${String(Math.round((hour % 1) * 60) % 60).padStart(2, '0')}`;
const entries = (value, limit = Infinity) => (plain(value) ? Object.entries(value).slice(0, limit) : []);

/**
 * Builds the stats of a frame. Without a demand, or without mw/res, the frame has no stats (null)
 * so the interface never shows invented numbers. res, coverage, balance and sector shares are derived.
 */
function normalizeStats(frame) {
  if (!amount(frame.demand)) return null;
  const mw = {};
  for (const key of SOURCES) mw[key] = amount(frame.mw?.[key]) ? Math.round(frame.mw[key]) : 0;
  const total = amount(frame.res) ? frame.res : plain(frame.mw) ? Object.values(mw).reduce((sum, value) => sum + value, 0) : null;
  if (total === null) return null;

  const res = Math.round(total);
  const demand = Math.round(frame.demand);
  const sectors = entries(frame.sectors, MAX_LIST_ITEMS)
    .filter(([label, value]) => label.trim() && amount(value))
    .map(([label, value]) => ({
      label: label.trim(),
      mw: Math.round(value),
      pct: demand > 0 ? Math.min(1, value / demand) : 0,
      color: SECTOR_COLORS[label.trim()] || DEFAULT_SECTOR_COLOR,
    }));
  return { res, demand, coverage: demand > 0 ? (res / demand) * 100 : 0, balance: res - demand, mw, sectors };
}

function normalizeMap(frame) {
  const sites = {};
  for (const [id, output] of entries(frame.sites)) {
    if (validSiteIds.has(id) && amount(output)) sites[id] = { output };
  }
  const cities = {};
  for (const [id, value] of entries(frame.cities)) {
    if (validCityIds.has(id) && Array.isArray(value) && amount(value[0])) {
      cities[id] = { demand: value[0], resReceived: amount(value[1]) ? value[1] : 0 };
    }
  }
  const flows = (Array.isArray(frame.flows) ? frame.flows.slice(0, MAX_LIST_ITEMS) : [])
    .filter(flow => Array.isArray(flow) && validSiteIds.has(flow[0]) && validCityIds.has(flow[1]))
    .map(([from, to]) => ({ from, to }));
  const nuclear = amount(frame.nuclear) ? { output: frame.nuclear } : null;
  return { sites, cities, flows, nuclear };
}

function normalizeDetail(frame) {
  const detail = {};
  for (const [id, note] of entries(frame.notes)) {
    if (validEntityIds.has(id) && text(note)) detail[id] = { aiDecision: text(note) };
  }
  return detail;
}

/**
 * Normalizes and validates the AI simulation payload (format: see README).
 * Each frame inherits every field it omits from the previous frame: mw, sectors, sites, cities and notes
 * are merged per key, hour advances by 1 and label is never inherited.
 */
export function normalizeSimulationPayload(input) {
  if (!plain(input)) {
    throw new TypeError('Невалиден формат: очаква се JSON обект.');
  }
  const prompt = text(input.prompt);
  if (!prompt) {
    throw new TypeError('Липсва prompt за симулацията.');
  }
  if (!Array.isArray(input.frames) || !input.frames.length) {
    throw new TypeError('Симулацията трябва да съдържа поне един кадър (frames).');
  }

  let previous = null;
  const frames = [];
  for (const raw of input.frames.slice(0, MAX_FRAMES)) {
    if (!plain(raw)) continue;
    const hour = number(raw.hour) && raw.hour >= 0 && raw.hour <= 24 ? raw.hour : previous ? (previous.hour + 1) % 24 : 12;
    const frame = { ...previous, ...raw, hour };
    for (const key of MERGED_KEYS) {
      if (plain(previous?.[key]) && plain(raw[key])) frame[key] = { ...previous[key], ...raw[key] };
    }
    previous = frame;
    frames.push({
      step: frames.length,
      hour,
      label: text(raw.label) || clock(hour),
      stats: normalizeStats(frame),
      map: normalizeMap(frame),
      detail: normalizeDetail(frame),
    });
  }
  if (!frames.length) {
    throw new TypeError('Всички кадри в симулацията са невалидни.');
  }

  const actions = (Array.isArray(input.actions) ? input.actions.slice(0, MAX_LIST_ITEMS) : [])
    .filter(action => Array.isArray(action) && text(action[1]))
    .map(([component, action, target, value]) => ({
      component: text(component),
      action: text(action),
      target: text(target),
      value: number(value) ? value : undefined,
    }));

  const scenario = plain(input.scenario) ? input.scenario : {};
  return {
    id: typeof input.id === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(input.id) ? input.id : crypto.randomUUID(),
    prompt,
    decision: { answer: text(input.answer), actions },
    scenario: {
      season: typeof scenario.season === 'string' && own(SEASONS, scenario.season) ? scenario.season : 'winter',
      cloud: Math.round(clamp(scenario.cloud, 0, 100, 50)),
      wind: Math.round(clamp(scenario.wind, 0, 100, 50)),
      hour: frames[0].hour,
      stepDurationMs: Math.round(clamp(scenario.stepMs, 200, 10000, 1200)),
    },
    frames,
    totalSteps: frames.length,
    isTimeline: frames.length > 1,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Extracts the frame data for visualization at a specific step index.
 */
export function extractActiveFrame(simulation, stepIndex = 0) {
  if (!simulation || !Array.isArray(simulation.frames) || !simulation.frames.length) {
    return null;
  }
  const idx = Math.max(0, Math.min(stepIndex, simulation.frames.length - 1));
  return simulation.frames[idx];
}
