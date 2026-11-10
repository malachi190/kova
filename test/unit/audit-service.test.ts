import assert from 'node:assert/strict';
import test from 'node:test';
import { AuditService } from '../../src/modules/audit/audit.service';
import { redactAuditData } from '../../src/modules/audit/audit.redaction';
import { validateAuditRecord } from '../../src/modules/audit/audit.validation';

test('audit redaction removes sensitive nested fields without mutating input', () => {
  const input = {
    name: 'Vendor',
    credentials: { accessToken: 'secret', authorization: 'Bearer abc' },
    history: [{ bvn: '123', one_time_code: '456', safe: true }],
  };

  assert.deepEqual(redactAuditData(input), {
    name: 'Vendor',
    credentials: {
      accessToken: '[REDACTED]',
      authorization: '[REDACTED]',
    },
    history: [{ bvn: '[REDACTED]', one_time_code: '[REDACTED]', safe: true }],
  });
  assert.equal(input.credentials.accessToken, 'secret');
});

test('audit input validation enforces actor, UUID, IP, and length rules', () => {
  const valid = {
    actorType: 'system' as const,
    actorId: null,
    action: 'deal.created',
    entity: 'deal',
    entityId: '3f2b6f70-ff99-4a69-9a80-04bdd1b2430b',
  };

  assert.equal(validateAuditRecord(valid).actorType, 'system');
  assert.throws(
    () =>
      validateAuditRecord({
        ...valid,
        actorType: 'vendor',
        actorId: null,
      }),
    /Invalid audit record/,
  );
  assert.throws(
    () => validateAuditRecord({ ...valid, ip: 'not-an-ip' }),
    /Invalid audit record/,
  );
  assert.throws(
    () => validateAuditRecord({ ...valid, action: 'a'.repeat(129) }),
    /Invalid audit record/,
  );
});

test('audit service exposes record and query only', () => {
  const service = Object.create(AuditService.prototype) as AuditService;
  assert.equal(typeof service.record, 'function');
  assert.equal(typeof service.findByEntity, 'function');
  assert.equal('update' in service, false);
  assert.equal('delete' in service, false);
});
