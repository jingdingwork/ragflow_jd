import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useQuery } from '@tanstack/react-query';

import {
  LucideChevronLeft,
  LucideChevronRight,
  LucideEye,
  LucideRefreshCw,
  LucideSearch,
} from 'lucide-react';

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
import { RAGFlowSelect } from '@/components/ui/select';
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
  esGetChunkDetail,
  esGetKbStats,
  esListKbDocuments,
  esListKnowledgebases,
  esSearchChunks,
} from '@/services/admin-service';

const PAGE_SIZE = 20;
// Radix <Select.Item> forbids an empty-string value, so use a sentinel for "all".
const ALL_DOCS = '__all__';

function AdminEsData() {
  const { t } = useTranslation();
  const [kbId, setKbId] = useState<string>('');
  const [docId, setDocId] = useState<string>(ALL_DOCS);
  const [keyword, setKeyword] = useState('');
  const [submitted, setSubmitted] = useState({ q: '', doc_id: '' });
  const [page, setPage] = useState(1);
  const [detailChunk, setDetailChunk] = useState<EsChunk | null>(null);

  // KB list for the picker.
  const { data: kbs, isFetching: kbLoading } = useQuery({
    queryKey: ['admin/es/kbs'],
    queryFn: async () => {
      const res = await esListKnowledgebases();
      return res?.data?.data ?? [];
    },
  });

  const kbOptions = useMemo(
    () =>
      (kbs ?? []).map((kb) => ({
        value: kb.id,
        label: `${kb.name} · ${kb.chunk_num} chunks`,
      })),
    [kbs],
  );

  // Stats for the selected KB.
  const { data: stats, refetch: refetchStats } = useQuery({
    queryKey: ['admin/es/stats', kbId],
    enabled: !!kbId,
    queryFn: async () => {
      const res = await esGetKbStats(kbId);
      return res?.data?.data ?? null;
    },
  });

  // Documents of the selected KB (for the filter dropdown).
  const { data: docs } = useQuery({
    queryKey: ['admin/es/docs', kbId],
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
    queryKey: ['admin/es/chunks', kbId, submitted.q, submitted.doc_id, page],
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
    refetchStats();
    refetchChunks();
  };

  const openDetail = async (chunk: EsChunk) => {
    setDetailChunk(chunk);
  };

  return (
    <Card className="!shadow-none relative h-full bg-transparent rounded-xl overflow-hidden">
      <Spotlight />

      <ScrollArea className="size-full">
        <CardHeader className="space-y-0 flex flex-row justify-between items-center">
          <div className="flex items-center gap-2">
            <CardTitle>{t('admin.esData')}</CardTitle>
            <Badge variant="secondary">{t('admin.esReadOnly')}</Badge>
          </div>
          <Button
            size="icon-lg"
            variant="outline"
            onClick={refreshAll}
            disabled={!kbId || chunkLoading}
          >
            <LucideRefreshCw
              className={cn('size-4', chunkLoading && 'animate-spin')}
            />
          </Button>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* KB picker */}
          <div className="flex flex-col gap-1.5 max-w-xl">
            <span className="text-sm text-text-secondary">
              {t('admin.esSelectKb')}
            </span>
            <RAGFlowSelect
              value={kbId}
              onChange={onSelectKb}
              options={kbOptions}
              placeholder={
                kbLoading
                  ? t('admin.esLoadingKb')
                  : t('admin.esSelectKbPlaceholder')
              }
              allowClear
            />
          </div>

          {!kbId ? (
            <div className="text-text-secondary text-sm py-10 text-center">
              {t('admin.esPickKbHint')}
            </div>
          ) : (
            <>
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
                  <RAGFlowSelect
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
                              onClick={() => openDetail(chunk)}
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
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    <LucideChevronRight className="size-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </ScrollArea>

      <ChunkDetailDialog
        kbId={kbId}
        chunk={detailChunk}
        onClose={() => setDetailChunk(null)}
      />
    </Card>
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
    queryKey: ['admin/es/chunk', kbId, chunk?.id],
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

export default AdminEsData;
