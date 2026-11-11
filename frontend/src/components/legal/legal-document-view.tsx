import Link from 'next/link';

import { TERMS_VERSION, type LegalDocument } from '@/lib/legal';

export function LegalDocumentView({ document }: { document: LegalDocument }) {
  return (
    <article className="mx-auto max-w-3xl py-6 sm:py-10">
      <h1 className="text-2xl font-black text-foreground sm:text-3xl">{document.title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">Versiya: {TERMS_VERSION}</p>
      <p className="mt-4 leading-7 text-foreground">{document.intro}</p>
      {document.sections.map((section) => (
        <section key={section.heading} className="mt-8">
          <h2 className="text-lg font-bold text-foreground">{section.heading}</h2>
          {section.paragraphs.map((paragraph) => (
            <p key={paragraph} className="mt-3 leading-7 text-muted-foreground">{paragraph}</p>
          ))}
          {section.links && (
            <ul className="mt-3 flex flex-wrap gap-x-4">
              {section.links.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="inline-flex min-h-11 items-center font-semibold text-primary hover:underline">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </article>
  );
}
