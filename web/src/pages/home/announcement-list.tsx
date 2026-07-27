import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  UserAnnouncement,
  useAckAnnouncement,
  useLatestAnnouncement,
  useListAnnouncements,
  useViewAnnouncement,
} from '@/hooks/use-announcement-request';
import MarkdownViewer from '@/pages/skills/components/markdown-viewer';
import { LucideMegaphone, LucidePin } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

// Strip Markdown syntax down to a short plain-text preview for the card.
function preview(md: string, max = 80) {
  const text = (md || '')
    .replace(/[#>*_`~-]/g, ' ')
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? text.slice(0, max) + '…' : text;
}

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

  if (list.length === 0) {
    return null;
  }

  return (
    <section className="mt-12" data-tour="home-announcements">
      <header className="flex items-center mb-2.5">
        <h2 className="text-2xl font-semibold flex items-center gap-2.5">
          <LucideMegaphone className="size-6 text-accent-primary" />
          {t('home.announcements')}
        </h2>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {list.map((a) => (
          <Card
            key={a.id}
            className="cursor-pointer border-0.5 border-border-button hover:border-accent-primary/60 transition-colors"
            onClick={() => openDetail(a)}
          >
            <CardContent className="p-4">
              <div className="flex items-start gap-2">
                {a.is_pinned && (
                  <LucidePin className="size-4 text-accent-primary shrink-0 mt-1" />
                )}
                <div className="min-w-0">
                  <h3 className="font-medium text-text-primary truncate">
                    {a.title}
                  </h3>
                  <p className="text-sm text-text-secondary mt-1 line-clamp-2">
                    {preview(a.content)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selected?.is_pinned && (
                <LucidePin className="size-4 text-accent-primary" />
              )}
              {selected?.title}
            </DialogTitle>
          </DialogHeader>

          <ScrollArea className="max-h-[60vh]">
            <div className="pr-3">
              {selected && <MarkdownViewer content={selected.content} />}
            </div>
          </ScrollArea>

          <DialogFooter>
            {isAutoPopup && selected && !selected.acknowledged ? (
              <Button onClick={handleAck}>{t('home.announcementAck')}</Button>
            ) : (
              <Button variant="outline" onClick={() => setOpen(false)}>
                {t('common.close')}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

export default Announcements;
