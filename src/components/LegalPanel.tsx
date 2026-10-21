import type { ReactNode } from 'react';

// Readable prose panel for the German legal pages, in the Aurora look.
export function LegalPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main lang="de" className="flex flex-1 justify-center px-4 py-10">
      <div className="holo-ring w-full max-w-2xl self-start">
        <article className="relative rounded-2xl bg-[rgba(10,12,30,0.93)] p-6 text-ink sm:p-8 [&_h2]:mt-8 [&_h2]:mb-2 [&_h2]:font-display [&_h2]:text-lg [&_h2]:tracking-wide [&_p]:mt-2 [&_p]:leading-relaxed [&_p]:text-[#d5daf5] [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:leading-relaxed [&_li]:text-[#d5daf5] [&_a]:inline-flex [&_a]:min-h-11 [&_a]:items-center [&_a]:text-holo-cyan [&_a]:underline [&_a]:underline-offset-4">
          <h1 className="w-fit bg-gradient-to-r from-holo-cyan via-holo-purple via-60% to-gold bg-clip-text font-display text-3xl tracking-wide text-transparent">
            {title}
          </h1>
          {children}
        </article>
      </div>
    </main>
  );
}
