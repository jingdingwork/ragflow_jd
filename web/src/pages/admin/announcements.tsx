import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  LucideEye,
  LucideMegaphone,
  LucidePencil,
  LucidePin,
  LucidePlus,
  LucideTrash2,
  LucideUsers,
} from 'lucide-react';

import Spotlight from '@/components/spotlight';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import message from '@/components/ui/message';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import MarkdownViewer from '@/pages/skills/components/markdown-viewer';
import {
  Announcement,
  createAnnouncement,
  deleteAnnouncement,
  listAnnouncements,
  pinAnnouncement,
  updateAnnouncement,
} from '@/services/admin-service';

const QUERY_KEY = ['admin/announcements'];

type EditState = {
  id?: string;
  title: string;
  content: string;
  is_pinned: boolean;
  pop_enabled: boolean;
};

const EMPTY_EDIT: EditState = {
  title: '',
  content: '',
  is_pinned: false,
  pop_enabled: true,
};

function fmt(ts?: number) {
  if (!ts) return '-';
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return '-';
  }
}

function AdminAnnouncements() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [editOpen, setEditOpen] = useState(false);
  const [edit, setEdit] = useState<EditState>(EMPTY_EDIT);
  const [deleteTarget, setDeleteTarget] = useState<Announcement | null>(null);

  const { data: items = [], isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => (await listAnnouncements()).data.data ?? [],
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: QUERY_KEY });

  const saveMutation = useMutation({
    mutationFn: async (state: EditState) => {
      const payload = {
        title: state.title,
        content: state.content,
        is_pinned: state.is_pinned,
        pop_enabled: state.pop_enabled,
      };
      if (state.id) {
        return (await updateAnnouncement(state.id, payload)).data;
      }
      return (await createAnnouncement(payload)).data;
    },
    onSuccess: (res) => {
      if (res?.code === 0) {
        message.success(t('common.saveSuccess', { defaultValue: 'Saved' }));
        setEditOpen(false);
        invalidate();
      }
    },
  });

  const pinMutation = useMutation({
    mutationFn: async (a: Announcement) =>
      (await pinAnnouncement(a.id, !a.is_pinned)).data,
    onSuccess: () => invalidate(),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => (await deleteAnnouncement(id)).data,
    onSuccess: () => {
      setDeleteTarget(null);
      invalidate();
    },
  });

  const latest = useMemo(() => {
    const published = items.filter((a) => a.status === '1');
    // Backend already returns pinned-first then newest-first.
    return published[0];
  }, [items]);

  const openCreate = () => {
    setEdit(EMPTY_EDIT);
    setEditOpen(true);
  };

  const openEdit = (a: Announcement) => {
    setEdit({
      id: a.id,
      title: a.title,
      content: a.content,
      is_pinned: a.is_pinned,
      pop_enabled: a.pop_enabled,
    });
    setEditOpen(true);
  };

  return (
    <>
      <Card className="!shadow-none relative h-full bg-transparent overflow-hidden">
        <Spotlight />

        <ScrollArea className="size-full">
          <CardHeader className="space-y-0 flex-row items-start justify-between">
            <div>
              <CardTitle className="leading-10">
                {t('admin.announcementManagement')}
              </CardTitle>
              <CardDescription className="text-text-secondary">
                {t('admin.announcementPage.description')}
              </CardDescription>
            </div>
            <Button onClick={openCreate}>
              <LucidePlus />
              {t('admin.announcementPage.create')}
            </Button>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* Current latest announcement highlight */}
            {latest && (
              <Card className="!shadow-none bg-bg-card border-0.5 border-accent-primary/40">
                <CardHeader>
                  <CardDescription className="text-accent-primary flex items-center gap-2">
                    <LucideMegaphone className="size-4" />
                    {t('admin.announcementPage.currentLatest')}
                  </CardDescription>
                  <CardTitle className="text-lg flex items-center gap-2">
                    {latest.is_pinned && (
                      <LucidePin className="size-4 text-accent-primary" />
                    )}
                    {latest.title}
                  </CardTitle>
                  <div className="flex items-center gap-4 text-sm text-text-secondary pt-1">
                    <span className="flex items-center gap-1">
                      <LucideEye className="size-4" />
                      {t('admin.announcementPage.views')}: {latest.view_count}
                    </span>
                    <span className="flex items-center gap-1">
                      <LucideUsers className="size-4" />
                      {t('admin.announcementPage.viewers')}:{' '}
                      {latest.viewer_count}
                    </span>
                  </div>
                </CardHeader>
              </Card>
            )}

            {/* List */}
            <div className="rounded-lg border-0.5 border-border-button overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-text-secondary border-b-0.5 border-border-button">
                    <th className="text-left font-medium px-4 py-3">
                      {t('admin.announcementPage.title')}
                    </th>
                    <th className="text-center font-medium px-4 py-3 w-24">
                      {t('admin.announcementPage.pinned')}
                    </th>
                    <th className="text-center font-medium px-4 py-3 w-24">
                      {t('admin.announcementPage.views')}
                    </th>
                    <th className="text-center font-medium px-4 py-3 w-24">
                      {t('admin.announcementPage.viewers')}
                    </th>
                    <th className="text-left font-medium px-4 py-3 w-44">
                      {t('admin.announcementPage.updateTime')}
                    </th>
                    <th className="text-right font-medium px-4 py-3 w-32">
                      {t('admin.announcementPage.actions')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((a) => (
                    <tr
                      key={a.id}
                      className="border-b-0.5 border-border-button last:border-0 hover:bg-bg-card/50"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {a.is_pinned && (
                            <LucidePin className="size-3.5 text-accent-primary shrink-0" />
                          )}
                          <span className="truncate max-w-[360px]">
                            {a.title}
                          </span>
                        </div>
                      </td>
                      <td className="text-center px-4 py-3">
                        <Switch
                          checked={a.is_pinned}
                          onCheckedChange={() => pinMutation.mutate(a)}
                        />
                      </td>
                      <td className="text-center px-4 py-3">{a.view_count}</td>
                      <td className="text-center px-4 py-3">
                        {a.viewer_count}
                      </td>
                      <td className="px-4 py-3 text-text-secondary">
                        {fmt(a.update_time)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEdit(a)}
                          >
                            <LucidePencil className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeleteTarget(a)}
                          >
                            <LucideTrash2 className="size-4 text-state-error" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!isLoading && items.length === 0 && (
                    <tr>
                      <td
                        colSpan={6}
                        className="text-center text-text-secondary py-12"
                      >
                        {t('admin.announcementPage.empty')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </ScrollArea>
      </Card>

      {/* Create / edit dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>
              {edit.id
                ? t('admin.announcementPage.editTitle')
                : t('admin.announcementPage.createTitle')}
            </DialogTitle>
            <DialogDescription>
              {t('admin.announcementPage.markdownHint')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label className="text-text-primary">
                {t('admin.announcementPage.title')}
              </Label>
              <Input
                className="h-10 mt-2"
                value={edit.title}
                placeholder={t('admin.announcementPage.titlePlaceholder')}
                onChange={(e) =>
                  setEdit((s) => ({ ...s, title: e.target.value }))
                }
              />
            </div>

            <div>
              <Label className="text-text-primary">
                {t('admin.announcementPage.content')}
              </Label>
              <div className="grid grid-cols-2 gap-3 mt-2">
                <Textarea
                  className="min-h-[280px] font-mono text-sm"
                  value={edit.content}
                  placeholder={t('admin.announcementPage.contentPlaceholder')}
                  onChange={(e) =>
                    setEdit((s) => ({ ...s, content: e.target.value }))
                  }
                />
                <div className="min-h-[280px] max-h-[420px] overflow-auto rounded-md border-0.5 border-border-button p-3 bg-bg-card">
                  {edit.content ? (
                    <MarkdownViewer content={edit.content} />
                  ) : (
                    <span className="text-text-secondary text-sm">
                      {t('admin.announcementPage.previewEmpty')}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-8">
              <div className="flex items-center gap-2">
                <Switch
                  checked={edit.is_pinned}
                  onCheckedChange={(v) =>
                    setEdit((s) => ({ ...s, is_pinned: v }))
                  }
                />
                <Label className="text-text-primary">
                  {t('admin.announcementPage.pinned')}
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={edit.pop_enabled}
                  onCheckedChange={(v) =>
                    setEdit((s) => ({ ...s, pop_enabled: v }))
                  }
                />
                <Label className="text-text-primary">
                  {t('admin.announcementPage.popEnabled')}
                </Label>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              disabled={!edit.title.trim() || saveMutation.isPending}
              onClick={() => saveMutation.mutate(edit)}
            >
              {t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('admin.announcementPage.deleteTitle')}</DialogTitle>
            <DialogDescription>
              {t('admin.announcementPage.deleteConfirm', {
                title: deleteTarget?.title,
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              className={cn('bg-state-error hover:bg-state-error/90')}
              disabled={deleteMutation.isPending}
              onClick={() =>
                deleteTarget && deleteMutation.mutate(deleteTarget.id)
              }
            >
              {t('common.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default AdminAnnouncements;
