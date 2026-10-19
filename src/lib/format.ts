const euro = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' });

export function formatEuro(cents: number): string {
  return euro.format(cents / 100);
}

export function formatPct(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

export function formatAge(then: Date, now: Date): string {
  const minutes = Math.floor(Math.max(0, now.getTime() - then.getTime()) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? 'day' : 'days'} ago`;
}

const count = new Intl.NumberFormat('en-IE');

export function formatCount(n: number): string {
  return count.format(n);
}

export function formatFreshness(then: Date | null, now: Date): string {
  if (!then) return '–';
  const hours = Math.max(0, now.getTime() - then.getTime()) / 3_600_000;
  if (hours < 24) return 'Today';
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? 'day' : 'days'} old`;
}
