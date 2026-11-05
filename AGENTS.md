# AGENTS.md: Kova

Read this file fully before every task. Then read `OUTLINE.md` and work from it.

## 0. How to work in this repository

1. **Follow `OUTLINE.md` in order**, phase by phase and feature by feature. Do not skip ahead and do not build features that are not in the outline.
2. **One feature at a time.** Keep changes small and reviewable. A feature is done only when its acceptance criteria are met, its tests pass, lint and type checks pass, and its checkbox in `OUTLINE.md` is ticked.
3. **Ask before guessing.** If something is missing, unclear, or conflicts with this file, stop and ask the owner. Always ask when a task touches money, security, legal or regulatory matters, or anything in section 14 (Open decisions). When you ask, give your recommended answer and the reason, so the owner can reply quickly.
4. **Do not change the rules in this file** (or the business rules in section 4) without the owner's written approval. If you think a rule is wrong, say so and propose a change, but keep following the rule until it is approved.
5. **Phase checkpoints.** At the end of each phase, write a short summary (what was built, tests added, anything uncertain, decisions needed) and wait for the owner's go-ahead before starting the next phase. The owner may say "continue through" to skip a checkpoint.
6. **Keep the docs current.** When you add a command, config value, or convention, update this file. When you finish a feature, tick it in `OUTLINE.md`.
7. **Never fake it.** Do not hard-code test values, disable tests, stub out real behaviour in production code, or mark work as done when it is not.
8. **Infra work belongs to the owner.** Do not write Dockerfiles, Docker Compose files, Nginx configs, CI/CD pipelines, Terraform, Kubernetes manifests, or monitoring/observability/deployment plumbing unless the owner explicitly asks. When a feature needs infra work, stop and notify the owner (see "Infrastructure work is the owner's" below), then continue with everything that is not infra.

## Hard rules (never break these)

1. **Money is integers in kobo.** Never floats or decimals. Use the shared `Kobo` type and helpers for all money math.
2. **The ledger is append-only, balanced, and idempotent.** Only the `ledger` module writes ledger tables. Never `UPDATE` or `DELETE` ledger rows; fix mistakes with reversing entries.
3. **Deal status changes only through `DealStateService`**, using a conditional update ("change to PAID only if currently CREATED"). Every transition writes a `deal_events` row and an outbox event in the same database transaction.
4. **Never trust a webhook or a browser redirect alone.** Verify the signature on the raw body, then verify with the Paystack API, then check reference, amount, and currency against the deal.
5. **All Paystack access goes through the `PaymentProvider` interface.** No other module imports Paystack code or calls its HTTP API.
6. **Generate and save our own unique reference before every Paystack call** (`pay_`, `po_`, `rf_` plus a UUID). A timeout never means "failed": check by reference first. Never retry a payout or refund blindly.
7. **Every state-changing POST requires an `Idempotency-Key` header.**
8. **Events are published only through the outbox**, written in the same transaction as the state change. Never publish to RabbitMQ directly from a request handler. Every consumer is idempotent (inbox table).
9. **The server computes price, fee, and total.** Never accept an amount from a client. The fee is calculated when the deal is created and stored on the deal.
10. **Never log or return** BVNs, passwords, tokens, one-time codes, secret keys, or raw webhook bodies containing personal data. Redact them. BVNs are stored with AES-256-GCM, the key lives outside the database, and decryption happens only in the verification worker.
11. **IP address and user agent are metadata only** (fraud checks and rate limiting). They are never an identity and never a pass/fail check. Buyer identity is the normalized email.
12. **The service fee is never refunded.** A refund returns the item price only. Disputes end in a full release or a full refund, never a split.
13. **Check authorization on every request** (a vendor sees only their own data). Deal links use long random tokens, stored hashed. Never use sequential IDs in URLs.
14. **Respect the kill switch.** Check the `payouts_paused` flag and the vendor freeze before every payout.
15. **No secrets in git.** Configuration comes from environment variables, validated at startup. Test keys everywhere except production.
16. **Do not use live Paystack keys or deploy to production** until the owner confirms in writing that the licensing and regulatory review is done.
17. **Do not add a dependency** without a stated reason. Pin versions and run `pnpm audit`.
18. **Never weaken tests, lint rules, type strictness, or security headers** to make something pass.

## 0a. Infrastructure work is the owner's

The owner is following a separate **infra engineering roadmap** (Linux and networking, Docker, CI/CD, Kubernetes, cloud/IaC, observability, reliability drills, and a security layer) and is using Kova as the base project to apply every part of it. All infrastructure work is therefore the owner's to do by hand. Codex builds the application, not the infrastructure.

**Codex must not do (unless the owner explicitly asks):**

- Dockerfiles and Docker Compose files (including the Phase 0 local stack)
- The Nginx gateway (added to the plan now; see `OUTLINE.md` Phase 0): a small gateway in front of the API that routes requests via Nginx, with TLS termination, request size limits, rate limiting on payment endpoints, and forwarding of real client headers
- CI/CD pipelines, image registries, image scanning setup
- Terraform / cloud resources / Kubernetes manifests
- Metrics, dashboards, and alerting infrastructure

**What Codex must do instead:**

- When a feature or phase reaches a point that needs infra work, **stop and notify the owner**: say exactly what infra piece is needed, which feature it unblocks, and what the acceptance criteria for it should be. Then wait for the owner or continue with non-infra parts in the meantime.
- Build the application so it runs correctly inside the owner's infra (for example: read config from environment variables, handle SIGTERM gracefully, expose health endpoints). Treat the owner's infra choices as fixed input.
- Future infra work that is not in the roadmap will be introduced by the owner later; when it is, integrate with it and update these docs.

**Reminder triggers.** Notify the owner at minimum when reaching: `OUTLINE.md` Phase 0.1/0.2 (entry-point packaging and the local Docker Compose stack), Phase 0.11 (Nginx gateway), Phase 0.9 (CI), Phase 8.5 (observability tooling), and Phase 9 (deployment). Also flag any other point where infra work appears.

## 1. Project summary

**Kova** is an escrow payment platform for social commerce in Nigeria. It holds a buyer's money until the vendor delivers, so neither side has to trust a stranger on Instagram or WhatsApp. The name sounds like "cover": we have got you covered.

**Problem.** Buyers fear scams and vendors never ship. Vendors get fooled by fake transfer alerts. Chat apps have no payment protection.

**Solution.** The vendor creates a deal and pastes a payment link into the chat. The buyer pays through Paystack. Kova holds the money in a ledger. When the buyer confirms delivery (or a timer runs out), the vendor is paid. If something goes wrong, the buyer opens a dispute and the funds freeze until an admin decides.

**Two goals.** A real product with a real pain point, and a portfolio project that demonstrates core payment-system engineering: idempotency, outbox and inbox patterns, async pipelines, webhooks, a double-entry ledger, state machines, reconciliation, retries, and unknown-outcome handling.

**Core flow**
1. Vendor creates a deal (item, price, delivery window) and gets a link.
2. Vendor pastes the link into the DM.
3. Buyer opens the link, sees price, service fee, and total, and pays through Paystack.
4. Paystack webhook is verified. Money moves to **held** in the ledger. The vendor is told to ship.
5. Vendor marks the order shipped.
6. Buyer confirms receipt. The money moves to the vendor's **available** balance and is paid out to their bank.
7. If the buyer does not respond, release happens automatically 48 hours after the delivery window ends.
8. If the buyer opens a dispute, funds freeze until an admin decides: release the full price to the vendor, or refund the full price to the buyer.

## 2. Scope

**In scope (MVP):** vendor accounts and verification, payout accounts, deals and payment links, Paystack payments, ledger, escrow hold and release, payouts, refunds, disputes with evidence, admin panel, PDF receipts, email and SMS notifications, reconciliation, a Next.js buyer page and vendor and admin dashboards.

**Out of scope:** WhatsApp bot, multiple currencies, subscriptions or recurring billing, buyer accounts or wallets, mobile apps.

**Regulatory note.** Holding other people's money may need a licence in Nigeria. During development, funds sit in Kova's Paystack balance and holds are tracked in Kova's ledger. A review is required before any live launch (hard rule 16).

## 3. Tech stack and architecture

| Area | Decision |
|---|---|
| Language and framework | TypeScript (strict mode) with NestJS |
| Package manager | pnpm |
| Architecture | Modular monolith. One repository, one package, three entry points |
| Database | PostgreSQL, the source of truth |
| ORM | Drizzle ORM with SQL migrations (explicit transactions, `FOR UPDATE SKIP LOCKED`) |
| Broker | RabbitMQ through `amqplib` behind a small wrapper |
| Redis | Rate limiting, short locks, caching. Never the source of truth for money or state |
| Scheduling | Due times stored in Postgres and polled by the scheduler process |
| Validation | `class-validator` DTOs with whitelisting; `zod` for environment config |
| Auth | `@nestjs/jwt`, `argon2` |
| Rate limiting | `@nestjs/throttler` backed by Redis |
| Logging | `pino`, JSON, with correlation IDs |
| PDF | `pdfkit` (template in code, no browser) |
| Tests | Jest, Supertest, Testcontainers, fast-check, k6 |
| Client | Next.js with Typescript & Tailwind CSS (dashboard) |
| Payment provider | Paystack, behind the `PaymentProvider` interface |

**Entry points** (one Docker image, different start commands; building and running the image is the owner's infra work, see section 0a)
- `main.api.ts`: HTTP API
- `main.worker.ts`: RabbitMQ consumers (payments, payouts, refunds, notifications, receipts)
- `main.scheduler.ts`: outbox relay and scheduled-jobs poller

**Modules:** `auth`, `vendors`, `payout-accounts`, `deals`, `fees`, `payments`, `payouts`, `refunds`, `disputes`, `ledger`, `webhooks`, `messaging`, `scheduler`, `notifications`, `receipts`, `admin`, `audit`, `providers/paystack`, `providers/kyc`, `common`.

**Module rules**
- A module reads and writes only its own tables. Other modules go through its exported service or through events.
- Controllers are thin. Business logic lives in services.
- Only `ledger` writes ledger tables. Only `DealStateService` changes deal status.
- `fees` is a pure function module with no database access.

**Suggested layout**
```
src/
  main.api.ts  main.worker.ts  main.scheduler.ts
  modules/<module>/  (controller, service, repository, dto, tests)
  providers/paystack/  providers/kyc/
  common/  (config, errors, idempotency, rate-limit, correlation-id, logger, money)
  db/  (schema, migrations)
test/  (integration and end-to-end)
web/   (Next.js client; confirm layout at Phase 7)
```

## 4. Business rules (source of truth)

### 4.1 Vendors
- Register with email or phone number, password, full name, and store name. Verify email or phone with a one-time code.
- Passwords hashed with argon2. Short-lived access tokens (JWT) plus refresh tokens with rotation. Revoke refresh tokens on password change.
- **Verification before the first deal:** the vendor submits a BVN. A BVN verification provider (behind the `KycVerifier` interface) returns the identity name. The vendor's bank account number is resolved through Paystack. The account name must match the BVN name. Both checks are required.
- The BVN is kept (encrypted) after verification.
- Vendor statuses: `PENDING_VERIFICATION`, `ACTIVE`, `FROZEN`.

### 4.2 Buyers and admins
- Buyers have no account. They open the deal link and pay. Email is collected for Paystack and stored.
- **Buyer identity is the normalized email.** The dashboards show a generated display name from a hash of it (for example "Buyer #A7F3").
- After payment, the buyer gets a PDF receipt by email that contains the transaction ID.
- Admins have a separate login with mandatory 2FA (TOTP) and role-based permissions. Every admin action is written to the audit log.

### 4.3 Deals and timers
- Deal fields: item title, description, price (kobo), delivery window end, status, link token (stored hashed).
- Payment link expires 24 hours after creation.
- The vendor must ship within the delivery window.
- **Auto-release happens 48 hours after the delivery window ends.** Disputes can be opened until then.
- Every timer job re-checks the deal's current state before acting. A disputed deal is never auto-released.

### 4.4 Fees
The **buyer pays the service fee on top of the item price.** The vendor receives the full price. Kova absorbs Paystack's processing and payout costs from its fee.

**Formula** (all values in config, nothing hard-coded):
- 5% (500 bps) on the first ₦10,000 (1,000,000 kobo) of the price, plus 3.5% (350 bps) on the part above it.
- Minimum fee ₦200 (20,000 kobo).
- Integer math with half-up rounding: `(amount * bps + 5000) / 10000`, dropping the remainder. Round each part, then add them, then apply the minimum.
- Calculate the fee once when the deal is created and store `fee_kobo` and `total_kobo` on the deal.

**Test table (must pass exactly)**

| Price | Fee | Buyer pays |
|---|---|---|
| ₦2,000 | ₦200 (minimum) | ₦2,200 |
| ₦5,000 | ₦250 | ₦5,250 |
| ₦10,000 | ₦500 | ₦10,500 |
| ₦20,000 | ₦850 | ₦20,850 |
| ₦100,000 | ₦3,650 | ₦103,650 |
| ₦500,000 | ₦17,650 | ₦517,650 |

**Paystack's real fee** comes back with the transaction data. Record it in the ledger (`provider_fees`). Never estimate it. Payouts of ₦10,000 or more also carry a ₦50 government stamp duty; record that in `provider_fees` too. Profit per deal is `revenue - provider_fees`. Re-check Paystack pricing before launch.

### 4.5 Refunds and disputes
- A refund returns the **item price only**. The service fee is never refunded. The terms and the checkout page must say so clearly.
- Every refund stores a `refund_reason`.
- Refund triggers: vendor cancels after payment, vendor misses the ship deadline, admin rules for the buyer in a dispute, a late payment (after expiry or cancellation), or a duplicate payment.
- **Disputes** are opened from a separate link. The buyer enters the checkout email and the transaction ID from the receipt, then confirms with a one-time code sent to that email. The receipt alone is not proof.
- Buyer and vendor can upload evidence (type and size checked, stored in object storage).
- An admin reviews every dispute and decides: **release the full price to the vendor, or refund the full price to the buyer.** No partial splits.
- Flag buyers (by email) who repeatedly lose disputes and vendors with high dispute rates.

### 4.6 Limits and holds (values to confirm, see section 14)
- New vendors have a deal cap (suggested ₦50,000) until they have **5 deals that reached COMPLETED**.
- Daily payout limits for new vendors.
- Changing a payout bank account needs a one-time code, sends an email or SMS alert, and puts a payout hold of 24 to 48 hours on that vendor.

### 4.7 Payment methods
- **Bank transfer (Paystack Pay with Transfer) is the main method** and is shown first.
- **Cards stay available as a secondary option.** International cards can cost more than the service fee on small deals; this is a known risk (section 14).
- OPay: only if Paystack supports it (section 14). OPay users can always pay by transfer.
- Paystack's OTP approval for transfers is turned off, so payouts run automatically. This makes Kova's own payout controls (limits, holds, kill switch, reconciliation) essential.

## 5. Ledger rules

A double-entry, append-only ledger in Postgres. Ledger accounts are records of who is owed what; the real money sits in Kova's Paystack balance.

**Accounts.** Per vendor: `held` and `available`. Platform: `paystack_cash`, `revenue`, `provider_fees`, `payout_in_transit`, `refund_in_transit`. One `held` account per vendor; every entry carries a `deal_id`.

**Entries** (example: ₦5,000 deal, ₦250 fee, Paystack fee ₦179)

| Event | Debit | Credit |
|---|---|---|
| Buyer pays ₦5,250 | `paystack_cash` 5,071; `provider_fees` 179 | vendor `held` 5,000; `revenue` 250 |
| Release to vendor | vendor `held` 5,000 | vendor `available` 5,000 |
| Payout starts | vendor `available` 5,000 | `payout_in_transit` 5,000 |
| Payout succeeds | `payout_in_transit` 5,000 | `paystack_cash` 5,000 |
| Payout fee (and stamp duty if applicable) | `provider_fees` | `paystack_cash` |
| Payout fails or is reversed | `payout_in_transit` 5,000 | vendor `available` 5,000 |
| Refund requested (price only) | vendor `held` 5,000 | `refund_in_transit` 5,000 |
| Refund processed | `refund_in_transit` 5,000 | `paystack_cash` 5,000 |
| Refund fails | `refund_in_transit` 5,000 | vendor `held` 5,000 |

**Invariants**
- Debits equal credits in every transaction, enforced in code and by a database constraint.
- Each ledger transaction has a unique `reference` (for example `payment:{paystack_ref}`, `release:{deal_id}`), so repeats cannot post twice.
- Entries and the cached balance update in one DB transaction, with a row lock on the account. Vendor accounts can never go below zero.
- The application's database user has no `UPDATE` or `DELETE` permission on `ledger_entries`, `ledger_transactions`, `deal_events`, and `audit_log`.
- A daily reconciliation compares `paystack_cash` with the real Paystack balance.

## 6. State machines

Deal, payment, payout, and refund each have their own state machine. Do not mix them.

**Deal**

| From | To | Trigger |
|---|---|---|
| CREATED | PAID | Verified payment |
| CREATED | CANCELLED | Vendor cancels |
| CREATED | EXPIRED | Link timer |
| PAID | SHIPPED | Vendor marks shipped |
| PAID | REFUNDED | Vendor cancels, or misses ship deadline |
| PAID | DISPUTED | Buyer opens dispute |
| SHIPPED | COMPLETED | Buyer confirms, or auto-release |
| SHIPPED | DISPUTED | Buyer opens dispute |
| DISPUTED | COMPLETED | Admin rules for vendor |
| DISPUTED | REFUNDED | Admin rules for buyer |

`COMPLETED`, `REFUNDED`, `CANCELLED`, and `EXPIRED` are final.

- **Payment:** INITIALIZED, PENDING, SUCCESS, FAILED, ABANDONED
- **Payout:** PENDING, PROCESSING, SUCCESS, FAILED, REVERSED, UNKNOWN (timeout: ask Paystack by reference before doing anything else)
- **Refund:** PENDING, PROCESSING, SUCCESS, FAILED

**Rules:** conditional updates only; repeating a transition is a no-op; every transition writes an audit record and an outbox event in the same transaction.

**Edge cases to handle:** payment after expiry or cancellation (auto-refund); duplicate payment (refund the second); out-of-order or duplicate webhooks; bank transfer amount mismatch (do not mark PAID, send to manual review); excess bank transfer payments (Paystack refunds the excess automatically).

## 7. Paystack integration rules

**Calls:** initialize transaction, verify transaction, resolve account number, create transfer recipient (once per bank account, save the code), transfer, refund (item price only).

**Webhook events:** `charge.success`; `transfer.success`, `transfer.failed`, `transfer.reversed`; `refund.pending`, `refund.processing`, `refund.processed`, `refund.failed`.

**Webhook endpoint**
1. Read the raw body (enable raw body parsing for this route).
2. Verify the `x-paystack-signature` header: HMAC SHA512 of the raw body with the secret key, compared in constant time. Reject with 401 if invalid.
3. Save the raw event in `webhook_events` (unique on Paystack's event ID).
4. Return 200 immediately. Process asynchronously.
5. The worker re-verifies with the Paystack API before moving any money. Paystack retries non-200 responses for up to 72 hours and may deliver an event more than once.

**Other rules**
- Short HTTP timeouts. Timeouts lead to `UNKNOWN`, then a check by reference.
- A reversed transfer returns the money to the vendor's `available` balance and notifies the vendor.
- Use test keys outside production. Test and live webhook URLs are configured separately; use a tunnel for local development.
- Keep a fake `PaymentProvider` for tests.

## 8. Async pipeline rules

- **Outbox:** `outbox_events` is written with the state change. The relay (scheduler process) reads batches with `FOR UPDATE SKIP LOCKED`, publishes to RabbitMQ, and marks them published.
- **Inbox:** each consumer records the message ID in `inbox_messages` (unique on message ID and consumer) in the same transaction as its work. Duplicates are skipped.
- **RabbitMQ:** one topic exchange. Separate queues for payments, payouts, refunds, notifications, receipts. Each queue has a retry queue (exponential backoff with jitter) and a dead letter queue. Anything in a dead letter queue raises an alert.
- **Payout flow:** create the payout record with its reference first, then call the transfer with that reference. Success or pending: wait for the webhook. Timeout: mark `UNKNOWN`, check by reference, then decide.
- **Scheduler:** `scheduled_jobs` table, polled with `SKIP LOCKED`, safe to run in multiples. Jobs: link expiry, ship deadline, auto-release, reminders.
- **Safety nets:** sweepers for payments stuck in `PENDING` and payouts stuck in `UNKNOWN`, plus a daily reconciliation.
- Every message and log line carries a correlation ID.

## 9. Security rules (in addition to the hard rules)

- Rate limit login, one-time code sending and verification, payment initialization (per IP and per email), and dispute requests. Add a CAPTCHA after repeated payment attempts.
- One-time codes expire in 5 to 10 minutes, have limited attempts, and a cooldown between sends. Store them hashed.
- Validate all input and reject unknown fields. Use parameterized queries. Lock down CORS. Use security headers (Helmet). Limit request size.
- Uploads: check type and size, store in object storage, never serve user files from the app origin. Build receipt PDFs from a fixed template, never from user-written HTML.
- Admin: mandatory 2FA, role-based permissions, full audit log.
- Fraud signals to implement: deal caps for new vendors, dispute-rate monitoring, repeated losing disputes, many different emails from one IP, repeated failed payments, unusual deal patterns (flag for admin review).
- TLS everywhere. Database, Redis, and RabbitMQ only on a private network. Containers run as non-root with pinned image versions.
- Follow Nigeria's data protection law (NDPA): privacy policy, consent, and a retention limit for personal data such as IP addresses.

## 10. Coding conventions

- TypeScript `strict: true`. No `any` without a comment explaining why.
- Money type `Kobo` (integer). Helpers for add, subtract, fee math. Database columns are `bigint`.
- IDs are UUIDs. Timestamps are UTC (`timestamptz`).
- Layers: controller, service, repository. DTOs validated with whitelisting.
- Errors use one format: `code`, `message`, `details`, `correlationId`. Use stable error codes.
- Pagination is cursor-based. APIs live under `/v1`.
- Migrations are SQL files, forward-only, and backward-compatible with the previous app version. Never edit a migration that has been applied.
- Configuration is validated at startup; the app refuses to boot if something is missing.
- Graceful shutdown: workers finish the current message and acknowledge only after the database commit.
- Commits are small and use clear messages (`feat:`, `fix:`, `test:`, `chore:`).
- Comments explain *why*, not *what*.

## 11. Testing rules

- Unit tests: fee calculation (rounding, minimum, boundaries, the test table in 4.4), state machine rules, ledger balance checks.
- Property-based tests (fast-check): for any sequence of ledger operations, debits equal credits, vendor balances stay at or above zero, and all accounts sum to zero.
- Integration tests with real Postgres, RabbitMQ, and Redis in containers: outbox relay, inbox dedupe, retries, dead letter queue, scheduler.
- Webhook tests: valid and invalid signatures, duplicates, out-of-order events, using recorded Paystack payloads.
- Concurrency tests: parallel confirm and dispute on one deal, the same webhook delivered many times at once, two workers grabbing one job.
- End-to-end tests: happy path, refund, dispute, payout timeout (`UNKNOWN`), late payment after expiry, double payment.
- Failure injection: kill a worker mid-message, drop the broker, make Paystack time out; no money lost and none paid twice.
- Money-path code (ledger, fees, state machine, webhooks, payouts, refunds) needs very high coverage. Tests are written with the feature, not after.
- Use the fake `PaymentProvider` everywhere except one small suite that calls Paystack test mode.
- CI blocks merges on lint, type check, unit tests, and integration tests.

## 12. Commands

Phase 0 creates these. Keep this section accurate.

```
pnpm install --frozen-lockfile # install pinned dependencies
pnpm build                     # compile the application to dist/
pnpm lint                      # lint application and tests
pnpm format                    # format files with Prettier
pnpm format:check              # verify formatting
pnpm typecheck                 # type check application and tests
pnpm test                      # run unit and smoke tests
pnpm test:smoke                # smoke test all three entry points
pnpm audit                     # audit pinned dependencies
pnpm start:api                 # run the compiled API
pnpm start:worker              # run the compiled worker
pnpm start:scheduler           # run the compiled scheduler
docker compose up              # local infrastructure and services (owner-managed, see section 0a)
```

## 13. Definition of done (every feature)

- Acceptance criteria in `OUTLINE.md` are met.
- Tests were written and pass, including failure cases for money-path code.
- Lint, type check, and CI pass.
- No hard rule is broken. No secrets, no sensitive data in logs.
- Docs updated (this file, OpenAPI, README) where relevant.
- The checkbox in `OUTLINE.md` is ticked and the owner has a short summary.

## 14. Open decisions (ask the owner before building the dependent feature)

| Decision | Needed by | Until then |
|---|---|---|
| BVN provider: trial EaseID, Dojah, and Prembly, then pick one | Phase 1 (real verification) | Build against `KycVerifier` with a fake implementation |
| Card payments: accept the cost risk on small deals, or restrict cards on small deals | Phase 3 | Bank transfer first, cards allowed as secondary |
| OPay: does Paystack checkout have a dedicated OPay option | Phase 3 | OPay users pay by transfer |
| VAT: does it apply on top of Paystack fees | Phase 2 (fee reporting) | Treat Paystack's fee as returned by the API |
| New-vendor deal cap amount, daily payout limits, payout hold duration, minimum and maximum delivery window | Phase 2 and 4 | Use config values with the suggested defaults |
| Email provider, SMS provider, object storage, CAPTCHA provider | Phase 1, 5, 6 | Use interfaces with local fakes (Mailpit, local storage) |
| Client repository layout (`web/` folder or separate repo) | Phase 7 | Not started |
| Hosting target and domain | Phase 9 | Not started |
| Licensing and regulatory review | Before production | No live keys, no production deploy |
