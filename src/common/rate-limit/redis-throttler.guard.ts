import { Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerException,
  ThrottlerGuard,
  type ThrottlerModuleOptions,
  type ThrottlerRequest,
  type ThrottlerStorage,
} from '@nestjs/throttler';
import type { ThrottleProfileName } from '../config/env-config';
import { RedisThrottlerUnavailableError } from './redis-throttler.storage';
import { THROTTLE_PROFILE_METADATA } from './throttle-profile.decorator';

@Injectable()
export class RedisThrottlerGuard extends ThrottlerGuard {
  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storage: ThrottlerStorage,
    reflector: Reflector,
  ) {
    super(options, storage, reflector);
  }

  protected override async handleRequest(
    requestProps: ThrottlerRequest,
  ): Promise<boolean> {
    const { context, throttler } = requestProps;
    const profile =
      this.reflector.getAllAndOverride<ThrottleProfileName>(
        THROTTLE_PROFILE_METADATA,
        [context.getHandler(), context.getClass()],
      ) ?? 'default';
    if (throttler.name !== profile) return true;

    try {
      return await super.handleRequest(requestProps);
    } catch (error) {
      if (
        error instanceof RedisThrottlerUnavailableError &&
        profile === 'auth'
      ) {
        return true;
      }
      if (error instanceof ThrottlerException) {
        const { res } = this.getRequestResponse(context);
        this.setResponseHeader(
          res,
          'Retry-After',
          Math.max(1, Math.ceil(requestProps.blockDuration / 1000)),
        );
      }
      throw error;
    }
  }
}
