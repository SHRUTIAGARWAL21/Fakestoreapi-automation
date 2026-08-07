/**
 * The framework's composition root.
 *
 * Every spec imports `test` and `expect` from here and never touches Playwright
 * directly. That gives one place to add cross-cutting behaviour, and it means a
 * spec's imports describe exactly what it needs.
 *
 * Fixtures provided:
 *   api          resource clients bound to a configured HTTP client
 *   http         the raw client, for tests that need an unusual request
 *   authToken    a real bearer token, fetched once per worker
 *   requestLog   the redacted transcript of the current test's HTTP traffic
 *
 * On failure the full request/response transcript is attached to the report, so
 * a red CI run is diagnosable without a re-run.
 */
import { test as base, type APIRequestContext } from '@playwright/test';

import { createApiClients, type ApiClients } from '@/api/clients';
import { config } from '@/config/environments';
import { HttpClient, type ExchangeRecord } from '@/core/http-client';
import { expect } from '@/assertions';

export interface ApiFixtures {
  api: ApiClients;
  http: HttpClient;
  requestLog: ExchangeRecord[];
}

export interface WorkerFixtures {
  /** A valid bearer token, obtained once per worker rather than per test. */
  authToken: string;
}

export const test = base.extend<ApiFixtures, WorkerFixtures>({
  requestLog: async ({}, use) => {
    await use([]);
  },

  http: async ({ request, requestLog }, use) => {
    const client = new HttpClient(request, {
      baseUrl: config.baseUrl,
      // Captured unconditionally: the transcript must exist when a test fails,
      // even on a quiet run where nothing was printed to the console.
      onExchange: (record) => requestLog.push(record),
    });
    await use(client);
  },

  api: async ({ http }, use) => {
    await use(createApiClients(http));
  },

  authToken: [
    async ({ playwright }, use) => {
      const context: APIRequestContext = await playwright.request.newContext({
        baseURL: config.baseUrl,
        timeout: config.timeouts.request,
      });

      try {
        const clients = createApiClients(new HttpClient(context, { baseUrl: config.baseUrl }));
        const token = await clients.auth.loginAndGetToken(config.credentials);
        await use(token);
      } finally {
        await context.dispose();
      }
    },
    { scope: 'worker' },
  ],
});

/** Attaches the request transcript to the report after each test. */
test.afterEach(async ({ requestLog }, testInfo) => {
  const shouldAttach = config.logging.attachAll || testInfo.status !== testInfo.expectedStatus;
  if (!shouldAttach || requestLog.length === 0) return;

  await testInfo.attach('http-transcript.json', {
    body: JSON.stringify(requestLog, null, 2),
    contentType: 'application/json',
  });
});

export { expect };
export { config } from '@/config/environments';
