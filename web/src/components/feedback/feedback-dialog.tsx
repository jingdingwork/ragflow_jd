import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { LucideStar, LucideX } from 'lucide-react';

import { Button, ButtonLoading } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import message from '@/components/ui/message';
import { Textarea } from '@/components/ui/textarea';
import { useSubmitFeedback } from '@/hooks/use-feedback-request';
import { cn } from '@/lib/utils';
import { FeedbackModule } from '@/services/feedback-service';

const MODULES: FeedbackModule[] = ['chat', 'knowledge', 'app'];
const MAX_IMAGES = 5;

type PastedImage = { file: File; url: string };

export function FeedbackDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { t } = useTranslation();
  const { submitFeedback, submitting } = useSubmitFeedback();

  const [modules, setModules] = useState<FeedbackModule[]>([]);
  const [content, setContent] = useState('');
  const [priority, setPriority] = useState(3);
  const [hoverStar, setHoverStar] = useState(0);
  const [images, setImages] = useState<PastedImage[]>([]);
  // Mirror to a ref so the unmount cleanup revokes the latest object URLs.
  const imagesRef = useRef<PastedImage[]>([]);
  imagesRef.current = images;

  const reset = useCallback(() => {
    imagesRef.current.forEach((i) => URL.revokeObjectURL(i.url));
    setModules([]);
    setContent('');
    setPriority(3);
    setHoverStar(0);
    setImages([]);
  }, []);

  useEffect(
    () => () => {
      imagesRef.current.forEach((i) => URL.revokeObjectURL(i.url));
    },
    [],
  );

  const toggleModule = (m: FeedbackModule) => {
    setModules((prev) =>
      prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m],
    );
  };

  const addFiles = useCallback(
    (files: File[]) => {
      const imgs = files.filter((f) => f.type.startsWith('image/'));
      if (imgs.length === 0) return;
      setImages((prev) => {
        const room = MAX_IMAGES - prev.length;
        if (room <= 0) {
          message.warning(t('feedback.maxImages', { count: MAX_IMAGES }));
          return prev;
        }
        const next = imgs.slice(0, room).map((f) => ({
          file: f,
          url: URL.createObjectURL(f),
        }));
        return [...prev, ...next];
      });
    },
    [t],
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const files: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (it?.kind === 'file') {
          const f = it.getAsFile();
          if (f) files.push(f);
        }
      }
      if (files.length) {
        e.preventDefault();
        addFiles(files);
      }
    },
    [addFiles],
  );

  const removeImage = (idx: number) => {
    setImages((prev) => {
      const target = prev[idx];
      if (target) URL.revokeObjectURL(target.url);
      return prev.filter((_, i) => i !== idx);
    });
  };

  const handleSubmit = async () => {
    if (!content.trim()) {
      message.warning(t('feedback.contentRequired'));
      return;
    }
    try {
      const res: any = await submitFeedback({
        content: content.trim(),
        modules,
        priority,
        images: images.map((i) => i.file),
      });
      if (res?.code === 0) {
        message.success(t('feedback.submitSuccess'));
        reset();
        onOpenChange(false);
      } else if (res?.message) {
        message.error(res.message);
      }
    } catch (e: any) {
      message.error(e?.message || t('feedback.submitFailed'));
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('feedback.title')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Modules (multi-select) */}
          <div>
            <div className="text-sm mb-2 text-text-secondary">
              {t('feedback.modules')}
            </div>
            <div className="flex flex-wrap gap-2">
              {MODULES.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => toggleModule(m)}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-sm border transition-colors',
                    modules.includes(m)
                      ? 'bg-accent-primary text-white border-accent-primary'
                      : 'border-border-default text-text-secondary hover:text-text-primary',
                  )}
                >
                  {t(`feedback.module_${m}`)}
                </button>
              ))}
            </div>
          </div>

          {/* Content + pasted screenshots */}
          <div>
            <div className="text-sm mb-2 text-text-secondary">
              {t('feedback.content')}
            </div>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onPaste={handlePaste}
              rows={5}
              placeholder={t('feedback.contentPlaceholder')}
            />
            {images.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {images.map((img, idx) => (
                  <div key={img.url} className="relative">
                    <img
                      src={img.url}
                      alt=""
                      className="size-16 object-cover rounded border border-border-default"
                    />
                    <button
                      type="button"
                      onClick={() => removeImage(idx)}
                      className="absolute -right-1.5 -top-1.5 bg-bg-base border border-border-default rounded-full p-0.5 text-text-secondary hover:text-text-primary"
                    >
                      <LucideX className="size-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Priority (1-5 stars) */}
          <div>
            <div className="text-sm mb-2 text-text-secondary">
              {t('feedback.priority')}
            </div>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onMouseEnter={() => setHoverStar(n)}
                  onMouseLeave={() => setHoverStar(0)}
                  onClick={() => setPriority(n)}
                  aria-label={String(n)}
                >
                  <LucideStar
                    className={cn(
                      'size-6 transition-colors',
                      n <= (hoverStar || priority)
                        ? 'fill-accent-primary text-accent-primary'
                        : 'text-text-secondary',
                    )}
                  />
                </button>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <ButtonLoading loading={submitting} onClick={handleSubmit}>
            {t('common.submit')}
          </ButtonLoading>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default FeedbackDialog;
