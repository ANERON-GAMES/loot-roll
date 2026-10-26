export class LootRollError extends Error {
  constructor(message) {
    super(message);
    this.name = 'LootRollError';
  }
}

export function createState() {
  return { misses: 0 };
}

export function roll(table, state, random) {
  const compiled = compile(table, state);
  assertRandom(random);
  if (isForced(compiled)) {
    return { entry: cloneEntry(compiled.pity), state: { misses: 0 } };
  }
  const picked = selectEntry(compiled, random);
  return { entry: cloneEntry(picked), state: nextState(compiled, picked) };
}

export function rollMany(table, state, random, count) {
  compile(table, state);
  assertRandom(random);
  assertCount(count);
  const picks = [];
  let current = { misses: readMisses(state) };
  for (let index = 0; index < count; index += 1) {
    const result = roll(table, current, random);
    picks.push(result.entry);
    current = result.state;
  }
  return { picks, state: current };
}

export function probabilities(table, state) {
  const compiled = compile(table, state);
  if (isForced(compiled)) {
    return compiled.entries.map((entry) => ({
      id: entry.id,
      probability: entry === compiled.pity ? 1 : 0,
    }));
  }
  return compiled.entries.map((entry) => ({
    id: entry.id,
    probability: entry.weight / compiled.total,
  }));
}

function isForced(compiled) {
  return compiled.pity !== null && compiled.misses >= compiled.pity.pityAfter;
}

function nextState(compiled, picked) {
  if (compiled.pity === null || picked === compiled.pity) {
    return { misses: 0 };
  }
  return { misses: compiled.misses + 1 };
}

function assertRandom(random) {
  if (typeof random !== 'function') {
    throw new LootRollError('random must be a function');
  }
}

function assertCount(count) {
  if (!Number.isSafeInteger(count) || count < 1) {
    throw new LootRollError('count must be a positive safe integer');
  }
}

function readMisses(state) {
  if (!isPlainObject(state)) {
    throw new LootRollError('state must be a plain object');
  }
  if (!Object.hasOwn(state, 'misses')) {
    throw new LootRollError('state.misses must be a non-negative safe integer');
  }
  const misses = state.misses;
  if (!Number.isSafeInteger(misses) || misses < 0) {
    throw new LootRollError('state.misses must be a non-negative safe integer');
  }
  return misses === 0 ? 0 : misses;
}

function selectEntry(compiled, random) {
  const sample = random();
  if (
    typeof sample !== 'number' ||
    !Number.isFinite(sample) ||
    sample < 0 ||
    sample >= 1
  ) {
    throw new LootRollError('random() must return a finite number in [0, 1)');
  }
  const target = sample * compiled.total;
  let cumulative = 0;
  const last = compiled.entries.length - 1;
  for (let index = 0; index < last; index += 1) {
    cumulative += compiled.entries[index].weight;
    if (target < cumulative) {
      return compiled.entries[index];
    }
  }
  return compiled.entries[last];
}

function cloneEntry(entry) {
  return { ...entry };
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function compile(table, state) {
  if (!isPlainObject(table)) {
    throw new LootRollError('table must be a plain object');
  }
  if (!Object.hasOwn(table, 'entries') || !Array.isArray(table.entries)) {
    throw new LootRollError('table.entries must be an array');
  }
  if (table.entries.length === 0) {
    throw new LootRollError('table.entries must not be empty');
  }

  const seen = new Set();
  let pity = null;
  let total = 0;

  for (const entry of table.entries) {
    if (!isPlainObject(entry)) {
      throw new LootRollError('entry must be a plain object');
    }
    if (
      !Object.hasOwn(entry, 'id') ||
      typeof entry.id !== 'string' ||
      entry.id.length === 0
    ) {
      throw new LootRollError('entry id must be a non-empty string');
    }
    if (seen.has(entry.id)) {
      throw new LootRollError(`duplicate entry id: ${entry.id}`);
    }
    seen.add(entry.id);
    if (
      !Object.hasOwn(entry, 'weight') ||
      typeof entry.weight !== 'number' ||
      !Number.isFinite(entry.weight) ||
      entry.weight <= 0
    ) {
      throw new LootRollError('entry weight must be a positive finite number');
    }
    if (Object.hasOwn(entry, 'pityAfter')) {
      if (!Number.isSafeInteger(entry.pityAfter) || entry.pityAfter < 1) {
        throw new LootRollError('pityAfter must be a positive safe integer');
      }
      if (pity !== null) {
        throw new LootRollError('only one entry may set pityAfter');
      }
      pity = entry;
    }
    total += entry.weight;
  }

  if (!Number.isFinite(total)) {
    throw new LootRollError('total weight must be finite');
  }

  return {
    entries: table.entries,
    pity,
    total,
    misses: readMisses(state),
  };
}
