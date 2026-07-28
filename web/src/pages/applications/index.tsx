import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

import { useQuery } from '@tanstack/react-query';

import {
  LucideAppWindow,
  LucideArrowRight,
  LucideBuilding2,
  LucideChevronRight,
  LucideDownload,
  LucideExternalLink,
  LucideInbox,
  LucideLock,
  LucidePackage,
  LucideSearch,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import message from '@/components/ui/message';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Segmented } from '@/components/ui/segmented';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { Routes } from '@/routes';

import {
  ApplicationCatalog,
  CatalogApplication,
  CatalogDepartment,
  downloadApplicationPackage,
  getApplicationCatalog,
} from '@/services/application-service';

/** Virtual node id for company-wide applications (``visibility === 'all'``). */
const COMPANY = '__company__';

type TypeFilter = 'all' | 'web' | 'exe';

/**
 * Icon-tile gradients. Each application keeps a stable colour derived from its
 * id, so a wall of applications reads as a palette instead of a grey grid while
 * the brand orange stays reserved for actions and selection.
 */
const TILE_THEMES = [
  'from-[#F39800] to-[#FFC373]',
  'from-[#3B82F6] to-[#7DB6FF]',
  'from-[#8B5CF6] to-[#B79CFF]',
  'from-[#0EA97A] to-[#4FD1A5]',
  'from-[#F43F5E] to-[#FF8FA3]',
  'from-[#0891B2] to-[#38D6EB]',
];

function themeOf(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return TILE_THEMES[hash % TILE_THEMES.length];
}

type DeptNode = CatalogDepartment & { depth: number; hasChildren: boolean };

/**
 * Flatten the department forest into a depth-annotated list, roots first.
 *
 * Top-level departments are always listed so the org structure stays readable;
 * below them only branches that actually carry applications are kept (a node
 * survives if it or any descendant has one), which prunes the long empty tails
 * of the OU tree.
 */
function flattenDepartments(
  departments: CatalogDepartment[],
  collapsed: Set<string>,
): DeptNode[] {
  const byParent = new Map<string, CatalogDepartment[]>();
  const ids = new Set(departments.map((d) => d.id));
  departments.forEach((d) => {
    // Treat a dangling parent as a root so no department is ever hidden.
    const key = d.parent_id && ids.has(d.parent_id) ? d.parent_id : '';
    const list = byParent.get(key) ?? [];
    list.push(d);
    byParent.set(key, list);
  });
  byParent.forEach((list) =>
    list.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN')),
  );

  const hasApps = new Map<string, boolean>();
  const subtreeHasApps = (dept: CatalogDepartment): boolean => {
    const cached = hasApps.get(dept.id);
    if (cached !== undefined) return cached;
    // Guard against a cyclic parent chain in the imported OU data.
    hasApps.set(dept.id, false);
    const value =
      dept.app_ids.length > 0 ||
      (byParent.get(dept.id) ?? []).some(subtreeHasApps);
    hasApps.set(dept.id, value);
    return value;
  };

  const result: DeptNode[] = [];
  const walk = (parentKey: string, depth: number) => {
    const nodes = (byParent.get(parentKey) ?? []).filter(
      (dept) => depth === 0 || subtreeHasApps(dept),
    );
    nodes.forEach((dept) => {
      const children = (byParent.get(dept.id) ?? []).filter(subtreeHasApps);
      result.push({ ...dept, depth, hasChildren: children.length > 0 });
      if (children.length > 0 && !collapsed.has(dept.id)) {
        walk(dept.id, depth + 1);
      }
    });
  };
  walk('', 0);
  return result;
}

function ApplicationsPortal() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string>(COMPANY);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [keyword, setKeyword] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');

  const { data, isLoading } = useQuery({
    queryKey: ['application-catalog'],
    queryFn: async () => {
      const res = await getApplicationCatalog();
      return (res?.data?.data ?? {}) as Partial<ApplicationCatalog>;
    },
  });

  const applications = useMemo(() => data?.applications ?? [], [data]);
  const departments = useMemo(() => data?.departments ?? [], [data]);
  const publicAppIds = useMemo(() => data?.public_app_ids ?? [], [data]);
  const myDepartmentId = data?.my_department_id ?? null;

  const appMap = useMemo(
    () => new Map(applications.map((app) => [app.id, app])),
    [applications],
  );

  const deptNodes = useMemo(
    () => flattenDepartments(departments, collapsed),
    [departments, collapsed],
  );

  const toggleCollapse = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // Land on the user's own department once the catalog arrives — that is the
  // list they care about most. The ref keeps a background refetch from throwing
  // away the user's own selection.
  const defaultedRef = useRef(false);
  useEffect(() => {
    if (defaultedRef.current || !myDepartmentId) return;
    const mine = departments.find((d) => d.id === myDepartmentId);
    if (!mine) return;
    defaultedRef.current = true;
    // A department with no applications of its own is pruned from the tree, so
    // landing on it would highlight nothing — stay on the company node instead.
    if (mine.app_ids.length > 0) {
      setSelected(myDepartmentId);
    }
  }, [myDepartmentId, departments]);

  const pickApps = useCallback(
    (ids: string[]) =>
      ids
        .map((id) => appMap.get(id))
        .filter((app): app is CatalogApplication => Boolean(app)),
    [appMap],
  );

  const companyApps = useMemo(
    () => pickApps(publicAppIds),
    [pickApps, publicAppIds],
  );

  const currentApps = useMemo(() => {
    if (selected === COMPANY) return companyApps;
    const dept = departments.find((d) => d.id === selected);
    return dept ? pickApps(dept.app_ids) : [];
  }, [selected, companyApps, departments, pickApps]);

  const filteredApps = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return currentApps.filter((app) => {
      if (typeFilter !== 'all' && app.app_type !== typeFilter) return false;
      if (!kw) return true;
      return (
        app.name.toLowerCase().includes(kw) ||
        (app.description ?? '').toLowerCase().includes(kw)
      );
    });
  }, [currentApps, keyword, typeFilter]);

  const currentTitle =
    selected === COMPANY
      ? t('applications.companyLevel')
      : (departments.find((d) => d.id === selected)?.name ?? '');

  const handleOpen = async (app: CatalogApplication) => {
    if (!app.accessible) return;
    if (app.app_type === 'web') {
      // Admin decides how a web app opens: 'newtab' launches the URL in a new
      // browser window; 'inline' (default) embeds it in the in-portal viewer.
      if (app.open_mode === 'newtab') {
        if (app.url) window.open(app.url, '_blank', 'noopener');
        return;
      }
      navigate(`${Routes.AppView}/${app.id}`);
      return;
    }
    if (!app.latest_version) {
      message.warning(t('applications.noPackage'));
      return;
    }
    try {
      setDownloadingId(app.id);
      await downloadApplicationPackage(
        app.id,
        app.latest_version.file_name ?? `${app.name}.exe`,
        app.latest_version.id,
      );
    } catch {
      message.error(t('applications.downloadFailed'));
    } finally {
      setDownloadingId(null);
    }
  };

  const renderCard = (app: CatalogApplication) => {
    const TypeIcon = app.app_type === 'exe' ? LucidePackage : LucideAppWindow;
    return (
      <div
        key={app.id}
        className={cn(
          'group relative flex flex-col overflow-hidden rounded-lg border border-border-default bg-bg-card p-3 transition-all duration-200',
          app.accessible
            ? 'hover:-translate-y-0.5 hover:border-accent-primary/60 hover:shadow-lg hover:shadow-black/5'
            : 'bg-bg-card/50',
        )}
      >
        <div className="flex items-start gap-2.5">
          {app.icon ? (
            <img
              src={app.icon}
              alt=""
              className={cn(
                'size-9 shrink-0 rounded-lg object-cover',
                !app.accessible && 'opacity-50 grayscale',
              )}
            />
          ) : (
            <div
              className={cn(
                'flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-white shadow-sm',
                themeOf(app.id),
                !app.accessible && 'opacity-40 grayscale',
              )}
            >
              <TypeIcon className="size-4" />
            </div>
          )}

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span
                className={cn(
                  'truncate text-sm font-semibold',
                  !app.accessible && 'text-text-secondary',
                )}
                title={app.name}
              >
                {app.name}
              </span>
              {!app.accessible && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <LucideLock className="size-3 shrink-0 text-text-secondary" />
                  </TooltipTrigger>
                  <TooltipContent>
                    {t('applications.noPermissionTip')}
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
            <p className="mt-0.5 line-clamp-2 min-h-7 text-xs leading-[14px] text-text-secondary">
              {app.description || t('applications.noDescription')}
            </p>
          </div>
        </div>

        <div className="mt-2 flex items-center gap-2 border-t border-border-default/60 pt-2">
          <span className="flex items-center gap-1 text-xs text-text-secondary">
            <TypeIcon className="size-3" />
            {app.app_type === 'exe'
              ? t('applications.exeType')
              : t('applications.webType')}
          </span>
          {app.accessible && app.app_type === 'exe' && app.latest_version && (
            <Badge
              variant="secondary"
              className="px-1.5 py-0 text-[10px] font-normal"
            >
              {app.latest_version.version}
            </Badge>
          )}

          <div className="ml-auto">
            {app.accessible ? (
              <Button
                size="xs"
                variant="transparent"
                className="gap-1 border-0 px-1.5 text-xs text-accent-primary hover:bg-accent-primary/10"
                disabled={downloadingId === app.id}
                onClick={() => handleOpen(app)}
              >
                {app.app_type === 'web' ? (
                  <>
                    {t('applications.open')}
                    {app.open_mode === 'newtab' ? (
                      <LucideExternalLink className="size-3.5" />
                    ) : (
                      <LucideArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                    )}
                  </>
                ) : (
                  <>
                    {downloadingId === app.id
                      ? t('applications.downloading')
                      : t('applications.download')}
                    <LucideDownload className="size-3.5" />
                  </>
                )}
              </Button>
            ) : (
              <span className="text-xs text-text-secondary">
                {t('applications.noPermission')}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderDeptItem = (node: DeptNode) => {
    const isActive = selected === node.id;
    return (
      <div
        key={node.id}
        role="button"
        tabIndex={0}
        onClick={() => setSelected(node.id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setSelected(node.id);
          }
        }}
        className={cn(
          'relative flex cursor-pointer items-center gap-1 rounded-md py-1.5 pr-2 text-sm transition-colors',
          isActive
            ? 'bg-accent-primary/10 font-medium text-accent-primary'
            : 'text-text-secondary hover:bg-bg-base hover:text-text-primary',
        )}
        style={{ paddingLeft: 8 + node.depth * 12 }}
      >
        {node.hasChildren ? (
          <button
            type="button"
            className="shrink-0 rounded p-0.5 hover:bg-bg-card"
            onClick={(e) => {
              e.stopPropagation();
              toggleCollapse(node.id);
            }}
          >
            <LucideChevronRight
              className={cn(
                'size-3.5 transition-transform',
                !collapsed.has(node.id) && 'rotate-90',
              )}
            />
          </button>
        ) : (
          <span className="w-[18px] shrink-0" />
        )}
        <span className="truncate">{node.name}</span>
        {node.id === myDepartmentId && (
          <span className="ml-1 shrink-0 rounded bg-accent-primary/15 px-1 py-0 text-[10px] text-accent-primary">
            {t('applications.myDepartment')}
          </span>
        )}
        <span className="ml-auto shrink-0 pl-1 text-xs tabular-nums text-text-secondary">
          {node.app_ids.length}
        </span>
      </div>
    );
  };

  return (
    <section className="flex size-full flex-col p-6" data-tour="apps-list">
      <h1 className="mb-4 text-2xl font-bold">{t('header.apps')}</h1>

      {isLoading ? (
        <div className="text-sm text-text-secondary">
          {t('applications.loading')}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 gap-4">
          <aside className="flex w-60 shrink-0 flex-col rounded-xl border border-border-default bg-bg-card">
            <div className="p-2">
              <div
                role="button"
                tabIndex={0}
                onClick={() => setSelected(COMPANY)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSelected(COMPANY);
                  }
                }}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium transition-colors',
                  selected === COMPANY
                    ? 'bg-accent-primary/10 text-accent-primary'
                    : 'hover:bg-bg-base',
                )}
              >
                <LucideBuilding2
                  className={cn(
                    'size-4 shrink-0',
                    selected === COMPANY
                      ? 'text-accent-primary'
                      : 'text-text-secondary',
                  )}
                />
                <span className="truncate">
                  {t('applications.companyLevel')}
                </span>
                <span className="ml-auto text-xs tabular-nums text-text-secondary">
                  {companyApps.length}
                </span>
              </div>
            </div>

            <div className="mx-2 h-px shrink-0 bg-border-default" />

            <ScrollArea className="min-h-0 flex-1">
              <div className="p-2">{deptNodes.map(renderDeptItem)}</div>
            </ScrollArea>
          </aside>

          <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-border-default bg-bg-card/20">
            <div className="flex flex-wrap items-center gap-3 border-b border-border-default px-4 py-2.5">
              <div className="flex min-w-0 items-baseline gap-2">
                <span className="truncate text-sm font-semibold">
                  {currentTitle}
                </span>
                <span className="text-xs tabular-nums text-text-secondary">
                  {filteredApps.length}
                </span>
              </div>

              <div className="ml-auto flex items-center gap-2">
                <Segmented
                  className="relative bg-bg-base p-0.5"
                  buttonSize="sm"
                  rounded="md"
                  value={typeFilter}
                  onChange={(v) => setTypeFilter(v as TypeFilter)}
                  options={[
                    { label: t('applications.filterAll'), value: 'all' },
                    { label: t('applications.webType'), value: 'web' },
                    { label: t('applications.exeType'), value: 'exe' },
                  ]}
                />
                <div className="relative w-52">
                  <LucideSearch className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-text-secondary" />
                  <Input
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    placeholder={t('applications.searchPlaceholder')}
                    className="h-8 pl-8 text-sm"
                  />
                </div>
              </div>
            </div>

            <ScrollArea className="min-h-0 flex-1">
              <div className="p-4">
                {filteredApps.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-2 py-20 text-text-secondary">
                    <LucideInbox className="size-8 opacity-40" />
                    <span className="text-sm">
                      {keyword.trim() || typeFilter !== 'all'
                        ? t('applications.noMatch')
                        : t('applications.empty')}
                    </span>
                  </div>
                ) : (
                  <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                    {filteredApps.map(renderCard)}
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        </div>
      )}
    </section>
  );
}

export default ApplicationsPortal;
