import message from '@/components/ui/message';
import i18n from '@/locales/config';
import {
  createFolder,
  deleteFolder,
  listFolderDocuments,
  listFolders,
  moveDocuments,
  renameFolder,
} from '@/services/knowledge-service';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { get } from 'lodash';
import { useParams } from 'react-router';
import { DocumentApiAction } from './use-document-request';

/** Reserved document-metadata key that stores the virtual folder path.
 * Mirrors backend `common.constants.DOC_FOLDER_META_KEY`. Hidden from the
 * metadata editor / count so users manage folders via the folder UI only. */
export const FOLDER_META_KEY = '_folder';

/** Drop the reserved folder key from a meta_fields object for display. */
export const stripFolderMeta = (
  meta?: Record<string, unknown> | null,
): Record<string, unknown> => {
  if (!meta) return {};
  const rest = { ...meta };
  delete rest[FOLDER_META_KEY];
  return rest;
};

export interface IFolderNode {
  /** Normalized full path, e.g. "合同/2024". Root children have no slash. */
  path: string;
  /** Last path segment (display name). */
  name: string;
  /** Direct document count in this exact folder (not recursive). */
  count: number;
}

/** A direct child folder of the current path, with a recursive doc count. */
export interface IFolderChild extends IFolderNode {
  /** Documents under this folder including all descendants. */
  total: number;
}

export const parentOfPath = (path: string) =>
  path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';

/** Direct children of `current`, each with a rolled-up (recursive) doc count. */
export const getFolderChildren = (
  folders: IFolderNode[],
  current: string,
): IFolderChild[] => {
  const rollup = (path: string) =>
    folders.reduce(
      (sum, n) =>
        n.path === path || n.path.startsWith(`${path}/`) ? sum + n.count : sum,
      0,
    );
  return folders
    .filter((n) => parentOfPath(n.path) === current)
    .map((n) => ({ ...n, total: rollup(n.path) }))
    .sort((a, b) => a.name.localeCompare(b.name));
};

export const enum FolderApiAction {
  FetchFolders = 'fetchFolders',
  FetchFolderDocIds = 'fetchFolderDocIds',
  CreateFolder = 'createFolder',
  RenameFolder = 'renameFolder',
  DeleteFolder = 'deleteFolder',
  MoveDocuments = 'moveDocuments',
}

/** Resolve the given folder paths to every document id under them (recursive),
 * so a folder selection can drive the same batch operations as file rows. */
export const useFolderDocIds = (folderPaths: string[], datasetId?: string) => {
  const { id } = useParams();
  const kbId = datasetId || id;
  // Sort so the query key is stable regardless of selection order.
  const sortedPaths = [...folderPaths].sort();

  const { data, isFetching: loading } = useQuery<string[]>({
    queryKey: [FolderApiAction.FetchFolderDocIds, kbId, sortedPaths],
    initialData: [],
    enabled: !!kbId && sortedPaths.length > 0,
    queryFn: async () => {
      const ret = await listFolderDocuments(kbId!, sortedPaths);
      if (get(ret, 'data.code') === 0) {
        return get(ret, 'data.data.doc_ids', []);
      }
      return [];
    },
  });

  return { folderDocIds: sortedPaths.length > 0 ? (data ?? []) : [], loading };
};

export const useFetchFolders = (datasetId?: string) => {
  const { id } = useParams();
  const kbId = datasetId || id;

  const { data, isFetching: loading } = useQuery<IFolderNode[]>({
    queryKey: [FolderApiAction.FetchFolders, kbId],
    initialData: [],
    enabled: !!kbId,
    queryFn: async () => {
      const ret = await listFolders(kbId!);
      if (get(ret, 'data.code') === 0) {
        return get(ret, 'data.data.folders', []);
      }
      return [];
    },
  });

  return { folders: data, loading };
};

export const useCreateFolder = () => {
  const queryClient = useQueryClient();
  const { id: datasetId } = useParams();
  const { mutateAsync, isPending: loading } = useMutation({
    mutationKey: [FolderApiAction.CreateFolder],
    mutationFn: async (path: string) => {
      const { data } = await createFolder(datasetId!, path);
      if (data.code === 0) {
        message.success(i18n.t('message.created'));
        queryClient.invalidateQueries({
          queryKey: [FolderApiAction.FetchFolders, datasetId],
        });
      }
      return data.code;
    },
  });
  return { createFolder: mutateAsync, loading };
};

export const useRenameFolder = () => {
  const queryClient = useQueryClient();
  const { id: datasetId } = useParams();
  const { mutateAsync, isPending: loading } = useMutation({
    mutationKey: [FolderApiAction.RenameFolder],
    mutationFn: async ({
      oldPath,
      newPath,
    }: {
      oldPath: string;
      newPath: string;
    }) => {
      const { data } = await renameFolder(datasetId!, oldPath, newPath);
      if (data.code === 0) {
        message.success(i18n.t('message.modified'));
        queryClient.invalidateQueries({
          queryKey: [FolderApiAction.FetchFolders, datasetId],
        });
        queryClient.invalidateQueries({
          queryKey: [DocumentApiAction.FetchDocumentList],
        });
      }
      return data.code;
    },
  });
  return { renameFolder: mutateAsync, loading };
};

export const useDeleteFolder = () => {
  const queryClient = useQueryClient();
  const { id: datasetId } = useParams();
  const { mutateAsync, isPending: loading } = useMutation({
    mutationKey: [FolderApiAction.DeleteFolder],
    mutationFn: async (path: string) => {
      const { data } = await deleteFolder(datasetId!, path);
      if (data.code === 0) {
        message.success(i18n.t('message.deleted'));
        queryClient.invalidateQueries({
          queryKey: [FolderApiAction.FetchFolders, datasetId],
        });
        // Documents under the folder were deleted too — refresh the file list.
        queryClient.invalidateQueries({
          queryKey: [DocumentApiAction.FetchDocumentList],
        });
      }
      return data.code;
    },
  });
  return { deleteFolder: mutateAsync, loading };
};

export const useMoveDocuments = () => {
  const queryClient = useQueryClient();
  const { id: datasetId } = useParams();
  const { mutateAsync, isPending: loading } = useMutation({
    mutationKey: [FolderApiAction.MoveDocuments],
    mutationFn: async ({
      docIds,
      targetPath,
    }: {
      docIds: string[];
      targetPath: string;
    }) => {
      const { data } = await moveDocuments(datasetId!, docIds, targetPath);
      if (data.code === 0) {
        message.success(i18n.t('message.operated'));
        queryClient.invalidateQueries({
          queryKey: [FolderApiAction.FetchFolders, datasetId],
        });
        queryClient.invalidateQueries({
          queryKey: [DocumentApiAction.FetchDocumentList],
        });
      }
      return data.code;
    },
  });
  return { moveDocuments: mutateAsync, loading };
};
