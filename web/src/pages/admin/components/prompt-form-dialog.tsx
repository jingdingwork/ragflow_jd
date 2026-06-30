import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useMutation, useQuery } from '@tanstack/react-query';

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
import { RAGFlowSelect, RAGFlowSelectOptionType } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';

import {
  DepartmentNode,
  PromptScope,
  PromptTemplate,
  PromptTemplatePayload,
  createPrompt,
  listDepartmentTree,
  updatePrompt,
} from '@/services/admin-service';

type Props = {
  prompt: PromptTemplate | null; // null => create
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
};

const EMPTY: PromptTemplatePayload = {
  name: '',
  scope: 'department',
  department_id: '',
  system: '',
  prologue: '',
  is_default: false,
  sort: 0,
};

function flattenDepartments(
  nodes: DepartmentNode[],
  depth = 0,
  acc: RAGFlowSelectOptionType[] = [],
) {
  for (const node of nodes) {
    acc.push({
      label: `${'  '.repeat(depth)}${node.name}`,
      value: node.id,
    });
    if (node.children?.length)
      flattenDepartments(node.children, depth + 1, acc);
  }
  return acc;
}

export function PromptFormDialog({
  prompt,
  open,
  onOpenChange,
  onSaved,
}: Props) {
  const { t } = useTranslation();
  const [form, setForm] = useState<PromptTemplatePayload>(EMPTY);

  const isEdit = !!prompt;

  const { data: tree } = useQuery({
    queryKey: ['admin/departments/tree'],
    queryFn: async () => (await listDepartmentTree())?.data?.data ?? [],
    enabled: open,
  });

  const departmentOptions = useMemo(
    () => flattenDepartments(tree ?? []),
    [tree],
  );

  useEffect(() => {
    if (!open) return;
    if (!prompt) {
      setForm(EMPTY);
      return;
    }
    setForm({
      name: prompt.name,
      scope: prompt.scope,
      department_id: prompt.department_id ?? '',
      system: prompt.system ?? '',
      prologue: prompt.prologue ?? '',
      is_default: prompt.is_default,
      sort: prompt.sort ?? 0,
    });
  }, [open, prompt]);

  const patch = (p: Partial<PromptTemplatePayload>) =>
    setForm((prev) => ({ ...prev, ...p }));

  const saveMutation = useMutation({
    mutationKey: ['admin/prompts/save', prompt?.id],
    mutationFn: async () => {
      if (!form.name.trim()) {
        message.error(t('admin.promptNameRequired'));
        return undefined;
      }
      if (form.scope === 'department' && !form.department_id) {
        message.error(t('admin.promptDepartmentRequired'));
        return undefined;
      }
      const payload: PromptTemplatePayload = {
        ...form,
        department_id:
          form.scope === 'department' ? form.department_id : undefined,
      };
      const res = isEdit
        ? await updatePrompt(prompt!.id, payload)
        : await createPrompt(payload);
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
            {isEdit ? t('admin.editPrompt') : t('admin.newPrompt')}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[65vh]">
          <div className="space-y-4 pr-3">
            <div className="space-y-2">
              <Label>
                {t('admin.promptName')} <span className="text-red-500">*</span>
              </Label>
              <Input
                value={form.name}
                onChange={(e) => patch({ name: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label>{t('admin.promptScope')}</Label>
              <RadioGroup
                className="flex gap-6"
                value={form.scope}
                onValueChange={(v) => patch({ scope: v as PromptScope })}
              >
                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <RadioGroupItem value="default" />
                  {t('admin.promptScopeDefault')}
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <RadioGroupItem value="all" />
                  {t('admin.promptScopeAll')}
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <RadioGroupItem value="department" />
                  {t('admin.promptScopeDepartment')}
                </label>
              </RadioGroup>
            </div>

            {form.scope === 'department' && (
              <div className="space-y-2">
                <Label>
                  {t('admin.promptDepartment')}{' '}
                  <span className="text-red-500">*</span>
                </Label>
                <RAGFlowSelect
                  value={form.department_id}
                  onChange={(v) => patch({ department_id: v })}
                  options={departmentOptions}
                  placeholder={t('admin.promptDepartmentPlaceholder')}
                />
              </div>
            )}

            <div className="flex items-center justify-between rounded-lg border border-border-default px-3 py-2">
              <div>
                <Label>{t('admin.promptIsDefault')}</Label>
                <p className="text-xs text-text-secondary mt-0.5">
                  {t('admin.promptIsDefaultHint')}
                </p>
              </div>
              <Switch
                checked={form.is_default}
                onCheckedChange={(v) => patch({ is_default: v })}
              />
            </div>

            <div className="space-y-2">
              <Label>{t('admin.promptSystem')}</Label>
              <Textarea
                rows={8}
                placeholder={t('admin.promptSystemPlaceholder')}
                value={form.system}
                onChange={(e) => patch({ system: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label>{t('admin.promptPrologue')}</Label>
              <Textarea
                rows={2}
                placeholder={t('admin.promptProloguePlaceholder')}
                value={form.prologue}
                onChange={(e) => patch({ prologue: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label>{t('admin.promptSort')}</Label>
              <Input
                type="number"
                value={String(form.sort ?? 0)}
                onChange={(e) => patch({ sort: Number(e.target.value) || 0 })}
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

export default PromptFormDialog;
