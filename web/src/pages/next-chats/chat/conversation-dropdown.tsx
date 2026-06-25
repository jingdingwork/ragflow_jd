import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MessageType } from '@/constants/chat';
import {
  useFetchSessionManually,
  useGetChatSearchParams,
  useRemoveSessions,
} from '@/hooks/use-chat-request';
import { IConversation, Message } from '@/interfaces/database/chat';
import { Share2, Trash2 } from 'lucide-react';
import {
  MouseEventHandler,
  PropsWithChildren,
  useCallback,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { useChatUrlParams } from '../hooks/use-chat-url';
import { ShareSessionDialog } from './share-session-dialog';

export function ConversationDropdown({
  children,
  conversation,
  removeTemporaryConversation,
}: PropsWithChildren & {
  conversation: IConversation & { is_new?: boolean };
  removeTemporaryConversation?: (conversationId: string) => void;
}) {
  const { t } = useTranslation();
  const { id: chatId } = useParams();
  const { setConversationBoth } = useChatUrlParams();
  const { removeSessions } = useRemoveSessions();
  const { fetchSessionManually } = useFetchSessionManually();
  const { conversationId, isNew } = useGetChatSearchParams();

  const [shareOpen, setShareOpen] = useState(false);
  const [shareMessages, setShareMessages] = useState<Message[]>([]);

  // The share action is available only once the conversation actually has a
  // chat record, i.e. at least one user message. A brand-new session that only
  // carries the assistant prologue (and nothing has been asked yet) is not
  // shareable. This is a per-conversation check and must not depend on the
  // currently-active session's `isNew` URL flag.
  const hasChatRecords = (conversation.messages ?? []).some(
    (m) => m.role === MessageType.User,
  );

  const handleOpenShare = useCallback(async () => {
    const conv = await fetchSessionManually(conversation.id);
    setShareMessages(conv?.messages ?? []);
    setShareOpen(true);
  }, [conversation.id, fetchSessionManually]);

  const handleDelete: MouseEventHandler<HTMLDivElement> =
    useCallback(async () => {
      if (isNew === 'true' && removeTemporaryConversation) {
        removeTemporaryConversation(conversation.id);
        if (conversationId === conversation.id) {
          setConversationBoth('', '');
        }
      } else {
        const code = await removeSessions([conversation.id]);
        if (code === 0) {
          setConversationBoth('', '');
        }
      }
    }, [
      conversation.id,
      conversationId,
      isNew,
      removeSessions,
      removeTemporaryConversation,
      setConversationBoth,
    ]);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
        <DropdownMenuContent>
          {hasChatRecords && (
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                handleOpenShare();
              }}
              data-testid="chat-detail-session-share"
              data-session-id={conversation.id}
            >
              {t('chat.share')} <Share2 />
            </DropdownMenuItem>
          )}

          <ConfirmDeleteDialog onOk={handleDelete}>
            <DropdownMenuItem
              className="text-state-error"
              onSelect={(e) => {
                e.preventDefault();
              }}
              onClick={(e) => {
                e.stopPropagation();
              }}
              data-testid="chat-detail-session-delete"
              data-session-id={conversation.id}
            >
              {t('common.delete')} <Trash2 />
            </DropdownMenuItem>
          </ConfirmDeleteDialog>
        </DropdownMenuContent>
      </DropdownMenu>

      {chatId && (
        <ShareSessionDialog
          open={shareOpen}
          onOpenChange={setShareOpen}
          chatId={chatId}
          sessionId={conversation.id}
          sessionName={conversation.name}
          messages={shareMessages}
        />
      )}
    </>
  );
}
