export type Kobo = bigint & { readonly __kobo: unique symbol };

export const MAX_KOBO = 9_223_372_036_854_775_807n;
const BASIS_POINTS = 10_000n;
const HALF_BASIS_POINT = BASIS_POINTS / 2n;

export function kobo(value: bigint): Kobo {
  if (value < 0n || value > MAX_KOBO) {
    throw new RangeError('Kobo value is outside the supported range');
  }
  return value as Kobo;
}

export function addKobo(left: Kobo, right: Kobo): Kobo {
  return kobo(left + right);
}

export function subtractKobo(left: Kobo, right: Kobo): Kobo {
  if (right > left) {
    throw new RangeError('Kobo subtraction cannot produce a negative amount');
  }
  return kobo(left - right);
}

export function multiplyKoboByBps(amount: Kobo, basisPoints: number): Kobo {
  if (!Number.isSafeInteger(basisPoints) || basisPoints < 0) {
    throw new RangeError('Basis points must be a non-negative safe integer');
  }

  const scaled = amount * BigInt(basisPoints);
  return kobo((scaled + HALF_BASIS_POINT) / BASIS_POINTS);
}

export function formatKobo(amount: Kobo, locale = 'en-NG'): string {
  const wholeNaira = amount / 100n;
  const fractionalKobo = (amount % 100n).toString().padStart(2, '0');
  const formatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return formatter
    .formatToParts(wholeNaira)
    .map((part) => (part.type === 'fraction' ? fractionalKobo : part.value))
    .join('');
}
