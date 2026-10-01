import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import clsx from 'clsx';

/**
 * A long text block shown folded behind a fade with "Read more" / "Read less"
 * (the 551 HVAC guide layout). The whole text is in the HTML, so search engines and
 * screen readers get all of it; folding is only visual.
 *
 * CSS-only (a visually hidden checkbox + label), so it works before or without
 * JavaScript and needs no client component.
 */
export function ReadMore({
  id,
  children,
  fadeColor,
  accentColor,
  collapsedClassName = 'max-h-[15rem]',
  centered = false,
}: {
  /** Unique on the page; ties the button to its text. */
  id: string;
  children: ReactNode;
  /** The section's background, so the fade blends into it. */
  fadeColor: string;
  accentColor: string;
  collapsedClassName?: string;
  centered?: boolean;
}) {
  const toggleId = `${id}-toggle`;
  return (
    <div className="relative">
      <input id={toggleId} type="checkbox" className="peer sr-only" aria-controls={id} />
      <div id={id} className={clsx('overflow-hidden transition-[max-height] duration-300 peer-checked:max-h-none', collapsedClassName)}>
        {children}
      </div>
      {/* Positioned, so it paints over the text above it (a plain block's background paints underneath). */}
      <div
        aria-hidden
        className="pointer-events-none relative -mt-24 h-24 w-full peer-checked:hidden"
        style={{ background: `linear-gradient(to bottom, transparent, ${fadeColor})` }}
      />
      <div className={clsx('mt-4 flex', centered ? 'justify-center' : 'justify-start')}>
        <label
          htmlFor={toggleId}
          className="group inline-flex cursor-pointer select-none items-center gap-1.5 rounded-full border px-5 py-2 text-sm font-semibold transition hover:opacity-90 [.peer:focus-visible~div_&]:ring-2 [.peer:focus-visible~div_&]:ring-offset-2"
          style={{ borderColor: accentColor, color: accentColor }}
        >
          <span className="[.peer:checked~div_&]:hidden">Read more</span>
          <span className="hidden [.peer:checked~div_&]:inline">Read less</span>
          <ChevronDown className="h-4 w-4 transition-transform [.peer:checked~div_&]:rotate-180" aria-hidden />
        </label>
      </div>
    </div>
  );
}
