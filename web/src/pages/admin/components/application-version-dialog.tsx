import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useMutation, useQuery } from '@tanstack/react-query';

import {
  LucideCheck,
  LucideStar,
  LucideTrash2,
  LucideUpload,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button, ButtonLoading } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import message from '@/components/ui/message';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';

import {
  addApplicationVersion,
  deleteApplicationVersion,
  getApplication,
  setLatestApplicationVersion,
} from '@/services/admin-service';

type Props = {
  applicationId: string | null;
  applicationName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
};

const MAX_SIZE = 1024 * 1024 * 1024; // 1GB

function formatSize(bytes: number | null) {
  if (!bytes) return '-';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
  return `${mb.toFixed(2)} MB`;
}

export function ApplicationVersionDialog({
  applicationId,
  applicationName,
  open,
  onOpenChange,
  onSaved,
}: Props) {
  const { t } = useTranslation();
  const [version, setVersion] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setVersion('');
      setDescription('');
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [open, applicationId]);

  const { data: detail, refetch } = useQuery({
    queryKey: ['admin/applications/detail', applicationId],
    enabled: open && !!applicationId,
    queryFn: async () => {
      const res = await getApplication(applicationId as string);
      return res?.data?.data;
    },
  });

  const versions = detail?.versions ?? [];

  const uploadMutation = useMutation({
    mutationKey: ['admin/applications/upload-version', applicationId],
    mutationFn: async () => {
      if (!applicationId) return undefined;
      if (!version.trim()) {
        message.error(t('admin.appVersionRequired'));
        return undefined;
      }
      if (!file) {
        message.error(t('admin.appPackageRequired'));
        return undefined;
      }
      if (file.size > MAX_SIZE) {
        message.error(t('admin.appPackageTooLarge'));
        return undefined;
      }
      const res = await addApplicationVersion(applicationId, {
        version: version.trim(),
        description,
        file,
      });
      return res?.data;
    },
    retry: false,
    onSuccess: (data) => {
      if (data?.code === 0) {
        message.success(t('admin.saveSuccess'));
        setVersion('');
        setDescription('');
        setFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
        refetch();
        onSaved?.();
      }
    },
  });

  const deleteMutation = useMutation({
    mutationKey: ['admin/applications/delete-version', applicationId],
    mutationFn: async (versionId: string) => {
      if (!applicationId) return undefined;
      const res = await deleteApplicationVersion(applicationId, versionId);
      return res?.data;
    },
    retry: false,
    onSuccess: (data) => {
      if (data?.code === 0) {
        message.success(t('admin.deleteSuccess'));
        refetch();
        onSaved?.();
      }
    },
  });

  const latestMutation = useMutation({
    mutationKey: ['admin/applications/set-latest', applicationId],
    mutationFn: async (versionId: string) => {
      if (!applicationId) return undefined;
      const res = await setLatestApplicationVersion(applicationId, versionId);
      return res?.data;
    },
    retry: false,
    onSuccess: (data) => {
      if (data?.code === 0) {
        message.success(t('admin.saveSuccess'));
        refetch();
        onSaved?.();
      }
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {t('admin.versionManagement')} · {applicationName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Upload new version */}
          <div className="border border-border-default rounded-lg p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>
                  {t('admin.appVersion')}{' '}
                  <span className="text-red-500">*</span>
                </Label>
                <Input
                  placeholder="1.0.0"
                  value={version}
                  onChange={(e) => setVersion(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>
                  {t('admin.appPackage')}{' '}
                  <span className="text-red-500">*</span>
                </Label>
                <Input
                  ref={fileInputRef}
                  type="file"
                  accept=".exe,.msi,.zip"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t('admin.appVersionNotes')}</Label>
              <Textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-text-secondary">
                {t('admin.appPackageSizeHint')}
              </span>
              <ButtonLoading
                variant="highlighted"
                size="sm"
                loading={uploadMutation.isPending}
                onClick={() => uploadMutation.mutate()}
              >
                <LucideUpload className="size-4 mr-1" />
                {t('admin.uploadVersion')}
              </ButtonLoading>
            </div>
          </div>

          {/* Existing versions */}
          <ScrollArea className="h-64 border border-border-default rounded-lg">
            {versions.length === 0 ? (
              <div className="text-text-secondary text-sm p-4 text-center">
                {t('admin.noVersions')}
              </div>
            ) : (
              <ul className="divide-y divide-border-default">
                {versions.map((v) => (
                  <li key={v.id} className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{v.version}</span>
                      {v.is_latest && (
                        <Badge
                          variant="default"
                          className="bg-[#F39800] hover:bg-[#F39800]"
                        >
                          {t('admin.latestVersion')}
                        </Badge>
                      )}
                      <span className="text-xs text-text-secondary ml-auto">
                        {formatSize(v.file_size)}
                      </span>
                    </div>
                    <div className="text-xs text-text-secondary mt-1 truncate">
                      {v.file_name} · {v.create_date}
                    </div>
                    {v.description && (
                      <div className="text-xs text-text-secondary mt-1 whitespace-pre-wrap">
                        {v.description}
                      </div>
                    )}
                    <div className="flex items-center gap-2 mt-2">
                      {!v.is_latest && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={latestMutation.isPending}
                          onClick={() => latestMutation.mutate(v.id)}
                        >
                          <LucideStar className="size-3.5 mr-1" />
                          {t('admin.setLatest')}
                        </Button>
                      )}
                      {v.is_latest && (
                        <span className="text-xs text-green-600 flex items-center">
                          <LucideCheck className="size-3.5 mr-1" />
                          {t('admin.currentVersion')}
                        </span>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        className="ml-auto text-red-500 hover:text-red-600"
                        disabled={deleteMutation.isPending}
                        onClick={() => deleteMutation.mutate(v.id)}
                      >
                        <LucideTrash2 className="size-3.5 mr-1" />
                        {t('admin.delete')}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default ApplicationVersionDialog;
