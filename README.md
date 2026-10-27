# @aneron/loot-roll

Weighted loot rolls with a pity counter.

## Purpose

`@aneron/loot-roll` selects an entry from a weighted table and tracks pity across rolls. The caller passes the current pity state in and receives the next state back. The caller also supplies a function that returns a number in the half-open interval [0, 1). The library does not call `Math.random`, does not read or write files, does not use the network, and has no runtime dependencies.

## Install

```sh
npm install @aneron/loot-roll
```

The package is ESM. It loads on Node.js 20 and later.

## Usage

```js
import { createState, probabilities, roll, rollMany } from '@aneron/loot-roll';

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
```

`first.entry.id` is `'common'` and `first.state.misses` is `1`. Each call in the batch also selects `'common'`, so `batch.state.misses` is `4`. `chances` is:

```js
[
  { id: 'common', probability: 0.7 },
  { id: 'uncommon', probability: 0.25 },
  { id: 'rare', probability: 0.05 },
];
```

A function such as `Math.random` can be passed by the caller. The library never calls `Math.random` itself.

## API

### `createState()`

Returns a new `{ misses: 0 }`.

### `roll(table, state, random)`

Returns `{ entry, state }`.

`table` is a plain object with an `entries` array. Each entry is a plain object:

- `id`: unique non-empty string.
- `weight`: finite number greater than 0. Integers and floats are both valid.
- `pityAfter` (optional): positive safe integer. At most one entry may set it.
- Other own enumerable fields are copied onto the picked entry.

`state` is a plain object with `misses`, a non-negative safe integer. `misses` is the number of completed rolls that did not return the pity entry.

`random` is a function. When the roll is not forced, it is called once and must return a finite number in [0, 1).

`entry` is a shallow copy of the selected table entry. `state` is a new object.

### `rollMany(table, state, random, count)`

Returns `{ picks, state }`.

`count` is a positive safe integer. `picks` has length `count`. On success this matches calling `roll` `count` times and threading the returned state through each call. `state` is the state after the last pick.

### `probabilities(table, state)`

Returns an array of `{ id, probability }` in table order. Each `probability` is the chance that the next `roll` with the same table and state returns that entry. The values sum to 1.

When the next roll is not forced, `probability` is `weight / totalWeight`. When the next roll is forced, the pity entry has probability 1 and every other entry has probability 0.

### `LootRollError`

Thrown when `table`, `state`, `random`, or `count` is invalid. A `random()` result outside [0, 1) also throws `LootRollError`. Exceptions thrown by `random` itself are not wrapped. Invalid input throws before the table or state objects are changed. Those objects are not mutated on success either.

## Design notes

State stays outside the library. Callers pass it in and receive a new state. The same table, the same state, and the same random sequence always produce the same picks.

Non-forced rolls scale the random sample by the total weight. Entries occupy successive half-open intervals in array order. A sample of 0 selects the first entry. A sample that lands exactly on a boundary belongs to the following entry. The last entry receives any remainder, including floating-point error that would otherwise fall past the total.

Pity is hard. If `pityAfter` is N, a roll whose incoming `misses` is greater than or equal to N returns the pity entry and a state of `{ misses: 0 }`. That roll does not call `random`. Any other result increases `misses` by 1, except a natural selection of the pity entry, which sets `misses` to 0. A table with no `pityAfter` always returns `{ misses: 0 }`.

With one pity entry, weight share `p`, and `pityAfter` N, the long-run rate of that entry is `p / (1 - (1 - p) ** (N + 1))`. Rolls that are not forced still use the table weights. Pity changes the long-run rate because a forced roll replaces what would have been another miss once `misses` has reached N.

Weights are summed with IEEE-754 addition. Very large or very small weights can make boundaries imprecise. Safe integers and ordinary decimal weights follow the selection rule above.

`rollMany` checks its arguments before it rolls. If a later `random()` call throws, no picks are returned and the caller's state object is left as it was.

## License

MIT. Copyright (c) 2026 Vadim Gubin.

The full text is in the LICENSE file.
