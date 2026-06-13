import MarkdownContent from '@/components/markdown-content';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { MessageType } from '@/constants/chat';
import { useFetchSharedConversationDetail } from '@/hooks/use-chat-request';
import { IReference } from '@/interfaces/database/chat';
import { cn } from '@/lib/utils';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

export function SharedPreviewDialog({
  sharedId,
  open,
  onOpenChange,
  onContinue,
  continuing,
}: {
  sharedId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onContinue: () => void;
  continuing?: boolean;
}) {
  const { t } = useTranslation();
  const { data, loading } = useFetchSharedConversationDetail(
    open ? sharedId : undefined,
  );

  const messages = data?.messages ?? [];
  const references = useMemo(() => data?.reference ?? [], [data]);

  // Track the assistant ordinal so each answer maps to its snapshot reference.
  let assistantIndex = -1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="truncate pr-6">
            {data?.name || t('chat.shareZone')}
          </DialogTitle>
          {data?.owner_name ? (
            <span className="text-xs text-text-secondary">
              {data.owner_name}
            </span>
          ) : null}
        </DialogHeader>

        <div className="max-h-[60vh] overflow-auto flex flex-col gap-4 py-1">
          {loading ? (
            <div className="text-text-secondary text-sm py-8 text-center">
              {t('common.loading')}
            </div>
          ) : messages.length === 0 ? (
            <div className="text-text-secondary text-sm py-8 text-center">
              {t('chat.shareNoRecords')}
            </div>
          ) : (
            messages.map((m, idx) => {
              const isUser = m.role === MessageType.User;
              if (!isUser) assistantIndex += 1;
              const reference = (
                isUser ? {} : references[assistantIndex] || {}
              ) as IReference;
              return (
                <div
                  key={m.id ?? idx}
                  className={cn('flex', {
                    'justify-end': isUser,
                    'justify-start': !isUser,
                  })}
                >
                  <div
                    className={cn('rounded-lg px-3 py-2 max-w-[85%]', {
                      'bg-accent-primary/10 text-text-primary': isUser,
                      'bg-bg-card text-text-primary': !isUser,
                    })}
                  >
                    {isUser ? (
                      <span className="whitespace-pre-wrap break-words text-sm">
                        {m.content}
                      </span>
                    ) : (
                      <MarkdownContent
                        loading={false}
                        content={m.content}
                        reference={reference}
                      />
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={onContinue} disabled={continuing || loading}>
            {t('chat.continueChat')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
