import { HomeCard } from '@/components/home-card';
import { ChatSearchParams } from '@/constants/chat';
import { useFetchAllConversations } from '@/hooks/use-chat-request';
import { Routes } from '@/routes';
import { useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router';

export function ChatList({
  setListLength,
  setLoading,
}: {
  setListLength: (length: number) => void;
  setLoading?: (loading: boolean) => void;
}) {
  const { data, loading } = useFetchAllConversations();
  const navigate = useNavigate();

  const openConversation = useCallback(
    (chatId: string, conversationId: string) => () => {
      navigate(
        `${Routes.Chat}/${chatId}?${ChatSearchParams.ConversationId}=${conversationId}`,
      );
    },
    [navigate],
  );

  useEffect(() => {
    setListLength(data?.length || 0);
    setLoading?.(loading || false);
  }, [data, setListLength, loading, setLoading]);

  return (
    <>
      {data.slice(0, 10).map((x) => (
        <HomeCard
          key={x.id}
          data={{
            name: x.name,
            avatar: x.avatar,
            description: x.chat_name,
            update_time: x.update_time,
          }}
          onClick={openConversation(x.chat_id, x.id)}
          moreDropdown={null}
        ></HomeCard>
      ))}
    </>
  );
}
