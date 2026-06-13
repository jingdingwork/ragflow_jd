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
  [Routes.Agents]: [Routes.Agents, Routes.AgentTemplates],
  [Routes.Memories]: [Routes.Memories, Routes.Memory, Routes.MemoryMessage],
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
  },
  { path: Routes.Memories, name: 'header.memories' /* icon: Cpu, */ },
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
        <nav>
          <ul className="relative flex items-center p-1 bg-bg-card rounded-full border border-border-button">
            {visibleMenuItems.map(({ path, name, icon: Icon, ...props }) => {
              const isActive = path === activePath;
              const anchorName = `--${navbarAnchorNamePrefix}${path === Routes.Root ? '-root' : path.replace('/', '-')}`;

              return (
                <li key={path} className="relative" style={{ anchorName }}>
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
                </li>
              );
            })}

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
        <nav>
          <ul className="flex items-center p-1 bg-bg-card rounded-full border border-border-button">
            {visibleMenuItems.map(({ path, name, icon: Icon, ...props }) => {
              const isActive = path === activePath;

              return (
                <li key={path}>
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
                </li>
              );
            })}
          </ul>
        </nav>
      );
    };

export default GlobalNavbar;
