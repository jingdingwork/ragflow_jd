import { cn } from '@/lib/utils';

interface CtciLogoProps {
  className?: string;
  size?: number;
}

/**
 * CTCI / 京鼎 wordmark logo (shared brand asset).
 * Inherits `currentColor` for the "CTCI" text; the brand square stays orange.
 */
export function CtciLogo({ className, size = 44 }: CtciLogoProps) {
  return (
    <svg
      viewBox="0 0 200 60"
      height={size}
      className={cn('inline-block select-none', className)}
      xmlns="http://www.w3.org/2000/svg"
      aria-label="CTCI"
    >
      <text
        x="0"
        y="49"
        fontFamily="'Arial Black', 'Helvetica Neue', Arial, sans-serif"
        fontWeight={900}
        fontSize="56"
        fill="currentColor"
        letterSpacing="-3"
      >
        CTCI
      </text>
      <rect x="168" y="4" width="14" height="14" fill="#F39800" rx="1" />
    </svg>
  );
}

interface CtciBrandProps {
  className?: string;
  /** logo height in px */
  logoSize?: number;
  /** main brand word, default 京鼎 */
  title?: string;
  /** sub label, default CTCI Engineering; pass null to hide */
  subtitle?: string | null;
  /** font size of the main brand word, default 22 */
  titleSize?: number;
}

/**
 * Brand block: CtciLogo + vertical divider + 京鼎 / CTCI Engineering.
 * Used in the user header, admin login, and admin sidebar so the brand
 * lockup stays consistent everywhere.
 */
export function CtciBrand({
  className,
  logoSize = 32,
  title = '京鼎',
  subtitle = 'CTCI Engineering',
  titleSize = 20,
}: CtciBrandProps) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <CtciLogo size={logoSize} className="text-text-primary" />
      <div className="h-7 w-px bg-text-primary/15" />
      <div className="flex flex-col leading-tight">
        <span
          className="font-bold tracking-[0.14em] text-text-primary"
          style={{ fontSize: titleSize }}
        >
          {title}
        </span>
        {subtitle && (
          <span className="text-[10px] tracking-[0.3em] text-text-secondary uppercase mt-0.5">
            {subtitle}
          </span>
        )}
      </div>
    </div>
  );
}
