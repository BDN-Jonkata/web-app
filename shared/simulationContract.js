import { CITIES, SITES, NUCLEAR, SEASONS } from './energy.js';

const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);

const validSiteIds = new Set(SITES.map(s => s.id));
const validCityIds = new Set(CITIES.map(c => c.id));
const validEntityIds = new Set([...validSiteIds, ...validCityIds, NUCLEAR.id]);

/**
 * Sanitizes the stats component of a frame.
 * If incomplete (e.g. missing total res or demand numbers), returns null so it won't be visualized.
 */
export function sanitizeStats(stats) {
  if (!plain(stats)) return null;
  if (typeof stats.res !== 'number' || !Number.isFinite(stats.res) || stats.res < 0) return null;
  if (typeof stats.demand !== 'number' || !Number.isFinite(stats.demand) || stats.demand < 0) return null;

  const res = Math.round(stats.res);
  const demand = Math.round(stats.demand);
  const coverage = typeof stats.coverage === 'number' && Number.isFinite(stats.coverage)
    ? Math.max(0, stats.coverage)
    : (demand > 0 ? (res / demand) * 100 : 0);
  const balance = typeof stats.balance === 'number' && Number.isFinite(stats.balance)
    ? Math.round(stats.balance)
    : res - demand;

  const mw = { solar: 0, wind: 0, hydro: 0, other: 0 };
  if (plain(stats.mw)) {
    for (const key of ['solar', 'wind', 'hydro', 'other']) {
      if (typeof stats.mw[key] === 'number' && Number.isFinite(stats.mw[key]) && stats.mw[key] >= 0) {
        mw[key] = Math.round(stats.mw[key]);
      }
    }
  }

  let sectors = [];
  if (Array.isArray(stats.sectors)) {
    sectors = stats.sectors
      .filter(s => plain(s) && typeof s.label === 'string' && typeof s.mw === 'number' && Number.isFinite(s.mw) && s.mw >= 0)
      .map(s => ({
        label: s.label.trim(),
        mw: Math.round(s.mw),
        pct: typeof s.pct === 'number' && Number.isFinite(s.pct) ? Math.max(0, Math.min(1, s.pct)) : (demand > 0 ? s.mw / demand : 0),
        color: typeof s.color === 'string' ? s.color : '#53615b',
      }));
  }

  let context = null;
  if (plain(stats.context)) {
    context = {};
    for (const [k, v] of Object.entries(stats.context)) {
      if (typeof v === 'string' || typeof v === 'number') context[k] = String(v);
    }
  }

  return { res, demand, coverage, balance, mw, sectors, context };
}

/**
 * Sanitizes map component data for sites, cities, flows, and nuclear asset.
 * Only entities with valid numbers are kept. Incomplete entities are omitted.
 */
export function sanitizeMap(map) {
  if (!plain(map)) {
    return { sites: {}, cities: {}, flows: [], nuclear: null };
  }

  const sites = {};
  if (plain(map.sites)) {
    for (const [id, siteData] of Object.entries(map.sites)) {
      if (validSiteIds.has(id) && plain(siteData)) {
        if (typeof siteData.output === 'number' && Number.isFinite(siteData.output) && siteData.output >= 0) {
          sites[id] = {
            output: siteData.output,
            status: typeof siteData.status === 'string' ? siteData.status : 'active',
            note: typeof siteData.note === 'string' ? siteData.note : '',
          };
        }
      }
    }
  }

  const cities = {};
  if (plain(map.cities)) {
    for (const [id, cityData] of Object.entries(map.cities)) {
      if (validCityIds.has(id) && plain(cityData)) {
        if (typeof cityData.demand === 'number' && Number.isFinite(cityData.demand) && cityData.demand >= 0) {
          const resReceived = typeof cityData.resReceived === 'number' && Number.isFinite(cityData.resReceived) && cityData.resReceived >= 0
            ? cityData.resReceived
            : 0;
          cities[id] = {
            demand: cityData.demand,
            resReceived,
            status: typeof cityData.status === 'string' ? cityData.status : (resReceived >= cityData.demand ? 'surplus' : 'deficit'),
          };
        }
      }
    }
  }

  const flows = [];
  if (Array.isArray(map.flows)) {
    for (const flow of map.flows) {
      if (plain(flow) && typeof flow.from === 'string' && typeof flow.to === 'string') {
        const mw = typeof flow.mw === 'number' && Number.isFinite(flow.mw) && flow.mw >= 0 ? flow.mw : 0;
        flows.push({
          from: flow.from,
          to: flow.to,
          mw,
          color: typeof flow.color === 'string' ? flow.color : undefined,
        });
      }
    }
  }

  let nuclear = null;
  if (plain(map.nuclear)) {
    const output = typeof map.nuclear.output === 'number' && Number.isFinite(map.nuclear.output) && map.nuclear.output >= 0
      ? map.nuclear.output
      : 2000;
    nuclear = {
      output,
      status: typeof map.nuclear.status === 'string' ? map.nuclear.status : 'baseload',
    };
  }

  return { sites, cities, flows, nuclear };
}

/**
 * Sanitizes entity-specific decision details.
 */
export function sanitizeDetail(detail) {
  if (!plain(detail)) return {};
  const cleaned = {};
  for (const [id, entry] of Object.entries(detail)) {
    if (validEntityIds.has(id) && plain(entry)) {
      cleaned[id] = {
        title: typeof entry.title === 'string' ? entry.title : undefined,
        customNotes: typeof entry.customNotes === 'string' ? entry.customNotes : '',
        aiDecision: typeof entry.aiDecision === 'string' ? entry.aiDecision : '',
      };
    }
  }
  return cleaned;
}

/**
 * Sanitizes a single simulation frame.
 */
export function sanitizeFrame(raw, index = 0) {
  if (!plain(raw)) return null;

  const step = typeof raw.step === 'number' && Number.isFinite(raw.step) ? raw.step : index;
  const hour = typeof raw.hour === 'number' && Number.isFinite(raw.hour) && raw.hour >= 0 && raw.hour <= 24
    ? raw.hour
    : 12;
  const label = typeof raw.label === 'string' && raw.label.trim()
    ? raw.label.trim()
    : `${String(Math.floor(hour)).padStart(2, '0')}:${String(Math.round((hour % 1) * 60)).padStart(2, '0')}`;

  const stats = sanitizeStats(raw.stats);
  const map = sanitizeMap(raw.map);
  const detail = sanitizeDetail(raw.detail);

  return { step, hour, label, stats, map, detail };
}

/**
 * Normalizes and validates the complete AI simulation payload.
 * Supports both single-frame payloads and multi-frame timelines.
 */
export function normalizeSimulationPayload(input) {
  if (!plain(input)) {
    throw new TypeError('Невалиден формат: очаква се JSON обект.');
  }

  if (typeof input.prompt !== 'string' || !input.prompt.trim()) {
    throw new TypeError('Липсва prompt за симулацията.');
  }
  const prompt = input.prompt.trim();

  // Validate decision
  let decision = {
    answer: '',
    summary: '',
    timestamp: new Date().toISOString(),
    actions: [],
  };
  if (plain(input.decision)) {
    decision.answer = typeof input.decision.answer === 'string' ? input.decision.answer.trim() : '';
    decision.summary = typeof input.decision.summary === 'string' ? input.decision.summary.trim() : '';
    decision.timestamp = typeof input.decision.timestamp === 'string' ? input.decision.timestamp : new Date().toISOString();
    if (Array.isArray(input.decision.actions)) {
      decision.actions = input.decision.actions
        .filter(a => plain(a) && typeof a.action === 'string')
        .map(a => ({
          component: typeof a.component === 'string' ? a.component : '',
          action: a.action,
          target: typeof a.target === 'string' ? a.target : '',
          value: typeof a.value === 'number' && Number.isFinite(a.value) ? a.value : undefined,
        }));
    }
  }

  // Validate scenario
  const scenario = {
    season: 'winter',
    cloud: 50,
    wind: 50,
    hour: 12,
    stepDurationMs: 1200,
  };
  if (plain(input.scenario)) {
    if (typeof input.scenario.season === 'string' && own(SEASONS, input.scenario.season)) {
      scenario.season = input.scenario.season;
    }
    if (typeof input.scenario.cloud === 'number' && Number.isFinite(input.scenario.cloud)) {
      scenario.cloud = Math.max(0, Math.min(100, Math.round(input.scenario.cloud)));
    }
    if (typeof input.scenario.wind === 'number' && Number.isFinite(input.scenario.wind)) {
      scenario.wind = Math.max(0, Math.min(100, Math.round(input.scenario.wind)));
    }
    if (typeof input.scenario.hour === 'number' && Number.isFinite(input.scenario.hour)) {
      scenario.hour = Math.max(0, Math.min(24, input.scenario.hour));
    }
    if (typeof input.scenario.stepDurationMs === 'number' && Number.isFinite(input.scenario.stepDurationMs)) {
      scenario.stepDurationMs = Math.max(200, Math.min(10000, Math.round(input.scenario.stepDurationMs)));
    }
  }

  // Frames: multi-frame timeline or single frame
  let rawFrames = [];
  if (Array.isArray(input.frames) && input.frames.length > 0) {
    rawFrames = input.frames;
  } else if (plain(input.components)) {
    rawFrames = [{
      step: 0,
      hour: scenario.hour,
      label: 'Текущо състояние',
      stats: input.components.stats,
      map: input.components.map,
      detail: input.components.detail,
    }];
  } else if (plain(input.stats) || plain(input.map)) {
    rawFrames = [{
      step: 0,
      hour: scenario.hour,
      label: 'Текущо състояние',
      stats: input.stats,
      map: input.map,
      detail: input.detail,
    }];
  } else {
    throw new TypeError('Симулацията трябва да съдържа поне един кадър (frames) или компоненти (components).');
  }

  const frames = rawFrames.map((f, i) => sanitizeFrame(f, i)).filter(Boolean);
  if (!frames.length) {
    throw new TypeError('Всички кадри в симулацията са невалидни.');
  }

  return {
    id: typeof input.id === 'string' ? input.id : crypto.randomUUID(),
    prompt,
    decision,
    scenario,
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
