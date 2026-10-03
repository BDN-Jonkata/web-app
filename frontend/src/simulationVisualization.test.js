import test from 'node:test';
import assert from 'node:assert/strict';
import { extractActiveFrame, normalizeSimulationPayload } from '../../shared/simulationContract.js';

test('simulation adapter extracts clean frame data without seeded numbers', () => {
  const payload = {
    prompt: 'Severe winter peak simulation',
    decision: {
      answer: 'Peaking hydro dispatched, demand curtailed.',
      summary: 'Hydro at 736 MW, deficit covered.',
      actions: [
        { component: 'hydro', action: 'dispatch_max', target: 'belovo', value: 736 },
      ],
    },
    scenario: {
      season: 'winter',
      cloud: 85,
      wind: 30,
      hour: 19,
    },
    frames: [
      {
        step: 0,
        hour: 19,
        label: '19:00 - Evening Peak',
        stats: {
          res: 1450,
          demand: 4276,
          coverage: 33.9,
          balance: -2826,
          mw: { solar: 0, wind: 76, hydro: 1339, other: 35 },
          sectors: [
            { label: 'Индустрия', mw: 1710, pct: 0.4 },
            { label: 'Домакинства', mw: 1625, pct: 0.38 },
          ],
        },
        map: {
          sites: {
            belovo: { output: 736.2, status: 'peaking_max' },
            kavarna: { output: 45.2, status: 'active' },
          },
          cities: {
            sofia: { demand: 1546, resReceived: 380 },
            plovdiv: { demand: 651, resReceived: 580 },
          },
          flows: [
            { from: 'belovo', to: 'sofia', mw: 368.1 },
          ],
          nuclear: { output: 2000, status: 'baseload' },
        },
        detail: {
          belovo: {
            customNotes: 'Max peaking output.',
            aiDecision: 'Dispatched for grid frequency control.',
          },
        },
      },
    ],
  };

  const normalized = normalizeSimulationPayload(payload);
  const activeFrame = extractActiveFrame(normalized, 0);

  // Map adapter projection
  const siteOut = Object.fromEntries(
    Object.entries(activeFrame.map.sites).map(([id, d]) => [id, d.output])
  );
  const cityDemand = Object.fromEntries(
    Object.entries(activeFrame.map.cities).map(([id, d]) => [id, d.demand])
  );
  const cityRes = Object.fromEntries(
    Object.entries(activeFrame.map.cities).map(([id, d]) => [id, d.resReceived ?? 0])
  );

  assert.equal(siteOut.belovo, 736.2);
  assert.equal(siteOut.kavarna, 45.2);
  assert.equal(siteOut.pazardzhik, undefined); // unprovided site has no output
  assert.equal(cityDemand.sofia, 1546);
  assert.equal(cityRes.sofia, 380);
  assert.equal(activeFrame.stats.res, 1450);
  assert.equal(activeFrame.stats.balance, -2826);
  assert.equal(activeFrame.map.nuclear.output, 2000);
  assert.equal(activeFrame.detail.belovo.aiDecision, 'Dispatched for grid frequency control.');
});

test('unseeded simulation state evaluates to null without inventing fake numbers', () => {
  const activeFrame = extractActiveFrame(null, 0);
  assert.equal(activeFrame, null);
});
