import Link from 'next/link';

import type { SeoFaq } from '@/lib/seo-content';

interface SeoFaqSectionProps {
  faqs: SeoFaq[];
  heading: string;
  intro?: string;
  links?: Array<{ href: string; label: string }>;
}

/** Visible, crawlable copy. Keep it in sync with any FAQPage JSON-LD emitted alongside it. */
export function SeoFaqSection({ faqs, heading, intro, links }: SeoFaqSectionProps) {
  return (
    <section aria-labelledby="seo-faq-heading" className="mx-auto max-w-7xl px-6 py-10 text-white md:px-12">
      <h2 id="seo-faq-heading" className="text-xl font-bold md:text-2xl">{heading}</h2>
      {intro ? <p className="mt-3 max-w-3xl text-sm leading-relaxed text-zinc-400">{intro}</p> : null}

      {links?.length ? (
        <nav aria-label="Related genres" className="mt-5 flex flex-wrap gap-3">
          {links.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="rounded-full border border-white/10 px-4 py-2 text-sm text-zinc-300 transition hover:border-white/30 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
            >
              {label}
            </Link>
          ))}
        </nav>
      ) : null}

      <dl className="mt-6 grid max-w-3xl gap-5">
        {faqs.map((faq) => (
          <div key={faq.question}>
            <dt className="text-sm font-semibold text-zinc-100">{faq.question}</dt>
            <dd className="mt-1 text-sm leading-relaxed text-zinc-400">{faq.answer}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
