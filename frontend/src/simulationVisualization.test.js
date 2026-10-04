import test from 'node:test';
import assert from 'node:assert/strict';
import { extractActiveFrame, normalizeSimulationPayload } from '../../shared/simulationContract.js';

test('simulation adapter extracts clean frame data without seeded numbers', () => {
  const payload = {
    prompt: 'Severe winter peak simulation',
    answer: 'Peaking hydro dispatched, demand curtailed.',
    actions: [['hydro', 'dispatch_max', 'belovo', 736]],
    scenario: { season: 'winter', cloud: 85, wind: 30 },
    frames: [
      {
        hour: 19,
        label: '19:00 - Evening Peak',
        demand: 4276,
        mw: { solar: 0, wind: 76, hydro: 1339, other: 35 },
        sectors: { 'Индустрия': 1710, 'Домакинства': 1625 },
        sites: { belovo: 736.2, kavarna: 45.2 },
        cities: { sofia: [1546, 380], plovdiv: [651, 580] },
        flows: [['belovo', 'sofia']],
        nuclear: 2000,
        notes: { belovo: 'Dispatched for grid frequency control.' },
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

test('timeline scrubbing advances steps correctly and clamps at bounds', () => {
  const payload = {
    prompt: 'Timeline stepping test',
    frames: [
      { hour: 12, demand: 2500, res: 2000 },
      { demand: 2600, res: 2400 },
      { demand: 2700, res: 2200 },
    ],
  };

  const simulation = normalizeSimulationPayload(payload);
  assert.equal(simulation.totalSteps, 3);
  assert.equal(simulation.isTimeline, true);

  // Step 0
  const frame0 = extractActiveFrame(simulation, 0);
  assert.equal(frame0.step, 0);
  assert.equal(frame0.stats.res, 2000);

  // Step 1
  const frame1 = extractActiveFrame(simulation, 1);
  assert.equal(frame1.step, 1);
  assert.equal(frame1.label, '13:00');
  assert.equal(frame1.stats.res, 2400);

  // Step 2
  const frame2 = extractActiveFrame(simulation, 2);
  assert.equal(frame2.step, 2);
  assert.equal(frame2.stats.res, 2200);

  // Scrubbing beyond upper bound clamps to last frame
  const clampedHigh = extractActiveFrame(simulation, 10);
  assert.equal(clampedHigh.step, 2);

  // Scrubbing below 0 clamps to first frame
  const clampedLow = extractActiveFrame(simulation, -5);
  assert.equal(clampedLow.step, 0);

  // Replaying resets step pointer to 0
  let currentStep = 2; // user at the end
  currentStep = 0;     // replay trigger
  const replayedFrame = extractActiveFrame(simulation, currentStep);
  assert.equal(replayedFrame.step, 0);
  assert.equal(replayedFrame.stats.res, 2000);
});

test('frames with missing stats omit stats without breaking the frame', () => {
  const payload = {
    prompt: 'Partial frame simulation without stats',
    frames: [{ hour: 10, sites: { belovo: 400 } }],
  };

  const simulation = normalizeSimulationPayload(payload);
  const frame = extractActiveFrame(simulation, 0);
  assert.equal(frame.stats, null); // completely omitted, not partial or fake
  assert.equal(frame.map.sites.belovo.output, 400);
});
