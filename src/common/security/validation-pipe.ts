import { BadRequestException, ValidationPipe } from '@nestjs/common';
import type { ValidationError } from 'class-validator';

export interface SafeValidationIssue {
  field: string;
  constraints: string[];
}

export class ApiValidationException extends BadRequestException {
  constructor(readonly issues: SafeValidationIssue[] = []) {
    super('Request validation failed');
  }
}

export function createApiValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    forbidUnknownValues: true,
    transformOptions: { enableImplicitConversion: false },
    exceptionFactory: (errors) =>
      new ApiValidationException(safeIssues(errors)),
  });
}

function safeIssues(errors: ValidationError[]): SafeValidationIssue[] {
  const issues: SafeValidationIssue[] = [];
  const visit = (error: ValidationError, depth: number): void => {
    if (issues.length >= 20 || depth > 5) return;
    const constraints = Object.keys(error.constraints ?? {});
    if (constraints.length > 0) {
      // Unknown-field names come from the request itself, so never record them.
      issues.push({
        field: constraints.includes('whitelistValidation')
          ? '<unknown>'
          : safeFieldName(error.property),
        constraints,
      });
    }
    for (const child of error.children ?? []) visit(child, depth + 1);
  };
  for (const error of errors) visit(error, 0);
  return issues;
}

function safeFieldName(property: string): string {
  return /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(property) ? property : '<field>';
}
