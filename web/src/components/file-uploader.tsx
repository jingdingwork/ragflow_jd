// https://github.com/sadmann7/file-uploader

'use client';

import { FileText, FolderUp, LucideTrash2, Upload } from 'lucide-react';
import * as React from 'react';
import Dropzone, {
  type DropzoneProps,
  type FileRejection,
} from 'react-dropzone';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useControllableState } from '@/hooks/use-controllable-state';
import { cn, formatBytes } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

function isFileWithPreview(file: File): file is File & { preview: string } {
  return 'preview' in file && typeof file.preview === 'string';
}

// Office/LibreOffice owner-lock and temp files (e.g. "~$report.docx",
// ".~lock.report.docx#"). A Word "~$" file is a ~160-byte lock stub, not a
// zip, so it can never be parsed ("File is not a zip file"). Drop these from
// uploads (especially folder uploads) so they never reach the knowledge base.
function isTempOrLockFile(name: string): boolean {
  const base = (name || '').split(/[\\/]/).pop() || '';
  return base.startsWith('~$') || base.startsWith('.~lock.');
}

interface FileCardProps {
  file: File;
  onRemove: () => void;
  progress?: number;
  error?: string;
}

interface FilePreviewProps {
  file: File & { preview: string };
}

function FilePreview({ file }: FilePreviewProps) {
  if (file.type.startsWith('image/')) {
    return (
      <img
        src={file.preview}
        alt={file.name}
        width={48}
        height={48}
        loading="lazy"
        className="size-full aspect-square shrink-0 rounded-md object-cover"
      />
    );
  }

  return (
    <FileText className="size-10 text-muted-foreground" aria-hidden="true" />
  );
}

function FileCard({ file, progress, error, onRemove }: FileCardProps) {
  return (
    <div className="relative flex items-center gap-2.5">
      <div className="flex flex-1 gap-2.5 overflow-hidden">
        <div className="w-8">
          {isFileWithPreview(file) ? <FilePreview file={file} /> : null}
        </div>
        <div className="flex flex-col flex-1 gap-2 overflow-hidden">
          <div className="flex flex-col gap-px">
            <Tooltip>
              <TooltipTrigger asChild>
                <p
                  className={cn(
                    'w-fit line-clamp-1 text-sm font-medium text-ellipsis truncate max-w-[370px]',
                    error ? 'text-red-500' : 'text-foreground/80',
                  )}
                >
                  {file.name}
                </p>
              </TooltipTrigger>
              <TooltipContent className="border border-border-button">
                {file.name}
              </TooltipContent>
            </Tooltip>
            {error ? (
              <p className="text-xs text-red-500">{error}</p>
            ) : (
              <p className="text-xs text-text-secondary">
                {formatBytes(file.size)}
              </p>
            )}
          </div>
          {progress ? <Progress value={progress} /> : null}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="delete"
          size="icon"
          className="size-7"
          onClick={onRemove}
        >
          <LucideTrash2 className="size-4" aria-hidden="true" />
          <span className="sr-only">Remove file</span>
        </Button>
      </div>
    </div>
  );
}

interface FileUploaderProps extends Omit<
  React.HTMLAttributes<HTMLDivElement>,
  'title'
> {
  /**
   * Value of the uploader.
   * @type File[]
   * @default undefined
   * @example value={files}
   */
  value?: File[];

  /**
   * Function to be called when the value changes.
   * @type (files: File[]) => void
   * @default undefined
   * @example onValueChange={(files) => setFiles(files)}
   */
  onValueChange?: (files: File[]) => void;

  /**
   * Function to be called when files are uploaded.
   * @type (files: File[]) => Promise<void>
   * @default undefined
   * @example onUpload={(files) => uploadFiles(files)}
   */
  onUpload?: (files: File[]) => Promise<void>;

  /**
   * Progress of the uploaded files.
   * @type Record<string, number> | undefined
   * @default undefined
   * @example progresses={{ "file1.png": 50 }}
   */
  progresses?: Record<string, number>;

  /**
   * Per-file error messages keyed by file name. When present for a file, the
   * card renders the message in red instead of the file size.
   * @type Record<string, string> | undefined
   */
  errors?: Record<string, string>;

  /**
   * Accepted file types for the uploader.
   * @type { [key: string]: string[]}
   * @default
   * ```ts
   * { "image/*": [] }
   * ```
   * @example accept={["image/png", "image/jpeg"]}
   */
  accept?: DropzoneProps['accept'];

  /**
   * Maximum file size for the uploader.
   * @type number | undefined
   * @default 1024 * 1024 * 2 // 2MB
   * @example maxSize={1024 * 1024 * 2} // 2MB
   */
  maxSize?: DropzoneProps['maxSize'];

  /**
   * Maximum number of files for the uploader.
   * @type number | undefined
   * @default 1
   * @example maxFileCount={4}
   */
  maxFileCount?: DropzoneProps['maxFiles'];

  hideDropzoneOnMaxFileCount?: boolean;

  /**
   * Whether the uploader should accept multiple files.
   * @type boolean
   * @default false
   * @example multiple
   */
  multiple?: boolean;

  /**
   * Whether the uploader is disabled.
   * @type boolean
   * @default false
   * @example disabled
   */
  disabled?: boolean;

  title?: React.ReactNode;
  description?: React.ReactNode;
}

export function FileUploader(props: FileUploaderProps) {
  const {
    value: valueProp,
    onValueChange,
    onUpload,
    progresses,
    errors,
    accept = {
      'image/*': [],
    },
    maxSize = 1024 * 1024 * 10000000,
    maxFileCount = 100000000000,
    multiple = false,
    disabled = false,
    hideDropzoneOnMaxFileCount = false,
    className,
    title,
    description,
    ...dropzoneProps
  } = props;
  const { t } = useTranslation();
  const [files, setFiles] = useControllableState({
    prop: valueProp,
    onChange: onValueChange,
  });

  const folderInputRef = React.useRef<HTMLInputElement>(null);

  const reachesMaxFileCount = (files?.length ?? 0) >= maxFileCount;

  const processFiles = React.useCallback(
    (incomingFiles: File[], rejectedFiles: FileRejection[]) => {
      // Drop Office/LibreOffice temp-lock files (e.g. "~$foo.docx") up front so
      // a folder upload never carries them into the knowledge base.
      const skippedTemp = incomingFiles.filter((f) => isTempOrLockFile(f.name));
      const acceptedFiles = incomingFiles.filter(
        (f) => !isTempOrLockFile(f.name),
      );
      if (skippedTemp.length > 0) {
        toast.info(
          t('fileManager.skippedTempFiles', { count: skippedTemp.length }),
        );
      }

      if (!multiple && maxFileCount === 1 && acceptedFiles.length > 1) {
        toast.error('Cannot upload more than 1 file at a time');
        return;
      }

      if ((files?.length ?? 0) + acceptedFiles.length > maxFileCount) {
        toast.error(`Cannot upload more than ${maxFileCount} files`);
        return;
      }

      const newFiles = acceptedFiles.map((file) => {
        const enhancedFile = file as File & { preview?: string };
        Object.defineProperty(enhancedFile, 'preview', {
          value: URL.createObjectURL(file),
          writable: true,
          enumerable: true,
          configurable: true,
        });
        return enhancedFile;
      });

      const updatedFiles = files ? [...files, ...newFiles] : newFiles;

      setFiles(updatedFiles);

      if (rejectedFiles.length > 0) {
        rejectedFiles.forEach(({ file, errors }) => {
          const tooLarge = errors?.some((e) => e.code === 'file-too-large');
          if (tooLarge && maxSize) {
            toast.error(
              t('fileManager.fileTooLarge', {
                name: file.name,
                size: Math.round(maxSize / (1024 * 1024)),
              }),
            );
          } else {
            toast.error(`File ${file.name} was rejected`);
          }
        });
      }

      if (
        onUpload &&
        updatedFiles.length > 0 &&
        updatedFiles.length <= maxFileCount
      ) {
        const target =
          updatedFiles.length > 0 ? `${updatedFiles.length} files` : `file`;

        toast.promise(onUpload(updatedFiles), {
          loading: `Uploading ${target}...`,
          success: () => {
            setFiles([]);
            return `${target} uploaded`;
          },
          error: `Failed to upload ${target}`,
        });
      }
    },
    [files, maxFileCount, maxSize, multiple, onUpload, setFiles, t],
  );

  const onDrop = React.useCallback(
    (acceptedFiles: File[], rejectedFiles: FileRejection[]) => {
      processFiles(acceptedFiles, rejectedFiles);
    },
    [processFiles],
  );

  const handleFolderSelect = React.useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!e.target.files) return;
      const fileList = Array.from(e.target.files);
      processFiles(fileList, []);
      e.target.value = '';
    },
    [processFiles],
  );

  function onRemove(index: number) {
    if (!files) return;
    const newFiles = files.filter((_, i) => i !== index);
    setFiles(newFiles);
    onValueChange?.(newFiles);
  }

  // Revoke preview url when component unmounts
  React.useEffect(() => {
    return () => {
      if (!files) return;
      files.forEach((file) => {
        if (isFileWithPreview(file)) {
          URL.revokeObjectURL(file.preview);
        }
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isDisabled = disabled || (files?.length ?? 0) >= maxFileCount;

  const renderDropzone = (isFolderMode: boolean = false) => {
    const IconComponent = isFolderMode ? FolderUp : Upload;

    return (
      <Dropzone
        onDrop={onDrop}
        accept={isFolderMode ? undefined : accept}
        maxSize={maxSize}
        maxFiles={maxFileCount}
        multiple={maxFileCount > 1 || multiple}
        disabled={isDisabled}
        noClick={isFolderMode}
        noDrag={isFolderMode}
      >
        {({ getRootProps, getInputProps, isDragActive }) => (
          <div
            {...getRootProps()}
            className={cn(
              'group relative grid h-72 w-full cursor-pointer place-items-center rounded-lg border border-dashed border-border-default',
              'px-5 py-2.5 text-center transition hover:bg-bg-card outline-none',
              'focus-visible:border-accent-primary focus-visible:bg-bg-card',
              isDragActive && 'border-border-button',
              isDisabled && 'pointer-events-none opacity-60',
              className,
            )}
            {...dropzoneProps}
          >
            {!isFolderMode && <input {...getInputProps()} />}
            {isDragActive && !isFolderMode ? (
              <div className="flex flex-col items-center justify-center gap-4 sm:px-5">
                <div>
                  <Upload
                    className="size-7 text-text-secondary transition-colors group-hover:text-text-primary"
                    aria-hidden="true"
                  />
                </div>
                <p className="font-medium text-text-secondary">
                  {t('fileManager.dropFilesHere', 'Drop the files here')}
                </p>
              </div>
            ) : (
              <div
                className="flex flex-col items-center justify-center gap-4 sm:px-5"
                onClick={() => {
                  if (isFolderMode && !isDisabled) {
                    folderInputRef.current?.click();
                  }
                }}
              >
                <IconComponent
                  className="size-12 stroke-1 text-text-secondary transition-colors group-hover:text-text-primary"
                  aria-hidden="true"
                />

                <p className="font-medium text-text-secondary">
                  {title ||
                    (isFolderMode
                      ? t('fileManager.uploadFolderTitle', 'Upload Folder')
                      : t('knowledgeDetails.uploadTitle'))}
                </p>

                <p className="text-sm text-text-disabled">
                  {description ||
                    (isFolderMode
                      ? t(
                          'knowledgeDetails.uploadDescription',
                          'Select a folder to upload all files inside',
                        )
                      : t('knowledgeDetails.uploadDescription'))}
                </p>
              </div>
            )}
          </div>
        )}
      </Dropzone>
    );
  };

  return (
    <div className="relative flex flex-col gap-4 overflow-hidden">
      {!(hideDropzoneOnMaxFileCount && reachesMaxFileCount) && (
        <Tabs defaultValue="file" className="w-full">
          <TabsList className="w-fit justify-start">
            <TabsTrigger value="file" className="gap-2">
              <FileText className="size-4" />
              {t('fileManager.files', 'Files')}
            </TabsTrigger>
            <TabsTrigger value="folder" className="gap-2">
              <FolderUp className="size-4" />
              {t('fileManager.folder', 'Folder')}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="file" className="mt-1">
            {renderDropzone(false)}
          </TabsContent>
          <TabsContent value="folder" className="mt-1">
            {renderDropzone(true)}
            <input
              ref={folderInputRef}
              type="file"
              className="hidden"
              multiple
              onChange={handleFolderSelect}
              {...{
                webkitdirectory: '',
                directory: '',
              }}
            />
          </TabsContent>
        </Tabs>
      )}

      {files?.length ? (
        <div className="h-fit w-full">
          <div className="flex max-h-48 flex-col gap-4 overflow-auto scrollbar-auto">
            {files?.map((file, index) => (
              <FileCard
                key={index}
                file={file}
                onRemove={() => onRemove(index)}
                progress={progresses?.[file.name]}
                error={errors?.[file.name]}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
