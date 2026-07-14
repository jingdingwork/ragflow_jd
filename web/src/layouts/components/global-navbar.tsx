import { useId, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router';

import { LucideHouse } from 'lucide-react';

import { useFetchUserInfo } from '@/hooks/use-user-setting-request';
import { cn } from '@/lib/utils';
import { Routes } from '@/routes';
import { supportsCssAnchor } from '@/utils/css-support';

const PathMap = {
  [Routes.Datasets]: [Routes.Datasets, Routes.DatasetBase],
  [Routes.Chats]: [Routes.Chats, Routes.Chat],
  [Routes.Searches]: [Routes.Searches, Routes.Search],
  // Memory lives inside the Agent item's hover submenu, so memory pages keep the
  // Agent nav entry highlighted as their parent.
  [Routes.Agents]: [
    Routes.Agents,
    Routes.AgentTemplates,
    Routes.Memories,
    Routes.Memory,
    Routes.MemoryMessage,
  ],
  [Routes.Files]: [Routes.Files],
  [Routes.Apps]: [Routes.Apps, Routes.AppView],
} as const;

const menuItems = [
  { path: Routes.Root, name: 'header.Root', icon: LucideHouse },
  {
    path: Routes.Chats,
    name: 'header.chat',
    /* icon: MessageSquareText, */ 'data-testid': 'nav-chat',
  },
  { path: Routes.Datasets, name: 'header.dataset' /* icon: Library, */ },
  // Search is no longer a top-level nav item; it now lives as a search bar
  // inside the Dataset page (see web/src/pages/datasets/dataset-search.tsx).
  {
    path: Routes.Agents,
    name: 'header.flow',
    /* icon: Cpu, */ 'data-testid': 'nav-agent',
    // Hover submenu under the Agent item. Clicking the Agent item itself still
    // navigates to the agent page; hovering reveals the memory entry.
    submenu: [{ path: Routes.Memories, name: 'header.memories' }],
  },
  // File manager is hidden for normal users; only superusers (admins) see it.
  {
    path: Routes.Files,
    name: 'header.fileManager',
    /* icon: File, */ adminOnly: true,
  },
  { path: Routes.Apps, name: 'header.apps' /* icon: LayoutGrid, */ },
];

// Filter out admin-only entries (e.g. File manager) for non-superusers.
function useVisibleMenuItems() {
  const {
    data: { is_superuser },
  } = useFetchUserInfo();

  return useMemo(
    () =>
      menuItems
        .filter((item) => !('adminOnly' in item) || is_superuser)
        // Strip the flag so it is never spread onto the DOM <Link>.
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        .map(({ adminOnly, ...item }: any) => item),
    [is_superuser],
  );
}

// Hover-revealed submenu rendered under a nav item (e.g. memory under agent).
// The `pt-2.5` creates an invisible bridge so the pointer can travel from the
// trigger to the panel without losing the `group-hover` state. Styling follows
// the CTCI brand: orange accent on hover/active, soft card surface.
function NavSubmenu({
  items,
  t,
}: {
  items: { path: string; name: string }[];
  t: (key: string) => string;
}) {
  const { pathname } = useLocation();

  return (
    <div className="invisible absolute left-1/2 top-full z-20 -translate-x-1/2 translate-y-1 pt-2.5 opacity-0 transition-all duration-200 ease-out group-hover:visible group-hover:translate-y-0 group-hover:opacity-100">
      <ul className="min-w-[160px] rounded-2xl border border-border-button bg-bg-card p-1.5 shadow-xl shadow-black/10 ring-1 ring-black/5">
        {items.map((sub) => {
          const isActive = pathname.includes(sub.path);
          return (
            <li key={sub.path}>
              <Link
                to={sub.path}
                className={cn(
                  'block whitespace-nowrap rounded-xl px-5 py-2.5 text-center text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-accent-primary/10 text-accent-primary'
                    : 'text-text-secondary hover:bg-accent-primary/10 hover:text-accent-primary',
                )}
                aria-current={isActive ? 'page' : undefined}
              >
                {t(sub.name)}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const GlobalNavbar = supportsCssAnchor
  ? () => {
      const { t } = useTranslation();
      const { pathname } = useLocation();
      const navbarAnchorNamePrefix = useId().replace(/:/g, '');
      const visibleMenuItems = useVisibleMenuItems();

      const activePath = useMemo(() => {
        return (
          Object.keys(PathMap).find((x: string) =>
            PathMap[x as keyof typeof PathMap].some((y: string) =>
              pathname.includes(y),
            ),
          ) || pathname
        );
      }, [pathname]);

      const activePathAnchorName = `--${navbarAnchorNamePrefix}${activePath === Routes.Root ? '-root' : activePath.replace('/', '-')}`;

      const hasAnyActive = useMemo(
        () => visibleMenuItems.some(({ path }) => path === activePath),
        [visibleMenuItems, activePath],
      );

      return (
        <nav data-tour="global-nav">
          <ul className="relative flex items-center p-1 bg-bg-card rounded-full border border-border-button">
            {visibleMenuItems.map(
              ({ path, name, icon: Icon, submenu, ...props }) => {
                const isActive = path === activePath;
                const anchorName = `--${navbarAnchorNamePrefix}${path === Routes.Root ? '-root' : path.replace('/', '-')}`;

                return (
                  <li
                    key={path}
                    className="relative group"
                    style={{ anchorName }}
                  >
                    <Link
                      {...props}
                      to={path}
                      className={cn(
                        'h-10 px-6 text-base inline-flex items-center justify-center',
                        'hover:text-current focus-visible:text-current rounded-full transition-all',
                        isActive && '!text-bg-base',
                      )}
                      aria-current={isActive ? 'page' : undefined}
                    >
                      {Icon && <Icon className="size-6 stroke-[1.5]" />}
                      <span className={cn(Icon && 'sr-only')}>{t(name)}</span>
                    </Link>
                    {submenu && <NavSubmenu items={submenu} t={t} />}
                  </li>
                );
              },
            )}

            <li
              className={cn(
                'absolute -z-[1] bg-text-primary border-b-2 border-b-accent-primary rounded-full opacity-0',
                'transition-all',
                hasAnyActive && 'opacity-100',
              )}
              role="presentation"
              style={{
                top: 'anchor(top)',
                left: 'anchor(left)',
                width: 'anchor-size(width)',
                height: 'anchor-size(height)',
                positionAnchor: activePathAnchorName,
              }}
            />
          </ul>
        </nav>
      );
    }
  : () => {
      const { t } = useTranslation();
      const { pathname } = useLocation();
      const visibleMenuItems = useVisibleMenuItems();

      const activePath = useMemo(() => {
        return (
          Object.keys(PathMap).find((x: string) =>
            PathMap[x as keyof typeof PathMap].some((y: string) =>
              pathname.includes(y),
            ),
          ) || pathname
        );
      }, [pathname]);

      return (
        <nav data-tour="global-nav">
          <ul className="flex items-center p-1 bg-bg-card rounded-full border border-border-button">
            {visibleMenuItems.map(
              ({ path, name, icon: Icon, submenu, ...props }) => {
                const isActive = path === activePath;

                return (
                  <li key={path} className="relative group">
                    <Link
                      {...props}
                      to={path}
                      className={cn(
                        'h-10 px-6 text-base inline-flex items-center justify-center',
                        'hover:text-current focus-visible:text-current rounded-full transition-all',
                        isActive &&
                          '!text-bg-base bg-text-primary border-b-2 border-b-accent-primary',
                      )}
                      aria-label={t(name)}
                      aria-current={isActive ? 'page' : undefined}
                    >
                      {Icon ? (
                        <Icon className="size-6 stroke-[1.5]" />
                      ) : (
                        <span>{t(name)}</span>
                      )}
                    </Link>
                    {submenu && <NavSubmenu items={submenu} t={t} />}
                  </li>
                );
              },
            )}
          </ul>
        </nav>
      );
    };

export default GlobalNavbar;
