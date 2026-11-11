import { SetMetadata } from '@nestjs/common';

export const PAYMENT_IDEMPOTENCY_METADATA = 'kova:payment-idempotency';

/** Marks a payment POST to require a key and persist/replay its response. */
export function PaymentIdempotency(): MethodDecorator {
  return SetMetadata(PAYMENT_IDEMPOTENCY_METADATA, true);
}
