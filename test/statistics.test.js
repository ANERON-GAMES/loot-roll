import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createState, probabilities, roll, rollMany } from '../src/index.js';

const originalRandom = Math.random;

before(() => {
  Math.random = () => {
    throw new Error('Math.random called');
  };
});

after(() => {
  Math.random = originalRandom;
});

function mulberry32(seed) {
  let state = seed >>> 0;
  return function random() {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function steadyHitRate(weightShare, pityAfter) {
  const missChance = 1 - weightShare;
  let weight = 1;
  let total = 0;
  let hit = 0;
  for (let misses = 0; misses <= pityAfter; misses += 1) {
    total += weight;
    hit += misses === pityAfter ? weight : weight * weightShare;
    weight *= missChance;
  }
  return hit / total;
}

function idsOf(picks) {
  return picks.map((pick) => pick.id);
}

describe('seeded random source', () => {
  const weighted = {
    entries: [
      { id: 'a', weight: 50 },
      { id: 'b', weight: 30 },
      { id: 'c', weight: 20 },
    ],
  };

  it('repeats a roll sequence for the same seed', () => {
    const first = rollMany(weighted, createState(), mulberry32(7), 200);
    const second = rollMany(weighted, createState(), mulberry32(7), 200);
    assert.deepEqual(first, second);
    const other = rollMany(weighted, createState(), mulberry32(8), 200);
    assert.notDeepEqual(idsOf(first.picks), idsOf(other.picks));
  });

  it('stays close to the weight shares', () => {
    const count = 20000;
    const { picks } = rollMany(weighted, createState(), mulberry32(1), count);
    const counts = { a: 0, b: 0, c: 0 };
    for (const pick of picks) {
      counts[pick.id] += 1;
    }
    const expected = [
      ['a', 0.5],
      ['b', 0.3],
      ['c', 0.2],
    ];
    let chiSquare = 0;
    for (const [id, share] of expected) {
      const expectedCount = share * count;
      const difference = counts[id] - expectedCount;
      chiSquare += (difference * difference) / expectedCount;
      assert.ok(Math.abs(counts[id] / count - share) < 0.02);
    }
    assert.ok(chiSquare < 25, `chi-square ${chiSquare}`);
    assert.deepEqual(probabilities(weighted, createState()), [
      { id: 'a', probability: 0.5 },
      { id: 'b', probability: 0.3 },
      { id: 'c', probability: 0.2 },
    ]);
  });

  it('lifts the pity entry to its hard-pity rate', () => {
    const pityAfter = 4;
    const table = {
      entries: [
        { id: 'a', weight: 9 },
        { id: 'b', weight: 1, pityAfter },
      ],
    };
    const count = 20000;
    const random = mulberry32(3);
    let state = createState();
    let hits = 0;
    let forced = 0;
    let streak = 0;
    let maxStreak = 0;
    for (let index = 0; index < count; index += 1) {
      const before = state.misses;
      assert.equal(streak, before);
      const result = roll(table, state, random);
      if (before >= pityAfter) {
        forced += 1;
        assert.equal(result.entry.id, 'b');
        assert.deepEqual(probabilities(table, state), [
          { id: 'a', probability: 0 },
          { id: 'b', probability: 1 },
        ]);
      } else {
        assert.deepEqual(probabilities(table, state), [
          { id: 'a', probability: 0.9 },
          { id: 'b', probability: 0.1 },
        ]);
      }
      if (result.entry.id === 'b') {
        hits += 1;
        maxStreak = Math.max(maxStreak, streak);
        streak = 0;
        assert.equal(result.state.misses, 0);
      } else {
        streak += 1;
        assert.equal(result.state.misses, before + 1);
      }
      state = result.state;
    }
    maxStreak = Math.max(maxStreak, streak);
    assert.equal(maxStreak, pityAfter);
    assert.ok(forced > 0);
    const share = 1 / 10;
    const closedForm = share / (1 - (1 - share) ** (pityAfter + 1));
    const markov = steadyHitRate(share, pityAfter);
    assert.ok(Math.abs(closedForm - markov) < 1e-12);
    const observed = hits / count;
    assert.ok(
      Math.abs(observed - closedForm) < 0.02,
      `observed ${observed} expected ${closedForm}`,
    );
    assert.ok(observed > share + 0.05);
  });
});
