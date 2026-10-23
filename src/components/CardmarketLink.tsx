import { cardmarketCheckUrl } from '@/lib/cardmarket';

/** Plain outbound link to Cardmarket's search. It sits next to, never inside, another link. */
export function CardmarketLink({ productId, productName, className = '' }: {
  productId: number; productName: string; className?: string;
}) {
  return (
    <a
      href={cardmarketCheckUrl(productId, productName)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Check on Cardmarket for ${productName}`}
      className={`inline-flex min-h-11 items-center justify-center rounded-[10px] border border-white/[0.13] px-3 text-xs text-mute hover:border-white/30 hover:text-white ${className}`}
    >
      Check on Cardmarket
    </a>
  );
}
