import { driver, type Driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { TOURS, TourId } from './tour-config';
import './tour.css';

const SEEN_PREFIX = 'ctci-tour-seen:';

const seenKey = (id: TourId) => `${SEEN_PREFIX}${id}`;

export function hasSeenTour(id: TourId): boolean {
  try {
    return localStorage.getItem(seenKey(id)) === '1';
  } catch {
    return false;
  }
}

function markSeen(id: TourId) {
  try {
    localStorage.setItem(seenKey(id), '1');
  } catch {
    /* ignore private-mode / quota errors */
  }
}

/** Resolve when `selector` appears in the DOM, or after `timeoutMs`. */
function waitForSelector(
  selector: string,
  timeoutMs: number,
  interval = 150,
): Promise<boolean> {
  return new Promise((resolve) => {
    const start = Date.now();
    const tick = () => {
      if (document.querySelector(selector)) return resolve(true);
      if (Date.now() - start >= timeoutMs) return resolve(false);
      window.setTimeout(tick, interval);
    };
    tick();
  });
}

export function usePageTour() {
  const { t } = useTranslation();
  const driverRef = useRef<Driver | null>(null);

  // Tear down any live tour when the hook unmounts (e.g. route change).
  useEffect(() => {
    return () => {
      driverRef.current?.destroy();
      driverRef.current = null;
    };
  }, []);

  const startTour = useCallback(
    async (id: TourId, opts?: { auto?: boolean }) => {
      const defs = TOURS[id];
      if (!defs?.length) return;

      // Page data may still be loading on first visit, so wait for the first
      // anchored step to render before deciding which steps are available.
      const firstWithSelector = defs.find((s) => s.selector);
      if (firstWithSelector?.selector) {
        await waitForSelector(
          firstWithSelector.selector,
          opts?.auto ? 4000 : 1500,
        );
      }

      // Keep centered steps and anchored steps whose element currently exists.
      const steps = defs
        .filter((s) => !s.selector || document.querySelector(s.selector))
        .map((s) => ({
          element: s.selector,
          popover: { title: t(s.titleKey), description: t(s.descKey) },
        }));

      if (steps.length === 0) return;

      driverRef.current?.destroy();

      const d = driver({
        showProgress: true,
        allowClose: true,
        overlayColor: 'rgba(10, 10, 12, 0.62)',
        stagePadding: 6,
        stageRadius: 10,
        popoverClass: 'ctci-tour',
        nextBtnText: t('tour.next'),
        prevBtnText: t('tour.prev'),
        doneBtnText: t('tour.done'),
        progressText: '{{current}} / {{total}}',
        steps,
        onDestroyed: () => {
          markSeen(id);
        },
      });

      driverRef.current = d;
      d.drive();
    },
    [t],
  );

  return { startTour };
}
