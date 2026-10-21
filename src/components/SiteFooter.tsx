import Link from 'next/link';

const linkClass =
  'inline-flex min-h-11 items-center px-3 text-sm text-mute underline-offset-4 hover:text-ink hover:underline';

export function SiteFooter() {
  return (
    <footer className="flex justify-center px-4 pb-4">
      <nav aria-label="Legal" className="flex gap-1">
        <Link href="/impressum" lang="de" className={linkClass}>
          Impressum
        </Link>
        <span aria-hidden="true" className="flex items-center text-mute">
          ·
        </span>
        <Link href="/datenschutz" lang="de" className={linkClass}>
          Datenschutz
        </Link>
      </nav>
    </footer>
  );
}
