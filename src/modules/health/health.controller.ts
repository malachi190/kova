import { Controller, Get, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { HealthService } from './health.service';

interface StatusResponse {
  status(code: number): this;
}

@Controller('health')
// Health probes must still report Redis outages when the throttle store is down.
@SkipThrottle()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  async check(@Res({ passthrough: true }) response: StatusResponse) {
    const report = await this.healthService.check();
    response.status(report.status === 'ok' ? 200 : 503);
    return report;
  }
}
