# OUTLINE.md: Kova build plan

Build Kova from first commit to deployment by following this outline **in order, phase by phase, feature by feature**. `AGENTS.md` holds the project rules and business rules; this file says what to build and when.

## How to use this outline

1. Read `AGENTS.md` first. Its hard rules apply to every feature here.
2. Work on **one feature at a time**, in the order listed. Do not start a feature before the ones above it are done.
3. Each feature has: what to build, **Done when** (acceptance criteria), and **Tests**. Tick the checkbox only when all acceptance criteria are met and the tests pass.
4. **If anything is missing, unclear, or in conflict with `AGENTS.md`, stop and ask the owner before proceeding.** Give your recommended answer so the owner can reply quickly. Items marked **Ask first** must be confirmed before you build them. Open decisions are listed in `AGENTS.md` section 14.
5. **Phase checkpoint:** at the end of each phase, post a short summary (what was built, tests added, uncertainties, decisions needed) and wait for the owner's go-ahead before starting the next phase. The owner may say "continue through" to skip a checkpoint.
6. You may add small supporting tasks a feature obviously needs (for example a migration or a helper). Do not add new features. If you think a feature is missing, propose it to the owner.
7. Keep `AGENTS.md` (commands, conventions) and the API documentation up to date as you go.
8. **Infra work is the owner's, not Codex's.** The owner is following a separate infra engineering roadmap (Docker, Nginx, CI/CD, Kubernetes, cloud, observability, security) on top of Kova. Features that depend on infra are marked **Infra (owner)**. When you reach one, stop and notify the owner: say what is needed, which feature it unblocks, and its acceptance criteria. Do not write Dockerfiles, Compose files, Nginx configs, pipelines, Terraform, or deployment/monitoring plumbing unless the owner explicitly asks. The owner may add further infra work later; integrate it when it arrives. See `AGENTS.md` section 0a.

---

## Phase 0: Foundation

**Goal:** a running skeleton with tooling, infrastructure, and the shared pieces every later feature needs.

- [x] **0.1 Repository and tooling.** NestJS project with pnpm, strict TypeScript, lint, formatting, three entry points (`main.api.ts`, `main.worker.ts`, `main.scheduler.ts`), folder layout from `AGENTS.md`.
  *Done when:* `pnpm install`, `pnpm lint`, `pnpm typecheck`, and starting each entry point all work. *Tests:* a smoke test for each entry point. *(Packaging the entry points into Docker images is **Infra (owner)** — notify the owner when this feature is code-complete.)*
- [ ] **0.2 Local infrastructure.** **Infra (owner).** The owner writes the Docker Compose stack (Postgres, Redis, RabbitMQ with management UI local only, Mailpit) and the Dockerfiles for the three app processes. Codex owns only the application side: a `/health` (or equivalent) endpoint that reports each dependency, and graceful shutdown/SIGTERM handling so processes stop cleanly. When 0.1 is code-complete, notify the owner that the Compose stack and Dockerfiles are needed here.
  *Done when:* `docker compose up` (run by the owner) starts everything and the API health endpoint reports each dependency. *Tests:* health endpoint test (Codex); stack behaviour tests are the owner's.
- [x] **0.3 Configuration.** Environment variables validated with zod at startup. App refuses to boot if something is missing. `.env.example` committed (no secrets).
  *Done when:* missing or invalid config stops startup with a clear message. *Tests:* config validation tests.
- [ ] **0.4 Database setup.** Drizzle, migration tooling, `pnpm db:migrate`, test database helpers. First migrations: `idempotency_keys`, `audit_log`.
  *Done when:* migrations apply cleanly on an empty database and are forward-only. *Tests:* migration test on a fresh container.
- [ ] **0.5 Logging, correlation IDs, errors.** `pino` JSON logs, correlation ID middleware (read or create `x-correlation-id`), redaction of sensitive fields, global exception filter using the standard error format.
  *Done when:* every log line has a correlation ID and sensitive fields never appear in logs. *Tests:* redaction test, error format test.
- [ ] **0.6 Money utilities.** `Kobo` type and helpers (add, subtract, multiply by bps with half-up rounding), formatting helper for display.
  *Done when:* rounding is exact and no floats are used. *Tests:* unit tests including edge cases.
- [ ] **0.7 Idempotency support.** Interceptor for `Idempotency-Key`: stores key, request hash, and response; same key returns the stored response; same key with a different body is rejected; keys expire after 48 hours.
  *Done when:* repeating a request returns the same result without running the handler twice. *Tests:* repeat, mismatch, and concurrent-request tests.
- [ ] **0.8 Rate limiting and security basics.** Redis-backed throttling, Helmet, locked-down CORS, request size limits, DTO validation with whitelisting.
  *Done when:* unknown fields are rejected and limits are configurable per route. *Tests:* throttle and validation tests.
- [ ] **0.9 Test setup and CI.** Test tooling (Jest, Supertest, Testcontainers, fast-check) is Codex's. The GitHub Actions pipeline itself is **Infra (owner)** per the infra roadmap: install with frozen lockfile, lint, typecheck, unit and integration tests, `pnpm audit`. Notify the owner when the test suites exist and are ready to be wired into a pipeline.
  *Done when:* CI is green on the main branch and blocks merges on failure.
- [ ] **0.10 Audit log service.** Helper to write immutable audit records (actor, action, entity, before and after, IP).
  *Done when:* any module can record an audit entry in the same transaction as its change. *Tests:* unit and integration tests.
- [ ] **0.11 Nginx gateway. Infra (owner).** Added to the plan now (it was missing from the original). A small gateway in front of the API that routes requests via Nginx: TLS termination, request size limits, rate limiting on the payment endpoints, and forwarding real client headers (for example `X-Forwarded-For`) so the API can keep IP metadata for fraud checks and rate limiting. Codex's side: make the app honour forwarded headers correctly and document the headers/endpoints the gateway must pass through. Notify the owner once the API exists locally and this gateway is needed to reach it.
  *Done when:* the API (and later the client) is reachable only through the gateway, real client IPs are visible to the app, and the payment endpoints are rate limited at the edge. *Tests:* owner tests the gateway; Codex tests that the app reads forwarded headers and applies per-route limits correctly.

**Infra (owner) in this phase:** 0.1 packaging (Dockerfiles), 0.2 the Docker Compose stack, 0.9 the CI pipeline, and 0.11 the Nginx gateway. Codex notifies the owner at each of these points and does not build them.

**Ask first:** none. **Checkpoint.**

---

## Phase 1: Accounts and vendor onboarding

**Goal:** vendors can register, log in, get verified, and add a payout account. Admins can log in securely.

- [ ] **1.1 Vendor registration.** Email or phone, password (argon2), full name, store name. Duplicate checks. Vendor starts as `PENDING_VERIFICATION`.
  *Done when:* a vendor can register and cannot create a deal yet. *Tests:* validation, duplicates, password hashing.
- [ ] **1.2 One-time codes.** Code generation, hashing, expiry (5 to 10 minutes), attempt limits, send cooldown. Email through a provider interface (Mailpit locally) and SMS through a provider interface with a local fake.
  *Done when:* codes verify email or phone and cannot be brute-forced. *Tests:* expiry, attempts, cooldown. **Ask first:** email and SMS providers (use fakes until confirmed).
- [ ] **1.3 Login and sessions.** Short-lived access tokens, refresh tokens with rotation, logout, revocation on password change, login rate limiting and delays after failures.
  *Done when:* a stolen or reused refresh token is rejected and revoked. *Tests:* rotation, reuse detection, revocation.
- [ ] **1.4 `PaymentProvider` interface (first part).** Define the interface with `listBanks` and `resolveAccount`, a `FakePaymentProvider`, and a Paystack implementation for those two calls.
  *Done when:* no other code calls Paystack directly. *Tests:* fake provider tests, contract test against Paystack test mode.
- [ ] **1.5 Payout accounts.** Add and list bank accounts. Resolve the account name through the provider. Store bank code, account number, account name. Changing or adding an account sets a payout hold and triggers a one-time code and an alert.
  *Done when:* an unresolved account cannot be saved and a change starts a hold. *Tests:* resolve failure, hold set. **Ask first:** payout hold duration (24 to 48 hours).
- [ ] **1.6 BVN verification.** `KycVerifier` interface with a fake implementation. Vendor submits BVN. The BVN is encrypted (AES-256-GCM, key outside the database, key version stored) and kept after verification. A verification worker decrypts it, calls the verifier, compares the BVN name with the resolved account name, and records the result. On success the vendor becomes `ACTIVE`.
  *Done when:* the BVN is never stored or logged in plain text and name mismatches block activation. *Tests:* encryption round trip, mismatch, key version, no-log test. **Ask first:** which provider to use (EaseID, Dojah, or Prembly) before building the real implementation.
- [ ] **1.7 Admin accounts.** Separate admin login, mandatory TOTP 2FA, role-based permissions, all actions audited. Seed script for the first admin.
  *Done when:* an admin cannot act without 2FA. *Tests:* 2FA enforcement, role checks.
- [ ] **1.8 Vendor profile endpoint.** View profile, verification status, and payout accounts.
  *Done when:* a vendor sees only their own data. *Tests:* authorization tests.

**Ask first:** BVN provider, email and SMS providers, payout hold duration. **Checkpoint.**

---

## Phase 2: Core money logic

**Goal:** fees, the ledger, deals, and the deal state machine, fully tested before any real money moves.

- [ ] **2.1 Fee calculation.** Pure function in the `fees` module. Config values for tiers, rates, and minimum. Integer math with half-up rounding.
  *Done when:* the test table in `AGENTS.md` section 4.4 passes exactly, including boundaries (₦10,000 and one kobo above). *Tests:* unit and property tests (fee never below minimum, never negative, total equals price plus fee).
- [ ] **2.2 Ledger tables and permissions.** Migrations for `ledger_accounts`, `ledger_transactions`, `ledger_entries`. Balanced-transaction constraint, vendor balance check, unique references. Database role for the app with no `UPDATE` or `DELETE` on the append-only tables (`ledger_entries`, `ledger_transactions`, `deal_events`, `audit_log`).
  *Done when:* an unbalanced transaction, a duplicate reference, or an update to a ledger row is rejected by the database. *Tests:* constraint and permission tests.
- [ ] **2.3 Ledger service.** Create accounts (per vendor and platform). Posting functions for each event in `AGENTS.md` section 5: payment received, release, payout started, payout succeeded, payout fee, payout failed or reversed, refund requested, refund processed, refund failed. Row locks and cached balances. Idempotent by reference.
  *Done when:* every event posts balanced entries and repeats are no-ops. *Tests:* each posting, concurrent posting, property-based test (debits equal credits, no negative vendor balances, all accounts sum to zero).
- [ ] **2.4 Deals.** Create a deal (vendor must be `ACTIVE`): validate price and delivery window, apply the new-vendor cap, calculate and store fee and total, generate the link token (store only the hash), set the expiry. List and view deals for the vendor.
  *Done when:* the server alone decides price, fee, and total. *Tests:* cap enforcement, authorization, fee stored. **Ask first:** new-vendor cap amount and delivery window limits.
- [ ] **2.5 Deal state machine.** `DealStateService` with the allowed transitions from `AGENTS.md` section 6, conditional updates, version column, `deal_events` audit rows, and an outbox event hook (the outbox itself arrives in Phase 3, so write events through an interface that Phase 3 implements).
  *Done when:* illegal transitions are rejected and parallel attempts have exactly one winner. *Tests:* every allowed and disallowed transition, concurrency test.
- [ ] **2.6 Vendor cancel and public deal view.** Vendor can cancel a `CREATED` deal. Public endpoint returns the deal by link token (item, store name, price, fee, total, delivery window, status) without exposing private data.
  *Done when:* invalid or expired tokens reveal nothing. *Tests:* token tests, no-leak test.
- [ ] **2.7 Reconciliation-ready reporting.** Query helpers for vendor balances, per-deal ledger totals, and platform profit (`revenue - provider_fees`).
  *Done when:* per-deal totals match the ledger. *Tests:* integration tests.

**Ask first:** new-vendor cap, delivery window limits, VAT on Paystack fees. **Checkpoint (owner reviews fees, ledger, and state machine code).**

---

## Phase 3: Payments and messaging

**Goal:** a buyer can pay, and Kova reliably confirms payment and moves money to held.

- [ ] **3.1 Outbox and relay.** `outbox_events` table, write helper used inside transactions, relay process in the scheduler entry point (batches, `SKIP LOCKED`, retries, marks published). Implement the event interface used by `DealStateService`.
  *Done when:* an event is published at least once and never lost if the app crashes after commit. *Tests:* crash simulation, multiple relays.
- [ ] **3.2 RabbitMQ topology and consumers.** Exchange, queues (payments, payouts, refunds, notifications, receipts), retry queues with exponential backoff and jitter, dead letter queues, alert hook for dead-lettered messages. Consumer base class with the inbox check.
  *Done when:* a failing message retries with backoff, then lands in the dead letter queue; a duplicate message is skipped. *Tests:* retry, dead letter, duplicate delivery.
- [ ] **3.3 Paystack provider: initialize and verify.** Extend `PaymentProvider` with `initializeTransaction` and `verifyTransaction`. Own reference generated and saved first. Short timeouts.
  *Done when:* calls work against Paystack test mode and the fake provider. *Tests:* contract tests, timeout handling.
- [ ] **3.4 Buyers and payment start.** Public `POST /v1/public/deals/:token/pay`: only for `CREATED`, unexpired deals. Create or find the buyer by normalized email, create the payment record, initialize Paystack with bank transfer first (cards as secondary), store IP and user agent as metadata, rate limit per IP and per email. Return the checkout link.
  *Done when:* a buyer can start payment and abuse is throttled. *Tests:* expired deal rejected, rate limiting, metadata only. **Ask first:** card policy for small deals and OPay availability.
- [ ] **3.5 Webhook intake.** Raw body, constant-time signature check, `webhook_events` with unique event ID, return 200 fast, enqueue processing through the outbox.
  *Done when:* invalid signatures get 401 and duplicates never process twice. *Tests:* valid, invalid, duplicate, and replayed events using recorded payloads.
- [ ] **3.6 Payment confirmation worker.** On `charge.success`: verify with Paystack, check reference, amount, and currency against the deal, then in one transaction mark the payment `SUCCESS`, move the deal to `PAID`, post ledger entries including Paystack's real fee, and write a `deal.paid` event.
  *Done when:* money moves to held exactly once per payment, even if the webhook arrives many times. *Tests:* happy path, duplicates, concurrent delivery, amount mismatch, kill-worker-mid-message test.
- [ ] **3.7 Payment edge cases.** Late payment after expiry or cancellation, duplicate payment on one deal, bank transfer amount mismatch (not marked `PAID`, flagged for manual review), excess transfer handled by Paystack. Where a refund is needed, create the refund request record (processing arrives in Phase 5).
  *Done when:* every edge case ends in a safe, recorded state. *Tests:* one test per edge case.
- [ ] **3.8 Scheduler.** `scheduled_jobs` table and poller (`SKIP LOCKED`, safe to run in multiples). First job: payment link expiry (`CREATED` to `EXPIRED`), re-checking state before acting.
  *Done when:* an unpaid deal expires after 24 hours and a paid deal is untouched. *Tests:* expiry, state re-check, two pollers.
- [ ] **3.9 Payment status endpoint.** Buyer-facing status for the deal page (waiting, paid, expired) by link token.
  *Done when:* the buyer page can poll without exposing private data. *Tests:* token and no-leak tests.

**Ask first:** card policy, OPay. **Checkpoint (owner reviews webhook, outbox, and confirmation code).**

---

## Phase 4: Delivery, release, and payouts

**Goal:** vendors ship, buyers confirm (or timers release), and vendors are paid safely.

- [ ] **4.1 Ship.** Vendor marks a `PAID` deal as shipped (`PAID` to `SHIPPED`). Schedule the auto-release job at delivery window end plus 48 hours.
  *Done when:* only the owning vendor can ship, and only from `PAID`. *Tests:* authorization, wrong state.
- [ ] **4.2 Buyer confirmation.** Buyer confirms receipt by link token (`SHIPPED` to `COMPLETED`). Post the release ledger entries and write a `deal.completed` event.
  *Done when:* confirming twice or racing with a dispute has exactly one winner. *Tests:* double confirm, confirm versus dispute concurrency.
- [ ] **4.3 Auto-release job.** At the scheduled time, re-check the deal. Release only if still `SHIPPED`. Never release a disputed deal.
  *Done when:* timers act correctly in every state. *Tests:* shipped, disputed, already completed.
- [ ] **4.4 Ship deadline job.** If the vendor never ships by the end of the delivery window, move `PAID` to `REFUNDED` and create a refund request (price only).
  *Done when:* missed deadlines refund the buyer without manual work. *Tests:* missed deadline, shipped in time.
- [ ] **4.5 Paystack provider: transfers.** Extend `PaymentProvider` with `createRecipient`, `transfer`, `verifyTransfer`. Save the recipient code per payout account. Reference generated first.
  *Done when:* transfers work against Paystack test mode and the fake. *Tests:* contract tests. **Ask first:** confirm transfer OTP is turned off on the Paystack account.
- [ ] **4.6 Payout creation and worker.** On `COMPLETED`, create the payout record with its reference, then call the transfer. Success or pending: wait for the webhook. Timeout: mark `UNKNOWN`. Ledger entries for payout started, succeeded, fee, and stamp duty (payouts of ₦10,000 or more).
  *Done when:* a payout is never sent twice and every outcome is recorded. *Tests:* success, pending, timeout, duplicate trigger, crash mid-payout.
- [ ] **4.7 Payout webhooks and resolver.** Handle `transfer.success`, `transfer.failed`, `transfer.reversed`. A resolver job checks `UNKNOWN` payouts by reference before any retry.
  *Done when:* failed or reversed payouts return the money to the vendor's available balance and notify the vendor. *Tests:* each event, resolver, out-of-order events.
- [ ] **4.8 Payout controls.** Respect `payouts_paused` and vendor freeze, payout holds after bank account changes, daily payout limits for new vendors, and the rule that new vendors stay limited until 5 deals reach `COMPLETED`.
  *Done when:* a paused, frozen, held, or over-limit payout waits and is retried later, never lost. *Tests:* each control. **Ask first:** daily payout limit values.
- [ ] **4.9 Wallet endpoints.** `GET /v1/wallet` (held and available) and `GET /v1/ledger` (history) for the vendor.
  *Done when:* balances equal ledger sums. *Tests:* authorization and balance tests.

**Ask first:** transfer OTP confirmation, payout limits. **Checkpoint (owner reviews payout code).**

---

## Phase 5: Refunds and disputes

**Goal:** buyers get their money back when they should, and disputes are handled fairly.

- [ ] **5.1 Paystack provider: refunds.** Extend `PaymentProvider` with `refund` (item price only). Reference generated first.
  *Done when:* refunds work in test mode and with the fake. *Tests:* contract tests.
- [ ] **5.2 Refund worker.** Refund state machine (`PENDING`, `PROCESSING`, `SUCCESS`, `FAILED`), ledger entries (requested, processed, failed), `refund_reason` required, handle `refund.pending`, `refund.processing`, `refund.processed`, `refund.failed`. Wire in the triggers: vendor cancel after payment, missed ship deadline, late payment, duplicate payment, dispute outcome.
  *Done when:* the buyer receives the item price only and the service fee stays with Kova. *Tests:* each trigger, failure and retry, no double refund.
- [ ] **5.3 Vendor cancel after payment.** Vendor can cancel a `PAID` deal, which triggers a refund.
  *Done when:* only the owning vendor can cancel and only before shipping. *Tests:* authorization, wrong state.
- [ ] **5.4 Dispute request and one-time code.** Public endpoint: buyer enters checkout email and transaction ID, a one-time code is sent to that email. Rate limited. Responses do not reveal whether a transaction exists.
  *Done when:* only the email owner can proceed. *Tests:* wrong email, wrong ID, no-leak test, rate limit.
- [ ] **5.5 Open a dispute.** With a valid code, the buyer opens a dispute on a `PAID` or `SHIPPED` deal before auto-release. The deal moves to `DISPUTED`, the auto-release job is cancelled, and payouts for it are blocked.
  *Done when:* funds are frozen and the vendor and admin are notified. *Tests:* before and after auto-release time, wrong state, concurrency with confirm.
- [ ] **5.6 Evidence uploads.** Buyer and vendor upload evidence. Check type and size, store in object storage, serve through signed or authorized links only.
  *Done when:* unsafe files are rejected and files are never served from the app origin. *Tests:* type, size, and authorization tests. **Ask first:** object storage provider.
- [ ] **5.7 Admin dispute resolution.** Admin reviews and decides: release the full price to the vendor (`COMPLETED` and payout) or refund the full price to the buyer (`REFUNDED`). No partial splits. Decision is audited.
  *Done when:* only an admin with 2FA can decide, and each decision triggers the right ledger entries. *Tests:* both outcomes, authorization, audit.
- [ ] **5.8 Dispute flags.** Track buyers (by email) who repeatedly lose disputes and vendors with high dispute rates. Show flags to admins. Allow admin vendor freeze.
  *Done when:* flags update automatically after each resolution. *Tests:* threshold tests.

**Ask first:** object storage provider. **Checkpoint.**

---

## Phase 6: Receipts, notifications, reconciliation, and operations

**Goal:** the platform communicates clearly, detects problems itself, and can be operated safely.

- [ ] **6.1 PDF receipts.** Generated asynchronously after payment from a fixed `pdfkit` template, containing the transaction ID, stored in object storage, emailed to the buyer, and downloadable by a token link.
  *Done when:* every successful payment produces exactly one receipt. *Tests:* generation, duplicate event, no user-written HTML.
- [ ] **6.2 Notifications.** Email and SMS templates and delivery through the queue with retries: one-time codes, vendor "paid, ship now", shipped, confirmed, payout success or failure, refund updates, dispute events, buyer receipt. Notification log table.
  *Done when:* failed sends retry and never block money flows. *Tests:* retry, template rendering, no sensitive data in messages.
- [ ] **6.3 Daily reconciliation.** Compare `paystack_cash` with the real Paystack balance and recent transactions, produce a report, and alert on any difference.
  *Done when:* a mismatch raises an alert with the details needed to investigate. *Tests:* matching and mismatching scenarios.
- [ ] **6.4 Stuck-item sweepers.** Check payments stuck in `PENDING`, payouts stuck in `UNKNOWN`, refunds stuck in `PROCESSING`, and outbox lag.
  *Done when:* each stuck item is resolved by checking Paystack, or alerted. *Tests:* one per sweeper.
- [ ] **6.5 Admin operations API.** Disputes list, vendor list and freeze, pause or resume all payouts (kill switch), view reconciliation, view audit log.
  *Done when:* every action needs admin 2FA and is audited. *Tests:* authorization, audit, kill switch stops payouts.
- [ ] **6.6 Fraud rules.** Velocity checks on payment starts, many emails from one IP, repeated failed payments, CAPTCHA after repeated attempts, flags for unusual deal patterns. Flags go to admin review and never auto-block without an owner decision.
  *Done when:* rules are configurable and flagged items are visible. *Tests:* each rule. **Ask first:** CAPTCHA provider.
- [ ] **6.7 Rate-limit and security review.** Re-check limits on all public endpoints, one-time code endpoints, and uploads.
  *Done when:* every public endpoint has an explicit limit. *Tests:* limit tests.

**Ask first:** CAPTCHA provider, SMS and email providers if not yet chosen. **Checkpoint.**

---

## Phase 7: Client (Next.js and Tailwind dashboard)

**Goal:** a usable interface on top of the finished API.

**Ask first:** repository layout for the client (`web/` folder in this repo or a separate repo). Do not start until confirmed.

- [ ] **7.1 Client foundation.** Next.js with Tailwind CSS, typed API client generated from the OpenAPI file, auth handling (access and refresh tokens), error and loading states, environment config.
  *Done when:* the app builds and talks to a local API. *Tests:* build and basic component tests.
- [ ] **7.2 Buyer deal page.** Public, mobile-first. Shows item, store name, price, service fee, total, delivery window, and a short explanation of how Kova protects the buyer, plus a clear note that the service fee is non-refundable. Pay button, payment status, confirm receipt, receipt download.
  *Done when:* a buyer can finish a purchase on a phone from a DM link. *Tests:* component tests, end-to-end test against a local API.
- [ ] **7.3 Dispute page.** Separate page: email, transaction ID, one-time code, reason, evidence upload.
  *Done when:* the flow matches `AGENTS.md` section 4.5. *Tests:* end-to-end test.
- [ ] **7.4 Vendor onboarding screens.** Register, verify code, BVN submission, payout account, verification status.
  *Done when:* a new vendor reaches `ACTIVE` through the UI. *Tests:* end-to-end test with fakes.
- [ ] **7.5 Vendor dashboard.** Create deal and copy link, deals list and detail, mark shipped, cancel, wallet (held and available), ledger history, payout status.
  *Done when:* a vendor can run the full deal flow from the UI. *Tests:* end-to-end test.
- [ ] **7.6 Admin panel.** Login with 2FA, disputes review and decision, vendor list and freeze, payout pause, reconciliation and audit views.
  *Done when:* an admin can resolve a dispute end to end. *Tests:* end-to-end test.
- [ ] **7.7 Accessibility and polish.** Keyboard use, labels, contrast, empty states, error messages in plain language.
  *Done when:* main flows pass an accessibility check. *Tests:* automated accessibility checks.

**Checkpoint.**

---

## Phase 8: Hardening and quality

**Goal:** prove the system is correct under stress and failure.

- [ ] **8.1 End-to-end suite.** Happy path, refund path, dispute path (both outcomes), payout timeout (`UNKNOWN`), late payment after expiry, double payment, bank transfer mismatch.
  *Done when:* all scenarios pass repeatedly in CI.
- [ ] **8.2 Failure-injection tests.** Kill a worker mid-message, stop the broker, make Paystack time out or return errors.
  *Done when:* no money is lost and none is paid twice in any scenario.
- [ ] **8.3 Concurrency and load tests.** k6 scripts for payment initialization and webhook bursts. Concurrency tests on confirm, dispute, and payouts.
  *Done when:* results and limits are documented and no invariant breaks under load.
- [ ] **8.4 Security review.** Walk through every hard rule and section 9 of `AGENTS.md`. Authorization tests for every endpoint (no IDOR), dependency audit, secrets scan, headers check, upload checks.
  *Done when:* a written checklist shows each item passed or fixed.
- [ ] **8.5 Observability.** Codex: OpenTelemetry instrumentation across API, outbox, queue, and workers, plus the metrics the app must expose (payments started and succeeded, webhook delay, outbox lag, queue depth, dead letter depth, payout success rate, stuck counts, reconciliation difference). **Infra (owner):** the Prometheus/Grafana/Loki (or equivalent) stack, dashboards (payment funnel, money held versus paid out, daily profit), and alert routing. Notify the owner when the app exposes metrics and traces so the tooling can be built against them.
  *Done when:* one deal can be traced end to end and every alert in section 8 of `AGENTS.md` exists.
- [ ] **8.6 Runbooks and docs.** README, OpenAPI documentation, architecture overview, runbooks for stuck payout, stuck refund, reconciliation mismatch, kill switch, key rotation, and restoring from backup.
  *Done when:* a new developer can run the system and handle each incident from the docs.

**Checkpoint.**

---

## Phase 9: Deployment

**Goal:** a safe, repeatable deployment, first to staging, then to production only with the owner's approval.

**This phase is almost entirely Infra (owner)** per the infra roadmap (production images, CI/CD, environments, networking, backups, monitoring). Codex's role: keep the app deployable (config from env, migrations forward-only, graceful shutdown, health endpoints) and implement any application-side change the owner's infra needs. Notify the owner when Phase 8 is code-complete so deployment work can begin. The owner may also introduce infra work not listed here; integrate it when it arrives.

**Ask first:** hosting target, domain, managed service choices, and the secrets manager. Do not start until confirmed.

- [ ] **9.1 [Infra (owner)] Production images.** Docker images for the API, worker, and scheduler: non-root, pinned versions, scanned, small.
  *Done when:* images build in CI and pass the scan.
- [ ] **9.2 [Infra (owner)] CI/CD pipeline.** Build, test, scan, push images, deploy to staging automatically, deploy to production by manual approval. Migrations run as a separate step before the new version starts.
  *Done when:* a merge to main reaches staging without manual steps.
- [ ] **9.3 [Infra (owner)] Staging environment.** Production-like infrastructure with Paystack test keys and a registered test webhook URL. Database roles and permissions match production (no `UPDATE` or `DELETE` on append-only tables).
  *Done when:* the full flow works on staging with Paystack test mode.
- [ ] **9.4 [Infra (owner)] Production infrastructure.** Managed Postgres with daily backups and point-in-time recovery, managed Redis, RabbitMQ with persistence, private networking (database, Redis, and broker never public), reverse proxy with TLS and DDoS protection, secrets in a secrets manager, separate keys per environment.
  *Done when:* only the API is reachable from the internet.
- [ ] **9.5 [Infra (owner)] Backups and recovery.** Restore drill from backup and point-in-time recovery, documented.
  *Done when:* a restore has been tested successfully and timed.
- [ ] **9.6 [Infra (owner)] Monitoring live.** Dashboards and alerts connected to a real notification channel. Kill switch tested in staging.
  *Done when:* a test alert reaches the owner and the kill switch stops payouts in staging.
- [ ] **9.7 Production launch checklist.** (App-side items are Codex; confirmations and keys are the owner's.) Confirm each item with the owner before enabling live keys:
  - Licensing and regulatory review is complete (written confirmation from the owner).
  - Terms and privacy policy published; the non-refundable service fee is stated in the terms and at checkout.
  - Live Paystack keys set, live webhook URL registered, transfer OTP confirmed off, Paystack pricing re-checked (including VAT).
  - Real BVN provider, email, SMS, CAPTCHA, and object storage configured.
  - New-vendor limits and payout limits set to conservative values.
  - Reconciliation and alerts verified, kill switch tested, backups verified.
  - Smoke tests pass on production with a small real transaction handled by the owner.
  *Done when:* the owner approves launch in writing.
- [ ] **9.8 Post-launch watch.** (Codex builds the review views/reports; the owner performs the daily review.) First days: manual daily review of reconciliation, dead letter queues, stuck items, disputes, and payouts. Report to the owner.
  *Done when:* two weeks pass with no unresolved discrepancy, or issues are fixed and documented.

**Final checkpoint:** the owner signs off on completion.
