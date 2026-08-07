/**
 * Defect-register reporter.
 *
 * Collects the `api-deviation` annotations recorded by tests and publishes them
 * as a markdown register alongside the standard reports. A green run therefore
 * still communicates *what is wrong with the API* - which is the point of the
 * whole exercise, and the artefact a product owner actually reads.
 *
 * Also prints a run summary (pass/fail/duration/slowest) so a CI log tail is
 * useful without downloading the HTML report.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestResult,
} from '@playwright/test/reporter';

import { DEVIATION_ANNOTATION, type Deviation } from '../src/support/deviations';

interface DeviationOccurrence {
  readonly deviation: Deviation;
  readonly tests: string[];
}

const OUTPUT_PATH = join(process.cwd(), 'reports', 'defect-register.md');
const SEVERITY_ORDER: Record<Deviation['severity'], number> = { high: 0, medium: 1, low: 2 };

export default class DefectRegisterReporter implements Reporter {
  private readonly occurrences = new Map<string, DeviationOccurrence>();
  private readonly durations: Array<{ title: string; ms: number }> = [];

  private passed = 0;
  private failed = 0;
  private skipped = 0;
  private flaky = 0;
  private startedAt = 0;
  private metadata: Record<string, unknown> = {};
  private rootSuite?: Suite;

  onBegin(config: FullConfig, suite: Suite): void {
    this.startedAt = Date.now();
    this.metadata = (config.metadata ?? {}) as Record<string, unknown>;
    this.rootSuite = suite;
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    this.durations.push({ title: test.titlePath().slice(1).join(' > '), ms: result.duration });

    for (const annotation of test.annotations) {
      if (annotation.type !== DEVIATION_ANNOTATION || !annotation.description) continue;

      const deviation = this.parse(annotation.description);
      if (!deviation) continue;

      const existing = this.occurrences.get(deviation.id);
      const title = test.titlePath().slice(1).join(' > ');

      if (existing) {
        if (!existing.tests.includes(title)) existing.tests.push(title);
      } else {
        this.occurrences.set(deviation.id, { deviation, tests: [title] });
      }
    }
  }

  onEnd(result: FullResult): void {
    this.tally();

    const durationMs = Date.now() - this.startedAt;
    const register = this.render(durationMs, result.status);

    mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
    writeFileSync(OUTPUT_PATH, register, 'utf8');

    this.printSummary(durationMs, result.status);
  }

  /**
   * Counts each test once, at the end.
   *
   * `onTestEnd` fires per *attempt*, so tallying there would record a retried
   * test as both a failure and a flake. `TestCase.outcome()` collapses all
   * attempts into the single verdict Playwright itself reports.
   */
  private tally(): void {
    for (const test of this.rootSuite?.allTests() ?? []) {
      switch (test.outcome()) {
        case 'expected':
          this.passed++;
          break;
        case 'flaky':
          this.flaky++;
          break;
        case 'skipped':
          this.skipped++;
          break;
        case 'unexpected':
          this.failed++;
          break;
      }
    }
  }

  private parse(description: string): Deviation | undefined {
    try {
      return JSON.parse(description) as Deviation;
    } catch {
      return undefined;
    }
  }

  private sorted(): DeviationOccurrence[] {
    return [...this.occurrences.values()].sort(
      (a, b) =>
        SEVERITY_ORDER[a.deviation.severity] - SEVERITY_ORDER[b.deviation.severity] ||
        a.deviation.id.localeCompare(b.deviation.id),
    );
  }

  private render(durationMs: number, status: string): string {
    const entries = this.sorted();
    const lines: string[] = [
      '# API Defect Register',
      '',
      'Generated automatically from the test run. Each entry is a place where the API',
      'deviates from the contract a correct implementation would honour. The suite',
      'asserts the **actual** behaviour, so any entry here fails loudly - and must be',
      'retired - the moment the API is fixed.',
      '',
      `- **Run status:** ${status}`,
      `- **Environment:** ${String(this.metadata.environment ?? 'unknown')} (${String(this.metadata.baseUrl ?? 'unknown')})`,
      `- **Executed:** ${new Date().toISOString()}`,
      `- **Duration:** ${(durationMs / 1000).toFixed(1)}s`,
      `- **Results:** ${this.passed} passed, ${this.failed} failed, ${this.skipped} skipped, ${this.flaky} flaky`,
      `- **Distinct defects observed:** ${entries.length}`,
      '',
    ];

    if (entries.length === 0) {
      lines.push('No deviations were recorded in this run.', '');
      return lines.join('\n');
    }

    lines.push('## Summary', '', '| ID | Severity | Title | Tests |', '|---|---|---|---|');
    for (const { deviation, tests } of entries) {
      lines.push(
        `| ${deviation.id} | ${deviation.severity.toUpperCase()} | ${deviation.title} | ${tests.length} |`,
      );
    }
    lines.push('', '## Detail', '');

    for (const { deviation, tests } of entries) {
      lines.push(
        `### ${deviation.id} - ${deviation.title}`,
        '',
        `**Severity:** ${deviation.severity.toUpperCase()}`,
        '',
        `**Expected:** ${deviation.expected}`,
        '',
        `**Actual:** ${deviation.actual}`,
        '',
        `**Impact:** ${deviation.impact}`,
        '',
        `**Covered by ${tests.length} test(s):**`,
        '',
        ...tests.map((title) => `- ${title}`),
        '',
      );
    }

    return lines.join('\n');
  }

  private printSummary(durationMs: number, status: string): void {
    const slowest = [...this.durations].sort((a, b) => b.ms - a.ms).slice(0, 3);
    const entries = this.sorted();
    const bySeverity = (severity: Deviation['severity']) =>
      entries.filter((entry) => entry.deviation.severity === severity).length;

    console.log('');
    console.log('─'.repeat(72));
    console.log(`  Run ${status.toUpperCase()} in ${(durationMs / 1000).toFixed(1)}s`);
    console.log(
      `  ${this.passed} passed  ${this.failed} failed  ${this.skipped} skipped  ${this.flaky} flaky`,
    );
    console.log(
      `  Defect register: ${entries.length} deviation(s) ` +
        `(${bySeverity('high')} high, ${bySeverity('medium')} medium, ${bySeverity('low')} low)`,
    );
    for (const { deviation } of entries) {
      console.log(`    - ${deviation.id} [${deviation.severity}] ${deviation.title}`);
    }
    if (slowest.length > 0) {
      console.log('  Slowest tests:');
      for (const entry of slowest) {
        console.log(`    - ${entry.ms}ms  ${entry.title}`);
      }
    }
    console.log(`  Reports: reports/html/index.html, reports/defect-register.md`);
    console.log('─'.repeat(72));
    console.log('');
  }
}
