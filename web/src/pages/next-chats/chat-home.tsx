import { Button } from '@/components/ui/button';
import { useGetOrCreateDefaultChat } from '@/hooks/use-chat-request';
import { Routes } from '@/routes';
import { Loader2 } from 'lucide-react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

/**
 * Chat landing: instead of the chat-app list, drop the user straight into their
 * personal default chat conversation. The default chat is silently
 * got-or-created on the backend, so there is no visible creation step.
 */
export default function ChatHome() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data, isError, refetch } = useGetOrCreateDefaultChat();

  useEffect(() => {
    if (data?.id) {
      navigate(`${Routes.Chat}/${data.id}?isNew=true`, { replace: true });
    }
  }, [data, navigate]);

  if (isError) {
    return (
      <div className="size-full flex flex-col items-center justify-center gap-3">
        <p className="text-text-secondary">{t('chat.enterFailed')}</p>
        <Button variant="outline" onClick={() => refetch()}>
          {t('chat.retry')}
        </Button>
      </div>
    );
  }

  return (
    <div className="size-full flex flex-col items-center justify-center gap-3 text-text-secondary">
      <Loader2 className="size-7 animate-spin text-accent-primary" />
      <span className="text-sm">{t('chat.entering')}</span>
    </div>
  );
}
