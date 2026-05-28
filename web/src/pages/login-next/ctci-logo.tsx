import { cn } from '@/lib/utils';

interface CtciLogoProps {
  className?: string;
  size?: number;
}

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
