import fc from 'fast-check';
import { describe, it } from '@jest/globals';
import {
  addKobo,
  kobo,
  MAX_KOBO,
  subtractKobo,
} from '../../../src/common/money/kobo';

describe('Kobo properties', () => {
  it('adding then subtracting any supported pair returns the original value', () => {
    const halfMax = MAX_KOBO / 2n;
    fc.assert(
      fc.property(
        fc.bigInt({ min: 0n, max: halfMax }),
        fc.bigInt({ min: 0n, max: halfMax }),
        (left, right) =>
          subtractKobo(addKobo(kobo(left), kobo(right)), kobo(right)) ===
          kobo(left),
      ),
    );
  });
});
