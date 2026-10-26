import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as api from '../src/index.js';

const { LootRollError, createState, probabilities, roll, rollMany } = api;

const originalRandom = Math.random;

before(() => {
  Math.random = () => {
    throw new Error('Math.random called');
  };
});

after(() => {
  Math.random = originalRandom;
});

function expectError(run, message) {
  assert.throws(run, (error) => {
    assert.ok(error instanceof LootRollError);
    assert.ok(error instanceof Error);
    assert.equal(error.name, 'LootRollError');
    assert.equal(error.message, message);
    return true;
  });
}

function basicTable() {
  return {
    entries: [
      { id: 'a', weight: 1 },
      { id: 'b', weight: 1 },
    ],
  };
}

describe('createState', () => {
  it('returns a fresh zeroed state', () => {
    const first = createState();
    const second = createState();
    assert.deepEqual(first, { misses: 0 });
    assert.notEqual(first, second);
    first.misses = 4;
    assert.deepEqual(second, { misses: 0 });
  });
});

describe('validation', () => {
  const state = () => ({ misses: 0 });
  const random = () => 0;
  const table = () => basicTable();

  const cases = [
    [
      'rejects a null table',
      () => roll(null, state(), random),
      'table must be a plain object',
    ],
    [
      'rejects an array table',
      () => roll([], state(), random),
      'table must be a plain object',
    ],
    [
      'rejects a table without entries',
      () => roll({}, state(), random),
      'table.entries must be an array',
    ],
    [
      'rejects entries that are not an array',
      () => roll({ entries: {} }, state(), random),
      'table.entries must be an array',
    ],
    [
      'rejects an empty table',
      () => roll({ entries: [] }, state(), random),
      'table.entries must not be empty',
    ],
    [
      'rejects a null entry',
      () => roll({ entries: [null] }, state(), random),
      'entry must be a plain object',
    ],
    [
      'rejects an array entry',
      () => roll({ entries: [['a', 1]] }, state(), random),
      'entry must be a plain object',
    ],
    [
      'rejects a class instance entry',
      () => {
        class Box {
          constructor() {
            this.id = 'a';
            this.weight = 1;
          }
        }
        return roll({ entries: [new Box()] }, state(), random);
      },
      'entry must be a plain object',
    ],
    [
      'rejects a missing id',
      () => roll({ entries: [{ weight: 1 }] }, state(), random),
      'entry id must be a non-empty string',
    ],
    [
      'rejects an empty id',
      () => roll({ entries: [{ id: '', weight: 1 }] }, state(), random),
      'entry id must be a non-empty string',
    ],
    [
      'rejects a numeric id',
      () => roll({ entries: [{ id: 1, weight: 1 }] }, state(), random),
      'entry id must be a non-empty string',
    ],
    [
      'rejects a duplicate id',
      () =>
        roll(
          {
            entries: [
              { id: 'a', weight: 1 },
              { id: 'a', weight: 2 },
            ],
          },
          state(),
          random,
        ),
      'duplicate entry id: a',
    ],
    [
      'rejects a missing weight',
      () => roll({ entries: [{ id: 'a' }] }, state(), random),
      'entry weight must be a positive finite number',
    ],
    [
      'rejects a zero weight',
      () => roll({ entries: [{ id: 'a', weight: 0 }] }, state(), random),
      'entry weight must be a positive finite number',
    ],
    [
      'rejects a negative weight',
      () => roll({ entries: [{ id: 'a', weight: -2 }] }, state(), random),
      'entry weight must be a positive finite number',
    ],
    [
      'rejects negative zero weight',
      () => roll({ entries: [{ id: 'a', weight: -0 }] }, state(), random),
      'entry weight must be a positive finite number',
    ],
    [
      'rejects NaN weight',
      () =>
        roll({ entries: [{ id: 'a', weight: Number.NaN }] }, state(), random),
      'entry weight must be a positive finite number',
    ],
    [
      'rejects an infinite weight',
      () =>
        roll(
          { entries: [{ id: 'a', weight: Number.POSITIVE_INFINITY }] },
          state(),
          random,
        ),
      'entry weight must be a positive finite number',
    ],
    [
      'rejects a string weight',
      () => roll({ entries: [{ id: 'a', weight: '1' }] }, state(), random),
      'entry weight must be a positive finite number',
    ],
    [
      'rejects a zero pity threshold',
      () =>
        roll(
          { entries: [{ id: 'a', weight: 1, pityAfter: 0 }] },
          state(),
          random,
        ),
      'pityAfter must be a positive safe integer',
    ],
    [
      'rejects a fractional pity threshold',
      () =>
        roll(
          { entries: [{ id: 'a', weight: 1, pityAfter: 1.5 }] },
          state(),
          random,
        ),
      'pityAfter must be a positive safe integer',
    ],
    [
      'rejects an explicit undefined pity threshold',
      () =>
        roll(
          { entries: [{ id: 'a', weight: 1, pityAfter: undefined }] },
          state(),
          random,
        ),
      'pityAfter must be a positive safe integer',
    ],
    [
      'rejects two pity entries',
      () =>
        roll(
          {
            entries: [
              { id: 'a', weight: 1, pityAfter: 2 },
              { id: 'b', weight: 1, pityAfter: 3 },
            ],
          },
          state(),
          random,
        ),
      'only one entry may set pityAfter',
    ],
    [
      'rejects a non-finite total weight',
      () =>
        roll(
          {
            entries: [
              { id: 'a', weight: Number.MAX_VALUE },
              { id: 'b', weight: Number.MAX_VALUE },
            ],
          },
          state(),
          random,
        ),
      'total weight must be finite',
    ],
    [
      'rejects a null state',
      () => roll(table(), null, random),
      'state must be a plain object',
    ],
    [
      'rejects an array state',
      () => roll(table(), [], random),
      'state must be a plain object',
    ],
    [
      'rejects a state without misses',
      () => roll(table(), {}, random),
      'state.misses must be a non-negative safe integer',
    ],
    [
      'rejects a negative miss count',
      () => roll(table(), { misses: -1 }, random),
      'state.misses must be a non-negative safe integer',
    ],
    [
      'rejects a fractional miss count',
      () => roll(table(), { misses: 1.5 }, random),
      'state.misses must be a non-negative safe integer',
    ],
    [
      'rejects an unsafe miss count',
      () => roll(table(), { misses: Number.MAX_SAFE_INTEGER + 2 }, random),
      'state.misses must be a non-negative safe integer',
    ],
    [
      'rejects a non-function random source',
      () => roll(table(), state(), null),
      'random must be a function',
    ],
    [
      'rejects a random source that returns 1',
      () => roll(table(), state(), () => 1),
      'random() must return a finite number in [0, 1)',
    ],
    [
      'rejects a random source that returns a negative number',
      () => roll(table(), state(), () => -0.01),
      'random() must return a finite number in [0, 1)',
    ],
    [
      'rejects a random source that returns NaN',
      () => roll(table(), state(), () => Number.NaN),
      'random() must return a finite number in [0, 1)',
    ],
    [
      'rejects a random source that returns a string',
      () => roll(table(), state(), () => '0.2'),
      'random() must return a finite number in [0, 1)',
    ],
    [
      'rejects a zero roll count',
      () => rollMany(table(), state(), random, 0),
      'count must be a positive safe integer',
    ],
    [
      'rejects a fractional roll count',
      () => rollMany(table(), state(), random, 1.5),
      'count must be a positive safe integer',
    ],
    [
      'rejects a negative roll count',
      () => rollMany(table(), state(), random, -3),
      'count must be a positive safe integer',
    ],
  ];

  for (const [name, run, message] of cases) {
    it(name, () => {
      expectError(run, message);
    });
  }

  it('does not call random when validation fails', () => {
    let calls = 0;
    expectError(
      () =>
        rollMany(
          { entries: [] },
          state(),
          () => {
            calls += 1;
            return 0;
          },
          0,
        ),
      'table.entries must not be empty',
    );
    assert.equal(calls, 0);
  });

  it('propagates exceptions from the random source', () => {
    const boom = new Error('source failed');
    assert.throws(
      () =>
        roll(table(), state(), () => {
          throw boom;
        }),
      (error) => {
        assert.equal(error, boom);
        return true;
      },
    );
  });
});

describe('weighted selection', () => {
  it('treats negative zero as a zero sample', () => {
    const result = roll(basicTable(), createState(), () => -0);
    assert.equal(result.entry.id, 'a');
  });

  it('selects the first entry for a zero sample', () => {
    const result = roll(
      {
        entries: [
          { id: 'a', weight: 1 },
          { id: 'b', weight: 3 },
        ],
      },
      createState(),
      () => 0,
    );
    assert.equal(result.entry.id, 'a');
    assert.deepEqual(result.state, { misses: 0 });
  });

  it('gives an exact boundary to the following entry', () => {
    const table = {
      entries: [
        { id: 'a', weight: 1 },
        { id: 'b', weight: 1 },
      ],
    };
    assert.equal(roll(table, createState(), () => 0.4999999).entry.id, 'a');
    assert.equal(roll(table, createState(), () => 0.5).entry.id, 'b');
    assert.equal(
      roll(table, createState(), () => 0.999999999999).entry.id,
      'b',
    );
  });

  it('splits three equal weights on thirds', () => {
    const table = {
      entries: [
        { id: 'a', weight: 1 },
        { id: 'b', weight: 1 },
        { id: 'c', weight: 1 },
      ],
    };
    assert.equal(roll(table, createState(), () => 0).entry.id, 'a');
    assert.equal(roll(table, createState(), () => 1 / 3).entry.id, 'b');
    assert.equal(roll(table, createState(), () => 2 / 3).entry.id, 'c');
    assert.equal(
      roll(table, createState(), () => 0.9999999999999999).entry.id,
      'c',
    );
  });

  it('accepts integer and float weights together', () => {
    const table = {
      entries: [
        { id: 'a', weight: 1 },
        { id: 'b', weight: 0.5 },
        { id: 'c', weight: 2.5 },
      ],
    };
    assert.equal(roll(table, createState(), () => 0).entry.id, 'a');
    assert.equal(roll(table, createState(), () => 0.9).entry.id, 'c');
  });

  it('accepts a very small positive weight', () => {
    const table = {
      entries: [
        { id: 'tiny', weight: Number.MIN_VALUE },
        { id: 'rest', weight: 1 },
      ],
    };
    assert.equal(roll(table, createState(), () => 0).entry.id, 'tiny');
    assert.equal(roll(table, createState(), () => 0.5).entry.id, 'rest');
  });

  it('returns the only entry for any in-range sample', () => {
    const table = { entries: [{ id: 'only', weight: 4, label: 'solo' }] };
    let calls = 0;
    const result = roll(table, { misses: 8 }, () => {
      calls += 1;
      return 0.7;
    });
    assert.equal(calls, 1);
    assert.deepEqual(result.entry, { id: 'only', weight: 4, label: 'solo' });
    assert.deepEqual(result.state, { misses: 0 });
  });

  it('keeps ids distinct when they differ only by spaces', () => {
    const table = {
      entries: [
        { id: 'a', weight: 1 },
        { id: 'a ', weight: 1 },
        { id: ' ', weight: 1 },
      ],
    };
    assert.equal(roll(table, createState(), () => 0).entry.id, 'a');
    assert.equal(roll(table, createState(), () => 0.5).entry.id, 'a ');
    assert.equal(roll(table, createState(), () => 0.9).entry.id, ' ');
  });

  it('copies an id that matches an object prototype key', () => {
    const result = roll(
      { entries: [{ id: '__proto__', weight: 1, pityAfter: 2 }] },
      createState(),
      () => 0,
    );
    assert.equal(result.entry.id, '__proto__');
    assert.equal(result.entry.weight, 1);
    assert.equal(Object.getPrototypeOf(result.entry), Object.prototype);
  });

  it('accepts plain objects with a null prototype', () => {
    const entry = Object.create(null);
    entry.id = 'a';
    entry.weight = 1;
    const table = Object.create(null);
    table.entries = [entry];
    const state = Object.create(null);
    state.misses = 0;
    const result = roll(table, state, () => 0);
    assert.equal(result.entry.id, 'a');
    assert.equal(result.entry.weight, 1);
  });

  it('maps a repeating sample grid onto weight buckets', () => {
    const values = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
    let index = 0;
    const { picks } = rollMany(
      {
        entries: [
          { id: 'a', weight: 1 },
          { id: 'b', weight: 1 },
          { id: 'c', weight: 1 },
        ],
      },
      createState(),
      () => {
        const value = values[index % values.length];
        index += 1;
        return value;
      },
      10000,
    );
    const counts = { a: 0, b: 0, c: 0 };
    for (const pick of picks) {
      counts[pick.id] += 1;
    }
    assert.deepEqual(counts, { a: 4000, b: 3000, c: 3000 });
    assert.equal(index, 10000);
  });
});

describe('pity', () => {
  const table = {
    entries: [
      { id: 'a', weight: 1 },
      { id: 'b', weight: 1, pityAfter: 3 },
      { id: 'c', weight: 1 },
    ],
  };

  it('counts misses and resets on a natural pity hit', () => {
    const samples = [0, 0, 1 / 3];
    let index = 0;
    let calls = 0;
    let state = createState();
    const ids = [];
    for (let step = 0; step < samples.length; step += 1) {
      const result = roll(table, state, () => {
        calls += 1;
        const value = samples[index];
        index += 1;
        return value;
      });
      ids.push(result.entry.id);
      state = result.state;
    }
    assert.deepEqual(ids, ['a', 'a', 'b']);
    assert.deepEqual(state, { misses: 0 });
    assert.equal(calls, 3);
  });

  it('forces the pity entry after N misses and skips random', () => {
    const samples = [0, 0, 0.5, 0.9, 0, 0, 0, 0];
    let index = 0;
    let calls = 0;
    const result = rollMany(
      table,
      createState(),
      () => {
        calls += 1;
        const value = samples[index];
        index += 1;
        return value;
      },
      9,
    );
    assert.deepEqual(
      result.picks.map((pick) => pick.id),
      ['a', 'a', 'b', 'c', 'a', 'a', 'b', 'a', 'a'],
    );
    assert.deepEqual(result.state, { misses: 2 });
    assert.equal(calls, samples.length);
    assert.equal(result.picks[6].pityAfter, 3);
    assert.equal(Object.hasOwn(result.picks[0], 'pityAfter'), false);
  });

  it('forces when misses is already at or above the threshold', () => {
    let calls = 0;
    const random = () => {
      calls += 1;
      return 0;
    };
    const atThreshold = roll(table, { misses: 3 }, random);
    const aboveThreshold = roll(table, { misses: 100 }, random);
    assert.equal(atThreshold.entry.id, 'b');
    assert.deepEqual(atThreshold.state, { misses: 0 });
    assert.equal(aboveThreshold.entry.id, 'b');
    assert.deepEqual(aboveThreshold.state, { misses: 0 });
    assert.equal(calls, 0);
  });

  it('still rolls normally one miss below the threshold', () => {
    let calls = 0;
    const result = roll(table, { misses: 2 }, () => {
      calls += 1;
      return 0;
    });
    assert.equal(calls, 1);
    assert.equal(result.entry.id, 'a');
    assert.deepEqual(result.state, { misses: 3 });
  });

  it('does not require a successful random call when pity is already due', () => {
    const result = roll(table, { misses: 3 }, () => {
      throw new Error('unused');
    });
    assert.equal(result.entry.id, 'b');
  });

  it('still requires random to be a function when pity is due', () => {
    expectError(
      () => roll(table, { misses: 3 }, null),
      'random must be a function',
    );
  });

  it('alternates a miss and a forced hit when the threshold is 1', () => {
    let calls = 0;
    const result = rollMany(
      {
        entries: [
          { id: 'a', weight: 1 },
          { id: 'b', weight: 1, pityAfter: 1 },
        ],
      },
      createState(),
      () => {
        calls += 1;
        return 0;
      },
      4,
    );
    assert.deepEqual(
      result.picks.map((pick) => pick.id),
      ['a', 'b', 'a', 'b'],
    );
    assert.deepEqual(result.state, { misses: 0 });
    assert.equal(calls, 2);
  });

  it('does not force when the pity entry is selected naturally every time', () => {
    let calls = 0;
    const result = rollMany(
      {
        entries: [
          { id: 'a', weight: 1 },
          { id: 'b', weight: 1, pityAfter: 1 },
        ],
      },
      createState(),
      () => {
        calls += 1;
        return 0.75;
      },
      4,
    );
    assert.deepEqual(
      result.picks.map((pick) => pick.id),
      ['b', 'b', 'b', 'b'],
    );
    assert.deepEqual(result.state, { misses: 0 });
    assert.equal(calls, 4);
  });

  it('reaches the maximum safe miss count and then forces', () => {
    const wide = {
      entries: [
        { id: 'a', weight: 1 },
        { id: 'b', weight: 1, pityAfter: Number.MAX_SAFE_INTEGER },
      ],
    };
    const almost = roll(wide, { misses: Number.MAX_SAFE_INTEGER - 1 }, () => 0);
    assert.equal(almost.entry.id, 'a');
    assert.equal(almost.state.misses, Number.MAX_SAFE_INTEGER);
    let calls = 0;
    const forced = roll(wide, almost.state, () => {
      calls += 1;
      return 0;
    });
    assert.equal(calls, 0);
    assert.equal(forced.entry.id, 'b');
    assert.deepEqual(forced.state, { misses: 0 });
  });

  it('clears misses when the table has no pity entry', () => {
    const result = roll(
      basicTable(),
      { misses: 5, note: 'ignored' },
      () => 0.75,
    );
    assert.equal(result.entry.id, 'b');
    assert.deepEqual(result.state, { misses: 0 });
  });
});

describe('rollMany', () => {
  it('matches successive roll calls, including a forced pity roll', () => {
    const table = {
      entries: [
        { id: 'a', weight: 2 },
        { id: 'b', weight: 1, pityAfter: 4, label: 'kept' },
      ],
    };
    const samples = [0, 0.1, 0.2, 0.8, 0, 0.95];
    let left = 0;
    let right = 0;
    const randomA = () => {
      const value = samples[left];
      left += 1;
      return value;
    };
    const randomB = () => {
      const value = samples[right];
      right += 1;
      return value;
    };
    let state = { misses: 2, extra: true };
    const manual = [];
    for (let index = 0; index < 6; index += 1) {
      const result = roll(table, state, randomA);
      manual.push(result);
      state = result.state;
    }
    const batch = rollMany(table, { misses: 2, extra: true }, randomB, 6);
    assert.deepEqual(
      batch.picks,
      manual.map((result) => result.entry),
    );
    assert.deepEqual(batch.state, manual[manual.length - 1].state);
    assert.equal(batch.picks.length, 6);
    assert.equal(left, right);
  });

  it('returns independent copies of repeated picks', () => {
    const { picks } = rollMany(basicTable(), createState(), () => 0, 2);
    picks[0].weight = 9;
    assert.equal(picks[1].weight, 1);
    assert.notEqual(picks[0], picks[1]);
  });

  it('stops without returning partial picks when a later sample is invalid', () => {
    const input = { misses: 0 };
    let calls = 0;
    expectError(
      () =>
        rollMany(
          basicTable(),
          input,
          () => {
            calls += 1;
            return calls === 3 ? 1 : 0;
          },
          5,
        ),
      'random() must return a finite number in [0, 1)',
    );
    assert.equal(calls, 3);
    assert.deepEqual(input, { misses: 0 });
  });
});

describe('probabilities', () => {
  it('returns weight shares in table order', () => {
    const chances = probabilities(
      {
        entries: [
          { id: 'common', weight: 70 },
          { id: 'uncommon', weight: 25 },
          { id: 'rare', weight: 5, pityAfter: 20 },
        ],
      },
      { misses: 4 },
    );
    assert.deepEqual(chances, [
      { id: 'common', probability: 0.7 },
      { id: 'uncommon', probability: 0.25 },
      { id: 'rare', probability: 0.05 },
    ]);
  });

  it('uses equal shares for equal weights', () => {
    const chances = probabilities(
      {
        entries: [
          { id: 'a', weight: 1 },
          { id: 'b', weight: 1 },
          { id: 'c', weight: 1 },
        ],
      },
      createState(),
    );
    assert.deepEqual(
      chances.map((item) => item.probability),
      [1 / 3, 1 / 3, 1 / 3],
    );
  });

  it('sums float weights to one', () => {
    const chances = probabilities(
      {
        entries: [
          { id: 'a', weight: 0.1 },
          { id: 'b', weight: 0.2 },
          { id: 'c', weight: 0.7 },
        ],
      },
      createState(),
    );
    const sum = chances.reduce((total, item) => total + item.probability, 0);
    assert.ok(Math.abs(sum - 1) < 1e-12);
  });

  it('switches to a forced distribution at the pity threshold', () => {
    const table = {
      entries: [
        { id: 'a', weight: 9 },
        { id: 'b', weight: 1, pityAfter: 5 },
        { id: 'c', weight: 2 },
      ],
    };
    assert.deepEqual(probabilities(table, { misses: 4 }), [
      { id: 'a', probability: 9 / 12 },
      { id: 'b', probability: 1 / 12 },
      { id: 'c', probability: 2 / 12 },
    ]);
    assert.deepEqual(probabilities(table, { misses: 5 }), [
      { id: 'a', probability: 0 },
      { id: 'b', probability: 1 },
      { id: 'c', probability: 0 },
    ]);
    assert.deepEqual(probabilities(table, { misses: 9 }), [
      { id: 'a', probability: 0 },
      { id: 'b', probability: 1 },
      { id: 'c', probability: 0 },
    ]);
  });

  it('ignores stored misses when the table has no pity entry', () => {
    const chances = probabilities(basicTable(), { misses: 7 });
    assert.deepEqual(chances, [
      { id: 'a', probability: 0.5 },
      { id: 'b', probability: 0.5 },
    ]);
  });

  it('returns new arrays and objects on each call', () => {
    const table = basicTable();
    const state = createState();
    const first = probabilities(table, state);
    const second = probabilities(table, state);
    assert.notEqual(first, second);
    assert.notEqual(first[0], second[0]);
    first[0].probability = 0;
    assert.equal(second[0].probability, 0.5);
    assert.deepEqual(state, { misses: 0 });
  });
});

describe('immutability', () => {
  it('does not mutate frozen inputs and detaches the returned entry', () => {
    const first = Object.freeze({ id: 'a', weight: 2, tag: 'kept' });
    const second = Object.freeze({ id: 'b', weight: 1, pityAfter: 4 });
    const table = Object.freeze({
      entries: Object.freeze([first, second]),
      label: 'ignored',
    });
    const state = Object.freeze({ misses: 1, note: 'keep' });
    const beforeTable = structuredClone(table);
    const beforeState = structuredClone(state);
    const result = roll(table, state, () => 0);
    assert.deepEqual(table, beforeTable);
    assert.deepEqual(state, beforeState);
    assert.notEqual(result.entry, first);
    assert.notEqual(result.state, state);
    assert.deepEqual(result.entry, { id: 'a', weight: 2, tag: 'kept' });
    assert.deepEqual(result.state, { misses: 2 });
    result.entry.weight = 9;
    result.state.misses = 9;
    assert.equal(first.weight, 2);
    assert.equal(state.misses, 1);
  });
});

describe('usage example', () => {
  it('matches the documented sequence', () => {
    const table = {
      entries: [
        { id: 'common', weight: 70 },
        { id: 'uncommon', weight: 25 },
        { id: 'rare', weight: 5, pityAfter: 20 },
      ],
    };
    let state = createState();
    const first = roll(table, state, () => 0);
    state = first.state;
    const batch = rollMany(table, state, () => 0.5, 3);
    state = batch.state;
    const chances = probabilities(table, state);
    assert.equal(first.entry.id, 'common');
    assert.deepEqual(first.state, { misses: 1 });
    assert.deepEqual(
      batch.picks.map((pick) => pick.id),
      ['common', 'common', 'common'],
    );
    assert.deepEqual(batch.state, { misses: 4 });
    assert.deepEqual(chances, [
      { id: 'common', probability: 0.7 },
      { id: 'uncommon', probability: 0.25 },
      { id: 'rare', probability: 0.05 },
    ]);
  });
});

describe('public surface', () => {
  it('exports the documented names', () => {
    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../src/index.js'),
      'utf8',
    );
    assert.equal(source.includes('Math.random'), false);
    assert.equal(source.includes('node:fs'), false);
    assert.equal(source.includes('node:http'), false);
    assert.equal(source.includes('node:https'), false);
    assert.equal(source.includes('node:net'), false);
    assert.equal(source.includes('fetch('), false);
    assert.deepEqual(Object.keys(api).sort(), [
      'LootRollError',
      'createState',
      'probabilities',
      'roll',
      'rollMany',
    ]);
  });
});
