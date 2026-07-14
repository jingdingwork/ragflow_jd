import { useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { useMutation } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import message from '@/components/ui/message';
import { cn } from '@/lib/utils';
import api from '@/utils/api';
import request from '@/utils/request';

type WebSearchTestResult = {
  llm_id: string;
  supported: boolean;
  answer: string;
};

/**
 * Probes whether the chat's currently selected model can actually perform web search.
 * Forces enable_search on and asks a live-info question; the operator reads the raw
 * answer to decide whether the model really supports web search.
 */
export function WebSearchTestButton() {
  const { t } = useTranslation();
  const form = useFormContext();
  const [result, setResult] = useState<WebSearchTestResult | null>(null);

  const { mutate, isPending } = useMutation({
    mutationKey: ['chat/web-search-test'],
    mutationFn: async () => {
      const llmId = form.getValues('llm_id');
      if (!llmId) {
        message.warning(t('chat.webSearchTestNoModel'));
        return null;
      }
      const res = await request.post(api.webSearchTest, { llm_id: llmId });
      return (res?.data?.data ?? null) as WebSearchTestResult | null;
    },
    onSuccess: (data) => {
      if (data) {
        setResult(data);
      }
    },
    retry: false,
  });

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="outline"
          disabled={isPending}
          onClick={() => mutate()}
        >
          {isPending ? t('chat.webSearchTesting') : t('chat.webSearchTest')}
        </Button>
        {result && (
          <span
            className={cn(
              'text-sm font-medium',
              result.supported ? 'text-green-600' : 'text-red-500',
            )}
          >
            {result.supported
              ? t('chat.webSearchSupported')
              : t('chat.webSearchUnsupported')}
          </span>
        )}
      </div>
      {result && (
        <div className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-md border border-border-default bg-bg-card p-3 text-sm text-text-secondary">
          {result.answer}
        </div>
      )}
    </div>
  );
}

export default WebSearchTestButton;
