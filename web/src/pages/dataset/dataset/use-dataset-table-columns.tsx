import { FileIcon } from '@/components/icon-font';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useNavigatePage } from '@/hooks/logic-hooks/navigate-hooks';
import { useSetDocumentStatus } from '@/hooks/use-document-request';
import { FOLDER_META_KEY } from '@/hooks/use-folder-request';
import { IDocumentInfo } from '@/interfaces/database/document';
import { cn } from '@/lib/utils';
import { formatDate } from '@/utils/date';
import { ColumnDef } from '@tanstack/table-core';
import { ArrowUpDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { MetadataType } from '../components/metedata/constant';
import { ShowManageMetadataModalProps } from '../components/metedata/interface';
import { DatasetActionCell } from './dataset-action-cell';
import { ParseDropdownButton, ParsingStatusCell } from './parsing-status-cell';
import { UseChangeDocumentParserShowType } from './use-change-document-parser';
import { UseRenameDocumentShowType } from './use-rename-document';
import { isSharedFolderDocument } from './utils';

type UseDatasetTableColumnsType = UseChangeDocumentParserShowType &
  UseRenameDocumentShowType & {
    showLog: (record: IDocumentInfo) => void;
    showManageMetadataModal: (config: ShowManageMetadataModalProps) => void;
    datasetId?: string;
    // When false, the user may only view: hide selection/parse/edit actions.
    canManage?: boolean;
    // When true, the KB blocks file downloads: hide the download action.
    downloadDisabled?: boolean;
    // Visible, non-empty folder rows the header "select all" should also cover.
    selectableFolderPaths?: string[];
    selectedFolderPaths?: string[];
    onSelectAllFolders?: (checked: boolean, paths: string[]) => void;
  };

export function useDatasetTableColumns({
  showChangeParserModal,
  showRenameModal,
  showManageMetadataModal,
  showLog,
  datasetId,
  canManage = true,
  downloadDisabled = false,
  selectableFolderPaths = [],
  selectedFolderPaths = [],
  onSelectAllFolders,
}: UseDatasetTableColumnsType) {
  const { t } = useTranslation('translation', {
    keyPrefix: 'knowledgeDetails',
  });
  // const { dataSourceInfo } = useDataSourceInfo();
  const { navigateToChunkParsedResult } = useNavigatePage();
  const { setDocumentStatus } = useSetDocumentStatus();

  const columns: ColumnDef<IDocumentInfo>[] = [
    {
      id: 'select',
      header: ({ table }) => {
        const hasRows = table.getRowModel().rows.length > 0;
        const hasFolders = selectableFolderPaths.length > 0;
        const rowsAll = table.getIsAllPageRowsSelected();
        const rowsSome = table.getIsSomePageRowsSelected();
        const foldersAll =
          hasFolders &&
          selectableFolderPaths.every((p) => selectedFolderPaths.includes(p));
        const foldersSome = selectableFolderPaths.some((p) =>
          selectedFolderPaths.includes(p),
        );
        // Checked only when every selectable file row AND folder row is on;
        // indeterminate when a partial mix is selected.
        const allChecked =
          (hasRows || hasFolders) &&
          (!hasRows || rowsAll) &&
          (!hasFolders || foldersAll);
        const someChecked = rowsAll || rowsSome || foldersAll || foldersSome;
        return (
          <Checkbox
            checked={allChecked ? true : someChecked ? 'indeterminate' : false}
            onCheckedChange={(value) => {
              table.toggleAllPageRowsSelected(!!value);
              onSelectAllFolders?.(!!value, selectableFolderPaths);
            }}
            aria-label="Select all"
          />
        );
      },
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
        />
      ),
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: 'name',
      header: ({ column }) => {
        return (
          <div className="flex items-center gap-1">
            {t('name')}

            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() =>
                column.toggleSorting(column.getIsSorted() === 'asc')
              }
            >
              <ArrowUpDown />
            </Button>
          </div>
        );
      },
      meta: { cellClassName: 'max-w-[20vw]' },
      cell: ({ row }) => {
        const name: string = row.getValue('name');

        return (
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className="flex items-center gap-2 cursor-pointer"
                onClick={navigateToChunkParsedResult(
                  row.original.id,
                  row.original.dataset_id,
                )}
              >
                <FileIcon name={name}></FileIcon>
                <span className={cn('truncate')}>{name}</span>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>{name}</p>
            </TooltipContent>
          </Tooltip>
        );
      },
    },
    {
      accessorKey: 'create_time',
      header: ({ column }) => {
        return (
          <div className="flex items-center gap-1">
            {t('uploadDate')}

            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() =>
                column.toggleSorting(column.getIsSorted() === 'asc')
              }
            >
              <ArrowUpDown />
            </Button>
          </div>
        );
      },
      cell: ({ row }) => (
        <time
          className="lowercase"
          dateTime={new Date(row.getValue('create_time')).toISOString()}
        >
          {formatDate(row.getValue('create_time'))}
        </time>
      ),
    },
    /*
    {
      accessorKey: 'source_from',
      header: t('source'),
      cell: ({ row }) => (
        <div className="text-text-primary">
          {row.original.source_type === 'local' ||
          row.original.source_type === '' ? (
            <div className="bg-accent-primary-5 w-6 h-6 rounded-full flex items-center justify-center">
              <MonitorUp className="text-accent-primary" size={16} />
            </div>
          ) : (
            <div className="w-6 h-6 flex items-center justify-center">
              {
                dataSourceInfo[
                  row.original.source_type as keyof typeof dataSourceInfo
                ]?.icon
              }
            </div>
          )}
        </div>
      ),
    },
    */
    {
      accessorKey: 'status',
      header: t('enabled'),
      cell: ({ row }) => {
        const id = row.original.id;
        return (
          <Switch
            checked={row.getValue('status') === '1'}
            disabled={
              !canManage || isSharedFolderDocument(row.original.source_type)
            }
            onCheckedChange={(e) => {
              setDocumentStatus({ status: e, documentId: id, datasetId });
            }}
          />
        );
      },
    },
    {
      accessorKey: 'chunk_count',
      header: t('chunkNumber'),
      cell: ({ row }) => (
        <div className="capitalize">{row.getValue('chunk_count')}</div>
      ),
    },
    {
      accessorKey: 'meta_fields',
      header: t('metadata.metadata'),
      cell: ({ row }) => {
        // Exclude the reserved virtual-folder key from the user-facing count.
        const length = Object.keys(row.getValue('meta_fields') || {}).filter(
          (k) => k !== FOLDER_META_KEY,
        ).length;
        return (
          <Button
            variant="static"
            size="auto"
            disabled={!canManage}
            onClick={() => {
              showManageMetadataModal({
                // metadata: util.JSONToMetaDataTableData(
                //   row.original.meta_fields || {},
                // ),
                isEditField: false,
                isCanAdd: true,
                isAddValue: true,
                type: MetadataType.UpdateSingle,
                record: row.original,
                title: (
                  <div className="flex flex-col gap-2 w-full">
                    <div className="text-base font-normal">
                      {t('metadata.editMetadata')}
                    </div>
                    {/* <div className="text-sm text-text-secondary w-full truncate">
                      {t('metadata.editMetadataForDataset')}
                      {row.original.name}
                    </div> */}
                  </div>
                ),
                secondTitle: (
                  <div className="w-full flex gap-1 text-sm text-text-secondary">
                    <FileIcon name={row.original.name}></FileIcon>
                    <div className="truncate">{row.original.name}</div>
                  </div>
                ),
                isDeleteSingleValue: true,
                documentIds: [row.original.id],
              });
            }}
          >
            {length + ' fields'}
          </Button>
        );
      },
    },
    {
      accessorKey: 'run',
      header: t('Parse'),
      // meta: { cellClassName: 'min-w-[20vw]' },
      cell: ({ row }) => {
        return (
          <ParseDropdownButton
            record={row.original}
            showChangeParserModal={showChangeParserModal}
          />
        );
      },
    },
    {
      id: 'run-status',
      header: '',
      cell: ({ row }) => {
        return (
          <ParsingStatusCell
            record={row.original}
            showChangeParserModal={showChangeParserModal}
            showLog={showLog}
          />
        );
      },
    },
    {
      id: 'actions',
      header: t('action'),
      enableHiding: false,
      cell: ({ row }) => {
        const record = row.original;

        return (
          <DatasetActionCell
            record={record}
            showRenameModal={showRenameModal}
            canManage={canManage}
            downloadDisabled={downloadDisabled}
          />
        );
      },
    },
  ];

  if (canManage) {
    return columns;
  }
  // Read-only users: drop the bulk-select checkbox column and the Parse
  // (trigger parsing) column. They keep view/download and the run-status display.
  return columns.filter(
    (c) =>
      c.id !== 'select' &&
      (c as { accessorKey?: string }).accessorKey !== 'run',
  );
}
