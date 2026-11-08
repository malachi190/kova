import request from 'supertest';
import { describe, it } from '@jest/globals';
import { bootTestApi } from '../../helpers/test-api';

describe('Kova API e2e', () => {
  it('boots with Testcontainers services and reports each dependency healthy', async () => {
    const app = await bootTestApi();
    try {
      await request(app.getHttpServer())
        .get('/health')
        .expect(200)
        .expect({
          status: 'ok',
          dependencies: {
            postgres: 'up',
            redis: 'up',
            rabbitmq: 'up',
          },
        });
    } finally {
      await app.close();
    }
  });
});
