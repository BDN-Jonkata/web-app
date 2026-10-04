import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSimulationPayload, extractActiveFrame } from './simulationContract.js';

const timeline = () => ({
  prompt: 'Winter storm at 19:00',
  answer: 'Belovo at full power.',
  actions: [['hydro', 'dispatch_max', 'belovo', 736]],
  scenario: { season: 'winter', cloud: 95, wind: 25, stepMs: 1500 },
  frames: [
    { hour: 19, label: '19:00 Peak', demand: 4276, mw: { solar: 0, wind: 76, hydro: 1339, other: 35 }, sectors: { 'Индустрия': 1700, 'Домакинства': 1300 },
      sites: { belovo: 736.2, kavarna: 45 }, cities: { sofia: [1450, 800] }, flows: [['belovo', 'sofia']], nuclear: 2000, notes: { belovo: 'Max', kozloduy: 'Baseload' } },
    { mw: { hydro: 1200 }, sites: { belovo: 600 }, cities: { plovdiv: [620, 400] } },
    { hour: 23, demand: 3000 },
  ],
});

test('normalizes decision, scenario and derived frame values', () => {
  const normalized = normalizeSimulationPayload(timeline());
  assert.equal(normalized.prompt, 'Winter storm at 19:00');
  assert.deepEqual(normalized.decision, {
    answer: 'Belovo at full power.',
    actions: [{ component: 'hydro', action: 'dispatch_max', target: 'belovo', value: 736 }],
  });
  assert.deepEqual(normalized.scenario, { season: 'winter', cloud: 95, wind: 25, hour: 19, stepDurationMs: 1500 });
  assert.equal(normalized.totalSteps, 3);
  assert.equal(normalized.isTimeline, true);

  const [first] = normalized.frames;
  assert.equal(first.step, 0);
  assert.equal(first.label, '19:00 Peak');
  assert.deepEqual(first.stats.mw, { solar: 0, wind: 76, hydro: 1339, other: 35 });
  assert.equal(first.stats.res, 1450);
  assert.equal(first.stats.demand, 4276);
  assert.equal(first.stats.balance, 1450 - 4276);
  assert.ok(Math.abs(first.stats.coverage - 1450 / 4276 * 100) < 1e-9);
  assert.deepEqual(first.stats.sectors[0], { label: 'Индустрия', mw: 1700, pct: 1700 / 4276, color: '#14201c' });
  assert.deepEqual(first.map, {
    sites: { belovo: { output: 736.2 }, kavarna: { output: 45 } },
    cities: { sofia: { demand: 1450, resReceived: 800 } },
    flows: [{ from: 'belovo', to: 'sofia' }],
    nuclear: { output: 2000 },
  });
  assert.deepEqual(first.detail, { belovo: { aiDecision: 'Max' }, kozloduy: { aiDecision: 'Baseload' } });
});

test('frames inherit omitted fields, merge maps per key and advance the hour', () => {
  const [, second, third] = normalizeSimulationPayload(timeline()).frames;
  assert.equal(second.hour, 20);
  assert.equal(second.label, '20:00');
  assert.equal(second.stats.demand, 4276);
  assert.equal(second.stats.res, 76 + 1200 + 35);
  assert.equal(second.map.sites.belovo.output, 600);
  assert.equal(second.map.sites.kavarna.output, 45);
  assert.deepEqual(Object.keys(second.map.cities), ['sofia', 'plovdiv']);
  assert.deepEqual(second.map.flows, [{ from: 'belovo', to: 'sofia' }]);
  assert.equal(second.detail.belovo.aiDecision, 'Max');
  assert.equal(third.hour, 23);
  assert.equal(third.stats.demand, 3000);
  assert.equal(third.stats.mw.hydro, 1200);
});

test('frames without demand or production have no stats instead of invented numbers', () => {
  const normalized = normalizeSimulationPayload({
    prompt: 'partial',
    frames: [{ sites: { belovo: 400 } }, { demand: 3000 }, { res: 1000 }],
  });
  const [first, second, third] = normalized.frames;
  assert.equal(first.stats, null);
  assert.equal(first.hour, 12);
  assert.equal(first.map.sites.belovo.output, 400);
  assert.equal(second.stats, null);
  assert.equal(third.stats.res, 1000);
  assert.deepEqual(third.stats.mw, { solar: 0, wind: 0, hydro: 0, other: 0 });
});

test('invalid values, unknown ids and malformed entries are dropped', () => {
  const [frame] = normalizeSimulationPayload({
    prompt: 'dirty',
    frames: [{
      hour: 99, demand: 3000, mw: { solar: -5, wind: '10', hydro: 100 },
      sectors: { 'Индустрия': -1, 'Нов сектор': 50 },
      sites: { belovo: -1, unknown: 50, krichim: 261 },
      cities: { sofia: { demand: 1 }, plovdiv: [620], atlantis: [1, 1] },
      flows: [['belovo', 'atlantis'], ['krichim', 'plovdiv'], 'x'],
      nuclear: -2000,
      notes: { belovo: '  ', mars: 'x', krichim: ' ok ' },
    }],
  }).frames;
  assert.equal(frame.hour, 12);
  assert.deepEqual(frame.stats.mw, { solar: 0, wind: 0, hydro: 100, other: 0 });
  assert.deepEqual(frame.stats.sectors, [{ label: 'Нов сектор', mw: 50, pct: 50 / 3000, color: '#53615b' }]);
  assert.deepEqual(frame.map.sites, { krichim: { output: 261 } });
  assert.deepEqual(frame.map.cities, { plovdiv: { demand: 620, resReceived: 0 } });
  assert.deepEqual(frame.map.flows, [{ from: 'krichim', to: 'plovdiv' }]);
  assert.equal(frame.map.nuclear, null);
  assert.deepEqual(frame.detail, { krichim: { aiDecision: 'ok' } });

  const normalized = normalizeSimulationPayload({ prompt: 'dirty', actions: [['hydro'], 'dispatch', ['hydro', 'ramp', 'belovo', 'big']], scenario: { season: 'monsoon', cloud: 400, wind: -3, stepMs: 5 }, frames: [{}] });
  assert.deepEqual(normalized.decision.actions, [{ component: 'hydro', action: 'ramp', target: 'belovo', value: undefined }]);
  assert.deepEqual(normalized.scenario, { season: 'winter', cloud: 100, wind: 0, hour: 12, stepDurationMs: 200 });
});

test('rejects payloads without a prompt or frames', () => {
  assert.throws(() => normalizeSimulationPayload(null), /Невалиден формат/);
  assert.throws(() => normalizeSimulationPayload({}), /Липсва prompt/);
  assert.throws(() => normalizeSimulationPayload({ prompt: '   ' }), /Липсва prompt/);
  assert.throws(() => normalizeSimulationPayload({ prompt: 'test' }), /поне един кадър/);
  assert.throws(() => normalizeSimulationPayload({ prompt: 'test', frames: [] }), /поне един кадър/);
  assert.throws(() => normalizeSimulationPayload({ prompt: 'test', frames: [null, 1] }), /невалидни/);
});

test('caps frames and list sizes and never trusts the id', () => {
  const normalized = normalizeSimulationPayload({
    prompt: 'big',
    id: '<script>alert(1)</script>',
    actions: Array.from({ length: 80 }, () => ['hydro', 'ramp']),
    frames: Array.from({ length: 500 }, () => ({ flows: Array.from({ length: 80 }, () => ['belovo', 'sofia']) })),
  });
  assert.equal(normalized.totalSteps, 200);
  assert.equal(normalized.decision.actions.length, 50);
  assert.equal(normalized.frames[0].map.flows.length, 50);
  assert.match(normalized.id, /^[0-9a-f-]{36}$/);
  assert.equal(normalizeSimulationPayload({ prompt: 'x', id: 'run_42', frames: [{}] }).id, 'run_42');
});

test('extractActiveFrame clamps the step index', () => {
  const simulation = normalizeSimulationPayload(timeline());
  assert.equal(extractActiveFrame(null), null);
  assert.equal(extractActiveFrame(simulation, 1).step, 1);
  assert.equal(extractActiveFrame(simulation, 10).step, 2);
  assert.equal(extractActiveFrame(simulation, -5).step, 0);
});
