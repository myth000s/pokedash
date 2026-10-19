import { ZodError } from 'zod';

const MAX_ISSUES = 3;

/** One-line-ish error text; schema failures are cut to the first few issues. Never includes request details. */
export function describeError(err: unknown): string {
  if (err instanceof ZodError) {
    const shown = err.issues
      .slice(0, MAX_ISSUES)
      .map((i) => `${i.path.length ? i.path.join('.') : '(root)'}: ${i.message}`);
    const more = err.issues.length > MAX_ISSUES ? `; ... ${err.issues.length} issues in total` : '';
    return `Schema validation failed (${err.issues.length} issues): ${shown.join('; ')}${more}`;
  }
  return err instanceof Error ? err.message : 'Unknown error';
}
