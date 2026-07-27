import { cn } from '@/lib/utils';
import { useMemo } from 'react';

interface PreviewWatermarkProps {
  // Whether to render the watermark. When false, children pass through untouched.
  active?: boolean;
  // Watermark label, e.g. "18017346 · 张三".
  text?: string;
  className?: string;
  children: React.ReactNode;
}

// Build a tiled, diagonal, low-opacity SVG background so the watermark repeats
// sparsely across the whole preview without hurting readability. Rendered as a
// data-URI background-image (one draw, GPU-friendly) rather than hundreds of
// DOM nodes.
function buildWatermarkDataUri(text: string) {
  const safe = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  // Sparse tile: ~260x170, text drawn once per tile, rotated -25deg.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="260" height="170">
    <text x="0" y="120" transform="rotate(-25 130 85)"
      font-family="Arial, 'Microsoft YaHei', sans-serif" font-size="15"
      fill="currentColor">${safe}</text>
  </svg>`;
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
}

export function PreviewWatermark({
  active,
  text,
  className,
  children,
}: PreviewWatermarkProps) {
  const backgroundImage = useMemo(
    () => (text ? buildWatermarkDataUri(text) : undefined),
    [text],
  );

  if (!active || !text) {
    return <>{children}</>;
  }

  return (
    <div className={cn('relative', className)}>
      {children}
      <div
        aria-hidden
        className={cn(
          'pointer-events-none select-none absolute inset-0 z-[60]',
          'overflow-hidden opacity-[0.10] text-text-primary',
        )}
        style={{
          backgroundImage,
          backgroundRepeat: 'repeat',
        }}
      />
    </div>
  );
}

export default PreviewWatermark;
