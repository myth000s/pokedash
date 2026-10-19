import type {
  BenchmarkAssessment, BenchmarkSnapshot, Confidence, ProductKind,
} from '@/domain/types';

const ORDER: Confidence[] = ['low', 'medium', 'high'];
const MS_PER_HOUR = 3_600_000;

const capAt = (level: Confidence, max: Confidence): Confidence =>
  ORDER.indexOf(level) > ORDER.indexOf(max) ? max : level;

export function assessBenchmark(
  snapshot: BenchmarkSnapshot,
  opts: { kind: ProductKind; reverseHolo: boolean; now: Date; maxAgeHours: number },
): BenchmarkAssessment {
  const { reverseHolo } = opts;
  const basis = reverseHolo ? 'trend_holo' : 'trend';
  const value = reverseHolo ? snapshot.trendHolo : snapshot.trend;
  const { capturedAt } = snapshot;

  if (value === null) {
    return {
      valueCents: null, basis, confidence: 'insufficient',
      reasons: ['No sales-based market price'], capturedAt,
    };
  }

  const checks =
    opts.kind === 'single'
      ? reverseHolo ? [snapshot.avg7Holo, snapshot.avg30Holo] : [snapshot.avg7, snapshot.avg30]
      : [reverseHolo ? snapshot.avgHolo : snapshot.avg];

  let level: Confidence = 'high';
  const reasons: string[] = [];

  if (checks.some((c) => c === null)) {
    level = capAt(level, 'medium');
    reasons.push('Few recent sales');
  }

  const present = checks.filter((c): c is number => c !== null);
  const dev = present.length ? Math.max(...present.map((c) => Math.abs(c - value) / value)) : 0;
  if (dev > 0.5) {
    level = 'low';
    reasons.push('Recent sales differ a lot from the trend');
  } else if (dev > 0.25) {
    level = capAt(level, 'medium');
    reasons.push('Recent sales vary from the trend');
  }

  const ageHours = (opts.now.getTime() - capturedAt.getTime()) / MS_PER_HOUR;
  if (ageHours > opts.maxAgeHours) {
    level = 'low';
    reasons.push(`Price data is ${Math.floor(ageHours / 24)} days old`);
  }

  return { valueCents: value, basis, confidence: level, reasons, capturedAt };
}
