import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ButtonLoading } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RAGFlowSelect } from '@/components/ui/select';
import { useFetchPromptTemplates } from '@/hooks/use-chat-request';
import { IModalProps } from '@/interfaces/common';

type Props = IModalProps<any> & {
  loading?: boolean;
  onOk: (name: string, promptTemplateId?: string) => void | Promise<unknown>;
};

export function CreateChatDialog({ hideModal, onOk, loading }: Props) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [templateId, setTemplateId] = useState('');
  const { data: templates } = useFetchPromptTemplates();

  const options = useMemo(
    () => templates.map((tpl) => ({ label: tpl.name, value: tpl.id })),
    [templates],
  );

  // Preselect the template flagged as default, otherwise the first one.
  useEffect(() => {
    if (templateId || templates.length === 0) return;
    const preferred = templates.find((tpl) => tpl.is_default) ?? templates[0];
    setTemplateId(preferred.id);
  }, [templates, templateId]);

  const handleOk = () => {
    if (!name.trim()) return;
    onOk(name.trim(), templateId || undefined);
  };

  return (
    <Dialog open onOpenChange={hideModal}>
      <DialogContent
        className="sm:max-w-[480px]"
        data-testid="create-chat-modal"
      >
        <DialogHeader>
          <DialogTitle>{t('chat.createChat')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{t('chat.assistantName')}</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('chat.assistantNameMessage')}
            />
          </div>

          {options.length > 0 && (
            <div className="space-y-2">
              <Label>{t('chat.promptTemplate')}</Label>
              <RAGFlowSelect
                value={templateId}
                onChange={setTemplateId}
                options={options}
                placeholder={t('chat.promptTemplatePlaceholder')}
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <ButtonLoading
            data-testid="create-chat-save"
            loading={loading}
            disabled={!name.trim()}
            onClick={handleOk}
          >
            {t('common.save')}
          </ButtonLoading>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default CreateChatDialog;
