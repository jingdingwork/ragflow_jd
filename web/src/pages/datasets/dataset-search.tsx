import HighLightMarkdown from '@/components/highlight-markdown';
import { FileIcon } from '@/components/icon-font';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import message from '@/components/ui/message';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { RAGFlowPagination } from '@/components/ui/ragflow-pagination';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useFetchKnowledgeList } from '@/hooks/use-knowledge-request';
import { ITestingChunk } from '@/interfaces/database/dataset';
import { cn } from '@/lib/utils';
import PdfDrawer from '@/pages/next-search/document-preview-modal';
import { useClickDrawer } from '@/pages/next-search/document-preview-modal/hooks';
import kbService from '@/services/knowledge-service';
import { downloadDocument } from '@/utils/file-util';
import { useMutation } from '@tanstack/react-query';
import {
  Check,
  ChevronDown,
  Database,
  Download,
  Loader2,
  Maximize2,
  Search as SearchIcon,
} from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

const PAGE_SIZE = 10;

// Wrap occurrences of the query terms in <em> on the chunk content so matched
// keywords are highlighted (rendered by HighLightMarkdown's rehype-raw and
// styled via the `[&_em]:…` arbitrary variants below — CTCI brand orange).
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const highlightKeywords = (content: string, query: string) => {
  if (!content || !query) return content;
  const terms = Array.from(
    new Set(
      query
        .split(/\s+/)
        .map((t) => t.trim())
        .filter(Boolean),
    ),
  )
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp);
  if (terms.length === 0) return content;
  const re = new RegExp(`(${terms.join('|')})`, 'gi');
  return content.replace(re, '<em>$1</em>');
};

interface ISearchPayload {
  kbIds: string[];
  question: string;
  page: number;
  size: number;
}

interface ISearchResult {
  chunks: ITestingChunk[];
  total: number;
}

function useDatasetRetrieval() {
  const { data, isPending, mutateAsync, reset } = useMutation<
    ISearchResult,
    Error,
    ISearchPayload
  >({
    mutationKey: ['datasetGlobalRetrieval'],
    gcTime: 0,
    mutationFn: async ({ kbIds, question, page, size }) => {
      const { data } = await kbService.retrievalTest({
        kb_id: kbIds,
        question,
        highlight: true,
        page,
        size,
      });
      if (data?.code === 0) {
        const res = data.data ?? {};
        return { chunks: res.chunks ?? [], total: res.total ?? 0 };
      }
      return { chunks: [], total: 0 };
    },
  });

  return {
    result: data ?? { chunks: [], total: 0 },
    loading: isPending,
    search: mutateAsync,
    reset,
  };
}

export function DatasetSearch() {
  const { t } = useTranslation();
  // Only knowledge bases with parsed chunks are searchable.
  const { list } = useFetchKnowledgeList(true);

  const [question, setQuestion] = useState('');
  const [selectedKbIds, setSelectedKbIds] = useState<string[]>([]);
  const [scopeOpen, setScopeOpen] = useState(false);

  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const activeRef = useRef<{ kbIds: string[]; question: string }>({
    kbIds: [],
    question: '',
  });

  const { result, loading, search } = useDatasetRetrieval();
  const { visible, hideModal, documentId, selectedChunk, clickDocumentButton } =
    useClickDrawer();
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const handleDownload = useCallback(
    async (chunk: ITestingChunk, rowKey: string) => {
      if (downloadingId) return;
      setDownloadingId(rowKey);
      try {
        await downloadDocument({ id: chunk.doc_id, filename: chunk.docnm_kwd });
      } catch {
        message.error(
          t('common.downloadFailed', { defaultValue: 'Download failed' }),
        );
      } finally {
        setDownloadingId(null);
      }
    },
    [downloadingId, t],
  );

  const allKbIds = useMemo(() => list.map((k) => k.id), [list]);
  const hasKb = allKbIds.length > 0;

  // KBs whose files cannot be downloaded — hide the download button for their
  // result chunks (content stays previewable/citable).
  const downloadDisabledKbIds = useMemo(
    () => new Set(list.filter((k) => k.download_disabled).map((k) => k.id)),
    [list],
  );

  const scopeLabel = useMemo(() => {
    if (selectedKbIds.length === 0)
      return t('knowledgeList.retrieval.allKnowledgeBases');
    if (selectedKbIds.length === 1) {
      return (
        list.find((k) => k.id === selectedKbIds[0])?.name ??
        t('knowledgeList.retrieval.selected', { count: 1 })
      );
    }
    return t('knowledgeList.retrieval.selected', {
      count: selectedKbIds.length,
    });
  }, [selectedKbIds, list, t]);

  const toggleKb = useCallback((id: string) => {
    setSelectedKbIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }, []);

  const runSearch = useCallback(
    (nextPage: number) => {
      const q = question.trim();
      if (!q || !hasKb) return;
      const kbIds = selectedKbIds.length ? selectedKbIds : allKbIds;
      activeRef.current = { kbIds, question: q };
      setPage(nextPage);
      setOpen(true);
      search({ kbIds, question: q, page: nextPage, size: PAGE_SIZE });
    },
    [question, hasKb, selectedKbIds, allKbIds, search],
  );

  const handlePageChange = useCallback(
    (next: number) => {
      const { kbIds, question: q } = activeRef.current;
      if (!q) return;
      setPage(next);
      search({ kbIds, question: q, page: next, size: PAGE_SIZE });
    },
    [search],
  );

  return (
    <div className="w-full">
      <div
        className={cn(
          'flex items-center gap-1 w-full rounded-full border border-border-button',
          'bg-bg-card pl-1.5 pr-1.5 py-1.5 transition-colors',
          'focus-within:border-accent-primary',
        )}
      >
        {/* Knowledge base scope selector */}
        <Popover open={scopeOpen} onOpenChange={setScopeOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              disabled={!hasKb}
              className={cn(
                'flex items-center gap-2 shrink-0 h-9 pl-3 pr-2.5 rounded-full',
                'text-sm text-text-primary bg-bg-base hover:bg-bg-base/70',
                'transition-colors disabled:opacity-50',
              )}
            >
              <Database className="size-4 text-accent-primary" />
              <span className="max-w-[160px] truncate">{scopeLabel}</span>
              <ChevronDown className="size-3.5 text-text-secondary" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 p-0">
            <Command>
              <CommandInput
                placeholder={t('knowledgeList.retrieval.selectKnowledgeBases')}
              />
              <CommandList>
                <CommandEmpty>
                  {t('knowledgeList.retrieval.noKnowledgeBase')}
                </CommandEmpty>
                <CommandGroup>
                  <CommandItem
                    onSelect={() => setSelectedKbIds([])}
                    className="cursor-pointer"
                  >
                    <div
                      className={cn(
                        'mr-2 flex size-4 items-center justify-center rounded-sm border border-accent-primary',
                        selectedKbIds.length === 0
                          ? 'bg-accent-primary text-white'
                          : 'opacity-50 [&_svg]:invisible',
                      )}
                    >
                      <Check className="size-3" />
                    </div>
                    {t('knowledgeList.retrieval.allKnowledgeBases')}
                  </CommandItem>
                  {list.map((kb) => {
                    const checked = selectedKbIds.includes(kb.id);
                    return (
                      <CommandItem
                        key={kb.id}
                        onSelect={() => toggleKb(kb.id)}
                        className="cursor-pointer"
                      >
                        <div
                          className={cn(
                            'mr-2 flex size-4 items-center justify-center rounded-sm border border-accent-primary',
                            checked
                              ? 'bg-accent-primary text-white'
                              : 'opacity-50 [&_svg]:invisible',
                          )}
                        >
                          <Check className="size-3" />
                        </div>
                        <span className="truncate">{kb.name}</span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        {/* Query input */}
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyUp={(e) => {
            if (e.key === 'Enter') runSearch(1);
          }}
          disabled={!hasKb}
          placeholder={
            hasKb
              ? t('knowledgeList.retrieval.placeholder')
              : t('knowledgeList.retrieval.noKnowledgeBase')
          }
          className={cn(
            'flex-1 min-w-0 bg-transparent px-3 h-9 text-sm text-text-primary',
            'placeholder:text-text-secondary outline-none disabled:cursor-not-allowed',
          )}
        />

        {/* Search button */}
        <Button
          type="button"
          onClick={() => runSearch(1)}
          disabled={!hasKb || !question.trim()}
          className="shrink-0 rounded-full h-9 px-5 gap-1.5"
        >
          {loading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <SearchIcon className="size-4" />
          )}
          {t('header.search')}
        </Button>
      </div>

      {/* Results drawer */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className="w-[680px] max-w-[92vw] flex flex-col p-0"
        >
          <SheetHeader className="px-6 pt-6 pb-4 border-b border-border-default/60 text-left">
            <SheetTitle className="flex items-center gap-2">
              <SearchIcon className="size-5 text-accent-primary" />
              {t('knowledgeList.retrieval.results')}
            </SheetTitle>
            <div className="flex items-center gap-2 text-sm text-text-secondary">
              <span className="truncate max-w-[280px] text-text-primary">
                “{activeRef.current.question}”
              </span>
              <span className="opacity-40">·</span>
              <span className="truncate max-w-[160px]">{scopeLabel}</span>
              {!loading && result.total > 0 && (
                <>
                  <span className="opacity-40">·</span>
                  <span>
                    {t('knowledgeList.retrieval.resultsCount', {
                      count: result.total,
                    })}
                  </span>
                </>
              )}
            </div>
          </SheetHeader>

          <div className="flex-1 overflow-auto px-6 py-4 scrollbar-thin">
            {loading ? (
              <div className="h-full flex flex-col items-center justify-center gap-3 text-text-secondary">
                <Loader2 className="size-6 animate-spin text-accent-primary" />
                <span className="text-sm">
                  {t('knowledgeList.retrieval.searching')}
                </span>
              </div>
            ) : result.chunks.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center gap-2 text-center">
                <SearchIcon className="size-8 text-text-secondary opacity-40" />
                <p className="text-text-primary">
                  {t('knowledgeList.retrieval.empty')}
                </p>
                <p className="text-sm text-text-secondary">
                  {t('knowledgeList.retrieval.emptyHint')}
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {result.chunks.map((chunk, index) => {
                  const rowKey = chunk.chunk_id ?? String(index);
                  return (
                    <div
                      key={rowKey}
                      className="rounded-lg border border-border-default/60 bg-bg-card p-4 hover:border-accent-primary/50 transition-colors"
                    >
                      <div
                        className={cn(
                          'text-sm text-text-primary leading-relaxed',
                          '[&_em]:bg-accent-primary/25 [&_em]:not-italic [&_em]:font-semibold',
                          '[&_em]:rounded-sm [&_em]:px-0.5',
                        )}
                      >
                        <HighLightMarkdown>
                          {highlightKeywords(
                            chunk.content_with_weight,
                            activeRef.current.question,
                          )}
                        </HighLightMarkdown>
                      </div>
                      <div className="mt-3 flex items-center gap-2 text-xs">
                        <button
                          type="button"
                          onClick={() =>
                            clickDocumentButton(chunk.doc_id, chunk as any)
                          }
                          title={t('knowledgeList.retrieval.preview')}
                          className="group flex items-center gap-2 min-w-0 text-text-secondary hover:text-accent-primary transition-colors"
                        >
                          <FileIcon name={chunk.docnm_kwd} />
                          <span className="truncate group-hover:underline">
                            {chunk.docnm_kwd}
                          </span>
                          <Maximize2 className="size-3 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </button>
                        <div className="ml-auto flex items-center gap-3 shrink-0">
                          {!downloadDisabledKbIds.has(chunk.kb_id) && (
                            <button
                              type="button"
                              onClick={() => handleDownload(chunk, rowKey)}
                              disabled={downloadingId === rowKey}
                              title={t('knowledgeList.retrieval.download')}
                              className="text-text-secondary hover:text-accent-primary transition-colors disabled:opacity-50"
                            >
                              {downloadingId === rowKey ? (
                                <Loader2 className="size-3.5 animate-spin" />
                              ) : (
                                <Download className="size-3.5" />
                              )}
                            </button>
                          )}
                          {typeof chunk.similarity === 'number' && (
                            <span className="text-accent-primary">
                              {(chunk.similarity * 100).toFixed(0)}%
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {!loading && result.total > PAGE_SIZE && (
            <div className="px-6 py-4 border-t border-border-default/60">
              <RAGFlowPagination
                current={page}
                pageSize={PAGE_SIZE}
                total={result.total}
                onChange={handlePageChange}
              />
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* In-app document preview (jumps to / highlights the matched chunk) */}
      {visible && (
        <PdfDrawer
          visible={visible}
          hideModal={hideModal}
          documentId={documentId}
          chunk={selectedChunk as any}
        />
      )}
    </div>
  );
}

export default DatasetSearch;
