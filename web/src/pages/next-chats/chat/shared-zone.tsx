import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  ISharedConversation,
  useDeleteSharedConversation,
  useFetchSharedConversations,
  useForkSharedConversation,
  useHideSharedConversation,
  usePublishSharedConversation,
  useRenameSharedConversation,
  useReorderSharedConversations,
} from '@/hooks/use-chat-request';
import { cn } from '@/lib/utils';
import {
  LucideEye,
  LucideEyeOff,
  LucideGripVertical,
  LucidePencil,
  LucideTrash2,
  LucideUsers,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { SharedPreviewDialog } from './shared-preview-dialog';

function StatusBadge({ item }: { item: ISharedConversation }) {
  const { t } = useTranslation();
  if (item.is_pending) {
    return (
      <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent-primary/15 text-accent-primary shrink-0">
        {t('chat.pendingReview')}
      </span>
    );
  }
  if (item.is_hidden) {
    return (
      <span className="text-[10px] px-1.5 py-0.5 rounded bg-bg-card text-text-secondary shrink-0">
        {t('chat.hidden')}
      </span>
    );
  }
  return null;
}

export function SharedZone({
  onForked,
}: {
  onForked: (sessionId: string) => void;
}) {
  const { t } = useTranslation();
  const { id: chatId } = useParams();
  const { data } = useFetchSharedConversations();
  const { forkSharedConversation, loading: forking } =
    useForkSharedConversation();
  const { publishSharedConversation } = usePublishSharedConversation();
  const { hideSharedConversation } = useHideSharedConversation();
  const { deleteSharedConversation } = useDeleteSharedConversation();
  const { renameSharedConversation } = useRenameSharedConversation();
  const { reorderSharedConversations } = useReorderSharedConversations();

  const [previewId, setPreviewId] = useState<string | undefined>(undefined);
  const [previewOpen, setPreviewOpen] = useState(false);

  const items = useMemo(() => data?.items ?? [], [data?.items]);

  // Local order, resynced from the server whenever the list changes (e.g. after
  // a reorder commit). Drag interactions mutate this optimistically.
  const [order, setOrder] = useState<ISharedConversation[]>(items);
  useEffect(() => {
    setOrder(items);
  }, [items]);

  const draggingId = useRef<string | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  // Inline rename state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const renameCancelled = useRef(false);

  const openPreview = useCallback((sharedId: string) => {
    setPreviewId(sharedId);
    setPreviewOpen(true);
  }, []);

  const handleContinue = useCallback(async () => {
    if (!chatId || !previewId) return;
    const session = await forkSharedConversation({
      sharedId: previewId,
      targetChatId: chatId,
    });
    if (session?.id) {
      setPreviewOpen(false);
      onForked(session.id);
    }
  }, [chatId, previewId, forkSharedConversation, onForked]);

  const handleDragStart = useCallback((id: string) => {
    draggingId.current = id;
    setActiveDragId(id);
  }, []);

  const handleDragOver = useCallback(
    (e: DragEvent<HTMLLIElement>, overId: string) => {
      const from = draggingId.current;
      if (!from) return;
      e.preventDefault();
      if (from === overId) return;
      setOrder((prev) => {
        const fromIdx = prev.findIndex((x) => x.id === from);
        const toIdx = prev.findIndex((x) => x.id === overId);
        if (fromIdx === -1 || toIdx === -1) return prev;
        const next = [...prev];
        const [moved] = next.splice(fromIdx, 1);
        next.splice(toIdx, 0, moved);
        return next;
      });
    },
    [],
  );

  const handleDragEnd = useCallback(() => {
    if (draggingId.current) {
      reorderSharedConversations(order.map((x) => x.id));
    }
    draggingId.current = null;
    setActiveDragId(null);
  }, [order, reorderSharedConversations]);

  const startRename = useCallback((item: ISharedConversation) => {
    setEditingId(item.id);
    setDraft(item.name);
  }, []);

  const commitRename = useCallback(async () => {
    if (renameCancelled.current) {
      renameCancelled.current = false;
      setEditingId(null);
      return;
    }
    const name = draft.trim();
    const id = editingId;
    setEditingId(null);
    if (id && name) {
      await renameSharedConversation({ sharedId: id, name });
    }
  }, [draft, editingId, renameSharedConversation]);

  return (
    <div>
      {order.length === 0 && (
        <div className="text-text-secondary text-xs py-6 text-center">
          {t('chat.shareZoneEmpty')}
        </div>
      )}

      <ul className="space-y-1">
        {order.map((item) => {
          const isEditing = editingId === item.id;
          return (
            <li
              key={item.id}
              draggable={item.can_reorder && !isEditing}
              onDragStart={() => handleDragStart(item.id)}
              onDragOver={(e) => handleDragOver(e, item.id)}
              onDragEnd={handleDragEnd}
              className={cn(
                'group pr-1 py-2 flex items-center gap-1 rounded-lg transition-colors hover:bg-bg-card',
                {
                  'opacity-60': item.is_hidden,
                  'opacity-40': activeDragId === item.id,
                  'ring-1 ring-accent-primary/40':
                    activeDragId && activeDragId !== item.id,
                  'pl-1': item.can_reorder,
                  'pl-3': !item.can_reorder,
                },
              )}
            >
              {item.can_reorder && (
                <span
                  className="shrink-0 cursor-grab active:cursor-grabbing text-text-secondary opacity-0 group-hover:opacity-60 transition-opacity"
                  aria-hidden
                  data-testid="shared-conversation-drag-handle"
                >
                  <LucideGripVertical size={16} />
                </span>
              )}

              {isEditing ? (
                <input
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename();
                    if (e.key === 'Escape') {
                      renameCancelled.current = true;
                      setEditingId(null);
                    }
                  }}
                  className="flex-1 min-w-0 bg-bg-base border-0.5 border-accent-primary rounded px-2 py-1 text-sm outline-none"
                  data-testid="shared-conversation-rename-input"
                />
              ) : (
                <button
                  type="button"
                  className="flex-1 min-w-0 text-left focus-visible:outline-none"
                  onClick={() => openPreview(item.id)}
                  title={t('chat.continueFromShare')}
                  data-testid="shared-conversation-item"
                  data-shared-id={item.id}
                >
                  <div className="flex items-center gap-2">
                    <span className="truncate">{item.name}</span>
                    <StatusBadge item={item} />
                  </div>
                  <div className="text-xs text-text-secondary truncate">
                    {item.owner_name}
                  </div>
                </button>
              )}

              {!isEditing && (
                <div className="flex items-center shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  {item.can_rename && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => startRename(item)}
                          data-testid="shared-conversation-rename"
                        >
                          <LucidePencil size={16} />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{t('common.rename')}</TooltipContent>
                    </Tooltip>
                  )}

                  {item.can_publish && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => publishSharedConversation(item.id)}
                          data-testid="shared-conversation-publish"
                        >
                          <LucideUsers size={16} />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{t('chat.syncToAll')}</TooltipContent>
                    </Tooltip>
                  )}

                  {item.can_hide && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() =>
                            hideSharedConversation({
                              sharedId: item.id,
                              hidden: !item.is_hidden,
                            })
                          }
                          data-testid="shared-conversation-hide"
                        >
                          {item.is_hidden ? (
                            <LucideEye size={16} />
                          ) : (
                            <LucideEyeOff size={16} />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        {item.is_hidden ? t('chat.unhide') : t('chat.hide')}
                      </TooltipContent>
                    </Tooltip>
                  )}

                  {item.can_delete && (
                    <ConfirmDeleteDialog
                      onOk={() => deleteSharedConversation(item.id)}
                    >
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        className="text-state-error"
                        data-testid="shared-conversation-delete"
                      >
                        <LucideTrash2 size={16} />
                      </Button>
                    </ConfirmDeleteDialog>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <SharedPreviewDialog
        sharedId={previewId}
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        onContinue={handleContinue}
        continuing={forking}
      />
    </div>
  );
}
