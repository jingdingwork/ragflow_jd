import { cn } from '@/lib/utils';
import { ReactNode } from 'react';

/**
 * View-only wrapper for previews of download-restricted knowledge bases. When
 * `active`, it blocks the right-click context menu (Save image/Save as…),
 * drag-to-save and text selection. This is a deterrent for ordinary users — it
 * cannot stop a determined user from reading the bytes via devtools, which is a
 * fundamental limit of any in-browser preview.
 */
export function NoSaveGuard({
  active,
  className,
  children,
}: {
  active: boolean;
  className?: string;
  children: ReactNode;
}) {
  if (!active) {
    return <>{children}</>;
  }
  return (
    <div
      className={cn('size-full select-none', className)}
      onContextMenu={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
    >
      {children}
    </div>
  );
}

export default NoSaveGuard;
