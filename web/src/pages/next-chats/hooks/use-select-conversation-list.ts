import { MessageType } from '@/constants/chat';
import { useTranslate } from '@/hooks/common-hooks';
import {
  useFetchChatList,
  useFetchSessionList,
  useGetChatSearchParams,
} from '@/hooks/use-chat-request';
import { IConversation } from '@/interfaces/database/chat';
import { generateConversationId } from '@/utils/chat';
import { useCallback, useMemo, useState } from 'react';
import { useParams } from 'react-router';
import { useChatUrlParams } from './use-chat-url';

export const useFindPrologueFromDialogList = () => {
  const { id: dialogId } = useParams();
  const { data } = useFetchChatList();

  const prologue = useMemo(() => {
    return data.chats.find((x) => x.id === dialogId)?.prompt_config?.prologue;
  }, [dialogId, data]);

  return prologue;
};

export const useSelectDerivedConversationList = () => {
  const { t } = useTranslate('chat');

  const [temporaryConversation, setTemporaryConversation] =
    useState<IConversation | null>(null);
  const {
    data: conversationList,
    loading,
    handleInputChange,
    searchString,
  } = useFetchSessionList();

  const { id: dialogId } = useParams();
  const { conversationId } = useGetChatSearchParams();
  const prologue = useFindPrologueFromDialogList();
  const { setConversationBoth } = useChatUrlParams();

  const addTemporaryConversation = useCallback(() => {
    if (!dialogId) return;
    const id = generateConversationId();
    setTemporaryConversation({
      id,
      name: t('newConversation'),
      chat_id: dialogId,
      is_new: true,
      messages: [
        {
          content: prologue,
          role: MessageType.Assistant,
        },
      ],
    } as any);
    setConversationBoth(id, 'true');
  }, [dialogId, setConversationBoth, t, prologue]);

  const removeTemporaryConversation = useCallback((id?: string) => {
    setTemporaryConversation((prev) =>
      prev && (!id || prev.id === id) ? null : prev,
    );
  }, []);

  // An unsent "new conversation" only belongs in the sidebar while it is the
  // active conversation. As soon as the user switches to another conversation
  // — or a real session is created after sending the first message, which
  // moves the active id off the temporary one — it is dropped, so an empty new
  // conversation never lingers in the list. Once the server list already
  // contains it (shouldn't normally happen), don't duplicate it.
  const list = useMemo(() => {
    if (
      temporaryConversation &&
      temporaryConversation.id === conversationId &&
      !conversationList.some((c) => c.id === temporaryConversation.id)
    ) {
      return [temporaryConversation, ...conversationList];
    }
    return conversationList;
  }, [temporaryConversation, conversationId, conversationList]);

  return {
    list,
    addTemporaryConversation,
    removeTemporaryConversation,
    loading,
    handleInputChange,
    searchString,
  };
};
