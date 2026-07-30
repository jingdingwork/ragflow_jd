import { driver, type Driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import { useCallback, useEffect } from 'react';
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

// A single, app-wide driver instance. The help button lives in the global
// header (never unmounts), but React StrictMode double-invokes effects and
// route changes re-trigger auto-start, while `startTour` awaits the anchor
// (`waitForSelector`) before creating the driver. A per-hook ref could then
// end up not referencing an instance created by a stale closure, leaking a
// second live driver whose popover lingers on screen — the "old step doesn't
// disappear on Next" bug. Keeping exactly one module-level instance and tearing
// it (plus any orphaned DOM) down before every start guarantees a single tour.
let activeDriver: Driver | null = null;

function destroyActiveTour() {
  try {
    activeDriver?.destroy();
  } catch {
    /* already gone */
  }
  activeDriver = null;

  // Sweep away nodes/classes any already-unreferenced instance may have left.
  document
    .querySelectorAll('.driver-popover, .driver-overlay, #driver-dummy-element')
    .forEach((el) => el.remove());
  document
    .querySelectorAll(
      '.driver-active-element, .driver-active-element-parent, .driver-active-element-parent-no-scroll',
    )
    .forEach((el) =>
      el.classList.remove(
        'driver-active-element',
        'driver-active-element-parent',
        'driver-active-element-parent-no-scroll',
      ),
    );
  [document.documentElement, document.body].forEach((el) =>
    el?.classList.remove('driver-active', 'driver-fade', 'driver-no-scroll'),
  );
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

  // Tear down any live tour when the hook unmounts (e.g. route change).
  useEffect(() => {
    return () => {
      destroyActiveTour();
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

      // Always start from a clean slate — destroys the previous instance and
      // clears any orphaned overlay/popover left by a stale closure.
      destroyActiveTour();

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
          if (activeDriver === d) activeDriver = null;
        },
      });

      activeDriver = d;
      d.drive();
    },
    [t],
  );

  return { startTour };
}
