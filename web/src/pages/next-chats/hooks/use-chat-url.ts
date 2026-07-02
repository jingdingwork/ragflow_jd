import { ChatSearchParams } from '@/constants/chat';
import { useGetChatSearchParams } from '@/hooks/use-chat-request';
import { IConversation, IMessage } from '@/interfaces/database/chat';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { useSetConversation } from './use-set-conversation';

/**
 * Consolidated hook for managing chat URL parameters (conversationId and isNew)
 * Replaces: useClickConversationCard from use-chat-request.ts and useSetChatRouteParams from use-set-chat-route.ts
 */
export const useChatUrlParams = () => {
  const [currentQueryParameters, setSearchParams] = useSearchParams();
  const newQueryParameters: URLSearchParams = useMemo(
    () => new URLSearchParams(currentQueryParameters.toString()),
    [currentQueryParameters],
  );

  const setConversationId = useCallback(
    (conversationId: string) => {
      newQueryParameters.set(ChatSearchParams.ConversationId, conversationId);
      setSearchParams(newQueryParameters);
    },
    [setSearchParams, newQueryParameters],
  );

  const setIsNew = useCallback(
    (isNew: string) => {
      newQueryParameters.set(ChatSearchParams.isNew, isNew);
      setSearchParams(newQueryParameters);
    },
    [setSearchParams, newQueryParameters],
  );

  const getIsNew = useCallback(() => {
    return newQueryParameters.get(ChatSearchParams.isNew);
  }, [newQueryParameters]);

  const setConversationBoth = useCallback(
    (conversationId: string, isNew: string) => {
      newQueryParameters.set(ChatSearchParams.ConversationId, conversationId);
      newQueryParameters.set(ChatSearchParams.isNew, isNew);
      setSearchParams(newQueryParameters);
    },
    [setSearchParams, newQueryParameters],
  );

  return {
    setConversationId,
    setIsNew,
    getIsNew,
    setConversationBoth,
  };
};

export function useCreateConversationBeforeSendMessage() {
  const { conversationId, isNew } = useGetChatSearchParams();
  const { setConversation } = useSetConversation();
  const { setConversationBoth } = useChatUrlParams();
  const { id: dialogId } = useParams();
  const queryClient = useQueryClient();
  // Backend session ids we created locally this session, so a follow-up message
  // reuses the fresh session even before the sidebar list has refetched.
  const createdIdsRef = useRef<Set<string>>(new Set());

  // Create conversation if it doesn't exist
  const createConversationBeforeSendMessage = useCallback(
    async (value: string) => {
      let currentMessages: Array<IMessage> = [];

      // Decide create-vs-reuse from whether the current conversation is an
      // actual persisted backend session — NOT from the `isNew` URL flag alone.
      // That flag can be transiently cleared by unrelated re-renders (e.g.
      // patching the dialog when selecting a knowledge base right after
      // entering), which would otherwise make us POST the completion with a
      // client-only temporary id; the backend then returns "Session not found!"
      // and nothing streams back. Read the raw (unfiltered) session cache so an
      // active sidebar search filter can't hide a genuinely persisted session.
      // Query key literal must match useFetchSessionList's
      // `[ChatApiAction.FetchSessionList, id]` (the const enum inlines to
      // 'fetchSessionList'); avoid importing the const enum across modules,
      // which esbuild/Vite cannot resolve at runtime under isolatedModules.
      const persistedSessions = queryClient.getQueryData<IConversation[]>([
        'fetchSessionList',
        dialogId,
      ]);
      const sessionListLoaded = Array.isArray(persistedSessions);
      const isPersistedSession =
        conversationId !== '' &&
        (createdIdsRef.current.has(conversationId) ||
          !!persistedSessions?.some((s) => s.id === conversationId));

      const needCreate =
        conversationId === '' ||
        isNew === 'true' ||
        (sessionListLoaded && !isPersistedSession);

      if (needCreate) {
        const data = await setConversation(value);
        if (!data || data.code !== 0) {
          return;
        }
        const backendConvId = data.data.id;
        createdIdsRef.current.add(backendConvId);
        setConversationBoth(backendConvId, '');
        currentMessages = data.data.messages;
        return {
          targetConversationId: backendConvId,
          currentMessages,
        };
      }

      return {
        targetConversationId: conversationId,
        currentMessages,
      };
    },
    [
      conversationId,
      isNew,
      dialogId,
      queryClient,
      setConversation,
      setConversationBoth,
    ],
  );

  return {
    createConversationBeforeSendMessage,
  };
}

export type CreateConversationBeforeSendMessageType = ReturnType<
  typeof useCreateConversationBeforeSendMessage
>['createConversationBeforeSendMessage'];

export type CreateConversationBeforeSendMessageReturnType = Awaited<
  ReturnType<CreateConversationBeforeSendMessageType>
>;
