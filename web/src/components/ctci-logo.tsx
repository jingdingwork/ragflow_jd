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

interface CtciFullLogoProps {
  className?: string;
  /** rendered logo height in px */
  height?: number;
  /**
   * Which artwork to show:
   * - `dark`  — dark-grey wordmark, for light surfaces
   * - `light` — white wordmark, for dark surfaces
   * - `auto`  — dark on light theme, white on dark theme (default)
   */
  variant?: 'auto' | 'dark' | 'light';
}

const CTCI_LOGO_DARK = '/ctci-logo-dark.png';
const CTCI_LOGO_LIGHT = '/ctci-logo-light.png';
const CTCI_LOGO_ALT = '京鼎工程建设有限公司 CTCI Beijing Co., Ltd.';

/**
 * Official CTCI company lockup: the "CTCI" wordmark + orange hexagon accent
 * followed by the two-line company name (京鼎工程建设有限公司 / CTCI Beijing
 * Co., Ltd.). Backed by the raster assets in `public/ctci-logo-dark.png`
 * (dark wordmark, for light surfaces) and `public/ctci-logo-light.png`
 * (white wordmark, for dark surfaces). `variant="auto"` swaps between them by
 * theme. This is the whole brand block on its own — do NOT pair it with a
 * separate 京鼎 wordmark.
 */
export function CtciFullLogo({
  className,
  height = 40,
  variant = 'auto',
}: CtciFullLogoProps) {
  const common = cn('inline-block w-auto select-none', className);

  if (variant === 'dark') {
    return (
      <img
        src={CTCI_LOGO_DARK}
        alt={CTCI_LOGO_ALT}
        style={{ height }}
        className={common}
      />
    );
  }

  if (variant === 'light') {
    return (
      <img
        src={CTCI_LOGO_LIGHT}
        alt={CTCI_LOGO_ALT}
        style={{ height }}
        className={common}
      />
    );
  }

  // auto: dark wordmark on light theme, white wordmark on dark theme
  return (
    <>
      <img
        src={CTCI_LOGO_DARK}
        alt={CTCI_LOGO_ALT}
        style={{ height }}
        className={cn(common, 'dark:hidden')}
      />
      <img
        src={CTCI_LOGO_LIGHT}
        alt={CTCI_LOGO_ALT}
        style={{ height }}
        className={cn(common, 'hidden dark:inline-block')}
      />
    </>
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
