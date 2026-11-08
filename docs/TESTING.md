# Testing Kova

Run tests from the repository root with Node 22 and pnpm:

- `pnpm test` runs the existing Node test suite and Jest unit tests. Unit tests need no containers.
- `pnpm test:integration` runs the existing Postgres integration tests, then Jest integration tests against fresh Postgres, Redis, and RabbitMQ Testcontainers.
- `pnpm test:e2e` starts the same services, applies the project migrations to the fresh Postgres database, and runs the Nest API through Supertest.
- `pnpm test:smoke` keeps the existing entry-point smoke test command.

## Local services with Docker Compose

Copy `.env.example` to `.env`, generate distinct random hexadecimal values for `COMPOSE_POSTGRES_PASSWORD` and `COMPOSE_RABBITMQ_PASSWORD`, and use the matching values in the host `DATABASE_URL`, `RABBITMQ_URL`, and optional `TEST_DATABASE_ADMIN_URL`. Start the local stack with `docker compose up --build`. PostgreSQL, Redis, RabbitMQ (including its management UI), and Mailpit publish loopback-only ports; the API, worker, scheduler, and migration job use the private Compose network. The migration job receives all three service URLs because it loads the shared runtime configuration, then completes before app processes start. The current worker and scheduler entrypoints exit cleanly after boot until their consumers and poller are implemented; Compose does not restart them. Mailpit is at `http://localhost:8026`; RabbitMQ management is at `http://localhost:15673`.

The stack keeps database and broker data in named volumes. `docker compose down` removes containers and the network while retaining those volumes. Dockerfiles exclude `.env` and run the application as the unprivileged `node` user. Nginx is not included; its gateway remains owner-managed. Local validation confirmed all services healthy and `GET http://localhost:3000/health` returning HTTP 200 with PostgreSQL, Redis, and RabbitMQ reported up.

## CI

`.github/workflows/ci.yml` runs on pushes to `main` and pull requests. It starts a short-lived PostgreSQL server with a generated password for the migration test, then runs lint, typecheck, unit and migration tests, Testcontainers integration and e2e suites, `pnpm audit --audit-level=moderate`, and a Docker image build. The audit gate fails on moderate, high, and critical advisories; low advisories remain visible in the audit output. The full workflow passed on `main` at commit `48ff96f` on 2026-11-08.

Docker must be running and reachable by the current user for integration and e2e tests. Testcontainers selects mapped local ports, generates the Postgres password for each run, and stops the containers after Jest exits. The application tests receive `DATABASE_URL`, `REDIS_URL`, `RABBITMQ_URL`, and `NODE_ENV=test` from the runner; no `.env` test secrets are required. The pre-existing Node integration tests continue to use their existing local test database setup.

File conventions:

- Fast Jest unit tests: `test/jest/unit/**/*.spec.ts`
- Tests using real services: `test/jest/integration/**/*.spec.ts`
- HTTP tests against the Nest app: `test/jest/e2e/**/*.spec.ts`
- Existing Node tests remain under `test/unit`, `test/integration`, and `test/smoke` with `*.test.ts` names.

Jest writes report-only coverage to `coverage/jest/`; no coverage threshold is enforced.
