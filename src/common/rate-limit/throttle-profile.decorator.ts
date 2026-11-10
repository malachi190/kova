import { SetMetadata } from '@nestjs/common';
import type { ThrottleProfileName } from '../config/env-config';

export const THROTTLE_PROFILE_METADATA = 'kova:throttle-profile';

export function ThrottleProfile(
  profile: ThrottleProfileName,
): MethodDecorator & ClassDecorator {
  return SetMetadata(THROTTLE_PROFILE_METADATA, profile);
}
