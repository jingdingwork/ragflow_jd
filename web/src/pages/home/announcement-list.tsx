import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  UserAnnouncement,
  useAckAnnouncement,
  useLatestAnnouncement,
  useListAnnouncements,
  useViewAnnouncement,
} from '@/hooks/use-announcement-request';
import { cn } from '@/lib/utils';
import MarkdownViewer from '@/pages/skills/components/markdown-viewer';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { LucideMegaphone, LucidePin, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

export function Announcements() {
  const { t } = useTranslation();
  const { list } = useListAnnouncements();
  const { latest } = useLatestAnnouncement();
  const { viewAnnouncement } = useViewAnnouncement();
  const { ackAnnouncement } = useAckAnnouncement();

  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<UserAnnouncement | null>(null);
  // Whether the currently-open dialog is the auto-popped latest announcement.
  const [isAutoPopup, setIsAutoPopup] = useState(false);
  // Guard so the latest announcement auto-pops at most once per mount.
  const autoPoppedRef = useRef(false);

  // The home bar surfaces only the pinned announcement; everything else lives in
  // the admin console. If nothing is pinned, the bar is hidden entirely.
  const pinned = useMemo(() => list.find((a) => a.is_pinned) ?? null, [list]);

  const openDetail = useCallback(
    (a: UserAnnouncement, auto = false) => {
      setSelected(a);
      setIsAutoPopup(auto);
      setOpen(true);
      viewAnnouncement(a.id).catch(() => {});
    },
    [viewAnnouncement],
  );

  // Auto-pop the latest popup-enabled announcement the user hasn't acknowledged.
  useEffect(() => {
    if (autoPoppedRef.current) return;
    if (latest && !latest.acknowledged) {
      autoPoppedRef.current = true;
      openDetail(latest, true);
    }
  }, [latest, openDetail]);

  const handleAck = useCallback(async () => {
    if (selected) {
      await ackAnnouncement(selected.id).catch(() => {});
    }
    setOpen(false);
  }, [selected, ackAnnouncement]);

  if (!pinned) {
    return null;
  }

  return (
    <section className="mt-12" data-tour="home-announcements">
      <div className="flex items-center gap-3 rounded-xl border-0.5 border-border-button bg-card px-4 py-3">
        <LucideMegaphone className="size-6 text-accent-primary shrink-0" />

        <button
          type="button"
          onClick={() => openDetail(pinned)}
          className="flex items-center gap-1.5 flex-1 min-w-0 text-text-primary font-medium hover:text-accent-primary transition-colors"
        >
          <LucidePin className="size-4 text-accent-primary shrink-0" />
          <span className="truncate">{pinned.title}</span>
        </button>
      </div>

      {/* Non-modal popup: no dark/blur backdrop, the page stays fully visible
          behind it so the announcement feels like a gentle notice, not a wall. */}
      <DialogPrimitive.Root open={open} onOpenChange={setOpen} modal={false}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Content
            onInteractOutside={(e) => e.preventDefault()}
            onOpenAutoFocus={(e) => e.preventDefault()}
            className={cn(
              'fixed left-1/2 top-24 z-50 w-[92vw] max-w-lg -translate-x-1/2',
              'rounded-xl border-0.5 border-border-button bg-bg-base p-6 shadow-2xl',
              'data-[state=open]:animate-in data-[state=closed]:animate-out',
              'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
              'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
              'data-[state=open]:slide-in-from-top-2',
            )}
          >
            <div className="flex items-center gap-2 border-b-0.5 border-border-button pb-3 pr-8">
              <LucideMegaphone className="size-5 text-accent-primary shrink-0" />
              {selected?.is_pinned && (
                <LucidePin className="size-4 text-accent-primary shrink-0" />
              )}
              <DialogPrimitive.Title className="text-lg font-semibold leading-none tracking-tight truncate">
                {selected?.title}
              </DialogPrimitive.Title>
            </div>

            <ScrollArea className="max-h-[50vh] mt-4">
              <div className="pr-3">
                {selected && <MarkdownViewer content={selected.content} />}
              </div>
            </ScrollArea>

            <div className="mt-4 flex justify-end gap-3">
              {isAutoPopup && selected && !selected.acknowledged ? (
                <Button onClick={handleAck}>{t('home.announcementAck')}</Button>
              ) : (
                <Button variant="outline" onClick={() => setOpen(false)}>
                  {t('common.close')}
                </Button>
              )}
            </div>

            <DialogPrimitive.Close className="absolute right-4 top-4 p-1.5 rounded-sm opacity-70 text-text-secondary transition-colors hover:bg-border-button hover:text-text-primary">
              <X className="h-4 w-4" />
              <span className="sr-only">{t('common.close')}</span>
            </DialogPrimitive.Close>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </section>
  );
}

export default Announcements;
