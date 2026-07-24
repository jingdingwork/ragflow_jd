import { CardContainer } from '@/components/card-container';
import { RAGFlowPagination } from '@/components/ui/ragflow-pagination';
import { CardSkeleton } from '@/components/ui/skeleton';
import { DatasetScope } from '@/hooks/use-knowledge-request';
import { IDataset } from '@/interfaces/database/dataset';
import { cn } from '@/lib/utils';
import { Building2, Users } from 'lucide-react';
import { ReactNode } from 'react';
import { DatasetCard } from './dataset-card';
import { useRenameDataset } from './use-rename-dataset';

type DatasetSectionProps = {
  scope: DatasetScope;
  title: string;
  hint: string;
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  kbs: IDataset[];
  loading: boolean;
  /** Shown instead of the grid when the section has nothing to display. */
  empty: ReactNode;
} & Pick<ReturnType<typeof useRenameDataset>, 'showDatasetRenameModal'>;

/**
 * One visibility bucket of the dataset portal (company-wide / department), with
 * its own header, grid and page cursor. The company section is tinted with the
 * brand accent so the two are distinguishable at a glance while scrolling.
 */
export function DatasetSection({
  scope,
  title,
  hint,
  total,
  page,
  pageSize,
  onPageChange,
  kbs,
  loading,
  empty,
  showDatasetRenameModal,
}: DatasetSectionProps) {
  const isCompany = scope === 'company';
  const Icon = isCompany ? Building2 : Users;

  return (
    <section className="mb-8 last:mb-0">
      <header className="mb-3 flex items-center gap-2.5">
        <span
          className={cn(
            'flex size-7 shrink-0 items-center justify-center rounded-md',
            isCompany
              ? 'bg-accent-primary/15 text-accent-primary'
              : 'bg-bg-card text-text-secondary',
          )}
        >
          <Icon className="size-4" />
        </span>
        <h2 className="text-base font-semibold text-text-primary">{title}</h2>
        <span className="rounded-full bg-bg-card px-2 py-0.5 text-xs tabular-nums text-text-secondary">
          {total}
        </span>
        <span className="hidden truncate text-xs text-text-secondary sm:inline">
          {hint}
        </span>
        <div className="ml-1 h-px flex-1 bg-border-default" />
      </header>

      {loading && kbs.length === 0 ? (
        <CardSkeleton />
      ) : kbs.length > 0 ? (
        <>
          <CardContainer>
            {kbs.map((dataset) => (
              <DatasetCard
                key={dataset.id}
                dataset={dataset}
                showCompanyBadge={false}
                showDatasetRenameModal={showDatasetRenameModal}
              />
            ))}
          </CardContainer>

          {total > pageSize && (
            <div className="mt-4">
              <RAGFlowPagination
                current={page}
                pageSize={pageSize}
                total={total}
                showSizeChanger={false}
                onChange={onPageChange}
              />
            </div>
          )}
        </>
      ) : (
        empty
      )}
    </section>
  );
}
