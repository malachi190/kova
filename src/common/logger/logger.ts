import type { LoggerService } from '@nestjs/common';
import pino, { type DestinationStream, type Logger as PinoLogger } from 'pino';
import { getCorrelationId } from '../correlation/correlation-context';

const REDACT_PATHS = [
  'password',
  '*.password',
  '**.password',
  'token',
  '*.token',
  '**.token',
  'accessToken',
  '*.accessToken',
  '**.accessToken',
  'refreshToken',
  '*.refreshToken',
  '**.refreshToken',
  'authorization',
  '*.authorization',
  '**.authorization',
  'cookie',
  '*.cookie',
  '**.cookie',
  'secret',
  '*.secret',
  '**.secret',
  'secretKey',
  '*.secretKey',
  '**.secretKey',
  'bvn',
  '*.bvn',
  '**.bvn',
  'otp',
  '*.otp',
  '**.otp',
  'oneTimeCode',
  '*.oneTimeCode',
  '**.oneTimeCode',
  'rawBody',
  '*.rawBody',
  '**.rawBody',
  'webhookBody',
  '*.webhookBody',
  '**.webhookBody',
];

export function createLogger(destination?: DestinationStream): PinoLogger {
  return pino(
    {
      level: 'info',
      base: null,
      mixin: () => ({ correlationId: getCorrelationId() }),
      redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
    },
    destination,
  );
}

export class PinoNestLogger implements LoggerService {
  private readonly logger = createLogger();

  log(message: unknown, ...optionalParams: unknown[]): void {
    this.write('info', message, optionalParams);
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    this.write('error', message, optionalParams);
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    this.write('warn', message, optionalParams);
  }

  debug(message: unknown, ...optionalParams: unknown[]): void {
    this.write('debug', message, optionalParams);
  }

  verbose(message: unknown, ...optionalParams: unknown[]): void {
    this.write('trace', message, optionalParams);
  }

  fatal(message: unknown, ...optionalParams: unknown[]): void {
    this.write('fatal', message, optionalParams);
  }

  private write(
    level: 'info' | 'error' | 'warn' | 'debug' | 'trace' | 'fatal',
    message: unknown,
    optionalParams: unknown[],
  ): void {
    const context = optionalParams.at(-1);
    const messageText = toSafeMessage(message);
    this.logger[level](
      { context: typeof context === 'string' ? context : undefined },
      messageText,
    );
  }
}

function toSafeMessage(message: unknown): string {
  if (typeof message === 'string') return message;
  if (message instanceof Error) return message.name;
  return 'Application log';
}
