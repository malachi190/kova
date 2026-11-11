# Testing Kova

Run tests from the repository root with Node 22 and pnpm:

- `pnpm test` runs the existing Node test suite and Jest unit tests. Unit tests need no containers.
- `pnpm test:integration` runs the existing Postgres integration tests, then Jest integration tests against fresh Postgres, Redis, and RabbitMQ Testcontainers.
- `pnpm test:e2e` starts the same services, applies the project migrations to the fresh Postgres database, and runs the Nest API through Supertest.
- `pnpm test:smoke` keeps the existing entry-point smoke test command.

## Local services with Docker Compose

Copy `.env.example` to `.env`, generate distinct random hexadecimal values for `COMPOSE_POSTGRES_PASSWORD` and `COMPOSE_RABBITMQ_PASSWORD`, and use the matching values in the host `DATABASE_URL`, `RABBITMQ_URL`, and optional `TEST_DATABASE_ADMIN_URL`. Start only the supporting services with `docker compose up -d`. PostgreSQL, Redis, and RabbitMQ (including its management UI) publish loopback-only ports. Compose does not build or run the API, worker, scheduler, or migrations. After PostgreSQL is healthy, run `pnpm db:migrate` from the host, then build and start the required app process locally (for example, `pnpm build` followed by `pnpm start:api`). RabbitMQ management is at `http://localhost:15673`.

The stack keeps database and broker data in named volumes. `docker compose down` removes service containers and the network while retaining those volumes. Existing app containers from older Compose configurations are orphans; apply the new services-only layout with `docker compose up -d --remove-orphans`. The API health endpoint is available at `http://localhost:3000/health` when the app is running locally with `pnpm start:api`.

## CI

`.github/workflows/ci.yml` runs on pushes to `main` and pull requests. It starts a short-lived PostgreSQL server with a generated password for the migration test, then runs lint, typecheck, unit and migration tests, Testcontainers integration and e2e suites, `pnpm audit --audit-level=moderate`, and a Docker image build. The audit gate fails on moderate, high, and critical advisories; low advisories remain visible in the audit output. The full workflow passed on `main` at commit `6a2636c` on 2026-11-08.

Docker must be running and reachable by the current user for integration and e2e tests. Testcontainers selects mapped local ports, generates the Postgres password for each run, and stops the containers after Jest exits. The application tests receive `DATABASE_URL`, `REDIS_URL`, `RABBITMQ_URL`, and `NODE_ENV=test` from the runner; no `.env` test secrets are required. The pre-existing Node integration tests continue to use their existing local test database setup.

File conventions:

- Fast Jest unit tests: `test/jest/unit/**/*.spec.ts`
- Tests using real services: `test/jest/integration/**/*.spec.ts`
- HTTP tests against the Nest app: `test/jest/e2e/**/*.spec.ts`
- Existing Node tests remain under `test/unit`, `test/integration`, and `test/smoke` with `*.test.ts` names.

Jest writes report-only coverage to `coverage/jest/`; no coverage threshold is enforced.
