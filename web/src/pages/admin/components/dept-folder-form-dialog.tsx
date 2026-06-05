import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useMutation, useQuery } from '@tanstack/react-query';

import { LucideCheckCircle2, LucidePlugZap, LucideXCircle } from 'lucide-react';

import { Button, ButtonLoading } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import message from '@/components/ui/message';
import { ScrollArea } from '@/components/ui/scroll-area';
import { RAGFlowSelect, RAGFlowSelectOptionType } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

import {
  DepartmentNode,
  DeptFolder,
  DeptFolderPayload,
  createDeptFolder,
  esListKnowledgebases,
  listDepartmentTree,
  testDeptFolder,
  updateDeptFolder,
} from '@/services/admin-service';

type Props = {
  folder: DeptFolder | null; // null => create
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
};

type FormState = {
  name: string;
  department_id: string;
  kb_id: string;
  root_path: string;
  recursive: boolean;
  allow_images: boolean;
  sync_deleted_files: boolean;
  exclude_dirs: string; // comma-separated in the form
  refresh_freq: number;
};

const EMPTY: FormState = {
  name: '',
  department_id: '',
  kb_id: '',
  root_path: '',
  recursive: true,
  allow_images: false,
  sync_deleted_files: true,
  exclude_dirs: '',
  refresh_freq: 1440,
};

function flattenDepartments(
  nodes: DepartmentNode[],
  depth = 0,
  acc: RAGFlowSelectOptionType[] = [],
) {
  for (const node of nodes) {
    acc.push({ label: `${'  '.repeat(depth)}${node.name}`, value: node.id });
    if (node.children?.length)
      flattenDepartments(node.children, depth + 1, acc);
  }
  return acc;
}

export function DeptFolderFormDialog({
  folder,
  open,
  onOpenChange,
  onSaved,
}: Props) {
  const { t } = useTranslation();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    count?: number;
  } | null>(null);

  const isEdit = !!folder;

  const { data: tree } = useQuery({
    queryKey: ['admin/departments/tree'],
    queryFn: async () => (await listDepartmentTree())?.data?.data ?? [],
    enabled: open,
  });

  const { data: kbs } = useQuery({
    queryKey: ['admin/es/knowledgebases'],
    queryFn: async () => (await esListKnowledgebases())?.data?.data ?? [],
    enabled: open,
  });

  const departmentOptions = useMemo(
    () => flattenDepartments(tree ?? []),
    [tree],
  );

  const kbOptions = useMemo<RAGFlowSelectOptionType[]>(() => {
    const list = kbs ?? [];
    const filtered = form.department_id
      ? list.filter((k) => k.department_id === form.department_id)
      : list;
    return filtered.map((k) => ({
      label: k.department_name ? `${k.name} (${k.department_name})` : k.name,
      value: k.id,
    }));
  }, [kbs, form.department_id]);

  useEffect(() => {
    if (!open) return;
    setTestResult(null);
    if (!folder) {
      setForm(EMPTY);
      return;
    }
    setForm({
      name: folder.name,
      department_id: folder.department_id ?? '',
      kb_id: folder.kb_id ?? '',
      root_path: folder.root_path,
      recursive: folder.recursive,
      allow_images: false,
      sync_deleted_files: folder.sync_deleted_files,
      exclude_dirs: (folder.exclude_dirs ?? []).join(', '),
      refresh_freq: folder.refresh_freq ?? 1440,
    });
  }, [open, folder]);

  const patch = (p: Partial<FormState>) =>
    setForm((prev) => ({ ...prev, ...p }));

  const toExcludeList = (s: string) =>
    s
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);

  const testMutation = useMutation({
    mutationKey: ['admin/dept-folders/test'],
    mutationFn: async () => {
      if (!form.root_path.trim()) {
        message.error(t('admin.deptFolderPathRequired'));
        return undefined;
      }
      return (
        await testDeptFolder({
          root_path: form.root_path.trim(),
          recursive: form.recursive,
          allow_images: form.allow_images,
          exclude_dirs: toExcludeList(form.exclude_dirs),
        })
      )?.data;
    },
    retry: false,
    onSuccess: (data) => {
      if (data?.code === 0 && data.data?.accessible) {
        setTestResult({ ok: true, count: data.data.file_count });
        message.success(t('admin.deptFolderAccessible'));
      } else {
        setTestResult({ ok: false });
      }
    },
    onError: () => setTestResult({ ok: false }),
  });

  const saveMutation = useMutation({
    mutationKey: ['admin/dept-folders/save', folder?.id],
    mutationFn: async () => {
      if (!form.root_path.trim()) {
        message.error(t('admin.deptFolderPathRequired'));
        return undefined;
      }
      if (!isEdit && !form.kb_id) {
        message.error(t('admin.deptFolderKbRequired'));
        return undefined;
      }
      const payload: DeptFolderPayload = {
        name: form.name.trim(),
        root_path: form.root_path.trim(),
        recursive: form.recursive,
        allow_images: form.allow_images,
        sync_deleted_files: form.sync_deleted_files,
        exclude_dirs: toExcludeList(form.exclude_dirs),
        refresh_freq: Number(form.refresh_freq) || 1440,
      };
      if (!isEdit) {
        payload.department_id = form.department_id || undefined;
        payload.kb_id = form.kb_id;
      }
      const res = isEdit
        ? await updateDeptFolder(folder!.id, payload)
        : await createDeptFolder(payload);
      return res?.data;
    },
    retry: false,
    onSuccess: (data) => {
      if (data?.code === 0) {
        message.success(t('admin.saveSuccess'));
        onSaved?.();
        onOpenChange(false);
      }
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t('admin.editDeptFolder') : t('admin.newDeptFolder')}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[65vh]">
          <div className="space-y-4 pr-3">
            <div className="space-y-2">
              <Label>{t('admin.deptFolderName')}</Label>
              <Input
                placeholder={t('admin.deptFolderNamePlaceholder')}
                value={form.name}
                onChange={(e) => patch({ name: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label>{t('admin.deptFolderDepartment')}</Label>
              <RAGFlowSelect
                disabled={isEdit}
                value={form.department_id}
                onChange={(v) => patch({ department_id: v, kb_id: '' })}
                options={departmentOptions}
                placeholder={t('admin.deptFolderDepartmentPlaceholder')}
              />
            </div>

            <div className="space-y-2">
              <Label>
                {t('admin.deptFolderKb')}{' '}
                {!isEdit && <span className="text-red-500">*</span>}
              </Label>
              <RAGFlowSelect
                disabled={isEdit}
                value={form.kb_id}
                onChange={(v) => patch({ kb_id: v })}
                options={kbOptions}
                placeholder={t('admin.deptFolderKbPlaceholder')}
              />
            </div>

            <div className="space-y-2">
              <Label>
                {t('admin.deptFolderPath')}{' '}
                <span className="text-red-500">*</span>
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  className="font-mono"
                  placeholder="/mnt/dept-a"
                  value={form.root_path}
                  onChange={(e) => {
                    patch({ root_path: e.target.value });
                    setTestResult(null);
                  }}
                />
                <ButtonLoading
                  variant="outline"
                  loading={testMutation.isPending}
                  onClick={() => testMutation.mutate()}
                >
                  <LucidePlugZap className="size-4 mr-1" />
                  {t('admin.deptFolderTest')}
                </ButtonLoading>
              </div>
              <p className="text-xs text-text-secondary">
                {t('admin.deptFolderPathHint')}
              </p>
              {testResult && (
                <div
                  className={
                    testResult.ok
                      ? 'flex items-center gap-1.5 text-xs text-emerald-600'
                      : 'flex items-center gap-1.5 text-xs text-red-500'
                  }
                >
                  {testResult.ok ? (
                    <>
                      <LucideCheckCircle2 className="size-3.5" />
                      {t('admin.deptFolderTestOk', { count: testResult.count })}
                    </>
                  ) : (
                    <>
                      <LucideXCircle className="size-3.5" />
                      {t('admin.deptFolderTestFail')}
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>{t('admin.deptFolderExcludeDirs')}</Label>
              <Input
                placeholder="#recycle, .tmp"
                value={form.exclude_dirs}
                onChange={(e) => patch({ exclude_dirs: e.target.value })}
              />
              <p className="text-xs text-text-secondary">
                {t('admin.deptFolderExcludeDirsHint')}
              </p>
            </div>

            <div className="space-y-2">
              <Label>{t('admin.deptFolderRefreshFreq')}</Label>
              <Input
                type="number"
                value={String(form.refresh_freq)}
                onChange={(e) =>
                  patch({ refresh_freq: Number(e.target.value) || 0 })
                }
              />
              <p className="text-xs text-text-secondary">
                {t('admin.deptFolderRefreshFreqHint')}
              </p>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border-default px-3 py-2">
              <div>
                <Label>{t('admin.deptFolderRecursive')}</Label>
                <p className="text-xs text-text-secondary mt-0.5">
                  {t('admin.deptFolderRecursiveHint')}
                </p>
              </div>
              <Switch
                checked={form.recursive}
                onCheckedChange={(v) => patch({ recursive: v })}
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border-default px-3 py-2">
              <div>
                <Label>{t('admin.deptFolderSyncDeleted')}</Label>
                <p className="text-xs text-text-secondary mt-0.5">
                  {t('admin.deptFolderSyncDeletedHint')}
                </p>
              </div>
              <Switch
                checked={form.sync_deleted_files}
                onCheckedChange={(v) => patch({ sync_deleted_files: v })}
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border-default px-3 py-2">
              <div>
                <Label>{t('admin.deptFolderAllowImages')}</Label>
                <p className="text-xs text-text-secondary mt-0.5">
                  {t('admin.deptFolderAllowImagesHint')}
                </p>
              </div>
              <Switch
                checked={form.allow_images}
                onCheckedChange={(v) => patch({ allow_images: v })}
              />
            </div>
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('admin.cancel')}
          </Button>
          <ButtonLoading
            variant="highlighted"
            loading={saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            {t('admin.save')}
          </ButtonLoading>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default DeptFolderFormDialog;
