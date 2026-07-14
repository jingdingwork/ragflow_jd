import { LucideCircleHelp } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router';

import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

import { tourIdForPath } from './tour-config';
import { hasSeenTour, usePageTour } from './use-page-tour';

/**
 * Header entry point for the per-page product tour. On a user's first visit to a
 * page that has a tour it opens automatically (once, tracked in localStorage);
 * afterwards the button re-triggers the current page's tour on demand. Pages
 * without a tour render nothing.
 */
export function TourHelpButton() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const { startTour } = usePageTour();
  const tourId = tourIdForPath(pathname);
  // Guards a single auto-open per tour within this mount (belt-and-suspenders
  // against StrictMode double-invoke; localStorage handles across sessions).
  const autoStartedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!tourId) return;
    if (autoStartedRef.current.has(tourId)) return;
    if (hasSeenTour(tourId)) return;
    autoStartedRef.current.add(tourId);
    startTour(tourId, { auto: true });
  }, [tourId, startTour]);

  if (!tourId) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          data-tour="tour-help"
          aria-label={t('tour.helpButton')}
          onClick={() => startTour(tourId)}
        >
          <LucideCircleHelp />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{t('tour.helpButton')}</TooltipContent>
    </Tooltip>
  );
}

export default TourHelpButton;
