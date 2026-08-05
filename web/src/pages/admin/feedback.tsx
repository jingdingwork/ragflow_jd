import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useMutation, useQuery } from '@tanstack/react-query';

import {
  LucideChevronLeft,
  LucideChevronRight,
  LucideImage,
  LucideRefreshCw,
  LucideSearch,
  LucideStar,
} from 'lucide-react';

import { SelectWithSearch } from '@/components/originui/select-with-search';
import Spotlight from '@/components/spotlight';
import { TableEmpty } from '@/components/table-skeleton';
import { Badge } from '@/components/ui/badge';
import { Button, ButtonLoading } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

import {
  AdminFeedbackListItem,
  AdminFeedbackStatus,
  getFeedbackDetail,
  listFeedbacks,
  updateFeedback,
} from '@/services/admin-service';

const ALL = '__all__';
const PAGE_SIZE = 20;

const STATUS_TABS = [
  { value: ALL, label: 'admin.fbAll' },
  { value: 'open', label: 'admin.fbStatusOpen' },
  { value: 'in_progress', label: 'admin.fbStatusInProgress' },
  { value: 'done', label: 'admin.fbStatusDone' },
];

const STATUS_META: Record<
  AdminFeedbackStatus,
  { label: string; variant: 'secondary' | 'success' | 'outline' }
> = {
  open: { label: 'admin.fbStatusOpen', variant: 'outline' },
  in_progress: { label: 'admin.fbStatusInProgress', variant: 'secondary' },
  done: { label: 'admin.fbStatusDone', variant: 'success' },
};

function Stars({ n }: { n: number }) {
  return (
    <span className="inline-flex">
      {[1, 2, 3, 4, 5].map((i) => (
        <LucideStar
          key={i}
          className={cn(
            'size-3.5',
            i <= n
              ? 'fill-accent-primary text-accent-primary'
              : 'text-text-secondary',
          )}
        />
      ))}
    </span>
  );
}

function AdminFeedback() {
  const { t } = useTranslation();

  const [status, setStatus] = useState<string>(ALL);
  const [module, setModule] = useState<string>(ALL);
  const [priority, setPriority] = useState<string>(ALL);
  const [searchInput, setSearchInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const id = setTimeout(() => {
      setKeyword(searchInput.trim());
      setPage(1);
    }, 400);
    return () => clearTimeout(id);
  }, [searchInput]);

  const moduleOptions = useMemo(
    () => [
      { label: t('admin.fbAllModules'), value: ALL },
      { label: t('feedback.module_chat'), value: 'chat' },
      { label: t('feedback.module_knowledge'), value: 'knowledge' },
      { label: t('feedback.module_app'), value: 'app' },
    ],
    [t],
  );

  const priorityOptions = useMemo(
    () => [
      { label: t('admin.fbAllPriorities'), value: ALL },
      ...[5, 4, 3, 2, 1].map((n) => ({
        label: '★'.repeat(n),
        value: String(n),
      })),
    ],
    [t],
  );

  const { data, isFetching, refetch } = useQuery({
    queryKey: ['admin/feedbacks', status, module, priority, keyword, page],
    queryFn: async () =>
      (
        await listFeedbacks({
          status: status === ALL ? '' : status,
          module: module === ALL ? '' : module,
          priority: priority === ALL ? '' : priority,
          keyword,
          page,
          size: PAGE_SIZE,
        })
      )?.data?.data,
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const stats = data?.stats;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const renderRow = (it: AdminFeedbackListItem) => {
    const meta = STATUS_META[it.status];
    return (
      <TableRow
        key={it.id}
        className="cursor-pointer"
        onClick={() => setSelectedId(it.id)}
      >
        <TableCell className="text-xs text-text-secondary whitespace-nowrap">
          {it.create_date}
        </TableCell>
        <TableCell className="text-sm">
          <div className="flex flex-col">
            <span>{it.submitter_name}</span>
            {it.submitter_email && (
              <span className="text-xs text-text-secondary">
                {it.submitter_email}
              </span>
            )}
          </div>
        </TableCell>
        <TableCell>
          {it.department_name ? (
            <Badge variant="secondary">{it.department_name}</Badge>
          ) : (
            <span className="text-text-secondary">-</span>
          )}
        </TableCell>
        <TableCell>
          <div className="flex flex-wrap gap-1">
            {(it.modules ?? []).map((m) => (
              <Badge key={m} variant="outline">
                {t(`feedback.module_${m}`)}
              </Badge>
            ))}
          </div>
        </TableCell>
        <TableCell>
          <Stars n={it.priority} />
        </TableCell>
        <TableCell className="max-w-[20rem]">
          <div className="flex items-center gap-1.5">
            {it.image_count > 0 && (
              <span className="inline-flex items-center gap-0.5 text-xs text-text-secondary shrink-0">
                <LucideImage className="size-3.5" />
                {it.image_count}
              </span>
            )}
            <span className="line-clamp-1 text-sm">{it.content}</span>
          </div>
        </TableCell>
        <TableCell>
          <Badge variant={meta.variant}>{t(meta.label)}</Badge>
        </TableCell>
      </TableRow>
    );
  };

  return (
    <Card className="!shadow-none relative h-full bg-transparent rounded-xl overflow-hidden">
      <Spotlight />

      <ScrollArea className="size-full">
        <CardHeader className="space-y-0 flex flex-row justify-between items-center">
          <CardTitle>{t('admin.feedbackManagement')}</CardTitle>
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
          {/* Stats */}
          {stats && (
            <div className="flex flex-wrap gap-3">
              {(
                [
                  ['total', stats.total],
                  ['open', stats.open],
                  ['in_progress', stats.in_progress],
                  ['done', stats.done],
                ] as const
              ).map(([key, val]) => (
                <div
                  key={key}
                  className="px-4 py-2 rounded-lg border border-border-default bg-bg-card min-w-[7rem]"
                >
                  <div className="text-xs text-text-secondary">
                    {t(`admin.fbStat_${key}`)}
                  </div>
                  <div className="text-xl font-semibold text-text-primary">
                    {val}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="w-44">
              <SelectWithSearch
                value={module}
                onChange={(v) => {
                  setModule(v);
                  setPage(1);
                }}
                options={moduleOptions}
              />
            </div>
            <div className="w-44">
              <SelectWithSearch
                value={priority}
                onChange={(v) => {
                  setPriority(v);
                  setPage(1);
                }}
                options={priorityOptions}
              />
            </div>
            <div className="relative w-64">
              <LucideSearch className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-text-secondary" />
              <Input
                className="pl-9"
                placeholder={t('admin.fbSearchPlaceholder')}
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </div>
          </div>

          {/* Status tabs */}
          <div className="flex flex-wrap items-center gap-2">
            {STATUS_TABS.map((tab) => (
              <Button
                key={tab.value}
                size="sm"
                variant={status === tab.value ? 'highlighted' : 'outline'}
                onClick={() => {
                  setStatus(tab.value);
                  setPage(1);
                }}
              >
                {t(tab.label)}
              </Button>
            ))}
          </div>

          <div className="border border-border-default rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('admin.fbColTime')}</TableHead>
                  <TableHead>{t('admin.fbColSubmitter')}</TableHead>
                  <TableHead>{t('admin.fbColDept')}</TableHead>
                  <TableHead>{t('admin.fbColModules')}</TableHead>
                  <TableHead>{t('admin.fbColPriority')}</TableHead>
                  <TableHead>{t('admin.fbColContent')}</TableHead>
                  <TableHead>{t('admin.fbColStatus')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.length > 0 ? (
                  items.map(renderRow)
                ) : (
                  <TableEmpty columnsLength={7} />
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-text-secondary">
              {t('admin.fbTotal', { count: total })}
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

      <FeedbackDetailDialog
        id={selectedId}
        onClose={() => setSelectedId(null)}
        onSaved={() => refetch()}
      />
    </Card>
  );
}

function FeedbackDetailDialog({
  id,
  onClose,
  onSaved,
}: {
  id: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<string>('open');
  const [note, setNote] = useState('');

  const { data: detail } = useQuery({
    queryKey: ['admin/feedback', id],
    queryFn: async () => (await getFeedbackDetail(id as string))?.data?.data,
    enabled: !!id,
  });

  useEffect(() => {
    if (detail) {
      setStatus(detail.status);
      setNote(detail.admin_note ?? '');
    }
  }, [detail]);

  const saveMutation = useMutation({
    mutationKey: ['admin/feedback/update'],
    mutationFn: async () =>
      (await updateFeedback(id as string, { status, admin_note: note }))?.data,
    retry: false,
    onSuccess: (res) => {
      if (res?.code === 0) {
        message.success(t('admin.fbUpdated'));
        onSaved();
        onClose();
      } else if (res?.message) {
        message.error(res.message);
      }
    },
  });

  const statusOptions = [
    { label: t('admin.fbStatusOpen'), value: 'open' },
    { label: t('admin.fbStatusInProgress'), value: 'in_progress' },
    { label: t('admin.fbStatusDone'), value: 'done' },
  ];

  return (
    <Dialog open={!!id} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('admin.fbDetailTitle')}</DialogTitle>
        </DialogHeader>

        {detail && (
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-4 pr-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-text-secondary">
                    {t('admin.fbColSubmitter')}:{' '}
                  </span>
                  {detail.submitter_name}
                </div>
                <div>
                  <span className="text-text-secondary">
                    {t('admin.fbColDept')}:{' '}
                  </span>
                  {detail.department_name || '-'}
                </div>
                <div>
                  <span className="text-text-secondary">
                    {t('admin.fbColTime')}:{' '}
                  </span>
                  {detail.create_date}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-text-secondary">
                    {t('admin.fbColPriority')}:
                  </span>
                  <Stars n={detail.priority} />
                </div>
              </div>

              <div className="flex flex-wrap gap-1">
                {(detail.modules ?? []).map((m) => (
                  <Badge key={m} variant="outline">
                    {t(`feedback.module_${m}`)}
                  </Badge>
                ))}
              </div>

              <div className="whitespace-pre-wrap text-sm text-text-primary bg-bg-card rounded-lg p-3 border border-border-default">
                {detail.content}
              </div>

              {detail.images.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {detail.images.map((src, i) => (
                    <a
                      key={i}
                      href={src}
                      target="_blank"
                      rel="noreferrer"
                      className="block"
                    >
                      <img
                        src={src}
                        alt=""
                        className="max-h-40 rounded border border-border-default"
                      />
                    </a>
                  ))}
                </div>
              )}

              <div className="space-y-2 border-t border-border-default pt-3">
                <div className="text-sm text-text-secondary">
                  {t('admin.fbStatus')}
                </div>
                <div className="w-56">
                  <SelectWithSearch
                    value={status}
                    onChange={setStatus}
                    options={statusOptions}
                  />
                </div>
                <div className="text-sm text-text-secondary">
                  {t('admin.fbNote')}
                </div>
                <Textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  placeholder={t('admin.fbNotePlaceholder')}
                />
              </div>
            </div>
          </ScrollArea>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <ButtonLoading
            loading={saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            {t('common.save')}
          </ButtonLoading>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default AdminFeedback;
