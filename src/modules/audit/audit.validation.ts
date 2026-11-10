import { isIP } from 'node:net';
import { z } from 'zod';

export const auditRecordSchema = z
  .object({
    actorType: z.enum(['vendor', 'admin', 'buyer', 'system']),
    actorId: z.string().uuid().nullable().optional(),
    action: z
      .string()
      .trim()
      .min(1)
      .max(128)
      .regex(/^[a-zA-Z][a-zA-Z0-9_.:-]*$/),
    entity: z.string().trim().min(1).max(100),
    entityId: z.string().uuid(),
    before: z.unknown().optional(),
    after: z.unknown().optional(),
    ip: z
      .string()
      .refine((value) => isIP(value) !== 0, 'must be a valid IP address')
      .nullable()
      .optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.actorType === 'system' && value.actorId != null) {
      context.addIssue({
        code: 'custom',
        path: ['actorId'],
        message: 'system actors must not have an actor ID',
      });
    }
    if (value.actorType !== 'system' && !value.actorId) {
      context.addIssue({
        code: 'custom',
        path: ['actorId'],
        message: 'actor ID is required for non-system actors',
      });
    }
  });

export type AuditRecordInput = z.input<typeof auditRecordSchema>;
export type ValidAuditRecord = z.output<typeof auditRecordSchema>;

export function validateAuditRecord(input: AuditRecordInput): ValidAuditRecord {
  const result = auditRecordSchema.safeParse(input);
  if (!result.success) throw new Error('Invalid audit record');
  return result.data;
}
