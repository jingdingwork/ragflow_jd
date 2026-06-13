import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import message from '@/components/ui/message';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { DatasetMetadata } from '@/constants/chat';
import { useSetModalState } from '@/hooks/common-hooks';
import { useFetchChat, useUpdateChat } from '@/hooks/use-chat-request';
import { cn } from '@/lib/utils';
import {
  removeUselessFieldsFromValues,
  setLLMSettingEnabledValues,
} from '@/utils/form';
import { zodResolver } from '@hookform/resolvers/zod';
import { isEmpty, omit } from 'lodash';
import { LucidePanelRightClose, LucideSettings } from 'lucide-react';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { z } from 'zod';
import ChatBasicSetting from './chat-basic-settings';
import { ChatModelSettings } from './chat-model-settings';
import { ChatPromptEngine } from './chat-prompt-engine';
import { SavingButton } from './saving-button';
import { useChatSettingSchema } from './use-chat-setting-schema';

type ChatSettingsProps = { hasSingleChatBox: boolean };

// Complete set of defaults for every required schema field. The chat returned by
// the backend may omit some of these (e.g. a silently-created default chat), and
// `form.reset` replaces the whole form — so we always merge these underneath the
// server data to avoid leaving required fields `undefined` (which surfaces as a
// "Required" validation error that blocks Save).
const DEFAULT_FORM_VALUES = {
  name: '',
  icon: '',
  description: '',
  dataset_ids: [],
  llm_setting: {},
  prompt_config: {
    quote: true,
    keyword: false,
    tts: false,
    use_kg: false,
    refine_multiturn: true,
    system: '',
    parameters: [],
    reasoning: false,
    cross_languages: [],
    toc_enhance: false,
    reference_metadata: {
      include: false,
      fields: undefined,
    },
  },
  top_n: 8,
  similarity_threshold: 0.2,
  vector_similarity_weight: 0.2,
  top_k: 1024,
  meta_data_filter: {
    method: DatasetMetadata.Disabled,
    manual: [],
  },
};

// Walk a react-hook-form errors tree and return the first error as `field: message`,
// so a generic "Required" still tells the user (and us) which field is at fault.
function findFirstErrorMessage(
  errors: any,
  path: string[] = [],
): string | undefined {
  if (!errors || typeof errors !== 'object') return undefined;
  if (typeof errors.message === 'string' && errors.message) {
    const field = path.join('.');
    return field ? `${field}: ${errors.message}` : errors.message;
  }
  for (const key of Object.keys(errors)) {
    if (key === 'ref' || key === 'type' || key === 'message') continue;
    const nested = findFirstErrorMessage(errors[key], [...path, key]);
    if (nested) return nested;
  }
  return undefined;
}

export function ChatSettings({ hasSingleChatBox }: ChatSettingsProps) {
  const formSchema = useChatSettingSchema();
  const { data } = useFetchChat();
  const { updateChat, loading } = useUpdateChat();
  const { id } = useParams();
  const { t } = useTranslation();

  const { visible: settingVisible, switchVisible: switchSettingVisible } =
    useSetModalState(false);

  type FormSchemaType = z.infer<typeof formSchema>;

  const form = useForm<FormSchemaType>({
    resolver: zodResolver(formSchema),
    shouldUnregister: false,
    defaultValues: DEFAULT_FORM_VALUES as unknown as FormSchemaType,
  });

  async function onSubmit(values: FormSchemaType) {
    const nextValues: Record<string, any> = removeUselessFieldsFromValues(
      values,
      'llm_setting.',
    );
    const referenceMetadata = nextValues?.prompt_config?.reference_metadata;
    if (
      referenceMetadata &&
      Array.isArray(referenceMetadata.fields) &&
      referenceMetadata.fields.length === 0
    ) {
      referenceMetadata.fields = undefined;
    }

    updateChat({
      chatId: id!,
      params: {
        ...omit(data, [
          'operator_permission',
          'tenant_id',
          'created_by',
          'create_time',
          'create_date',
          'update_time',
          'update_date',
          'id',
        ]),
        ...nextValues,
      },
    });
  }

  function onInvalid(errors: any) {
    // Surface the first validation error instead of silently swallowing it,
    // otherwise the Save button looks dead when a required field is missing.
    const firstError = findFirstErrorMessage(errors);
    message.error(firstError || t('chat.saveValidationFailed'));
  }

  useEffect(() => {
    const llmSettingEnabledValues = setLLMSettingEnabledValues(
      data.llm_setting,
    );
    const referenceMetadata = data?.prompt_config?.reference_metadata;
    const normalizedReferenceMetadata =
      referenceMetadata &&
      Array.isArray(referenceMetadata.fields) &&
      referenceMetadata.fields.length === 0
        ? { ...referenceMetadata, fields: undefined }
        : referenceMetadata;

    const nextData = {
      ...DEFAULT_FORM_VALUES,
      ...data,
      prompt_config: {
        ...DEFAULT_FORM_VALUES.prompt_config,
        ...data.prompt_config,
        reference_metadata:
          normalizedReferenceMetadata ??
          DEFAULT_FORM_VALUES.prompt_config.reference_metadata,
      },
      meta_data_filter: {
        ...DEFAULT_FORM_VALUES.meta_data_filter,
        ...(data.meta_data_filter ?? {}),
      },
      llm_setting: {
        ...DEFAULT_FORM_VALUES.llm_setting,
        ...(data.llm_setting ?? {}),
      },
      ...llmSettingEnabledValues,
    };

    if (!isEmpty(data)) {
      form.reset(nextData as FormSchemaType);
    }
  }, [data, form]);

  return (
    <>
      {settingVisible || (
        <div className="p-5">
          <Button
            onClick={switchSettingVisible}
            disabled={!hasSingleChatBox}
            variant={'ghost'}
            size="icon-sm"
            data-testid="chat-settings"
          >
            <LucideSettings />
          </Button>
        </div>
      )}

      <section
        data-testid="chat-detail-settings"
        className={cn(
          'transition-[width] ease-out duration-300 flex-shrink-0 flex flex-col overflow-hidden',
          settingVisible ? 'w-[440px]' : 'w-0',
        )}
      >
        {settingVisible && (
          <>
            <div className="p-5 pb-2 flex justify-between items-center text-base">
              {t('chat.chatSetting')}

              <Button
                variant="transparent"
                size="icon-sm"
                className="border-0"
                onClick={switchSettingVisible}
                data-testid="chat-detail-settings-close"
              >
                <LucidePanelRightClose
                  className="size-4 cursor-pointer"
                  onClick={switchSettingVisible}
                />
              </Button>
            </div>

            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit, onInvalid)}
                className="flex-1 flex flex-col min-h-0"
              >
                <ScrollArea viewportClassName="[&>div]:!block">
                  <section className="p-5 space-y-6 overflow-auto flex-1 min-h-0">
                    <ChatBasicSetting></ChatBasicSetting>
                    <Separator />
                    <ChatPromptEngine></ChatPromptEngine>
                    <Separator />
                    <ChatModelSettings></ChatModelSettings>
                  </section>
                </ScrollArea>

                <div className="p-5 pt-4 space-x-5 text-right">
                  <Button
                    variant={'outline'}
                    onClick={switchSettingVisible}
                    data-testid="chat-detail-settings-cancel"
                  >
                    {t('chat.cancel')}
                  </Button>
                  <SavingButton loading={loading}></SavingButton>
                </div>
              </form>
            </Form>
          </>
        )}
      </section>
    </>
  );
}
