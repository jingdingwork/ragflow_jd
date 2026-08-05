import { LucideMessageSquarePlus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

import { FeedbackDialog } from './feedback-dialog';

/**
 * Always-on header entry point for the feedback dialog (unlike the tour button,
 * which hides on pages without a tour). Sits next to the usage-guide icon.
 */
export function FeedbackButton() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('feedback.title')}
            onClick={() => setOpen(true)}
          >
            <LucideMessageSquarePlus />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t('feedback.title')}</TooltipContent>
      </Tooltip>

      <FeedbackDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

export default FeedbackButton;
