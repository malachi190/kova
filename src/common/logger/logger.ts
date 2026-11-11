import type { LoggerService } from '@nestjs/common';
import pino, { type DestinationStream, type Logger as PinoLogger } from 'pino';
import { chmodSync, closeSync, fchmodSync, mkdirSync, openSync } from 'node:fs';
import path from 'node:path';
import { getCorrelationId } from '../correlation/correlation-context';

export const ERROR_LOG_FILE = path.resolve(process.cwd(), 'logs', 'errors.log');

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
  const output = destination ?? defaultDestinations();
  return pino(
    {
      level: 'info',
      base: null,
      mixin: () => ({ correlationId: getCorrelationId() }),
      redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
    },
    output,
  );
}

export const appLogger = createLogger();

function defaultDestinations(): DestinationStream {
  const logDirectory = path.dirname(ERROR_LOG_FILE);
  mkdirSync(logDirectory, { recursive: true, mode: 0o700 });
  chmodSync(logDirectory, 0o700);
  const fileDescriptor = openSync(ERROR_LOG_FILE, 'a', 0o600);
  fchmodSync(fileDescriptor, 0o600);
  closeSync(fileDescriptor);
  const errorFile = pino.destination({ dest: ERROR_LOG_FILE, sync: false });

  return pino.multistream([
    { level: 'info', stream: process.stdout },
    { level: 'warn', stream: errorFile },
  ]);
}

export class PinoNestLogger implements LoggerService {
  private readonly logger = appLogger;

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
    const messageText = toSafeMessage(message, level);
    this.logger[level](
      { context: typeof context === 'string' ? context : undefined },
      messageText,
    );
  }
}

function toSafeMessage(
  message: unknown,
  level: 'info' | 'error' | 'warn' | 'debug' | 'trace' | 'fatal',
): string {
  if (message instanceof Error) {
    return /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(message.name)
      ? message.name
      : 'ApplicationError';
  }
  if (typeof message === 'string') {
    if (level === 'error' || level === 'warn' || level === 'fatal') {
      const safeType =
        /^([A-Za-z][A-Za-z0-9_]*(?:Error|Exception)|Error|Exception)(?=[:\s]|$)/.exec(
          message,
        )?.[1];
      return safeType ?? `Application ${level}`;
    }
    return message;
  }
  return 'Application log';
}
