import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeSimulationPayload,
  sanitizeStats,
  sanitizeMap,
  sanitizeDetail,
  sanitizeFrame,
  extractActiveFrame,
} from './simulationContract.js';

test('normalizeSimulationPayload validates and normalizes a multi-step timeline payload', () => {
  const payload = {
    prompt: 'Winter cold snap with peak heating demand at 19:00',
    decision: {
      answer: 'Belovo hydro dispatched to max capacity; demand response active in Sofia.',
      summary: 'Renewables covered 34% (1,450 MW). Deficit of 2,826 MW balanced.',
      actions: [
        { component: 'hydro', action: 'dispatch_max', target: 'belovo', value: 736 },
      ],
    },
    scenario: {
      season: 'winter',
      cloud: 90,
      wind: 20,
      hour: 19,
    },
    frames: [
      {
        step: 0,
        hour: 18,
        label: '18:00 Ramp-up',
        stats: {
          res: 1200,
          demand: 3800,
          mw: { solar: 10, wind: 60, hydro: 1100, other: 30 },
          sectors: [{ label: 'Индустрия', mw: 1600, pct: 0.42 }],
        },
        map: {
          sites: {
            belovo: { output: 600, status: 'ramping' },
            pazardzhik: { output: 10, status: 'sunset' },
          },
          cities: {
            sofia: { demand: 1400, resReceived: 350 },
          },
          flows: [
            { from: 'belovo', to: 'sofia', mw: 300 },
          ],
        },
      },
      {
        step: 1,
        hour: 19,
        label: '19:00 Peak Demand',
        stats: {
          res: 1450,
          demand: 4276,
          mw: { solar: 0, wind: 76, hydro: 1339, other: 35 },
          sectors: [{ label: 'Индустрия', mw: 1710, pct: 0.40 }],
        },
        map: {
          sites: {
            belovo: { output: 736.2, status: 'peaking_max' },
            pazardzhik: { output: 0, status: 'night' },
          },
          cities: {
            sofia: { demand: 1546, resReceived: 380 },
          },
        },
      },
    ],
  };

  const normalized = normalizeSimulationPayload(payload);
  assert.equal(normalized.prompt, payload.prompt);
  assert.equal(normalized.decision.answer, payload.decision.answer);
  assert.equal(normalized.totalSteps, 2);
  assert.equal(normalized.isTimeline, true);

  const frame0 = extractActiveFrame(normalized, 0);
  assert.equal(frame0.step, 0);
  assert.equal(frame0.stats.res, 1200);
  assert.equal(frame0.map.sites.belovo.output, 600);

  const frame1 = extractActiveFrame(normalized, 1);
  assert.equal(frame1.step, 1);
  assert.equal(frame1.stats.res, 1450);
  assert.equal(frame1.stats.balance, -2826);
  assert.equal(frame1.map.sites.belovo.output, 736.2);
});

test('normalizeSimulationPayload accepts a single-snapshot with top-level components', () => {
  const payload = {
    prompt: 'Solar noon peak',
    decision: {
      answer: 'Solar generation at maximum throughout Thrace.',
    },
    components: {
      stats: {
        res: 3200,
        demand: 3600,
        mw: { solar: 2400, wind: 300, hydro: 450, other: 50 },
      },
      map: {
        sites: {
          pazardzhik: { output: 280, status: 'max_solar' },
        },
        cities: {
          plovdiv: { demand: 550, resReceived: 400 },
        },
      },
    },
  };

  const normalized = normalizeSimulationPayload(payload);
  assert.equal(normalized.totalSteps, 1);
  assert.equal(normalized.isTimeline, false);
  const frame = extractActiveFrame(normalized, 0);
  assert.ok(frame);
  assert.equal(frame.stats.res, 3200);
  assert.equal(frame.map.sites.pazardzhik.output, 280);
});

test('incomplete or missing component data is omitted and not visualized', () => {
  // Missing demand or res nullifies stats completely
  const missingDemand = sanitizeStats({ res: 1500 });
  assert.equal(missingDemand, null);

  const missingRes = sanitizeStats({ demand: 4000 });
  assert.equal(missingRes, null);

  const nonNumericRes = sanitizeStats({ res: 'invalid', demand: 3000 });
  assert.equal(nonNumericRes, null);

  const negativeRes = sanitizeStats({ res: -50, demand: 3000 });
  assert.equal(negativeRes, null);

  // If a site output is not numeric or negative, it is stripped
  const sanitizedMap = sanitizeMap({
    sites: {
      belovo: { output: 'corrupt' },
      pazardzhik: { output: -50 },
      sliven: { output: 200 },
    },
    cities: {
      sofia: { demand: 1200 },
      invalid_city_id: { demand: 500 },
    },
  });
  assert.equal(sanitizedMap.sites.belovo, undefined);
  assert.equal(sanitizedMap.sites.pazardzhik, undefined);
  assert.equal(sanitizedMap.sites.sliven.output, 200);
  assert.equal(sanitizedMap.cities.sofia.demand, 1200);
  assert.equal(sanitizedMap.cities.invalid_city_id, undefined);
});

test('throws clear TypeError when payload is missing prompt or components', () => {
  assert.throws(() => normalizeSimulationPayload(null), /Невалиден формат/);
  assert.throws(() => normalizeSimulationPayload({}), /Липсва prompt/);
  assert.throws(() => normalizeSimulationPayload({ prompt: '   ' }), /Липсва prompt/);
  assert.throws(() => normalizeSimulationPayload({ prompt: 'test' }), /трябва да съдържа поне един кадър/);
  assert.throws(() => normalizeSimulationPayload({ prompt: 'test', frames: [] }), /трябва да съдържа поне един кадър/);
});

test('scenario numbers are safely bounded and clamped', () => {
  const payload = {
    prompt: 'Stress test weather parameters',
    scenario: {
      cloud: 250, // should clamp to 100
      wind: -50,  // should clamp to 0
      hour: 35,   // should clamp to 24
      stepDurationMs: 50, // should clamp to min 200
    },
    components: {
      stats: { res: 100, demand: 200 },
    },
  };

  const normalized = normalizeSimulationPayload(payload);
  assert.equal(normalized.scenario.cloud, 100);
  assert.equal(normalized.scenario.wind, 0);
  assert.equal(normalized.scenario.hour, 24);
  assert.equal(normalized.scenario.stepDurationMs, 200);
});

test('sanitizeDetail keeps only known valid entity IDs', () => {
  const detail = sanitizeDetail({
    belovo: { aiDecision: 'Peaking dispatch' },
    sofia: { customNotes: 'Active curtailment' },
    unknown_village: { aiDecision: 'Ignored' },
    hacker_site: { aiDecision: 'Ignored' },
  });

  assert.equal(detail.belovo.aiDecision, 'Peaking dispatch');
  assert.equal(detail.sofia.customNotes, 'Active curtailment');
  assert.equal(detail.unknown_village, undefined);
  assert.equal(detail.hacker_site, undefined);
});

test('handles large 24-step hourly timeline without performance degradation', () => {
  const frames = Array.from({ length: 24 }, (_, i) => ({
    step: i,
    hour: i,
    label: `${String(i).padStart(2, '0')}:00`,
    stats: {
      res: 1000 + i * 50,
      demand: 3000 + (i >= 8 && i <= 20 ? 1000 : 0),
      mw: { solar: i >= 6 && i <= 18 ? 500 : 0, wind: 200, hydro: 300, other: 50 },
    },
    map: {
      sites: {
        belovo: { output: 300 + i * 10 },
      },
      cities: {
        sofia: { demand: 1000 + i * 20 },
      },
    },
  }));

  const payload = {
    prompt: 'Full 24-hour daily grid simulation',
    frames,
  };

  const normalized = normalizeSimulationPayload(payload);
  assert.equal(normalized.totalSteps, 24);
  assert.equal(normalized.isTimeline, true);

  const startFrame = extractActiveFrame(normalized, 0);
  assert.equal(startFrame.hour, 0);
  assert.equal(startFrame.stats.res, 1000);

  const noonFrame = extractActiveFrame(normalized, 12);
  assert.equal(noonFrame.hour, 12);
  assert.equal(noonFrame.stats.res, 1600);
  assert.equal(noonFrame.stats.mw.solar, 500);

  const endFrame = extractActiveFrame(normalized, 23);
  assert.equal(endFrame.hour, 23);
  assert.equal(endFrame.stats.res, 2150);

  // Boundary clamping in extractActiveFrame
  const clampedHigh = extractActiveFrame(normalized, 999);
  assert.equal(clampedHigh.step, 23);

  const clampedLow = extractActiveFrame(normalized, -10);
  assert.equal(clampedLow.step, 0);
});

test('simulation payloads cannot smuggle CSS, oversized timelines or odd ids', () => {
  const frame = {
    stats: { res: 1000, demand: 3000, mw: { solar: 1, wind: 1, hydro: 1, other: 1 },
      sectors: [{ label: 'A', mw: 10, color: 'url(http://evil.example/x.png)' }, { label: 'B', mw: 10, color: '#aabbcc' }] },
    map: { flows: [{ from: 'a', to: 'b', mw: 5, color: 'red; background:url(x)' }] },
  };
  const normalized = normalizeSimulationPayload({
    prompt: 'test', decision: { answer: 'ok' },
    id: '<script>alert(1)</script>',
    frames: Array.from({ length: 500 }, () => frame),
  });
  assert.equal(normalized.totalSteps, 200);
  assert.match(normalized.id, /^[0-9a-f-]{36}$/);
  const [first] = normalized.frames;
  assert.equal(first.stats.sectors[0].color, '#53615b');
  assert.equal(first.stats.sectors[1].color, '#aabbcc');
  assert.equal(first.map.flows[0].color, undefined);
});

test('compact v2 payload expands to the same frames and inherits omitted fields', () => {
  const normalized = normalizeSimulationPayload({
    v: 2,
    prompt: 'Winter storm at 19:00',
    answer: 'Belovo at full power.',
    actions: [['hydro', 'dispatch_max', 'belovo', 736]],
    scenario: { season: 'winter', cloud: 95, wind: 25, stepMs: 1500 },
    frames: [
      { hour: 19, demand: 4276, mw: { solar: 0, wind: 76, hydro: 1339, other: 35 }, sectors: { 'Индустрия': 1700 },
        sites: { belovo: 736 }, cities: { sofia: [1450, 800] }, flows: [['belovo', 'sofia']], nuclear: 2000, notes: { belovo: 'Max' } },
      { mw: { hydro: 1200 }, cities: { plovdiv: [620, 400] } },
    ],
  });
  assert.deepEqual(normalized.decision.actions, [{ component: 'hydro', action: 'dispatch_max', target: 'belovo', value: 736 }]);
  assert.equal(normalized.decision.answer, 'Belovo at full power.');
  assert.deepEqual(normalized.scenario, { season: 'winter', cloud: 95, wind: 25, hour: 19, stepDurationMs: 1500 });
  const [first, second] = normalized.frames;
  assert.equal(first.label, '19:00');
  assert.equal(first.stats.res, 1450);
  assert.equal(first.stats.balance, 1450 - 4276);
  assert.equal(first.stats.sectors[0].color, '#14201c');
  assert.deepEqual(first.map.flows, [{ from: 'belovo', to: 'sofia', mw: 0, color: undefined }]);
  assert.equal(first.map.nuclear.output, 2000);
  assert.equal(first.detail.belovo.aiDecision, 'Max');
  assert.equal(second.hour, 20);
  assert.equal(second.label, '20:00');
  assert.equal(second.stats.res, 76 + 1200 + 35);
  assert.equal(second.stats.demand, 4276);
  assert.equal(second.map.sites.belovo.output, 736);
  assert.deepEqual(Object.keys(second.map.cities), ['sofia', 'plovdiv']);
});
