import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { MessageType } from '@/constants/chat';
import { useShareSession } from '@/hooks/use-chat-request';
import { Message } from '@/interfaces/database/chat';
import { cn } from '@/lib/utils';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

type Turn = {
  key: string;
  question: Message;
  answer?: Message;
  messageIds: string[];
};

// Group a flat message list into Q&A turns. The leading assistant prologue
// (before any user message) carries no question and is not shareable.
function groupTurns(messages: Message[]): Turn[] {
  const turns: Turn[] = [];
  let current: Turn | null = null;
  messages.forEach((m) => {
    if (m.role === MessageType.User) {
      if (current) turns.push(current);
      current = {
        key: m.id ?? `${turns.length}`,
        question: m,
        messageIds: m.id ? [m.id] : [],
      };
    } else if (m.role === MessageType.Assistant && current) {
      if (!current.answer) current.answer = m;
      if (m.id) current.messageIds.push(m.id);
    }
  });
  if (current) turns.push(current);
  return turns.filter((turn) => turn.messageIds.length > 0);
}

function truncate(text: string, max = 120): string {
  const plain = (text || '').replace(/\s+/g, ' ').trim();
  return plain.length > max ? `${plain.slice(0, max)}…` : plain;
}

export function ShareSessionDialog({
  open,
  onOpenChange,
  chatId,
  sessionId,
  sessionName,
  messages,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chatId: string;
  sessionId: string;
  sessionName?: string;
  messages: Message[];
}) {
  const { t } = useTranslation();
  const { shareSession, loading } = useShareSession();
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  const turns = useMemo(() => groupTurns(messages ?? []), [messages]);

  const toggle = useCallback((key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const handleShare = useCallback(async () => {
    const messageIds = turns
      .filter((turn) => selectedKeys.has(turn.key))
      .flatMap((turn) => turn.messageIds);
    if (messageIds.length === 0) return;
    const code = await shareSession({
      chatId,
      sessionId,
      messageIds,
      name: sessionName,
    });
    if (code === 0) {
      setSelectedKeys(new Set());
      onOpenChange(false);
    }
  }, [
    turns,
    selectedKeys,
    shareSession,
    chatId,
    sessionId,
    sessionName,
    onOpenChange,
  ]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('chat.shareSelectRecords')}</DialogTitle>
        </DialogHeader>

        <div className="max-h-[55vh] overflow-auto flex flex-col gap-2 py-1">
          {turns.length === 0 ? (
            <div className="text-text-secondary text-sm py-8 text-center">
              {t('chat.shareNoRecords')}
            </div>
          ) : (
            turns.map((turn) => {
              const checked = selectedKeys.has(turn.key);
              return (
                <label
                  key={turn.key}
                  className={cn(
                    'flex gap-3 rounded-lg border border-border-button p-3 cursor-pointer bg-bg-card transition-colors',
                    { 'border-accent-primary': checked },
                  )}
                >
                  <Checkbox
                    className="mt-0.5"
                    checked={checked}
                    onCheckedChange={() => toggle(turn.key)}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-text-primary font-medium truncate">
                      {truncate(turn.question.content)}
                    </div>
                    {turn.answer ? (
                      <div className="text-xs text-text-secondary mt-1 line-clamp-2">
                        {truncate(turn.answer.content, 200)}
                      </div>
                    ) : null}
                  </div>
                </label>
              );
            })
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handleShare}
            disabled={selectedKeys.size === 0 || loading}
          >
            {t('chat.share')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
