import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useMutation, useQuery } from '@tanstack/react-query';

import {
  LucideChevronLeft,
  LucideChevronRight,
  LucideChevronsUp,
  LucideRefreshCw,
  LucideSearch,
} from 'lucide-react';

import { SelectWithSearch } from '@/components/originui/select-with-search';
import Spotlight from '@/components/spotlight';
import { TableEmpty } from '@/components/table-skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import message from '@/components/ui/message';
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
  ParseQueueItem,
  ParseQueueStatus,
  esListKnowledgebases,
  listParseQueue,
  prioritizeParseDoc,
} from '@/services/admin-service';

const ALL = '__all__';
const PAGE_SIZE = 50;

// Status badge styling. Keys resolve to i18n labels; variants come from ui/badge.
const STATUS_META: Record<
  ParseQueueStatus,
  {
    key: string;
    variant: 'default' | 'secondary' | 'success' | 'destructive' | 'outline';
  }
> = {
  unstart: { key: 'admin.pqStatusUnstart', variant: 'outline' },
  queued: { key: 'admin.pqStatusQueued', variant: 'secondary' },
  parsing: { key: 'admin.pqStatusParsing', variant: 'default' },
  done: { key: 'admin.pqStatusDone', variant: 'success' },
  failed: { key: 'admin.pqStatusFailed', variant: 'destructive' },
  cancelled: { key: 'admin.pqStatusCancelled', variant: 'outline' },
};

// Status tabs, in display order. `active` is the virtual "not finished" bucket.
const TABS: { value: string; label: string }[] = [
  { value: 'active', label: 'admin.pqTabActive' },
  { value: 'unstart', label: 'admin.pqStatusUnstart' },
  { value: 'queued', label: 'admin.pqStatusQueued' },
  { value: 'parsing', label: 'admin.pqStatusParsing' },
  { value: 'done', label: 'admin.pqStatusDone' },
  { value: 'failed', label: 'admin.pqStatusFailed' },
];

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function AdminParseQueue() {
  const { t } = useTranslation();

  const [status, setStatus] = useState<string>('active');
  const [departmentId, setDepartmentId] = useState<string>(ALL);
  const [kbId, setKbId] = useState<string>(ALL);
  const [searchInput, setSearchInput] = useState<string>('');
  const [keyword, setKeyword] = useState<string>('');
  const [page, setPage] = useState<number>(1);

  // Debounce the file-name search so typing doesn't fire a request per keystroke.
  useEffect(() => {
    const id = setTimeout(() => {
      setKeyword(searchInput.trim());
      setPage(1);
    }, 400);
    return () => clearTimeout(id);
  }, [searchInput]);

  // Filter options are derived from the full KB list (already exposes department).
  const { data: kbList } = useQuery({
    queryKey: ['admin/parse-queue/kbs'],
    queryFn: async () => (await esListKnowledgebases())?.data?.data ?? [],
  });

  const departmentOptions = useMemo(() => {
    const map = new Map<string, string>();
    (kbList ?? []).forEach((k) => {
      if (k.department_id) {
        map.set(k.department_id, k.department_name || k.department_id);
      }
    });
    return [
      { label: t('admin.pqAllDepartments'), value: ALL },
      ...Array.from(map.entries()).map(([value, label]) => ({ label, value })),
    ];
  }, [kbList, t]);

  const kbOptions = useMemo(() => {
    const list = (kbList ?? []).filter((k) =>
      departmentId === ALL ? true : k.department_id === departmentId,
    );
    return [
      { label: t('admin.pqAllKbs'), value: ALL },
      ...list.map((k) => ({ label: k.name, value: k.id })),
    ];
  }, [kbList, departmentId, t]);

  const { data, isFetching, refetch } = useQuery({
    queryKey: ['admin/parse-queue', status, departmentId, kbId, keyword, page],
    queryFn: async () =>
      (
        await listParseQueue({
          status,
          department_id: departmentId === ALL ? '' : departmentId,
          kb_id: kbId === ALL ? '' : kbId,
          keyword,
          page,
          size: PAGE_SIZE,
        })
      )?.data?.data,
    // Keep refreshing while anything is still moving through the queue so the
    // admin watches positions and progress advance live.
    refetchInterval: (query) => {
      const counts = query.state.data?.status_counts ?? {};
      const moving =
        (counts.queued ?? 0) + (counts.parsing ?? 0) + (counts.unstart ?? 0);
      return moving > 0 ? 4000 : false;
    },
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const counts = data?.status_counts ?? {};
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const tabCount = (value: string): number => {
    if (value === 'active') {
      return (
        (counts.unstart ?? 0) + (counts.queued ?? 0) + (counts.parsing ?? 0)
      );
    }
    return counts[value as ParseQueueStatus] ?? 0;
  };

  const prioritizeMutation = useMutation({
    mutationKey: ['admin/parse-queue/prioritize'],
    mutationFn: async (docId: string) =>
      (await prioritizeParseDoc(docId))?.data,
    retry: false,
    onSuccess: (res) => {
      if (res?.code === 0) {
        message.success(t('admin.pqPrioritized'));
        refetch();
      } else if (res?.message) {
        message.error(res.message);
      }
    },
    onError: (err: any) => {
      message.error(err?.message || t('admin.pqPrioritizeFailed'));
    },
  });

  const changeStatus = (value: string) => {
    setStatus(value);
    setPage(1);
  };

  const changeDepartment = (value: string) => {
    setDepartmentId(value);
    setKbId(ALL);
    setPage(1);
  };

  const changeKb = (value: string) => {
    setKbId(value);
    setPage(1);
  };

  const renderQueueCell = (it: ParseQueueItem) => {
    if (it.status === 'parsing') {
      return (
        <span className="text-accent-primary font-medium">
          {Math.round((it.progress ?? 0) * 100)}%
        </span>
      );
    }
    if (it.queue_pos != null) {
      return (
        <span className="font-mono text-text-primary">#{it.queue_pos}</span>
      );
    }
    return <span className="text-text-secondary">-</span>;
  };

  const renderRow = (it: ParseQueueItem) => {
    const meta = STATUS_META[it.status];
    const busy =
      prioritizeMutation.isPending &&
      prioritizeMutation.variables === it.doc_id;
    return (
      <TableRow key={it.doc_id}>
        <TableCell className="font-medium max-w-[18rem]">
          <span className="line-clamp-2 break-all">{it.name}</span>
        </TableCell>
        <TableCell>
          {it.department_name ? (
            <Badge variant="secondary">{it.department_name}</Badge>
          ) : (
            <span className="text-text-secondary">-</span>
          )}
        </TableCell>
        <TableCell className="text-sm">{it.kb_name || '-'}</TableCell>
        <TableCell className="text-xs">
          <div className="flex flex-col gap-0.5">
            <span className="font-mono text-text-primary uppercase">
              {it.parser_id}
            </span>
            <span className="text-text-secondary">{it.layout_recognize}</span>
          </div>
        </TableCell>
        <TableCell>
          <Badge variant={meta.variant}>{t(meta.key)}</Badge>
        </TableCell>
        <TableCell>{renderQueueCell(it)}</TableCell>
        <TableCell className="text-xs text-text-secondary">
          {formatBytes(it.size)}
        </TableCell>
        <TableCell className="text-right">
          <Button
            size="sm"
            variant="outline"
            disabled={!it.can_prioritize || busy}
            onClick={() => prioritizeMutation.mutate(it.doc_id)}
            title={
              it.can_prioritize
                ? t('admin.pqPrioritize')
                : t('admin.pqPrioritizeDisabledTip')
            }
          >
            <LucideChevronsUp className="size-3.5 mr-1" />
            {t('admin.pqPrioritize')}
          </Button>
        </TableCell>
      </TableRow>
    );
  };

  return (
    <Card className="!shadow-none relative h-full bg-transparent rounded-xl overflow-hidden">
      <Spotlight />

      <ScrollArea className="size-full">
        <CardHeader className="space-y-0 flex flex-row justify-between items-center">
          <CardTitle>{t('admin.pqTitle')}</CardTitle>
          <Button
            size="icon-lg"
            variant="outline"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <LucideRefreshCw
              className={cn('size-4', isFetching && 'animate-spin')}
            />
          </Button>
        </CardHeader>

        <CardContent className="space-y-4">
          <p className="text-xs text-text-secondary">{t('admin.pqHint')}</p>

          {/* Filters: department, knowledge base, file-name search. */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="w-56">
              <SelectWithSearch
                value={departmentId}
                onChange={changeDepartment}
                options={departmentOptions}
              />
            </div>
            <div className="w-56">
              <SelectWithSearch
                value={kbId}
                onChange={changeKb}
                options={kbOptions}
              />
            </div>
            <div className="relative w-64">
              <LucideSearch className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-text-secondary" />
              <Input
                className="pl-9"
                placeholder={t('admin.pqSearchPlaceholder')}
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </div>
          </div>

          {/* Status tabs with live counts. */}
          <div className="flex flex-wrap items-center gap-2">
            {TABS.map((tab) => (
              <Button
                key={tab.value}
                size="sm"
                variant={status === tab.value ? 'highlighted' : 'outline'}
                onClick={() => changeStatus(tab.value)}
              >
                {t(tab.label)}
                <span className="ml-1.5 text-xs opacity-70">
                  {tabCount(tab.value)}
                </span>
              </Button>
            ))}
          </div>

          <div className="border border-border-default rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('admin.pqColFile')}</TableHead>
                  <TableHead>{t('admin.pqColDept')}</TableHead>
                  <TableHead>{t('admin.pqColKb')}</TableHead>
                  <TableHead>{t('admin.pqColMethod')}</TableHead>
                  <TableHead>{t('admin.pqColStatus')}</TableHead>
                  <TableHead>{t('admin.pqColQueue')}</TableHead>
                  <TableHead>{t('admin.pqColSize')}</TableHead>
                  <TableHead className="text-right">
                    {t('admin.actions')}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.length > 0 ? (
                  items.map(renderRow)
                ) : (
                  <TableEmpty columnsLength={8} />
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination. */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-text-secondary">
              {t('admin.pqTotal', { count: total })}
            </span>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <LucideChevronLeft className="size-4" />
              </Button>
              <span className="text-xs text-text-secondary">
                {page} / {totalPages}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                <LucideChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </ScrollArea>
    </Card>
  );
}

export default AdminParseQueue;
