import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  LucideBuilding2,
  LucideChevronDown,
  LucideChevronLeft,
  LucideChevronRight,
  LucideDownload,
  LucideEye,
  LucideFolder,
  LucideLock,
  LucideRefreshCw,
  LucideSearch,
  LucideUser,
} from 'lucide-react';

import { SelectWithSearch } from '@/components/originui/select-with-search';
import Spotlight from '@/components/spotlight';
import { TableEmpty } from '@/components/table-skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

import {
  EsChunk,
  EsKnowledgebase,
  esGetChunkDetail,
  esGetKbStats,
  esListKbDocuments,
  esListKnowledgebases,
  esSearchChunks,
  setKbCompanyLevel,
  setKbDownloadLimit,
} from '@/services/admin-service';

const PAGE_SIZE = 20;
// Radix <Select.Item> forbids an empty-string value, so use a sentinel for "all".
const ALL_DOCS = '__all__';

type GroupBy = 'dept' | 'owner';

const COMPANY_PERM = 'company';

function permissionLabel(t: (k: string) => string, permission?: string) {
  switch (permission) {
    case COMPANY_PERM:
      return t('admin.kbPermCompany');
    case 'team':
      return t('admin.kbPermTeam');
    case 'department':
      return t('admin.kbPermDepartment');
    default:
      return t('admin.kbPermMe');
  }
}

function AdminKbManagement() {
  const { t } = useTranslation();
  const [kbId, setKbId] = useState<string>('');
  const [groupBy, setGroupBy] = useState<GroupBy>('dept');
  const [filter, setFilter] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const [docId, setDocId] = useState<string>(ALL_DOCS);
  const [keyword, setKeyword] = useState('');
  const [submitted, setSubmitted] = useState({ q: '', doc_id: '' });
  const [page, setPage] = useState(1);
  const [detailChunk, setDetailChunk] = useState<EsChunk | null>(null);

  // Full KB list.
  const {
    data: kbs,
    isFetching: kbLoading,
    refetch: refetchKbs,
  } = useQuery({
    queryKey: ['admin/kb/list'],
    queryFn: async () => {
      const res = await esListKnowledgebases();
      return res?.data?.data ?? [];
    },
  });

  const selectedKb = useMemo(
    () => (kbs ?? []).find((k) => k.id === kbId) ?? null,
    [kbs, kbId],
  );

  // Group + filter the KB list for the left tree.
  const groups = useMemo(() => {
    const term = filter.trim().toLowerCase();
    const list = (kbs ?? []).filter(
      (k) => !term || k.name.toLowerCase().includes(term),
    );

    const fallback =
      groupBy === 'dept'
        ? t('admin.kbUnassignedDept')
        : t('admin.kbUnknownOwner');
    // Company-wide KBs are pulled out of the department tree into their own
    // bucket, so "which datasets are company-level" is answerable at a glance.
    const companyGroup = t('admin.kbPermCompany');

    const map = new Map<string, EsKnowledgebase[]>();
    for (const kb of list) {
      const key =
        groupBy === 'dept'
          ? kb.permission === COMPANY_PERM
            ? companyGroup
            : kb.department_name || fallback
          : kb.creator_name || fallback;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(kb);
    }

    // Sort: the company bucket first, then named groups alphabetically, fallback last.
    return Array.from(map.entries())
      .sort(([a], [b]) => {
        if (a === companyGroup) return -1;
        if (b === companyGroup) return 1;
        if (a === fallback) return 1;
        if (b === fallback) return -1;
        return a.localeCompare(b);
      })
      .map(([name, items]) => ({ name, items }));
  }, [kbs, filter, groupBy, t]);

  const totalKb = kbs?.length ?? 0;

  // The only write operation on this page: flip company-wide visibility.
  const queryClient = useQueryClient();
  const { mutate: toggleCompany, isPending: togglingCompany } = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      setKbCompanyLevel(id, enabled),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin/kb/list'] });
    },
  });

  // Toggle the KB's file-download restriction (content stays searchable/citable).
  const { mutate: toggleDownloadLimit, isPending: togglingDownload } =
    useMutation({
      mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
        setKbDownloadLimit(id, enabled),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['admin/kb/list'] });
      },
    });

  // Stats for the selected KB.
  const { data: stats, refetch: refetchStats } = useQuery({
    queryKey: ['admin/kb/stats', kbId],
    enabled: !!kbId,
    queryFn: async () => {
      const res = await esGetKbStats(kbId);
      return res?.data?.data ?? null;
    },
  });

  // Documents of the selected KB (for the filter dropdown).
  const { data: docs } = useQuery({
    queryKey: ['admin/kb/docs', kbId],
    enabled: !!kbId,
    queryFn: async () => {
      const res = await esListKbDocuments(kbId);
      return res?.data?.data ?? [];
    },
  });

  const docOptions = useMemo(
    () => [
      { value: ALL_DOCS, label: t('admin.esAllDocuments') },
      ...(docs ?? []).map((d) => ({ value: d.id, label: d.name })),
    ],
    [docs, t],
  );

  // Chunk search.
  const {
    data: chunkResult,
    isFetching: chunkLoading,
    refetch: refetchChunks,
  } = useQuery({
    queryKey: ['admin/kb/chunks', kbId, submitted.q, submitted.doc_id, page],
    enabled: !!kbId,
    queryFn: async () => {
      const res = await esSearchChunks(kbId, {
        q: submitted.q,
        doc_id: submitted.doc_id,
        page,
        size: PAGE_SIZE,
      });
      return res?.data?.data ?? { total: 0, chunks: [] };
    },
  });

  const total = chunkResult?.total ?? 0;
  const chunks = chunkResult?.chunks ?? [];
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const onSelectKb = (id: string) => {
    setKbId(id);
    setDocId(ALL_DOCS);
    setKeyword('');
    setSubmitted({ q: '', doc_id: '' });
    setPage(1);
  };

  const onSearch = () => {
    setPage(1);
    setSubmitted({
      q: keyword.trim(),
      doc_id: docId === ALL_DOCS ? '' : docId,
    });
  };

  const refreshAll = () => {
    refetchKbs();
    if (kbId) {
      refetchStats();
      refetchChunks();
    }
  };

  const toggleGroup = (name: string) =>
    setCollapsed((prev) => ({ ...prev, [name]: !prev[name] }));

  return (
    <Card className="!shadow-none relative h-full bg-transparent rounded-xl overflow-hidden">
      <Spotlight />

      <div className="flex flex-col h-full">
        <CardHeader className="space-y-0 flex flex-row justify-between items-center shrink-0">
          <div className="flex items-center gap-2">
            <CardTitle>{t('admin.kbManagement')}</CardTitle>
            <Badge variant="secondary">{t('admin.kbReadOnly')}</Badge>
          </div>
          <Button
            size="icon-lg"
            variant="outline"
            onClick={refreshAll}
            disabled={kbLoading || chunkLoading}
          >
            <LucideRefreshCw
              className={cn(
                'size-4',
                (kbLoading || chunkLoading) && 'animate-spin',
              )}
            />
          </Button>
        </CardHeader>

        <CardContent className="flex flex-row gap-4 flex-1 min-h-0 pb-4">
          {/* Left: grouped KB list */}
          <aside className="w-80 shrink-0 flex flex-col border border-border-default rounded-lg overflow-hidden">
            <div className="p-3 space-y-3 border-b border-border-default shrink-0">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">
                  {t('admin.kbListTitle')}
                </span>
                <span className="text-xs text-text-secondary">
                  {t('admin.kbCount', { count: totalKb })}
                </span>
              </div>
              <div className="flex gap-1 rounded-md bg-bg-card p-1">
                <GroupTab
                  active={groupBy === 'dept'}
                  onClick={() => setGroupBy('dept')}
                  label={t('admin.kbGroupByDept')}
                />
                <GroupTab
                  active={groupBy === 'owner'}
                  onClick={() => setGroupBy('owner')}
                  label={t('admin.kbGroupByOwner')}
                />
              </div>
              <div className="relative">
                <LucideSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-text-secondary" />
                <Input
                  className="pl-8"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder={t('admin.kbSearchPlaceholder')}
                />
              </div>
            </div>

            <ScrollArea className="flex-1 min-h-0">
              {groups.length === 0 ? (
                <div className="text-text-secondary text-sm py-10 text-center">
                  {t('admin.kbEmpty')}
                </div>
              ) : (
                <div className="p-2 space-y-1">
                  {groups.map((group) => {
                    const isCollapsed = !!collapsed[group.name];
                    const GroupIcon =
                      groupBy === 'dept' ? LucideFolder : LucideUser;
                    return (
                      <div key={group.name}>
                        <button
                          type="button"
                          onClick={() => toggleGroup(group.name)}
                          className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md text-sm text-text-secondary hover:bg-bg-card transition-colors"
                        >
                          <LucideChevronDown
                            className={cn(
                              'size-3.5 transition-transform shrink-0',
                              isCollapsed && '-rotate-90',
                            )}
                          />
                          <GroupIcon className="size-3.5 shrink-0" />
                          <span className="truncate flex-1 text-left">
                            {group.name}
                          </span>
                          <span className="text-xs">{group.items.length}</span>
                        </button>

                        {!isCollapsed && (
                          <div className="pl-3 space-y-0.5">
                            {group.items.map((kb) => (
                              <button
                                key={kb.id}
                                type="button"
                                onClick={() => onSelectKb(kb.id)}
                                className={cn(
                                  'w-full text-left px-2 py-1.5 rounded-md transition-colors',
                                  'hover:bg-bg-card',
                                  kb.id === kbId &&
                                    'bg-bg-card text-text-primary',
                                )}
                              >
                                <div className="text-sm truncate font-medium">
                                  {kb.name}
                                </div>
                                <div className="flex items-center gap-2 text-xs text-text-secondary mt-0.5">
                                  <span>
                                    {kb.doc_num} {t('admin.kbColDocs')}
                                  </span>
                                  <span>·</span>
                                  <span>
                                    {kb.chunk_num} {t('admin.kbColChunks')}
                                  </span>
                                  <Badge
                                    variant={
                                      kb.permission === COMPANY_PERM
                                        ? 'default'
                                        : 'secondary'
                                    }
                                    className="ml-auto"
                                  >
                                    {permissionLabel(t, kb.permission)}
                                  </Badge>
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </aside>

          {/* Right: detail of the selected KB */}
          <section className="flex-1 min-w-0">
            <ScrollArea className="size-full">
              {!kbId ? (
                <div className="text-text-secondary text-sm py-20 text-center">
                  {t('admin.kbPickHint')}
                </div>
              ) : (
                <div className="space-y-4 pr-1">
                  {/* Selected KB header */}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="text-base font-semibold">
                      {selectedKb?.name}
                    </span>
                    {selectedKb?.creator_name && (
                      <span className="text-sm text-text-secondary">
                        {t('admin.kbColOwner')}: {selectedKb.creator_name}
                      </span>
                    )}
                    <span className="text-sm text-text-secondary">
                      {t('admin.kbColDept')}:{' '}
                      {selectedKb?.department_name ||
                        t('admin.kbUnassignedDept')}
                    </span>
                    <Badge
                      variant={
                        selectedKb?.permission === COMPANY_PERM
                          ? 'default'
                          : 'secondary'
                      }
                    >
                      {permissionLabel(t, selectedKb?.permission)}
                    </Badge>
                    {selectedKb?.download_disabled && (
                      <Badge
                        variant="secondary"
                        className="border-accent-primary text-accent-primary"
                      >
                        <LucideLock className="size-3 mr-1" />
                        {t('admin.kbDownloadLimited')}
                      </Badge>
                    )}
                    {selectedKb && (
                      <div className="ml-auto flex items-center gap-2">
                        <Button
                          size="sm"
                          variant={
                            selectedKb.permission === COMPANY_PERM
                              ? 'outline'
                              : 'highlighted'
                          }
                          disabled={togglingCompany}
                          onClick={() =>
                            toggleCompany({
                              id: selectedKb.id,
                              enabled: selectedKb.permission !== COMPANY_PERM,
                            })
                          }
                        >
                          <LucideBuilding2 className="size-4 mr-1" />
                          {selectedKb.permission === COMPANY_PERM
                            ? t('admin.kbUnsetCompany')
                            : t('admin.kbSetCompany')}
                        </Button>
                        <Button
                          size="sm"
                          variant={
                            selectedKb.download_disabled ? 'outline' : 'outline'
                          }
                          className={cn(
                            selectedKb.download_disabled &&
                              'border-accent-primary text-accent-primary',
                          )}
                          disabled={togglingDownload}
                          onClick={() =>
                            toggleDownloadLimit({
                              id: selectedKb.id,
                              enabled: !selectedKb.download_disabled,
                            })
                          }
                        >
                          {selectedKb.download_disabled ? (
                            <LucideLock className="size-4 mr-1" />
                          ) : (
                            <LucideDownload className="size-4 mr-1" />
                          )}
                          {selectedKb.download_disabled
                            ? t('admin.kbUnsetDownloadLimit')
                            : t('admin.kbSetDownloadLimit')}
                        </Button>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-text-secondary">
                    {t('admin.kbCompanyTip')}
                  </p>
                  <p className="text-xs text-text-secondary">
                    {t('admin.kbDownloadLimitTip')}
                  </p>

                  {/* Stats panel */}
                  {stats && (
                    <div className="flex flex-wrap gap-x-6 gap-y-2 rounded-lg border border-border-default p-3 text-sm">
                      <Stat label={t('admin.esEngine')} value={stats.engine} />
                      <Stat
                        label={t('admin.esIndexName')}
                        value={stats.index_name}
                      />
                      <div className="flex items-center gap-1.5">
                        <span className="text-text-secondary">
                          {t('admin.esIndexStatus')}:
                        </span>
                        <Badge
                          variant={stats.index_exist ? 'default' : 'secondary'}
                        >
                          {stats.index_exist
                            ? t('admin.esIndexExist')
                            : t('admin.esIndexMissing')}
                        </Badge>
                      </div>
                      <Stat
                        label={t('admin.esChunkTotal')}
                        value={String(stats.es_total)}
                      />
                      <Stat
                        label={t('admin.esDocCount')}
                        value={String(stats.doc_aggregation.length)}
                      />
                    </div>
                  )}

                  {/* Search bar */}
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="flex flex-col gap-1.5 flex-1 min-w-[240px]">
                      <span className="text-sm text-text-secondary">
                        {t('admin.esKeyword')}
                      </span>
                      <Input
                        value={keyword}
                        onChange={(e) => setKeyword(e.target.value)}
                        placeholder={t('admin.esKeywordPlaceholder')}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') onSearch();
                        }}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5 min-w-[200px]">
                      <span className="text-sm text-text-secondary">
                        {t('admin.esDocument')}
                      </span>
                      <SelectWithSearch
                        value={docId}
                        onChange={(v: string) => setDocId(v || ALL_DOCS)}
                        options={docOptions}
                        placeholder={t('admin.esAllDocuments')}
                      />
                    </div>
                    <Button variant="highlighted" onClick={onSearch}>
                      <LucideSearch className="size-4 mr-1" />
                      {t('admin.esSearch')}
                    </Button>
                  </div>

                  {/* Chunk table */}
                  <div className="border border-border-default rounded-lg">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[22%]">
                            {t('admin.esColDocument')}
                          </TableHead>
                          <TableHead>{t('admin.esColContent')}</TableHead>
                          <TableHead className="w-[16%]">
                            {t('admin.esColKeywords')}
                          </TableHead>
                          <TableHead className="w-[80px]">
                            {t('admin.esColAvailable')}
                          </TableHead>
                          <TableHead className="w-[80px] text-right">
                            {t('admin.actions')}
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {chunks.length > 0 ? (
                          chunks.map((chunk) => (
                            <TableRow key={chunk.id}>
                              <TableCell className="align-top font-medium truncate max-w-0">
                                {chunk.docnm_kwd || '-'}
                              </TableCell>
                              <TableCell className="align-top text-sm text-text-secondary">
                                {chunk.highlighted ? (
                                  <span
                                    className="es-highlight line-clamp-3"
                                    // Highlight HTML produced by the search engine (<em> tags).
                                    dangerouslySetInnerHTML={{
                                      __html: chunk.content,
                                    }}
                                  />
                                ) : (
                                  <span className="line-clamp-3">
                                    {chunk.content || '-'}
                                  </span>
                                )}
                              </TableCell>
                              <TableCell className="align-top">
                                <div className="flex flex-wrap gap-1">
                                  {(chunk.important_kwd ?? [])
                                    .slice(0, 4)
                                    .map((kw, i) => (
                                      <Badge key={i} variant="secondary">
                                        {kw}
                                      </Badge>
                                    ))}
                                </div>
                              </TableCell>
                              <TableCell className="align-top">
                                <Badge
                                  variant={
                                    chunk.available ? 'default' : 'secondary'
                                  }
                                >
                                  {chunk.available
                                    ? t('admin.esYes')
                                    : t('admin.esNo')}
                                </Badge>
                              </TableCell>
                              <TableCell className="align-top text-right">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setDetailChunk(chunk)}
                                >
                                  <LucideEye className="size-3.5 mr-1" />
                                  {t('admin.esView')}
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableEmpty columnsLength={5} />
                        )}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Pagination */}
                  <div className="flex items-center justify-between text-sm text-text-secondary">
                    <span>{t('admin.esTotalChunks', { count: total })}</span>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={page <= 1 || chunkLoading}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                      >
                        <LucideChevronLeft className="size-4" />
                      </Button>
                      <span>
                        {page} / {totalPages}
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={page >= totalPages || chunkLoading}
                        onClick={() =>
                          setPage((p) => Math.min(totalPages, p + 1))
                        }
                      >
                        <LucideChevronRight className="size-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </ScrollArea>
          </section>
        </CardContent>
      </div>

      <ChunkDetailDialog
        kbId={kbId}
        chunk={detailChunk}
        onClose={() => setDetailChunk(null)}
      />
    </Card>
  );
}

function GroupTab({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex-1 text-sm py-1 rounded transition-colors',
        active
          ? 'bg-bg-base text-text-primary shadow-sm'
          : 'text-text-secondary hover:text-text-primary',
      )}
    >
      {label}
    </button>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-text-secondary">{label}:</span>
      <span className="font-medium break-all">{value}</span>
    </div>
  );
}

function ChunkDetailDialog({
  kbId,
  chunk,
  onClose,
}: {
  kbId: string;
  chunk: EsChunk | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { data: detail, isFetching } = useQuery({
    queryKey: ['admin/kb/chunk', kbId, chunk?.id],
    enabled: !!kbId && !!chunk?.id,
    queryFn: async () => {
      const res = await esGetChunkDetail(kbId, chunk!.id);
      return res?.data?.data ?? {};
    },
  });

  const entries = useMemo(() => {
    if (!detail) return [];
    return Object.entries(detail).sort(([a], [b]) => a.localeCompare(b));
  }, [detail]);

  return (
    <Dialog open={!!chunk} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{t('admin.esChunkDetail')}</DialogTitle>
        </DialogHeader>
        <ScrollArea className="flex-1 min-h-0">
          {isFetching ? (
            <div className="text-text-secondary text-sm py-6 text-center">
              {t('admin.esLoadingDetail')}
            </div>
          ) : (
            <div className="space-y-2 pr-4">
              {entries.map(([key, value]) => (
                <div
                  key={key}
                  className="grid grid-cols-[160px_1fr] gap-3 text-sm border-b border-border-default pb-2"
                >
                  <span className="font-medium text-text-secondary break-all">
                    {key}
                  </span>
                  <span className="break-all whitespace-pre-wrap">
                    {typeof value === 'object'
                      ? JSON.stringify(value, null, 2)
                      : String(value)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

export default AdminKbManagement;
