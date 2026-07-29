import { EmptyCardType } from '@/components/empty/constant';
import { EmptyAppCard } from '@/components/empty/empty';
import ListFilterBar from '@/components/list-filter-bar';
import { useHandleFilterSubmit } from '@/components/list-filter-bar/use-handle-filter-submit';
import { RenameDialog } from '@/components/rename-dialog';
import { Button } from '@/components/ui/button';
import { useHandleSearchChange } from '@/hooks/logic-hooks';
import { useFetchKnowledgeListByScope } from '@/hooks/use-knowledge-request';
import { useCanManageKnowledge } from '@/hooks/use-user-setting-request';
import { useQueryClient } from '@tanstack/react-query';
import { useDebounce } from 'ahooks';
import { Plus } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { DatasetCreatingDialog } from './dataset-creating-dialog';
import { DatasetSearch } from './dataset-search';
import { DatasetSection } from './dataset-section';
import { useSaveKnowledge } from './hooks';
import { useRenameDataset } from './use-rename-dataset';
import { useSelectOwners } from './use-select-owners';

const PAGE_SIZE = 12;

export default function Datasets() {
  const { t } = useTranslation();
  const {
    visible,
    hideModal,
    showModal,
    onCreateOk,
    loading: creatingLoading,
  } = useSaveKnowledge();

  // Search + owner filter are owned by the page and shared by both sections;
  // each section keeps its own page cursor (see `useFetchKnowledgeListByScope`).
  const { searchString, handleInputChange } = useHandleSearchChange();
  const debouncedSearchString = useDebounce(searchString, { wait: 500 });
  const { filterValue, handleFilterSubmit } = useHandleFilterSubmit();
  const ownerIds = useMemo(
    () => (filterValue.owner as string[]) ?? [],
    [filterValue.owner],
  );

  const company = useFetchKnowledgeListByScope(
    'company',
    debouncedSearchString,
    ownerIds,
    PAGE_SIZE,
  );
  const dept = useFetchKnowledgeListByScope(
    'dept',
    debouncedSearchString,
    ownerIds,
    PAGE_SIZE,
  );
  const personal = useFetchKnowledgeListByScope(
    'me',
    debouncedSearchString,
    ownerIds,
    PAGE_SIZE,
  );

  const owners = useSelectOwners();
  const canManage = useCanManageKnowledge();

  const {
    datasetRenameLoading,
    initialDatasetName,
    onDatasetRenameOk,
    datasetRenameVisible,
    hideDatasetRenameModal,
    showDatasetRenameModal,
  } = useRenameDataset();

  const [searchUrl, setSearchUrl] = useSearchParams();
  const isCreate = searchUrl.get('isCreate') === 'true';
  const queryClient = useQueryClient();
  useEffect(() => {
    if (isCreate) {
      queryClient.invalidateQueries({ queryKey: ['tenantInfo'] });
      showModal();
      searchUrl.delete('isCreate');
      setSearchUrl(searchUrl);
    }
  }, [isCreate, showModal, searchUrl, setSearchUrl, queryClient]);

  const isFiltering = !!debouncedSearchString || ownerIds.length > 0;
  const loading = company.loading || dept.loading || personal.loading;
  const isEmpty =
    company.total === 0 && dept.total === 0 && personal.total === 0;

  // Nothing at all and nothing typed: keep the full-page onboarding card.
  if (isEmpty && !isFiltering && !loading) {
    return (
      <>
        <article
          className="size-full flex items-center justify-center"
          data-testid="datasets-list"
        >
          <EmptyAppCard
            showIcon
            size="large"
            className="w-[480px] p-14"
            type={EmptyCardType.Dataset}
            onClick={() => showModal()}
          />
        </article>
        {visible && (
          <DatasetCreatingDialog
            hideModal={hideModal}
            onOk={onCreateOk}
            loading={creatingLoading}
          />
        )}
      </>
    );
  }

  return (
    <>
      <article className="size-full flex flex-col" data-testid="datasets-list">
        <header className="px-5 pt-8 mb-4">
          <ListFilterBar
            title={t('header.dataset')}
            searchString={searchString}
            onSearchChange={handleInputChange}
            value={filterValue}
            filters={owners}
            onChange={handleFilterSubmit}
            icon={'datasets'}
          >
            {/* Everyone may create at least a personal knowledge base; the
                dialog and backend restrict employees to the personal scope. */}
            <Button onClick={showModal}>
              <Plus className="size-[1em]" />
              {t('knowledgeList.createKnowledgeBase')}
            </Button>
          </ListFilterBar>
          <div className="mt-4">
            <DatasetSearch />
          </div>
        </header>

        <div className="flex-1 overflow-auto px-5 pb-5">
          {/* Company-wide: hidden entirely when there is none, so the section
              header never introduces an empty block nobody can act on. */}
          {company.total > 0 && (
            <DatasetSection
              scope="company"
              title={t('knowledgeList.companySection')}
              hint={t('knowledgeList.companySectionTip')}
              total={company.total}
              page={company.page}
              pageSize={company.pageSize}
              onPageChange={company.setPage}
              kbs={company.kbs}
              loading={company.loading}
              showDatasetRenameModal={showDatasetRenameModal}
              empty={
                <p className="py-6 text-sm text-text-secondary">
                  {t('knowledgeList.noMatch')}
                </p>
              }
            />
          )}

          {/* Personal: private to the creator; everyone can create these. */}
          <DatasetSection
            scope="me"
            title={t('knowledgeList.personalSection')}
            hint={t('knowledgeList.personalSectionTip')}
            total={personal.total}
            page={personal.page}
            pageSize={personal.pageSize}
            onPageChange={personal.setPage}
            kbs={personal.kbs}
            loading={personal.loading}
            showDatasetRenameModal={showDatasetRenameModal}
            empty={
              isFiltering ? (
                <p className="py-6 text-sm text-text-secondary">
                  {t('knowledgeList.noMatch')}
                </p>
              ) : (
                <EmptyAppCard
                  showIcon
                  size="large"
                  className="w-[480px] p-14"
                  type={EmptyCardType.Dataset}
                  onClick={() => showModal()}
                />
              )
            }
          />

          <DatasetSection
            scope="dept"
            title={t('knowledgeList.deptSection')}
            hint={t('knowledgeList.deptSectionTip')}
            total={dept.total}
            page={dept.page}
            pageSize={dept.pageSize}
            onPageChange={dept.setPage}
            kbs={dept.kbs}
            loading={dept.loading}
            showDatasetRenameModal={showDatasetRenameModal}
            empty={
              isFiltering || !canManage ? (
                // Employees cannot create datasets, so the onboarding card would
                // be a dead end for them — show a plain hint instead.
                <p className="py-6 text-sm text-text-secondary">
                  {isFiltering
                    ? t('knowledgeList.noMatch')
                    : t('knowledgeList.deptSectionEmpty')}
                </p>
              ) : (
                <EmptyAppCard
                  showIcon
                  size="large"
                  className="w-[480px] p-14"
                  type={EmptyCardType.Dataset}
                  onClick={() => showModal()}
                />
              )
            }
          />
        </div>
      </article>

      {visible && (
        <DatasetCreatingDialog
          hideModal={hideModal}
          onOk={onCreateOk}
          loading={creatingLoading}
        />
      )}
      {datasetRenameVisible && (
        <RenameDialog
          hideModal={hideDatasetRenameModal}
          onOk={onDatasetRenameOk}
          initialName={initialDatasetName}
          loading={datasetRenameLoading}
        />
      )}
    </>
  );
}
