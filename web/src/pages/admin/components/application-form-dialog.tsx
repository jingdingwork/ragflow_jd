import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useMutation } from '@tanstack/react-query';

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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';

import {
  Application,
  ApplicationPayload,
  createApplication,
  getApplication,
  updateApplication,
} from '@/services/admin-service';

import { DepartmentTreeSelect } from './department-tree-select';

type Props = {
  application: Application | null; // null => create
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
};

const EMPTY: ApplicationPayload = {
  name: '',
  description: '',
  app_type: 'web',
  url: '',
  visibility: 'dept',
  sort: 0,
  department_ids: [],
};

export function ApplicationFormDialog({
  application,
  open,
  onOpenChange,
  onSaved,
}: Props) {
  const { t } = useTranslation();
  const [form, setForm] = useState<ApplicationPayload>(EMPTY);

  const isEdit = !!application;

  useEffect(() => {
    if (!open) return;
    if (!application) {
      setForm(EMPTY);
      return;
    }
    // Load full detail to populate department_ids.
    setForm({
      name: application.name,
      description: application.description ?? '',
      app_type: application.app_type,
      url: application.url ?? '',
      visibility: application.visibility,
      sort: application.sort ?? 0,
      department_ids: application.department_ids ?? [],
    });
    getApplication(application.id).then((res) => {
      const d = res?.data?.data;
      if (d) {
        setForm({
          name: d.name,
          description: d.description ?? '',
          app_type: d.app_type,
          url: d.url ?? '',
          visibility: d.visibility,
          sort: d.sort ?? 0,
          department_ids: d.department_ids ?? [],
        });
      }
    });
  }, [open, application]);

  const patch = (p: Partial<ApplicationPayload>) =>
    setForm((prev) => ({ ...prev, ...p }));

  const saveMutation = useMutation({
    mutationKey: ['admin/applications/save', application?.id],
    mutationFn: async () => {
      if (!form.name.trim()) {
        message.error(t('admin.appNameRequired'));
        return undefined;
      }
      if (form.app_type === 'web' && !(form.url ?? '').trim()) {
        message.error(t('admin.appUrlRequired'));
        return undefined;
      }
      const payload: ApplicationPayload = {
        ...form,
        department_ids: form.visibility === 'dept' ? form.department_ids : [],
      };
      const res = isEdit
        ? await updateApplication(application!.id, payload)
        : await createApplication(payload);
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
            {isEdit ? t('admin.editApplication') : t('admin.newApplication')}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[65vh]">
          <div className="space-y-4 pr-3">
            <div className="space-y-2">
              <Label>
                {t('admin.appName')} <span className="text-red-500">*</span>
              </Label>
              <Input
                value={form.name}
                onChange={(e) => patch({ name: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label>{t('admin.appDescription')}</Label>
              <Textarea
                rows={2}
                value={form.description}
                onChange={(e) => patch({ description: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label>{t('admin.appType')}</Label>
              <RadioGroup
                className="flex gap-6"
                value={form.app_type}
                onValueChange={(v) => patch({ app_type: v as 'web' | 'exe' })}
              >
                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <RadioGroupItem value="web" />
                  {t('admin.appTypeWeb')}
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <RadioGroupItem value="exe" />
                  {t('admin.appTypeExe')}
                </label>
              </RadioGroup>
            </div>

            {form.app_type === 'web' ? (
              <div className="space-y-2">
                <Label>
                  {t('admin.appUrl')} <span className="text-red-500">*</span>
                </Label>
                <Input
                  placeholder="https://app.example.com"
                  value={form.url}
                  onChange={(e) => patch({ url: e.target.value })}
                />
              </div>
            ) : (
              <p className="text-xs text-text-secondary">
                {isEdit
                  ? t('admin.appExeManageHint')
                  : t('admin.appExeCreateHint')}
              </p>
            )}

            <div className="space-y-2">
              <Label>{t('admin.appSort')}</Label>
              <Input
                type="number"
                value={String(form.sort ?? 0)}
                onChange={(e) => patch({ sort: Number(e.target.value) || 0 })}
              />
            </div>

            <div className="space-y-2">
              <Label>{t('admin.appVisibility')}</Label>
              <RadioGroup
                className="flex gap-6"
                value={form.visibility}
                onValueChange={(v) =>
                  patch({ visibility: v as 'all' | 'dept' })
                }
              >
                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <RadioGroupItem value="all" />
                  {t('admin.appVisibilityAll')}
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <RadioGroupItem value="dept" />
                  {t('admin.appVisibilityDept')}
                </label>
              </RadioGroup>
            </div>

            {form.visibility === 'dept' && (
              <DepartmentTreeSelect
                value={form.department_ids ?? []}
                onChange={(ids) => patch({ department_ids: ids })}
              />
            )}
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

export default ApplicationFormDialog;
