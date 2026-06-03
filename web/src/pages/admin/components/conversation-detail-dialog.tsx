import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useQuery } from '@tanstack/react-query';

import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

import {
  ChatHistoryConversation,
  getConversationDetail,
  listUserConversations,
} from '@/services/admin-service';

type SelectedConv = {
  id: string;
  source: 'chat' | 'agent';
};

type Props = {
  userId: string | null;
  nickname: string;
  range: { start?: number; end?: number };
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function formatTs(ts: number | null | undefined) {
  if (!ts) return '';
  return new Date(ts).toLocaleString();
}

export function ConversationDetailDialog({
  userId,
  nickname,
  range,
  open,
  onOpenChange,
}: Props) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<SelectedConv | null>(null);

  useEffect(() => {
    if (open) setSelected(null);
  }, [open, userId]);

  const { data: list, isFetching: listLoading } = useQuery({
    queryKey: ['admin/chat-history/user-convs', userId, range.start, range.end],
    enabled: open && !!userId,
    queryFn: async () => {
      const res = await listUserConversations(userId as string, {
        start: range.start,
        end: range.end,
        page: 1,
        size: 200,
      });
      return res?.data?.data;
    },
  });

  const { data: detail, isFetching: detailLoading } = useQuery({
    queryKey: [
      'admin/chat-history/conv-detail',
      selected?.id,
      selected?.source,
    ],
    enabled: open && !!selected,
    queryFn: async () => {
      const res = await getConversationDetail(selected!.id, selected!.source);
      return res?.data?.data;
    },
  });

  const conversations = useMemo<ChatHistoryConversation[]>(
    () => list?.items ?? [],
    [list],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>
            {t('admin.chatHistoryDetailTitle')} · {nickname}
            {list ? (
              <Badge variant="secondary" className="ml-2">
                {t('admin.chatSessionsCount', { count: list.total })}
              </Badge>
            ) : null}
          </DialogTitle>
        </DialogHeader>

        <div className="flex gap-4 h-[60vh]">
          {/* Session list */}
          <div className="w-72 shrink-0 border border-border-default rounded-lg overflow-hidden">
            <ScrollArea className="h-full">
              {listLoading ? (
                <div className="text-text-secondary text-sm p-4 text-center">
                  {t('admin.loading')}
                </div>
              ) : conversations.length === 0 ? (
                <div className="text-text-secondary text-sm p-4 text-center">
                  {t('admin.noConversations')}
                </div>
              ) : (
                <ul className="divide-y divide-border-default">
                  {conversations.map((c) => {
                    const isActive = selected?.id === c.id;
                    return (
                      <li key={`${c.source}-${c.id}`}>
                        <button
                          type="button"
                          className={cn(
                            'w-full text-left px-3 py-2.5 transition-colors',
                            isActive ? 'bg-primary/10' : 'hover:bg-bg-card',
                          )}
                          onClick={() =>
                            setSelected({ id: c.id, source: c.source })
                          }
                        >
                          <div className="flex items-center gap-1.5">
                            <Badge
                              variant="outline"
                              className="shrink-0 text-[10px] px-1.5 py-0"
                            >
                              {c.source === 'agent'
                                ? t('admin.sourceAgent')
                                : t('admin.sourceChat')}
                            </Badge>
                            <span className="truncate text-sm flex-1">
                              {c.name || c.app_name || '-'}
                            </span>
                          </div>
                          <div className="flex items-center justify-between mt-1 text-xs text-text-secondary">
                            <span className="truncate">{c.app_name}</span>
                            <span className="shrink-0 ml-2">
                              {t('admin.roundsShort', {
                                count: c.round_count,
                              })}
                            </span>
                          </div>
                          <div className="text-[11px] text-text-secondary mt-0.5">
                            {c.create_date || formatTs(c.create_time)}
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </ScrollArea>
          </div>

          {/* Messages */}
          <div className="flex-1 min-w-0 border border-border-default rounded-lg overflow-hidden">
            <ScrollArea className="h-full">
              {!selected ? (
                <div className="text-text-secondary text-sm p-6 text-center">
                  {t('admin.selectConversation')}
                </div>
              ) : detailLoading ? (
                <div className="text-text-secondary text-sm p-6 text-center">
                  {t('admin.loading')}
                </div>
              ) : !detail || detail.messages.length === 0 ? (
                <div className="text-text-secondary text-sm p-6 text-center">
                  {t('admin.noMessages')}
                </div>
              ) : (
                <div className="p-4 space-y-4">
                  {detail.messages.map((m, idx) => {
                    const isUser = m.role === 'user';
                    return (
                      <div
                        key={idx}
                        className={cn(
                          'flex',
                          isUser ? 'justify-end' : 'justify-start',
                        )}
                      >
                        <div
                          className={cn(
                            'max-w-[80%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap break-words',
                            isUser
                              ? 'bg-primary/10 text-text-primary'
                              : 'bg-bg-card text-text-primary',
                          )}
                        >
                          <div className="text-[11px] text-text-secondary mb-1">
                            {isUser ? t('admin.roleUser') : t('admin.roleAi')}
                            {m.created_at
                              ? ` · ${formatTs(m.created_at * 1000)}`
                              : ''}
                          </div>
                          {m.content}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default ConversationDetailDialog;
