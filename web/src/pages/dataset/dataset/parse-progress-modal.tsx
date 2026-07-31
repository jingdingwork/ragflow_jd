import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { useTranslation } from 'react-i18next';

// Blocking progress overlay shown while a batch parse is submitting its tasks.
// Being modal (no onOpenChange, outside/escape ignored) it also prevents the
// user from re-triggering the run while the batch is still in flight.
export function ParseProgressModal({
  progress,
}: {
  progress: { current: number; total: number } | null;
}) {
  const { t } = useTranslation();
  const open = !!progress && progress.total > 0;
  const percent = open
    ? Math.round((progress!.current / progress!.total) * 100)
    : 0;

  return (
    <Dialog open={open}>
      <DialogContent
        className="max-w-sm"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <div className="space-y-3 pt-1">
          <div className="text-text-primary font-medium">
            {t('knowledgeDetails.submittingParseTasks')}
          </div>
          <div className="flex justify-between text-xs text-text-secondary">
            <span>{t('knowledgeDetails.pleaseWait')}</span>
            <span>
              {progress?.current} / {progress?.total}
            </span>
          </div>
          <Progress value={percent} className="h-2" />
        </div>
      </DialogContent>
    </Dialog>
  );
}
