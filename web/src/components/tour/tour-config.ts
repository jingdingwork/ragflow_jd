// Per-page product tour definitions. Each tour is a list of steps; a step with
// a `selector` highlights that element, a step without one is shown centered
// (used for the intro card). Text is stored as i18n keys and resolved at run
// time. Steps whose anchor is missing at start are filtered out gracefully, so
// tours stay robust when a page's content is empty or still loading.

export type TourId = 'home' | 'chat' | 'agents' | 'apps';

export interface TourStepDef {
  /** CSS selector of the anchor element; omit for a centered step. */
  selector?: string;
  titleKey: string;
  descKey: string;
}

export const TOURS: Record<TourId, TourStepDef[]> = {
  home: [
    { titleKey: 'tour.home.welcomeTitle', descKey: 'tour.home.welcomeDesc' },
    {
      selector: '[data-tour="global-nav"]',
      titleKey: 'tour.home.navTitle',
      descKey: 'tour.home.navDesc',
    },
    {
      selector: '[data-tour="home-datasets"]',
      titleKey: 'tour.home.datasetsTitle',
      descKey: 'tour.home.datasetsDesc',
    },
    {
      selector: '[data-tour="home-apps"]',
      titleKey: 'tour.home.appsTitle',
      descKey: 'tour.home.appsDesc',
    },
    {
      selector: '[data-tour="tour-help"]',
      titleKey: 'tour.home.helpTitle',
      descKey: 'tour.home.helpDesc',
    },
  ],
  chat: [
    { titleKey: 'tour.chat.welcomeTitle', descKey: 'tour.chat.welcomeDesc' },
    {
      selector: '[data-testid="chat-detail-sessions"]',
      titleKey: 'tour.chat.sessionsTitle',
      descKey: 'tour.chat.sessionsDesc',
    },
    {
      selector: '[data-tour="chat-controls"]',
      titleKey: 'tour.chat.controlsTitle',
      descKey: 'tour.chat.controlsDesc',
    },
    {
      selector: '[data-tour="chat-input"]',
      titleKey: 'tour.chat.inputTitle',
      descKey: 'tour.chat.inputDesc',
    },
    {
      selector: '[data-tour="tour-help"]',
      titleKey: 'tour.chat.helpTitle',
      descKey: 'tour.chat.helpDesc',
    },
  ],
  agents: [
    {
      titleKey: 'tour.agents.welcomeTitle',
      descKey: 'tour.agents.welcomeDesc',
    },
    {
      selector: '[data-testid="create-agent"]',
      titleKey: 'tour.agents.createTitle',
      descKey: 'tour.agents.createDesc',
    },
    {
      selector: '[data-testid="agents-list"]',
      titleKey: 'tour.agents.manageTitle',
      descKey: 'tour.agents.manageDesc',
    },
    {
      selector: '[data-tour="tour-help"]',
      titleKey: 'tour.agents.helpTitle',
      descKey: 'tour.agents.helpDesc',
    },
  ],
  apps: [
    { titleKey: 'tour.apps.welcomeTitle', descKey: 'tour.apps.welcomeDesc' },
    {
      selector: '[data-tour="apps-list"]',
      titleKey: 'tour.apps.listTitle',
      descKey: 'tour.apps.listDesc',
    },
    {
      selector: '[data-tour="tour-help"]',
      titleKey: 'tour.apps.helpTitle',
      descKey: 'tour.apps.helpDesc',
    },
  ],
};

/** Resolve which tour applies to a route, or null if the page has none. */
export function tourIdForPath(pathname: string): TourId | null {
  if (pathname === '/') return 'home';
  // Chat landing (`/chats`) redirects into `/chat/:id`; both share the tour.
  if (pathname.startsWith('/chat')) return 'chat';
  // Agent list is `/agents`; the canvas editor is `/agent/:id` (singular) and
  // deliberately has no tour.
  if (pathname.startsWith('/agents')) return 'agents';
  if (pathname === '/apps') return 'apps';
  return null;
}
