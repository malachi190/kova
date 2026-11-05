import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_KOBO,
  addKobo,
  formatKobo,
  kobo,
  multiplyKoboByBps,
  subtractKobo,
} from '../../src/common/money/kobo';

test('kobo factory, addition, and subtraction enforce non-negative PostgreSQL bigint values', () => {
  assert.equal(addKobo(kobo(120n), kobo(80n)), 200n);
  assert.equal(subtractKobo(kobo(200n), kobo(80n)), 120n);
  assert.equal(kobo(0n), 0n);
  assert.equal(kobo(MAX_KOBO), MAX_KOBO);
  assert.throws(() => kobo(-1n), RangeError);
  assert.throws(() => kobo(MAX_KOBO + 1n), RangeError);
  assert.throws(() => addKobo(kobo(MAX_KOBO), kobo(1n)), RangeError);
  assert.throws(() => subtractKobo(kobo(1n), kobo(2n)), RangeError);
});

test('basis-point multiplication uses integer half-up rounding', () => {
  assert.equal(multiplyKoboByBps(kobo(1n), 4_999), 0n);
  assert.equal(multiplyKoboByBps(kobo(1n), 5_000), 1n);
  assert.equal(multiplyKoboByBps(kobo(3n), 5_000), 2n);
  assert.equal(multiplyKoboByBps(kobo(1_000_000n), 500), 50_000n);
  assert.equal(multiplyKoboByBps(kobo(0n), 0), 0n);
  assert.throws(() => multiplyKoboByBps(kobo(1n), -1), RangeError);
  assert.throws(() => multiplyKoboByBps(kobo(1n), 1.5), RangeError);
  assert.throws(() => multiplyKoboByBps(kobo(MAX_KOBO), 10_001), RangeError);
});

test('NGN formatting preserves fractional kobo and large integer amounts exactly', () => {
  assert.equal(formatKobo(kobo(0n)), '₦0.00');
  assert.equal(formatKobo(kobo(123_456n)), '₦1,234.56');
  assert.equal(
    formatKobo(kobo(9_007_199_254_740_991n)),
    '₦90,071,992,547,409.91',
  );
});
