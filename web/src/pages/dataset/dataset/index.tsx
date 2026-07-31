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
import {
  getFolderChildren,
  useFetchFolders,
  useFolderDocIds,
} from '@/hooks/use-folder-request';
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
import { ParseProgressModal } from './parse-progress-modal';
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
    documentUploadProgress,
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

  // Folder selection: selecting a folder row batch-targets all of its files.
  const [selectedFolderPaths, setSelectedFolderPaths] = useState<string[]>([]);
  const toggleFolderSelect = useCallback((path: string, checked: boolean) => {
    setSelectedFolderPaths((prev) =>
      checked ? [...prev, path] : prev.filter((p) => p !== path),
    );
  }, []);
  const clearFolderSelection = useCallback(
    () => setSelectedFolderPaths([]),
    [],
  );
  // "Select all" in the table header also toggles the visible folder rows, so a
  // whole-page select covers subfolders (and their files) too.
  const selectAllFolders = useCallback((checked: boolean, paths: string[]) => {
    setSelectedFolderPaths(checked ? paths : []);
  }, []);
  // Prune selections whose folder rows no longer exist (e.g. after navigating).
  useEffect(() => {
    setSelectedFolderPaths((prev) => {
      const valid = prev.filter((p) =>
        folderChildren.some((c) => c.path === p),
      );
      return valid.length === prev.length ? prev : valid;
    });
  }, [folderChildren]);
  const { folderDocIds } = useFolderDocIds(selectedFolderPaths);

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

  // A search keyword or any active filter switches the list to a flat,
  // whole-KB view (the backend drops folder scoping in that case), so hide the
  // folder rows and surface the matching files directly instead of behind them.
  const hasActiveQuery = useMemo(() => {
    if (searchString && searchString.trim()) return true;
    return Object.values(filterValue || {}).some((v) =>
      Array.isArray(v)
        ? v.length > 0
        : v && typeof v === 'object'
          ? Object.keys(v).length > 0
          : Boolean(v),
    );
  }, [searchString, filterValue]);

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

  const { rowSelection, setRowSelection } = useRowSelection();

  const {
    chunkNum,
    hasUnknownChunks,
    list,
    visible: reparseDialogVisible,
    hideModal: hideReparseDialogModal,
    handleRunClick: handleOperationIconClick,
    runProgress,
  } = useBulkOperateDataset({
    documents,
    rowSelection,
    setRowSelection,
    extraDocIds: folderDocIds,
    clearExtraSelection: clearFolderSelection,
  });

  const { selectedIds: rowSelectedKeys } = useSelectedIds(
    rowSelection,
    documents,
  );
  // Individually-checked rows ∪ files under the checked folders.
  const selectedRowKeys = useMemo(
    () => Array.from(new Set([...rowSelectedKeys, ...folderDocIds])),
    [rowSelectedKeys, folderDocIds],
  );
  const effectiveCount = selectedRowKeys.length;

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
            count: effectiveCount,
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
          {canManage && effectiveCount > 0 && (
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

        {effectiveCount > 0 && (
          <BulkOperateBar
            className="!mt-2.5 !-mb-2.5"
            list={updatedList as BulkOperateItemType[]}
            count={effectiveCount}
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
          selectedFolderPaths={selectedFolderPaths}
          onToggleFolderSelect={toggleFolderSelect}
          onSelectAllFolders={selectAllFolders}
          hasActiveQuery={hasActiveQuery}
        />

        {moveOpen && (
          <MoveToFolderDialog
            docIds={selectedRowKeys}
            folders={folders}
            hideModal={() => setMoveOpen(false)}
            onMoved={() => {
              setRowSelection({});
              clearFolderSelection();
            }}
          />
        )}
        {documentUploadVisible && (
          <FileUploadDialog
            hideModal={hideDocumentUploadModal}
            onOk={onDocumentUploadOk}
            loading={documentUploadLoading}
            progress={documentUploadProgress}
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
              clearFolderSelection();
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
              chunkNum === 0 &&
              !hasUnknownChunks &&
              !knowledgeBase?.parser_config?.enable_metadata
            }
            // hidden={false}
            enable_metadata={knowledgeBase?.parser_config?.enable_metadata}
            handleOperationIconClick={handleOperationIconClick}
            chunk_num={chunkNum}
            visible={reparseDialogVisible}
            hideModal={hideReparseDialogModal}
          ></ReparseDialog>
        )}
        <ParseProgressModal progress={runProgress} />
      </CardContent>
    </Card>
  );
}
