import {
  ConfirmDeleteDialog,
  ConfirmDeleteDialogNode,
} from '@/components/confirm-delete-dialog';
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
import { RAGFlowSelect } from '@/components/ui/select';
import {
  useCreatePromptTemplate,
  useDeletePromptTemplate,
  useFetchPromptTemplates,
} from '@/hooks/use-chat-request';
import { LucideSave, LucideTrash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

const SYSTEM_FIELD = 'prompt_config.system';

// Dropdown above the system-prompt textarea that lets a user apply an
// admin-managed (default / department) prompt or one of their own personal
// prompts, and save the current system text as a reusable personal prompt.
export function SystemPromptTemplates() {
  const { t } = useTranslation();
  const form = useFormContext();
  const { data: templates } = useFetchPromptTemplates();
  const { createPromptTemplate, loading: saving } = useCreatePromptTemplate();
  const { deletePromptTemplate } = useDeletePromptTemplate();

  const [selectedId, setSelectedId] = useState('');
  const [saveOpen, setSaveOpen] = useState(false);
  const [newName, setNewName] = useState('');

  const options = useMemo(
    () => templates.map((tpl) => ({ label: tpl.name, value: tpl.id })),
    [templates],
  );

  const selected = useMemo(
    () => templates.find((tpl) => tpl.id === selectedId),
    [templates, selectedId],
  );

  const handleSelect = (id: string) => {
    setSelectedId(id);
    const tpl = templates.find((item) => item.id === id);
    if (tpl) {
      form.setValue(SYSTEM_FIELD, tpl.system, {
        shouldDirty: true,
        shouldValidate: true,
      });
    }
  };

  const handleSave = async () => {
    const name = newName.trim();
    const system = (form.getValues(SYSTEM_FIELD) || '').trim();
    if (!name) return;
    if (!system) {
      message.warning(t('chat.systemRequiredToSave'));
      return;
    }
    const res = await createPromptTemplate({ name, system });
    if (res?.code === 0) {
      setSaveOpen(false);
      setNewName('');
      if (res?.data?.id) setSelectedId(res.data.id);
    }
  };

  const handleDelete = async () => {
    if (!selected) return;
    await deletePromptTemplate(selected.id);
    setSelectedId('');
  };

  if (options.length === 0) {
    return (
      <PromptToolbar>
        <SaveButton
          onClick={() => setSaveOpen(true)}
          label={t('chat.savePrompt')}
        />
        <SaveDialog
          open={saveOpen}
          onOpenChange={setSaveOpen}
          name={newName}
          setName={setNewName}
          onSave={handleSave}
          saving={saving}
        />
      </PromptToolbar>
    );
  }

  return (
    <PromptToolbar>
      <div className="flex-1 min-w-0">
        <RAGFlowSelect
          value={selectedId}
          onChange={handleSelect}
          options={options}
          placeholder={t('chat.applyPromptTemplate')}
        />
      </div>
      {selected?.scope === 'personal' && (
        <ConfirmDeleteDialog
          title={t('chat.deletePromptTitle')}
          onOk={handleDelete}
          content={{
            node: (
              <ConfirmDeleteDialogNode>
                <span className="text-text-secondary text-xs">
                  {selected.name}
                </span>
              </ConfirmDeleteDialogNode>
            ),
          }}
        >
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            title={t('chat.deletePromptTitle')}
          >
            <LucideTrash2 className="size-4" />
          </Button>
        </ConfirmDeleteDialog>
      )}
      <SaveButton
        onClick={() => setSaveOpen(true)}
        label={t('chat.savePrompt')}
      />
      <SaveDialog
        open={saveOpen}
        onOpenChange={setSaveOpen}
        name={newName}
        setName={setNewName}
        onSave={handleSave}
        saving={saving}
      />
    </PromptToolbar>
  );
}

function PromptToolbar({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-2">{children}</div>;
}

function SaveButton({
  onClick,
  label,
}: {
  onClick: () => void;
  label: string;
}) {
  return (
    <Button type="button" variant="outline" size="sm" onClick={onClick}>
      <LucideSave className="size-4 mr-1" />
      {label}
    </Button>
  );
}

function SaveDialog({
  open,
  onOpenChange,
  name,
  setName,
  onSave,
  saving,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  setName: (name: string) => void;
  onSave: () => void;
  saving: boolean;
}) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>{t('chat.savePromptTitle')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Label>{t('chat.promptName')}</Label>
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('chat.promptNamePlaceholder')}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                onSave();
              }
            }}
          />
        </div>
        <DialogFooter>
          <ButtonLoading
            loading={saving}
            disabled={!name.trim()}
            onClick={onSave}
          >
            {t('common.save')}
          </ButtonLoading>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
