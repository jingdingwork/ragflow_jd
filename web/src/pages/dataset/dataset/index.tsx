import {
  BulkOperateBar,
  BulkOperateItemType,
} from '@/components/bulk-operate-bar';
import { FileUploadDialog } from '@/components/file-upload-dialog';
import ListFilterBar from '@/components/list-filter-bar';
import { RenameDialog } from '@/components/rename-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  useRowSelection,
  useSelectedIds,
} from '@/hooks/logic-hooks/use-row-selection';
import { useFetchDocumentList } from '@/hooks/use-document-request';
import { getFolderChildren, useFetchFolders } from '@/hooks/use-folder-request';
import { useFetchKnowledgeBaseConfiguration } from '@/hooks/use-knowledge-request';
import { FolderInput, LucidePlus } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { MetadataType } from '../components/metedata/constant';
import { useManageMetadata } from '../components/metedata/hooks/use-manage-modal';
import { ManageMetadataModal } from '../components/metedata/manage-modal';
import { useKnowledgeBaseContext } from '../contexts/knowledge-base-context';
import { DatasetTable } from './dataset-table';
import { FolderBar } from './folder-bar';
import Generate from './generate-button/generate';
import { MoveToFolderDialog } from './move-to-folder-dialog';
import { ReparseDialog } from './reparse-dialog';
import { useBulkOperateDataset } from './use-bulk-operate-dataset';
import { useCreateEmptyDocument } from './use-create-empty-document';
import { useSelectDatasetFilters } from './use-select-filters';
import { useHandleUploadDocument } from './use-upload-document';

export default function Dataset() {
  const { t } = useTranslation();
  const {
    documentUploadVisible,
    hideDocumentUploadModal,
    showDocumentUploadModal,
    onDocumentUploadOk,
    documentUploadLoading,
  } = useHandleUploadDocument();
  const { knowledgeBase } = useKnowledgeBaseContext();
  // Per-dataset gate: company-wide datasets are operable by their creator only.
  const canManage = Boolean(knowledgeBase?.manageable);

  // Virtual-folder navigation via the `folder` search param (""=root).
  const [searchParams, setSearchParams] = useSearchParams();
  const currentFolder = searchParams.get('folder') ?? '';
  const { folders } = useFetchFolders();
  const folderChildren = useMemo(
    () => getFolderChildren(folders, currentFolder),
    [folders, currentFolder],
  );
  const [moveOpen, setMoveOpen] = useState(false);

  // Ensure the folder param is always present so the document list scopes to
  // the current folder (root by default) instead of showing a flat list.
  useEffect(() => {
    if (searchParams.get('folder') === null) {
      const next = new URLSearchParams(searchParams);
      next.set('folder', '');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const navigateFolder = useCallback(
    (path: string) => {
      const next = new URLSearchParams(searchParams);
      next.set('folder', path);
      next.set('page', '1'); // reset pagination when entering a folder
      setSearchParams(next);
    },
    [searchParams, setSearchParams],
  );
  const {
    searchString,
    documents,
    pagination,
    handleInputChange,
    setPagination,
    filterValue,
    handleFilterSubmit,
    loading,
    checkValue,
  } = useFetchDocumentList();

  const { data: dataSetData } = useFetchKnowledgeBaseConfiguration();

  const { filters, onOpenChange, filterGroup } = useSelectDatasetFilters();

  const {
    createLoading,
    onCreateOk,
    createVisible,
    hideCreateModal,
    showCreateModal,
  } = useCreateEmptyDocument();

  const {
    manageMetadataVisible,
    showManageMetadataModal,
    hideManageMetadataModal,
    tableData,
    config: metadataConfig,
  } = useManageMetadata();

  useEffect(() => {
    checkValue(filters);
  }, [filters]);

  const { rowSelection, rowSelectionIsEmpty, setRowSelection, selectedCount } =
    useRowSelection();

  const {
    chunkNum,
    list,
    visible: reparseDialogVisible,
    hideModal: hideReparseDialogModal,
    handleRunClick: handleOperationIconClick,
  } = useBulkOperateDataset({
    documents,
    rowSelection,
    setRowSelection,
  });

  const { selectedIds: selectedRowKeys } = useSelectedIds(
    rowSelection,
    documents,
  );

  const handleAddMetadataWithDocuments = () => {
    showManageMetadataModal({
      type: MetadataType.Manage,
      isCanAdd: true,
      isEditField: false,
      isDeleteSingleValue: true,
      isAddValue: true,
      secondTitle: (
        <>
          {t('knowledgeDetails.metadata.selectFiles', {
            count: selectedCount,
          })}
        </>
      ),
      title: (
        <div className="flex flex-col gap-2">
          <div className="text-base font-normal">
            {t('knowledgeDetails.metadata.manageMetadata')}
          </div>
          {/* <div className="text-sm text-text-secondary">
            {t('knowledgeDetails.metadata.manageMetadataForDataset')}
          </div> */}
        </div>
      ),
      documentIds: selectedRowKeys,
    });
  };

  const updatedList = list.map((item) => {
    if (item.id === 'batch-metadata') {
      return {
        ...item,
        onClick: handleAddMetadataWithDocuments,
      };
    }
    return item;
  });

  return (
    <Card
      as="article"
      className="mb-5 mr-5 min-w-[880px] bg-transparent shadow-none"
    >
      <CardHeader as="header" className="p-5 space-y-0">
        <ListFilterBar
          onSearchChange={handleInputChange}
          searchString={searchString}
          value={filterValue}
          filterGroup={filterGroup}
          onChange={handleFilterSubmit}
          onOpenChange={onOpenChange}
          filters={filters}
          className="items-end"
          leftPanel={
            <div>
              <h1 className="leading-normal font-medium">
                {t('knowledgeDetails.subbarFiles')}
              </h1>
              <p className="text-text-secondary text-sm font-normal">
                {t('knowledgeDetails.datasetDescription')}
              </p>
            </div>
          }
          preChildren={
            canManage ? (
              <Generate disabled={!(dataSetData.chunk_count > 0)} />
            ) : undefined
          }
          // preChildren={
          //   <Button
          //     variant={'ghost'}
          //     className="border border-border-button"
          //     onClick={() =>
          //       showManageMetadataModal({
          //         type: MetadataType.Manage,
          //         isCanAdd: false,
          //         isEditField: false,
          //         isDeleteSingleValue: true,
          //         title: (
          //           <div className="flex flex-col gap-2">
          //             <div className="text-base font-normal">
          //               {t('knowledgeDetails.metadata.manageMetadata')}
          //             </div>
          //             <div className="text-sm text-text-secondary">
          //               {t(
          //                 'knowledgeDetails.metadata.manageMetadataForDataset',
          //               )}
          //             </div>
          //           </div>
          //         ),
          //       })
          //     }
          //   >
          //     <div className="flex gap-1 items-center">
          //       <Pen size={14} />
          //       {t('knowledgeDetails.metadata.metadata')}
          //     </div>
          //   </Button>
          // }
        >
          {canManage && selectedCount > 0 && (
            <Button
              variant="outline"
              size="default"
              className="mr-2"
              onClick={() => setMoveOpen(true)}
            >
              <FolderInput />
              {t('knowledgeDetails.folder.moveTo')}
            </Button>
          )}
          {canManage && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="default">
                  <LucidePlus />
                  {t('knowledgeDetails.addFile')}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-auto min-w-40" align="end">
                <DropdownMenuItem onClick={showDocumentUploadModal}>
                  {t('fileManager.uploadFile')}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={showCreateModal}>
                  {t('knowledgeDetails.emptyFiles')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </ListFilterBar>

        {rowSelectionIsEmpty || (
          <BulkOperateBar
            className="!mt-2.5 !-mb-2.5"
            list={updatedList as BulkOperateItemType[]}
            count={selectedCount}
          />
        )}
      </CardHeader>

      <CardContent className="px-5 py-0">
        <div className="pb-3">
          <FolderBar
            currentFolder={currentFolder}
            onNavigate={navigateFolder}
            canManage={canManage}
          />
        </div>
        <DatasetTable
          documents={documents}
          pagination={pagination}
          setPagination={setPagination}
          rowSelection={rowSelection}
          setRowSelection={setRowSelection}
          showManageMetadataModal={showManageMetadataModal}
          loading={loading}
          folderChildren={folderChildren}
          onNavigateFolder={navigateFolder}
        />

        {moveOpen && (
          <MoveToFolderDialog
            docIds={selectedRowKeys}
            folders={folders}
            hideModal={() => setMoveOpen(false)}
            onMoved={() => setRowSelection({})}
          />
        )}
        {documentUploadVisible && (
          <FileUploadDialog
            hideModal={hideDocumentUploadModal}
            onOk={onDocumentUploadOk}
            loading={documentUploadLoading}
            showParseOnCreation
          ></FileUploadDialog>
        )}
        {createVisible && (
          <RenameDialog
            hideModal={hideCreateModal}
            onOk={onCreateOk}
            loading={createLoading}
            title={t('knowledgeDetails.fileName')}
          ></RenameDialog>
        )}
        {manageMetadataVisible && (
          <ManageMetadataModal
            title={
              metadataConfig.title || (
                <div className="flex flex-col gap-2">
                  <div className="text-base font-normal">
                    {t('knowledgeDetails.metadata.manageMetadata')}
                  </div>
                  {/* <div className="text-sm text-text-secondary">
                    {t('knowledgeDetails.metadata.manageMetadataForDataset')}
                  </div> */}
                </div>
              )
            }
            visible={manageMetadataVisible}
            hideModal={() => {
              setRowSelection({});
              hideManageMetadataModal();
            }}
            // selectedRowKeys={selectedRowKeys}
            tableData={tableData}
            isCanAdd={metadataConfig.isCanAdd}
            isAddValue={metadataConfig.isAddValue}
            isVerticalShowValue={metadataConfig.isVerticalShowValue}
            isEditField={metadataConfig.isEditField}
            isDeleteSingleValue={metadataConfig.isDeleteSingleValue}
            secondTitle={metadataConfig.secondTitle}
            type={metadataConfig.type}
            documentIds={metadataConfig.documentIds}
            otherData={metadataConfig.record}
          />
        )}
        {reparseDialogVisible && (
          <ReparseDialog
            hidden={
              chunkNum === 0 && !knowledgeBase?.parser_config?.enable_metadata
            }
            // hidden={false}
            enable_metadata={knowledgeBase?.parser_config?.enable_metadata}
            handleOperationIconClick={handleOperationIconClick}
            chunk_num={chunkNum}
            visible={reparseDialogVisible}
            hideModal={hideReparseDialogModal}
          ></ReparseDialog>
        )}
      </CardContent>
    </Card>
  );
}
