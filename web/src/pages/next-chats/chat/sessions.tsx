import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog';
import EmbedDialog from '@/components/embed-dialog';
import { useShowEmbedModal } from '@/components/embed-dialog/use-show-embed-dialog';
import { MoreButton } from '@/components/more-button';
import { RAGFlowAvatar } from '@/components/ragflow-avatar';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { SearchInput } from '@/components/ui/input';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { SharedFrom } from '@/constants/chat';
import { useSetModalState } from '@/hooks/common-hooks';
import {
  useFetchChat,
  useFetchSharedConversations,
  useGetChatSearchParams,
  useRemoveSessions,
} from '@/hooks/use-chat-request';
import { cn } from '@/lib/utils';
import {
  LucideCopyX,
  LucideListChecks,
  LucideMessageSquare,
  LucidePanelLeftClose,
  LucidePlus,
  LucideSend,
  LucideShare2,
  LucideTrash2,
  LucideUndo2,
} from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { useChatUrlParams } from '../hooks/use-chat-url';
import { useHandleClickConversationCard } from '../hooks/use-click-card';
import { useSelectDerivedConversationList } from '../hooks/use-select-conversation-list';
import { ConversationDropdown } from './conversation-dropdown';
import { SharedZone } from './shared-zone';

type SessionProps = Pick<
  ReturnType<typeof useHandleClickConversationCard>,
  'handleConversationCardClick'
>;
export function Sessions({ handleConversationCardClick }: SessionProps) {
  const { t } = useTranslation();
  const {
    list: conversationList,
    addTemporaryConversation,
    removeTemporaryConversation,
    handleInputChange,
    searchString,
  } = useSelectDerivedConversationList();
  const { data } = useFetchChat();
  const { visible, switchVisible } = useSetModalState(true);
  const { removeSessions } = useRemoveSessions();
  const { setConversationBoth } = useChatUrlParams();
  const { conversationId } = useGetChatSearchParams();

  // Active sidebar tab: own conversations vs department share zone
  const [activeTab, setActiveTab] = useState<'conversations' | 'shared'>(
    'conversations',
  );
  const { data: sharedData } = useFetchSharedConversations();
  const sharedCount = sharedData?.items?.length ?? 0;

  // Selection mode state
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Toggle selection mode (click batch delete icon)
  const toggleSelectionMode = useCallback(() => {
    setSelectionMode(true);
    setSelectedIds(new Set());
  }, []);

  // Exit selection mode (click return icon)
  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, []);

  // Toggle single item selection
  const toggleSelection = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  }, []);

  // Toggle select all
  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      if (prev.size === conversationList.length) {
        return new Set();
      }
      return new Set(conversationList.map((x) => x.id));
    });
  }, [conversationList]);

  // Batch delete
  const handleBatchDelete = useCallback(async () => {
    if (selectedIds.size === 0) {
      return;
    }

    const selectedIdList = Array.from(selectedIds);
    const currentConversationDeleted = conversationId
      ? selectedIdList.includes(conversationId)
      : false;
    const temporaryIdSet = new Set(
      conversationList.filter((item) => item.is_new).map((item) => item.id),
    );
    const persistedIds: string[] = [];

    selectedIdList.forEach((id) => {
      if (temporaryIdSet.has(id)) {
        removeTemporaryConversation(id);
      } else {
        persistedIds.push(id);
      }
    });

    let removeCode = -1;
    if (persistedIds.length > 0) {
      removeCode = await removeSessions(persistedIds);
    }

    if (currentConversationDeleted && conversationId) {
      const currentIsTemporary = temporaryIdSet.has(conversationId);
      const currentPersistedDeleted =
        persistedIds.includes(conversationId) && removeCode === 0;
      if (currentIsTemporary || currentPersistedDeleted) {
        setConversationBoth('', '');
      }
    }
    exitSelectionMode();
  }, [
    selectedIds,
    conversationId,
    conversationList,
    setConversationBoth,
    removeTemporaryConversation,
    removeSessions,
    exitSelectionMode,
  ]);

  const selectedCount = useMemo(() => selectedIds.size, [selectedIds]);

  const { id } = useParams();
  const { showEmbedModal, hideEmbedModal, embedVisible, beta } =
    useShowEmbedModal();

  if (!visible) {
    return (
      <div className="p-5">
        <Button
          variant="transparent"
          size="icon-sm"
          className="border-0"
          onClick={switchVisible}
          data-testid="chat-detail-sessions-open"
        >
          <RAGFlowAvatar
            avatar={data.icon}
            name={data.name}
            className="size-8 cursor-pointer"
          />
        </Button>
      </div>
    );
  }

  return (
    <aside
      className="p-5 w-[296px] flex flex-col"
      role="complementary"
      data-testid="chat-detail-sessions"
    >
      <header className="flex items-center text-base justify-between gap-4">
        <div className="flex gap-3 items-center min-w-0">
          <RAGFlowAvatar
            avatar={data.icon}
            name={data.name}
            className="size-8"
          />

          <span className="flex-1 truncate">{data.name}</span>
        </div>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              onClick={showEmbedModal}
              size="icon-xs"
              data-testid="chat-detail-embed-open"
            >
              <LucideSend />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('common.embedIntoSite')}</TooltipContent>
        </Tooltip>

        <EmbedDialog
          visible={embedVisible}
          hideModal={hideEmbedModal}
          token={id!}
          from={SharedFrom.Chat}
          beta={beta}
          isAgent={false}
        />

        <Button
          variant="transparent"
          size="icon-sm"
          className="border-0 ml-auto"
          onClick={switchVisible}
          data-testid="chat-detail-sessions-close"
        >
          <LucidePanelLeftClose />
        </Button>
      </header>

      {/* Segmented icon switcher: own conversations vs department share zone */}
      <div className="pt-8 pb-4">
        <div className="relative flex p-1 rounded-xl bg-bg-card border-0.5 border-border-button select-none">
          <span
            aria-hidden
            className="absolute top-1 bottom-1 left-1 w-[calc(50%-4px)] rounded-lg bg-accent-primary/15 ring-1 ring-accent-primary/30 shadow-sm transition-transform duration-300 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)]"
            style={{
              transform:
                activeTab === 'shared' ? 'translateX(100%)' : 'translateX(0)',
            }}
          />
          {(
            [
              {
                key: 'conversations',
                Icon: LucideMessageSquare,
                label: t('chat.conversations'),
                count: conversationList.length,
              },
              {
                key: 'shared',
                Icon: LucideShare2,
                label: t('chat.shareZone'),
                count: sharedCount,
              },
            ] as const
          ).map(({ key, Icon, label, count }) => {
            const active = activeTab === key;
            return (
              <Tooltip key={key}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label={label}
                    aria-pressed={active}
                    onClick={() => {
                      setActiveTab(key);
                      if (key === 'shared') exitSelectionMode();
                    }}
                    className={cn(
                      'relative z-10 flex-1 min-w-0 flex items-center justify-center gap-1.5 py-2 rounded-lg transition-colors duration-200',
                      active
                        ? 'text-accent-primary'
                        : 'text-text-secondary hover:text-text-primary',
                    )}
                    data-testid={`chat-detail-tab-${key}`}
                  >
                    <Icon size={16} className="shrink-0" />
                    <span
                      className={cn(
                        'shrink-0 min-w-[18px] text-center text-[11px] leading-none px-1.5 py-0.5 rounded-full tabular-nums transition-colors',
                        active
                          ? 'bg-accent-primary/20 text-accent-primary'
                          : 'bg-bg-base text-text-secondary',
                      )}
                    >
                      {count}
                    </span>
                  </button>
                </TooltipTrigger>
                <TooltipContent>{label}</TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </div>

      {/* Sliding panels */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <div
          className="flex h-full w-[200%] transition-transform duration-300 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)]"
          style={{
            transform:
              activeTab === 'shared' ? 'translateX(-50%)' : 'translateX(0)',
          }}
        >
          {/* Conversations panel */}
          <div
            className={cn(
              'w-1/2 h-full flex flex-col min-h-0 pr-0.5 transition-opacity duration-300',
              activeTab === 'conversations' ? 'opacity-100' : 'opacity-0',
            )}
            aria-hidden={activeTab !== 'conversations'}
          >
            <div className="flex items-center justify-end gap-2 mb-2 h-7">
              {selectionMode ? (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={exitSelectionMode}
                  data-testid="chat-detail-session-selection-exit"
                >
                  <LucideUndo2 size={16} />
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={addTemporaryConversation}
                  data-testid="chat-detail-session-new"
                >
                  <LucidePlus className="h-4 w-4" />
                </Button>
              )}

              {selectionMode && selectedCount > 0 ? (
                <ConfirmDeleteDialog
                  onOk={handleBatchDelete}
                  title={t('chat.batchDeleteSessions')}
                  content={{
                    title: t('chat.deleteSelectedConfirm', {
                      count: selectedCount,
                    }),
                  }}
                  testId="chat-detail-session-batch-delete-dialog"
                  confirmButtonTestId="chat-detail-session-batch-delete-confirm"
                  cancelButtonTestId="chat-detail-session-batch-delete-cancel"
                >
                  <Button
                    variant="delete"
                    size="icon-xs"
                    data-testid="chat-detail-session-batch-delete"
                  >
                    <LucideTrash2 />
                  </Button>
                </ConfirmDeleteDialog>
              ) : (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={
                    selectionMode ? toggleSelectAll : toggleSelectionMode
                  }
                  data-testid={
                    selectionMode
                      ? 'chat-detail-session-select-all'
                      : 'chat-detail-session-selection-enable'
                  }
                >
                  {selectionMode ? <LucideListChecks /> : <LucideCopyX />}
                </Button>
              )}
            </div>

            <div className="pb-3" role="search">
              <SearchInput
                onChange={handleInputChange}
                value={searchString}
                data-testid="chat-detail-session-search"
              ></SearchInput>
            </div>

            <div className="flex-1 overflow-auto">
              {selectionMode ? (
                <ul className="space-y-2" role="listbox" aria-multiselectable>
                  {conversationList.map((x) => (
                    <li
                      key={x.id}
                      className="py-2"
                      role="option"
                      aria-selected={selectedIds.has(x.id)}
                      data-session-id={x.id}
                    >
                      <label className="flex items-center gap-2">
                        <Checkbox
                          checked={selectedIds.has(x.id)}
                          onCheckedChange={() => toggleSelection(x.id)}
                          data-testid="chat-detail-session-checkbox"
                          data-session-id={x.id}
                        />

                        <span className="truncate">{x.name}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              ) : (
                <nav aria-label={t('chat.conversations')}>
                  <ul className="space-y-2">
                    {conversationList.map((x) => (
                      <li
                        key={x.id}
                        className="
                            group pr-3 flex items-center gap-1 rounded-lg
                            aria-selected:bg-bg-card has-[>button:focus-visible]:bg-bg-card
                          "
                        aria-selected={conversationId === x.id}
                      >
                        <button
                          type="button"
                          className="focus-visible:outline-none px-3 py-2 text-left flex-1 truncate"
                          onClick={() =>
                            handleConversationCardClick(x.id, x.is_new)
                          }
                          data-testid="chat-detail-session-item"
                          data-session-id={x.id}
                        >
                          {x.name}
                        </button>

                        <ConversationDropdown
                          conversation={x}
                          removeTemporaryConversation={
                            removeTemporaryConversation
                          }
                        >
                          <MoreButton
                            data-testid="chat-detail-session-actions"
                            data-session-id={x.id}
                          ></MoreButton>
                        </ConversationDropdown>
                      </li>
                    ))}
                  </ul>
                </nav>
              )}
            </div>
          </div>

          {/* Share zone panel */}
          <div
            className={cn(
              'w-1/2 h-full overflow-auto pl-0.5 transition-opacity duration-300',
              activeTab === 'shared' ? 'opacity-100' : 'opacity-0',
            )}
            aria-hidden={activeTab !== 'shared'}
          >
            <SharedZone
              onForked={(sessionId) =>
                handleConversationCardClick(sessionId, false)
              }
            />
          </div>
        </div>
      </div>
    </aside>
  );
}
