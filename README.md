# FakeStore API Automation Framework

A production-grade API automation suite for [fakestoreapi.com](https://fakestoreapi.com/), focused on the **Cart** domain and its authentication flow.

**129 tests in ~20s**, verified deterministic over 6 consecutive runs with retries disabled. Covers cart CRUD, authentication and authorisation, JSON-Schema validation, contract testing, and data-driven scenarios — and publishes a machine-generated defect register describing eight real API defects it found.

---

## Quick start

```bash
npm ci          # install
npm test        # run everything
npm run report  # open the HTML report
```

No `.env` file is required — every setting has a working default. No browser download is required either: the suite uses Playwright's HTTP client, not a browser.

---

## Table of contents

- [The central design decision](#the-central-design-decision)
- [Technology choices](#technology-choices)
- [Architecture](#architecture)
- [Running the tests](#running-the-tests)
- [Configuration](#configuration)
- [What is covered](#what-is-covered)
- [Validation strategy](#validation-strategy)
- [Contract testing](#contract-testing)
- [Data-driven testing](#data-driven-testing)
- [Reporting](#reporting)
- [Logging](#logging)
- [Findings: the API defect register](#findings-the-api-defect-register)
- [Extension plan](#extension-plan)
- [Contributing](#contributing)

---

## The central design decision

Before writing a line of framework code, I probed all five cart endpoints plus `/auth/login` against the live API. That probing produced the finding that shaped everything else:

> **FakeStore is a simulation, not an implementation.** It does not persist writes, does not validate cart payloads, and never enforces authorisation on any endpoint.

That leaves a fork in the road, and both obvious paths are wrong:

| Approach                                                    | Outcome                                                                        |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Assert the _ideal_ REST contract (`invalid quantity → 400`) | Permanently red suite. Nobody trusts it; it gets muted within a sprint.        |
| Assert only _observed_ behaviour                            | Green suite that silently blesses four high-severity defects. Worthless as QA. |

This framework does **both**, via a **dual-expectation model**:

1. Tests assert the **actual** behaviour — so the suite is green, deterministic, and safe to gate a pipeline on.
2. Each such test attaches a structured entry from the [deviation register](src/support/deviations.ts) describing what a **correct** implementation would do, at what severity, and what the consumer impact is.
3. A [custom reporter](reporters/defect-register.reporter.ts) aggregates those entries into `reports/defect-register.md` on every run.

The property that makes this honest rather than a fudge: **the assertion is on the actual behaviour**. The day the API starts returning `404` for a missing cart, that test fails loudly and the register entry must be consciously retired. Nothing rots quietly, and the "known issues" list can never drift out of sync with reality — it is generated from the tests themselves.

The result is a green pipeline _and_ a reviewable, always-current statement of what is wrong with the API. See [Findings](#findings-the-api-defect-register).

---

## Technology choices

### Why TypeScript?

- **Types are documentation that cannot go stale.** `CartPayload`, `ApiResponse<T>` and the client signatures make the API's surface discoverable from the editor.
- `strict` plus `noUncheckedIndexedAccess` catches the class of mistake that plagues JS API suites: assuming an array element or optional field exists.
- One language across tests, fixtures, tooling and CI scripts.

### Why Playwright Test?

Evaluated against the realistic alternatives:

| Candidate                         | Why not chosen                                                                                                 |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **Jest/Vitest + supertest/axios** | Needs bolted-on parallelism config, custom reporters, and a separate HTTP layer. More assembly, less cohesion. |
| **REST Assured (Java)**           | Excellent, but a heavier toolchain and a smaller hiring pool for a suite that a whole team must contribute to. |
| **Cypress**                       | Browser-centric; API testing is a secondary concern and parallelism is a paid feature.                         |
| **Postman/Newman**                | Collections are JSON blobs — poor diffs, poor reuse, poor refactoring. Not code review-able at scale.          |

**Playwright Test** wins on the axes that matter here:

- **`APIRequestContext`** — a first-class HTTP client with no browser dependency, so CI needs no `playwright install`.
- **Parallelism is the default**, with worker-scoped fixtures for expensive setup (the auth token is fetched once per worker, not once per test).
- **Fixtures over hooks** — dependency injection that makes each test declare exactly what it needs, with automatic teardown.
- **Reporting** — HTML, JSON and JUnit out of the box, plus a documented custom-reporter API (used here for the defect register).
- **`expect.extend`** infers matcher types automatically, so custom matchers get full IntelliSense with no module augmentation.
- **Tags and projects** for slicing the suite without duplicating configuration.

### Why Ajv for schemas?

JSON Schema is a portable, language-agnostic artifact — the same schema can be shared with backend developers or generated from an OpenAPI spec later. Ajv is the fastest compliant validator, and schemas are composed by `$ref` and registered once, so `cart-line-item` has exactly one definition shared by the read, write and list schemas.

---

## Architecture

The layering rule is one sentence: **each layer knows only the layer directly beneath it, and only the test layer asserts.**

```
tests/                       WHAT is true      (specs: arrange, act, assert)
  fixtures/api.fixture.ts    composition root — wires everything together
src/
  assertions/                HOW we assert     (matchers + domain assertions)
  api/clients/               WHAT endpoints    (never assert; reusable from setup)
  api/routes.ts              WHERE endpoints   (single source of truth for paths)
  data/                      WITH WHAT         (builders + datasets)
  schemas/                   WHAT shape        (versioned JSON Schema, $ref-composed)
  validation/                HOW we validate   (Ajv wrapper + contract engine)
  core/                      HOW we talk       (HTTP client, response, logger, errors)
  config/                    WHERE/HOW LONG    (environments, constants)
  support/                   cross-cutting     (deviation register, predicates)
reporters/                   HOW we report
contracts/__snapshots__/     recorded API shapes, reviewed like code
```

Load-bearing decisions:

- **Clients never assert.** `CartClient.create()` returns a response whether it is a 201 or a 400. That single rule is what lets negative tests, positive tests and setup code share one client instead of needing "bad" variants.
- **One choke point for HTTP.** Every request passes through [`HttpClient.send()`](src/core/http-client.ts), so retries, timing, redaction and logging were each implemented once. Adding request signing or a correlation header is a change to one file.
- **`ApiResponse` never throws on parse.** A 400 with an HTML body is data, not an error — the auth endpoints return exactly that, and the framework handles it without special cases.
- **Only `src/config/env.ts` may read `process.env`**, enforced by an ESLint rule. Configuration is resolved and frozen once, so a bad value fails at startup rather than mid-suite.
- **Routes are centralised.** No test builds a URL by hand, which is what makes API versioning a one-file change.

---

## Running the tests

```bash
npm test                  # everything (functional + contract)
npm run test:smoke        # ~3 tests, fails fast if the API is down
npm run test:carts        # cart CRUD only
npm run test:auth         # authentication + authorisation
npm run test:contract     # contract tests only (serial)
npm run test:negative     # every @negative-tagged test
npm run test:data-driven  # parameterised suites

npm run contract:update   # re-record contract snapshots (intentional changes only)

npm run report            # open the HTML report
npm run verify            # typecheck + lint + format check
```

Filter freely with Playwright's own flags:

```bash
npx playwright test --grep "@deviation"       # only tests documenting API defects
npx playwright test --grep-invert "@negative" # skip negative paths
npx playwright test tests/carts/create-cart.spec.ts
npx playwright test --workers=1 --headed=false
```

### Requirements

- Node.js ≥ 20 (developed on 22)
- Network access to `fakestoreapi.com`

---

## Configuration

Copy `.env.example` to `.env` to override anything. Every value has a safe default, so **the suite runs with no `.env` at all**.

| Variable                          | Default               | Purpose                                                               |
| --------------------------------- | --------------------- | --------------------------------------------------------------------- |
| `TEST_ENV`                        | `production`          | Selects an entry from [`environments.ts`](src/config/environments.ts) |
| `BASE_URL`                        | per environment       | Overrides the selected environment's URL                              |
| `REQUEST_TIMEOUT_MS`              | `30000`               | Hard timeout per HTTP request                                         |
| `TEST_TIMEOUT_MS`                 | `60000`               | Budget per test                                                       |
| `RESPONSE_SLA_MS`                 | `10000`               | Response-time assertion threshold                                     |
| `HTTP_RETRIES`                    | `2`                   | Transport retries for network errors / 5xx / 429                      |
| `AUTH_USERNAME` / `AUTH_PASSWORD` | demo creds            | Credentials; supply from a secret store in CI                         |
| `LOG_LEVEL`                       | `info` (`warn` in CI) | `silent` \| `error` \| `warn` \| `info` \| `debug`                    |
| `ATTACH_ALL_LOGS`                 | `false`               | Attach the HTTP transcript to passing tests too                       |
| `CONTRACT_STRICT`                 | `false`               | Fail on additive contract changes as well as breaking ones            |

Adding an environment is a single entry in `ENVIRONMENTS` — nothing else in the framework needs to know it exists.

### On the response-time threshold — and the one flake I found

Every response is asserted against `RESPONSE_SLA_MS`. Choosing that number took measurement and one instructive failure, which is worth recording because it is the only flake this suite ever exhibited.

Under 4-worker concurrency the API measures **p50 324ms, p95 355ms, p99 797ms, max 847ms**, so I initially set the budget to 5000ms — roughly 6× the observed worst case. Repeated full-suite runs then produced **one failure in three runs**, on a run that took 46s against a ~20s norm: a CDN slow spell, not a regression.

That is the diagnosis in one line: **a tight latency budget makes functional results depend on network weather.** The fix was not to delete the assertion or to paper over it with retries, but to be honest about what it is for. At 10000ms it is a guard against _pathological_ slowness — an endpoint going from 350ms to 30s — which is a real regression worth failing a build over. Fine-grained latency is a different question with different statistics (percentiles over many samples, not a single observation), and belongs in the dedicated performance suite described in the [extension plan](#extension-plan).

Verification after the change: **6 consecutive full-suite runs with `--retries=0`, all passing** — including two runs in the 30–38s degraded range that would previously have been at risk.

---

## What is covered

**129 tests** across ten spec files.

### Cart CRUD

| Endpoint              | Positive                                                                                                         | Negative                                                                                                                                           |
| --------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /carts`         | minimal payload, 2/3/5-product carts, duplicate line items, empty product list, quantity and product-id matrices | missing fields, unknown product ids, zero/negative/string quantities, wrong types, no body, malformed JSON (4 variants), mismatched `Content-Type` |
| `GET /carts`          | all carts, `limit`, `sort=asc\|desc`, date-range filter, combined params                                         | non-numeric `limit`, unknown `sort`, negative `limit`                                                                                              |
| `GET /carts/:id`      | fetch by id, read consistency across concurrent reads                                                            | 5 unparseable ids, non-existent id, id `0`, negative id                                                                                            |
| `GET /carts/user/:id` | user's carts, ownership invariant                                                                                | user with no carts                                                                                                                                 |
| `PUT /carts/:id`      | full update, quantity change, product replacement, emptying, reassigning owner                                   | 5 unparseable ids, 4 malformed bodies, empty update, no body, wrong types, negative quantity, non-existent id                                      |
| `DELETE /carts/:id`   | deletes and returns the cart, matches pre-delete state                                                           | 5 unparseable ids, non-existent id, id `0`, repeat delete, post-delete retrieval, unauthenticated delete                                           |

### Authentication and authorisation

- Valid login: token issued, claims correct, `iat` current, password never echoed back.
- Invalid credentials: wrong password, unknown user, both wrong, empty strings.
- **User-enumeration check** — a wrong password and an unknown user must be indistinguishable in both status and message.
- Missing credentials: absent password, absent username, empty object, no body, malformed JSON.
- Authorisation enforcement probed at seven points: missing / malformed / expired tokens across read, create, update and delete, plus a horizontal privilege-escalation check.

### Cross-cutting

- **Lifecycle** (`cart-lifecycle.spec.ts`) — proves and quantifies the non-persistence defect rather than assuming it.
- **Contract** — 8 endpoint shapes fingerprinted and diffed.
- **Data-driven** — 5 product datasets × 3 scenarios, plus 3 multi-product datasets.

---

## Validation strategy

Four independent layers. A response has to satisfy all of them, and each catches a class the others miss.

**1. Transport envelope** — [`assertResponseEnvelope`](src/assertions/response.assertions.ts) is one call that asserts status, `Content-Type`, response time against the SLA, the CORS header, and that the body actually parses. Bundling these is what makes "never assert only the status code" cheap enough that nobody skips it.

**2. JSON Schema** — [versioned schemas](src/schemas/v1) with `additionalProperties: false`, so a silently added field is surfaced rather than swallowed. Ajv's raw errors are rewritten into readable form:

```
Schema "Cart" reported 2 violation(s):
  - $.products[0].quantity: expected type integer, got string (got "two")
  - $.userId: required field is missing
```

**3. Business rules** — [`cart.assertions.ts`](src/assertions/cart.assertions.ts) encodes what a cart _means_: positive integer ids, line items referencing the real catalogue, ownership invariants, correct sort order, no duplicate ids. A payload can be schema-valid and still commercial nonsense.

**4. Contract** — structural drift detection across the whole response, including areas no explicit assertion covers.

---

## Contract testing

Schema validation asserts what we _require_. Contract testing asserts what the API _currently is_, so unexpected drift surfaces even where no assertion looks.

Each snapshot records a **shape** — the type skeleton with all values discarded. That is what makes it stable against data churn (a price changing, a new cart appearing) while still catching what actually breaks consumers.

Array items are merged into one fingerprint, so a 20-element response yields a compact shape that also records which fields are only _sometimes_ present.

Detected and classified:

| Change                                | Classification                                            |
| ------------------------------------- | --------------------------------------------------------- |
| Field removed                         | **breaking**                                              |
| Field renamed                         | **breaking** (removal + addition)                         |
| Type changed (`integer → string`)     | **breaking**                                              |
| Always-present field becomes optional | **breaking**                                              |
| `integer → number` (widening)         | compatible                                                |
| New field added                       | additive — reported, passes unless `CONTRACT_STRICT=true` |

Failures are actionable rather than cryptic:

```
Contract "cart-by-id" no longer matches the recorded shape.

BREAKING (2) - these will break existing consumers:
  [removed] $.userId: was integer, no longer returned
  [type-changed] $.products[*].quantity: integer -> string

ADDITIVE (1) - backwards compatible:
  [added] $.currency: new field of type string

If this change is intentional and approved, re-record the contract with:
  npm run contract:update
```

Snapshots are pretty-printed with sorted keys in [`contracts/__snapshots__/`](contracts/__snapshots__), so a change is a readable git diff reviewed like any other code. Contract tests run in their own **serial project** so parallel workers can never race on a snapshot file.

---

## Data-driven testing

The assignment asked for one parameterised test across three product IDs. The framework generalises the pattern: datasets are declarative records in [`cart.datasets.ts`](src/data/datasets/cart.datasets.ts), and adding coverage is **appending one object — never copying a test body**.

```ts
export const PRODUCT_DATASETS = [
  { name: 'first product in the catalogue', productId: 1, quantity: 1, userId: 1 },
  { name: 'mid-catalogue product, bulk', productId: 7, quantity: 25, userId: 2 },
  { name: 'mid-catalogue product, single', productId: 12, quantity: 3, userId: 3 },
  { name: 'last product in the catalogue', productId: 20, quantity: 10, userId: 4 },
  { name: 'maximum realistic quantity', productId: 5, quantity: 999, userId: 2 },
];
```

Those five datasets drive three suites (create, update, and a catalogue-integrity guard) from a single body each. The dataset name becomes the test title, so a failure names the exact case without opening a file.

The **catalogue-integrity guard** is the detail worth calling out: it asserts that every product id referenced by a dataset still resolves. A cart test asserting on product 20 is meaningless if the catalogue no longer serves product 20 — this keeps the datasets themselves honest.

Payload variation uses a fluent builder, so a test's intent is visible as its diff from the default:

```ts
aCart().forUser(4).withProduct(6, 2).build(); // valid
aCart().withRaw('quantity', 'two').buildRaw(); // deliberately invalid
```

---

## Reporting

Four reporters run together:

| Reporter              | Output                       | Use                                      |
| --------------------- | ---------------------------- | ---------------------------------------- |
| `list`                | stdout                       | local feedback                           |
| `html`                | `reports/html/`              | full detail, request transcripts, traces |
| `json`                | `reports/results.json`       | programmatic consumption                 |
| `junit`               | `reports/junit.xml`          | CI test-reporting integrations           |
| **`defect-register`** | `reports/defect-register.md` | **the API defect register**              |

The custom reporter also prints a run summary so a CI log tail is useful on its own:

```
────────────────────────────────────────────────────────────────────────
  Run PASSED in 21.7s
  129 passed  0 failed  0 skipped  0 flaky
  Defect register: 8 deviation(s) (4 high, 2 medium, 2 low)
    - FSA-001 [high] Missing cart returns 200 with a null body instead of 404
    - FSA-002 [high] Create/update/delete are simulated, never persisted
    ...
  Slowest tests:
    - 4386ms  Authorisation on cart endpoints > reads succeed with no token at all
  Reports: reports/html/index.html, reports/defect-register.md
────────────────────────────────────────────────────────────────────────
```

**On failure**, the full HTTP transcript — request headers, body, response headers, body, timing, retry count — is attached to the report automatically, so a red CI run is diagnosable without a re-run. Set `ATTACH_ALL_LOGS=true` to attach it to passing tests too.

---

## Logging

Structured JSON, one object per line, ingestible by any CI log processor:

```json
{
  "timestamp": "2026-08-07T16:35:21.203Z",
  "level": "info",
  "scope": "http",
  "message": "HTTP exchange",
  "context": {
    "method": "POST",
    "url": "...",
    "status": 201,
    "durationMs": 374,
    "attempts": 1,
    "requestHeaders": { "authorization": "***REDACTED***" }
  }
}
```

**Redaction is structural, not best-effort.** `Authorization`, `Cookie` and `Set-Cookie` headers are replaced by marker; `password`, `token`, `accessToken` and `secret` are deep-redacted anywhere in a JSON body; and any JWT-shaped string in a non-JSON body is pattern-wiped as a backstop. A dedicated test asserts the login response never contains the submitted password.

---

## Findings: the API defect register

Generated by the suite itself on every run. Full detail in `reports/defect-register.md`.

| ID          | Severity | Finding                                                                                                                                                               |
| ----------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **FSA-001** | HIGH     | Missing cart returns `200` with body `null` instead of `404`. Clients branching on status treat a miss as a hit, then dereference null.                               |
| **FSA-002** | HIGH     | Create/update/delete are simulated, never persisted. `POST` always returns the same synthetic id, so ids are not unique and cannot be used as references.             |
| **FSA-003** | HIGH     | Cart payloads accepted without validation — unknown product ids, negative quantities, string-typed numbers and missing required fields all return `201`.              |
| **FSA-004** | HIGH     | No endpoint enforces authentication or authorisation. Missing, malformed and expired tokens all succeed, including on `DELETE`. Login issues tokens nothing verifies. |
| **FSA-005** | MEDIUM   | Auth failures return `text/html` while cart errors return a JSON envelope — no single error handler can cover both.                                                   |
| **FSA-006** | MEDIUM   | Issued JWTs carry no `exp` claim, so a leaked token is valid forever.                                                                                                 |
| **FSA-007** | LOW      | Malformed query parameters (`?limit=abc`, `?sort=bogus`) are silently ignored rather than rejected.                                                                   |
| **FSA-008** | LOW      | `?limit=-1` returns one row instead of `400`.                                                                                                                         |

Each entry names its expected behaviour, actual behaviour, consumer impact, and the tests that cover it. Run `npx playwright test --grep "@deviation"` to execute only these.

---

## Extension plan

**Parallel execution** — already on: `fullyParallel: true` with 4 workers, chosen to balance wall-clock against CDN throttling. Tests share no mutable state and create no ordering dependencies, so raising `workers` is a config change. Contract tests are isolated in a serial project because they touch snapshot files. For a larger suite, shard across CI machines with `--shard=1/4` and merge with `blob` reporters.

**Multiple environments** — add an entry to `ENVIRONMENTS` and run with `TEST_ENV=<name>`. To test several environments in one run, promote environments to Playwright projects and read `baseUrl` from `testInfo.project.use`.

**CI/CD** — [`.github/workflows/ci.yml`](.github/workflows/ci.yml) ships with a three-stage pipeline (static analysis → smoke → full suite), scheduled nightly runs to catch API drift no commit would reveal, JUnit publishing, artifact retention, and the defect register posted to the job summary. Porting to GitLab/Jenkins/CircleCI is a translation of the same four commands.

**Rich reporting** — the reporter array is additive. Allure (`allure-playwright`) for historical trends, or a Slack/Teams reporter for failure notifications, plug in without touching a test.

**API versioning** — all paths live in [`routes.ts`](src/api/routes.ts) and schemas are namespaced by version (`schemas/v1`). Supporting `/v2/carts` means adding `schemas/v2`, parameterising the route prefix, and running both as projects — the v1 contract snapshots keep proving the old version still works.

**More endpoints** — add a typed client, a schema, a route entry, and one line in `createApiClients()`. The Products and Users clients already demonstrate the pattern.

**Mock services** — the HTTP client takes an injected `APIRequestContext`, so pointing at a Prism/WireMock instance is a `BASE_URL` change. That is the path to testing the failure modes a live sandbox will not produce on demand (5xx, timeouts, malformed responses), and to making the negative tests assert the _ideal_ contract against a spec-driven mock while the live tests continue to document reality.

**Performance testing** — every response already carries `durationMs` and the SLA is asserted per request. The natural progression is exporting those timings as a trend, then k6/Artillery for true load testing — the payload builders and route definitions are reusable there as-is.

**Contract testing evolution** — the current engine is intentionally lightweight and dependency-free. Two upgrade paths: generate schemas from an OpenAPI spec so the contract has a single upstream source of truth, or graduate to Pact for genuine consumer-driven contracts with a broker, once more than one consumer exists.

---

## Contributing

**Adding a test for an existing endpoint** — add a `test()` to the relevant spec. Use `assertResponseEnvelope` for the transport layer and a domain assertion for business rules.

**Adding a dataset** — append an object to `src/data/datasets/`. No test code changes.

**Adding an endpoint** — route → type → schema → client method → register in `createApiClients()` → spec.

**Adding a custom matcher** — add to `src/assertions/matchers.ts`. Types are inferred automatically.

### Conventions

- **AAA** — Arrange, Act, Assert, commented where the split is not obvious.
- **One behaviour per test.** Titles describe behaviour, not mechanics.
- **No inter-test dependencies.** Any test must pass in isolation, in any order, at any worker count.
- **No magic values.** Ids, statuses, thresholds and tags live in `constants.ts`.
- **Clients never assert; tests never build URLs.**
- **Failure messages carry context** — every assertion says what was expected, what arrived, and which request produced it.

Run `npm run verify` before pushing — CI runs the same three checks.

---

## Project layout

```
fakestoreapi/
├── src/
│   ├── api/          routes, typed clients, domain types
│   ├── assertions/   custom matchers + envelope and business assertions
│   ├── config/       environments, constants, env parsing
│   ├── core/         HTTP client, response envelope, logger, errors
│   ├── data/         payload builders + datasets
│   ├── schemas/      versioned JSON Schema (v1), $ref-composed registry
│   ├── support/      deviation register, comparison predicates
│   └── validation/   Ajv wrapper, shape fingerprinting, contract engine
├── tests/
│   ├── fixtures/     composition root
│   ├── smoke/        fail-fast health checks
│   ├── carts/        CRUD, lifecycle, data-driven
│   ├── auth/         login + authorisation enforcement
│   └── contract/     contract verification (serial)
├── contracts/__snapshots__/   recorded API shapes
├── reporters/        defect-register reporter
└── .github/workflows/ci.yml
```
