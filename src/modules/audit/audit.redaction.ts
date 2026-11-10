const SENSITIVE_FIELD_PATTERN =
  /(password|passwd|token|secret|bvn|one.?time.?code|otp|authorization|cookie|raw.?body|webhook.?body)/i;

export function redactAuditData(value: unknown): unknown {
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw new Error('Audit state must be JSON serializable');
  }
  if (serialized === undefined) {
    throw new Error('Audit state must be JSON serializable');
  }

  return redact(JSON.parse(serialized) as unknown);
}

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value === null || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      SENSITIVE_FIELD_PATTERN.test(key) ? '[REDACTED]' : redact(child),
    ]),
  );
}
