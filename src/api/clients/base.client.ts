/**
 * Shared base for resource clients.
 *
 * Clients express *what* an endpoint is, never *whether* a response is correct -
 * assertions live in the test and assertion layers. That split keeps clients
 * reusable from setup code, teardown code and negative tests alike.
 */
import type { HttpClient } from '@/core/http-client';

export abstract class BaseClient {
  constructor(protected readonly http: HttpClient) {}
}
