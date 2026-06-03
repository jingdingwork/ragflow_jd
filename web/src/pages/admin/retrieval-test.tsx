import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useMutation, useQuery } from '@tanstack/react-query';

import {
  LucideArrowDown,
  LucideArrowUp,
  LucideSearch,
  LucideSparkles,
} from 'lucide-react';

import Spotlight from '@/components/spotlight';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { RAGFlowSelect } from '@/components/ui/select';
import { cn } from '@/lib/utils';

import {
  RetrievalChunk,
  RetrievalRanks,
  esListKbDocuments,
  esListKnowledgebases,
  retrievalTest,
} from '@/services/admin-service';

// Radix <Select.Item> forbids an empty-string value, so use a sentinel for "all".
const ALL_DOCS = '__all__';

function AdminRetrievalTest() {
  const { t } = useTranslation();
  const [kbId, setKbId] = useState<string>('');
  const [docId, setDocId] = useState<string>(ALL_DOCS);
  const [question, setQuestion] = useState('');

  // KB list for the picker.
  const { data: kbs, isFetching: kbLoading } = useQuery({
    queryKey: ['admin/rt/kbs'],
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

  // Documents of the selected KB (for the filter dropdown).
  const { data: docs } = useQuery({
    queryKey: ['admin/rt/docs', kbId],
    enabled: !!kbId,
    queryFn: async () => {
      const res = await esListKbDocuments(kbId);
      return res?.data?.data ?? [];
    },
  });

  const docOptions = useMemo(
    () => [
      { value: ALL_DOCS, label: t('admin.rtAllDocuments') },
      ...(docs ?? []).map((d) => ({ value: d.id, label: d.name })),
    ],
    [docs, t],
  );

  const { mutate, data, isPending, reset } = useMutation({
    mutationKey: ['admin/rt/run'],
    mutationFn: async () => {
      const res = await retrievalTest({
        kb_id: kbId,
        question: question.trim(),
        doc_id: docId === ALL_DOCS ? '' : docId,
      });
      return res?.data?.data ?? null;
    },
  });

  const result = data ?? null;

  const onSelectKb = (id: string) => {
    setKbId(id);
    setDocId(ALL_DOCS);
    reset();
  };

  const onRun = () => {
    if (!kbId || !question.trim()) return;
    mutate();
  };

  return (
    <Card className="!shadow-none relative h-full bg-transparent rounded-xl overflow-hidden">
      <Spotlight />

      <ScrollArea className="size-full">
        <CardHeader className="space-y-0 flex flex-row justify-between items-center">
          <div className="flex items-center gap-2">
            <CardTitle>{t('admin.retrievalTest')}</CardTitle>
            <Badge variant="secondary">{t('admin.rtReadOnly')}</Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* KB picker */}
          <div className="flex flex-col gap-1.5 max-w-xl">
            <span className="text-sm text-text-secondary">
              {t('admin.rtSelectKb')}
            </span>
            <RAGFlowSelect
              value={kbId}
              onChange={onSelectKb}
              options={kbOptions}
              placeholder={
                kbLoading
                  ? t('admin.rtLoadingKb')
                  : t('admin.rtSelectKbPlaceholder')
              }
              allowClear
            />
          </div>

          {!kbId ? (
            <div className="text-text-secondary text-sm py-10 text-center">
              {t('admin.rtPickKbHint')}
            </div>
          ) : (
            <>
              {/* Query bar */}
              <div className="flex flex-wrap items-end gap-2">
                <div className="flex flex-col gap-1.5 flex-1 min-w-[240px]">
                  <span className="text-sm text-text-secondary">
                    {t('admin.rtQuestion')}
                  </span>
                  <Input
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    placeholder={t('admin.rtQuestionPlaceholder')}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') onRun();
                    }}
                  />
                </div>
                <div className="flex flex-col gap-1.5 min-w-[200px]">
                  <span className="text-sm text-text-secondary">
                    {t('admin.rtDocument')}
                  </span>
                  <RAGFlowSelect
                    value={docId}
                    onChange={(v: string) => setDocId(v || ALL_DOCS)}
                    options={docOptions}
                    placeholder={t('admin.rtAllDocuments')}
                  />
                </div>
                <Button
                  variant="highlighted"
                  onClick={onRun}
                  disabled={isPending || !question.trim()}
                >
                  <LucideSearch className="size-4 mr-1" />
                  {isPending ? t('admin.rtRunning') : t('admin.rtRun')}
                </Button>
              </div>

              {/* Model info */}
              {result && (
                <div className="flex flex-wrap gap-x-6 gap-y-2 rounded-lg border border-border-default p-3 text-sm">
                  <Stat
                    label={t('admin.rtEmbeddingModel')}
                    value={result.embedding_model || '-'}
                  />
                  <div className="flex items-center gap-1.5">
                    <span className="text-text-secondary">
                      {t('admin.rtRerankModel')}:
                    </span>
                    {result.rerank_available && result.rerank_model ? (
                      <Badge variant="default">{result.rerank_model}</Badge>
                    ) : (
                      <Badge variant="secondary">
                        {t('admin.rtRerankUnavailable')}
                      </Badge>
                    )}
                  </div>
                </div>
              )}

              {/* Results: before vs after rerank */}
              {result && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <ResultColumn
                    title={t('admin.rtBefore')}
                    ranks={result.base}
                  />
                  {result.rerank_available && result.reranked ? (
                    <ResultColumn
                      title={t('admin.rtAfter')}
                      ranks={result.reranked}
                      baseChunks={result.base.chunks}
                      showMovement
                    />
                  ) : (
                    <div className="rounded-lg border border-border-default p-6 text-center text-sm text-text-secondary flex items-center justify-center">
                      {t('admin.rtRerankUnavailable')}
                      {result.rerank_error ? (
                        <span className="block mt-1 text-xs opacity-70">
                          {result.rerank_error}
                        </span>
                      ) : null}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </CardContent>
      </ScrollArea>
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

function ResultColumn({
  title,
  ranks,
  baseChunks,
  showMovement,
}: {
  title: string;
  ranks: RetrievalRanks;
  baseChunks?: RetrievalChunk[];
  showMovement?: boolean;
}) {
  const { t } = useTranslation();

  // Map chunk_id -> rank (0-based) in the "before" list, to show movement.
  const baseRankMap = useMemo(() => {
    const m = new Map<string, number>();
    (baseChunks ?? []).forEach((c, i) => m.set(c.chunk_id, i));
    return m;
  }, [baseChunks]);

  return (
    <div className="rounded-lg border border-border-default flex flex-col">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border-default">
        <div className="flex items-center gap-1.5 font-medium text-sm">
          {showMovement && (
            <LucideSparkles className="size-4 text-accent-primary" />
          )}
          {title}
        </div>
        <span className="text-xs text-text-secondary">
          {t('admin.rtTotal', { count: ranks.total })}
        </span>
      </div>

      {ranks.chunks.length === 0 ? (
        <div className="py-10 text-center text-sm text-text-secondary">
          {t('admin.rtNoResults')}
        </div>
      ) : (
        <ul className="divide-y divide-border-default">
          {ranks.chunks.map((c, i) => (
            <li key={c.chunk_id} className="p-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-text-secondary w-6 shrink-0">
                  #{i + 1}
                </span>
                <span className="font-medium text-sm truncate flex-1">
                  {c.docnm_kwd || '-'}
                </span>
                {showMovement && (
                  <Movement from={baseRankMap.get(c.chunk_id)} to={i} />
                )}
              </div>

              <div
                className="es-highlight text-sm text-text-secondary line-clamp-3 pl-8"
                // Highlight HTML produced by the search engine (<em> tags).
                dangerouslySetInnerHTML={{ __html: c.content || '-' }}
              />

              <div className="flex flex-wrap gap-1.5 pl-8">
                <ScoreBadge
                  label={t('admin.rtScore')}
                  value={c.similarity}
                  primary
                />
                <ScoreBadge
                  label={t('admin.rtVector')}
                  value={c.vector_similarity}
                />
                <ScoreBadge
                  label={t('admin.rtTerm')}
                  value={c.term_similarity}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ScoreBadge({
  label,
  value,
  primary,
}: {
  label: string;
  value: number;
  primary?: boolean;
}) {
  return (
    <Badge variant={primary ? 'default' : 'secondary'} className="font-mono">
      {label} {value.toFixed(3)}
    </Badge>
  );
}

function Movement({ from, to }: { from: number | undefined; to: number }) {
  const { t } = useTranslation();
  if (from === undefined) {
    return (
      <Badge
        variant="outline"
        className="text-accent-primary border-accent-primary shrink-0"
      >
        {t('admin.rtMovedNew')}
      </Badge>
    );
  }
  const delta = from - to; // positive => moved up
  if (delta === 0) {
    return (
      <span className="text-xs text-text-secondary shrink-0">
        {t('admin.rtMovedSame')}
      </span>
    );
  }
  const up = delta > 0;
  return (
    <span
      className={cn(
        'flex items-center gap-0.5 text-xs shrink-0',
        up ? 'text-green-600' : 'text-red-500',
      )}
      title={t('admin.rtMoved')}
    >
      {up ? (
        <LucideArrowUp className="size-3" />
      ) : (
        <LucideArrowDown className="size-3" />
      )}
      {up
        ? t('admin.rtMovedUp', { n: delta })
        : t('admin.rtMovedDown', { n: -delta })}
    </span>
  );
}

export default AdminRetrievalTest;
