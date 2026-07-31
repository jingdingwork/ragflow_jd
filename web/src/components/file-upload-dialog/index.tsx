import { ButtonLoading } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { IModalProps } from '@/interfaces/common';
import { zodResolver } from '@hookform/resolvers/zod';
import { TFunction } from 'i18next';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { FileUploader } from '../file-uploader';
import { RAGFlowFormItem } from '../ragflow-form';
import { Form } from '../ui/form';
import { Progress } from '../ui/progress';
import { Switch } from '../ui/switch';

function buildUploadFormSchema(t: TFunction) {
  const FormSchema = z.object({
    parseOnCreation: z.boolean().optional(),
    // Update schema to allow files with path property to handle folder uploads
    fileList: z
      .array(
        z.instanceof(File).or(
          z.object({
            file: z.instanceof(File),
            path: z.string(), // Store the relative path for files in folders
          }),
        ),
      )
      .min(1, { message: t('fileManager.pleaseUploadAtLeastOneFile') }),
  });

  return FormSchema;
}

export type UploadFormSchemaType = z.infer<
  ReturnType<typeof buildUploadFormSchema>
>;

const UploadFormId = 'UploadFormId';

// Name of a fileList entry, which may be a bare File or a {file, path} pair
// (folder uploads carry the relative path alongside the File).
function entryName(entry: unknown): string {
  if (entry instanceof File) return entry.name;
  const f = (entry as { file?: File })?.file;
  return f?.name ?? '';
}

type UploadFormProps = {
  submit: (values?: UploadFormSchemaType) => void;
  showParseOnCreation?: boolean;
  fileErrors?: Record<string, string>;
  // When true, the KB has the admin big-file escape hatch on: lift the client
  // per-file cap to the global framework ceiling (1 GB) instead of 100 MB.
  unlimitedSize?: boolean;
};
function UploadForm({
  submit,
  showParseOnCreation,
  fileErrors,
  unlimitedSize,
}: UploadFormProps) {
  const { t } = useTranslation();
  const FormSchema = buildUploadFormSchema(t);

  type UploadFormSchemaType = z.infer<typeof FormSchema>;
  const form = useForm<UploadFormSchemaType>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      parseOnCreation: false,
      fileList: [],
    },
  });

  // After an upload with rejections, drop the files that succeeded (they are
  // already persisted) and keep only the flagged ones, so the user sees just
  // the failures and a re-submit won't duplicate the successful files.
  useEffect(() => {
    if (!fileErrors || Object.keys(fileErrors).length === 0) return;
    const current = form.getValues('fileList') || [];
    const remaining = current.filter((f) => fileErrors[entryName(f)]);
    if (remaining.length !== current.length) {
      form.setValue('fileList', remaining, { shouldValidate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileErrors]);

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(submit)}
        id={UploadFormId}
        className="space-y-4"
      >
        {showParseOnCreation && (
          <RAGFlowFormItem
            name="parseOnCreation"
            label={t('fileManager.parseOnCreation')}
          >
            {(field) => (
              <Switch
                data-testid="parse-on-creation-toggle"
                onCheckedChange={field.onChange}
                checked={field.value}
              />
            )}
          </RAGFlowFormItem>
        )}
        <RAGFlowFormItem name="fileList" label={''}>
          {(field) => (
            <FileUploader
              value={field.value}
              onValueChange={field.onChange}
              accept={{}}
              maxSize={unlimitedSize ? 1024 * 1024 * 1024 : 100 * 1024 * 1024}
              errors={fileErrors}
              data-testid="dataset-upload-dropzone"
            />
          )}
        </RAGFlowFormItem>
      </form>
    </Form>
  );
}

type FileUploadDialogProps = IModalProps<UploadFormSchemaType> &
  Pick<UploadFormProps, 'showParseOnCreation' | 'unlimitedSize'> & {
    // Per-file upload progress; when set and uploading, a progress bar shows
    // how many of the batch have finished (useful for folder uploads).
    progress?: { current: number; total: number } | null;
    // Per-file rejection reasons (filename -> message), e.g. sensitive-word
    // hits; rendered inline next to the flagged file in the list.
    fileErrors?: Record<string, string>;
  };
export function FileUploadDialog({
  hideModal,
  onOk,
  loading,
  showParseOnCreation = false,
  progress,
  fileErrors,
  unlimitedSize,
}: FileUploadDialogProps) {
  const { t } = useTranslation();

  const showProgress = !!loading && !!progress && progress.total > 0;
  const percent = showProgress
    ? Math.round((progress!.current / progress!.total) * 100)
    : 0;

  return (
    <Dialog open onOpenChange={hideModal}>
      <DialogContent data-testid="dataset-upload-modal">
        <DialogHeader>
          <DialogTitle>{t('fileManager.uploadFile')}</DialogTitle>
        </DialogHeader>
        {/* <Tabs defaultValue="account">
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="account">{t('fileManager.local')}</TabsTrigger>
            <TabsTrigger value="password">{t('fileManager.s3')}</TabsTrigger>
          </TabsList>
          <TabsContent value="account">
            <UploadForm
              submit={onOk!}
              showParseOnCreation={showParseOnCreation}
            ></UploadForm>
          </TabsContent>
          <TabsContent value="password">{t('common.comingSoon')}</TabsContent>
        </Tabs> */}
        <UploadForm
          submit={onOk!}
          showParseOnCreation={showParseOnCreation}
          fileErrors={fileErrors}
          unlimitedSize={unlimitedSize}
        />
        {showProgress && (
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-text-secondary">
              <span>{t('fileManager.uploading')}</span>
              <span>
                {progress!.current} / {progress!.total}
              </span>
            </div>
            <Progress value={percent} className="h-2" />
          </div>
        )}
        <DialogFooter>
          <ButtonLoading type="submit" loading={loading} form={UploadFormId}>
            {t('common.save')}
          </ButtonLoading>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
