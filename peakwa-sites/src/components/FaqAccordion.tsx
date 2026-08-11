'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import clsx from 'clsx';

type Faq = { question: string; answer: string };

type FaqAccordionProps = {
  faqs: Faq[];
  accentColor: string;
};

export function FaqAccordion({ faqs, accentColor }: FaqAccordionProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <div className="divide-y divide-gray-200 overflow-hidden rounded-xl border border-gray-200 bg-white">
      {faqs.map((faq, i) => {
        const isOpen = openIndex === i;
        return (
          <div key={`${faq.question}-${i}`} className="px-5 sm:px-6">
            <button
              type="button"
              onClick={() => setOpenIndex(isOpen ? null : i)}
              aria-expanded={isOpen}
              className="flex w-full items-center justify-between gap-4 py-5 text-left"
            >
              <span className="text-lg font-bold text-gray-900">{faq.question}</span>
              <ChevronDown
                aria-hidden
                className={clsx(
                  'h-5 w-5 shrink-0 text-gray-500 transition-transform duration-300',
                  isOpen && 'rotate-180',
                )}
                style={{ color: accentColor }}
              />
            </button>
            <div
              className={clsx(
                'grid transition-[grid-template-rows] duration-300 ease-in-out',
                isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
              )}
            >
              <div className="overflow-hidden">
                <p className="pb-5 leading-relaxed text-gray-600">{faq.answer}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
