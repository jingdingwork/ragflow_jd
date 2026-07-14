import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useMutation, useQuery } from '@tanstack/react-query';

import {
  LucideDownloadCloud,
  LucidePencil,
  LucidePlus,
  LucideRefreshCw,
  LucideServerCog,
  LucideTrash2,
} from 'lucide-react';

import Spotlight from '@/components/spotlight';
import { TableEmpty } from '@/components/table-skeleton';
import { Badge } from '@/components/ui/badge';
import { Button, ButtonLoading } from '@/components/ui/button';
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
import message from '@/components/ui/message';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import {
  MODEL_CAPABILITY_I18N,
  ModelCatalogItem,
  deleteModelCatalog,
  listModelCatalog,
  syncModelCatalog,
} from '@/services/admin-service';

import { GlobalLlmDialog } from './components/global-llm-dialog';
import { ModelCatalogDialog } from './components/model-catalog-dialog';

enum SystemSettingsTab {
  ModelSettings = 'model-settings',
}

function ModelSettingsPane() {
  const { t } = useTranslation();
  const [globalOpen, setGlobalOpen] = useState(false);
  const [editItem, setEditItem] = useState<ModelCatalogItem | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ModelCatalogItem | null>(
    null,
  );

  const { data, isFetching, refetch } = useQuery({
    queryKey: ['admin/model-catalog'],
    queryFn: async () => {
      const res = await listModelCatalog();
      return res?.data?.data ?? [];
    },
  });

  const models = data ?? [];

  const openCreate = () => {
    setEditItem(null);
    setEditOpen(true);
  };

  const openEdit = (item: ModelCatalogItem) => {
    setEditItem(item);
    setEditOpen(true);
  };

  const syncMutation = useMutation({
    mutationKey: ['admin/model-catalog/sync'],
    mutationFn: async () => {
      const res = await syncModelCatalog();
      return res?.data;
    },
    onSuccess: (res) => {
      if (res?.code === 0) {
        message.success(
          t('admin.modelCatalogSyncDone', { added: res.data?.added ?? 0 }),
        );
        refetch();
      }
    },
    retry: false,
  });

  const deleteMutation = useMutation({
    mutationKey: ['admin/model-catalog/delete'],
    mutationFn: async (id: string) => {
      const res = await deleteModelCatalog(id);
      return res?.data;
    },
    onSuccess: (res) => {
      if (res?.code === 0) {
        message.success(t('admin.saveSuccess'));
        setDeleteTarget(null);
        refetch();
      }
    },
    retry: false,
  });

  return (
    <Card className="!shadow-none bg-transparent">
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div className="space-y-1.5">
          <CardTitle className="text-xl leading-none">
            {t('admin.systemSettingsPage.modelSettings')}
          </CardTitle>
          <CardDescription className="text-text-secondary">
            {t('admin.systemSettingsPage.modelSettingsDescription')}
          </CardDescription>
        </div>

        <div className="flex items-center gap-2">
          <ButtonLoading
            size="sm"
            variant="highlighted"
            loading={syncMutation.isPending}
            onClick={() => syncMutation.mutate()}
          >
            <LucideDownloadCloud className="size-4 mr-1" />
            {t('admin.modelCatalogSync')}
          </ButtonLoading>
          <Button size="sm" variant="outline" onClick={openCreate}>
            <LucidePlus className="size-4 mr-1" />
            {t('admin.modelCatalogAdd')}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setGlobalOpen(true)}
          >
            <LucideServerCog className="size-4 mr-1" />
            {t('admin.otherModelSettings')}
          </Button>
          <Button
            size="icon-lg"
            variant="outline"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <LucideRefreshCw
              className={isFetching ? 'size-4 animate-spin' : 'size-4'}
            />
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        <div className="border border-border-default rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('admin.modelCatalogName')}</TableHead>
                <TableHead>{t('admin.modelCapabilities')}</TableHead>
                <TableHead>{t('admin.modelCustomTags')}</TableHead>
                <TableHead className="text-right">
                  {t('admin.actions')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {models.length > 0 ? (
                models.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium align-top">
                      {m.llm_name}
                    </TableCell>
                    <TableCell className="align-top">
                      {m.capabilities.length > 0 ? (
                        <div className="flex flex-wrap gap-1 max-w-md">
                          {m.capabilities.map((cap) => (
                            <span
                              key={cap}
                              className="px-1.5 py-0.5 rounded text-xs leading-none border border-accent-primary/50 text-accent-primary whitespace-nowrap"
                            >
                              {t(MODEL_CAPABILITY_I18N[cap])}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-text-secondary">-</span>
                      )}
                    </TableCell>
                    <TableCell className="align-top">
                      {m.custom_tags.length > 0 ? (
                        <div className="flex flex-wrap gap-1 max-w-md">
                          {m.custom_tags.map((tag) => (
                            <Badge
                              key={tag}
                              variant="secondary"
                              className="font-normal"
                            >
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-text-secondary">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right align-top whitespace-nowrap">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openEdit(m)}
                        >
                          <LucidePencil className="size-3.5 mr-1" />
                          {t('admin.edit')}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setDeleteTarget(m)}
                        >
                          <LucideTrash2 className="size-3.5 mr-1" />
                          {t('admin.delete')}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableEmpty columnsLength={4} />
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <ModelCatalogDialog
        item={editItem}
        open={editOpen}
        onOpenChange={(o) => {
          setEditOpen(o);
          if (!o) setEditItem(null);
        }}
        onSaved={() => refetch()}
      />

      <GlobalLlmDialog
        open={globalOpen}
        onOpenChange={setGlobalOpen}
        onSaved={() => refetch()}
      />

      <Dialog
        open={!!deleteTarget}
        onOpenChange={(o) => {
          if (!o) setDeleteTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('admin.modelCatalogDeleteTitle')}</DialogTitle>
          </DialogHeader>
          <DialogDescription>
            {t('admin.modelCatalogDeleteConfirm', {
              name: deleteTarget?.llm_name,
            })}
          </DialogDescription>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              {t('admin.cancel')}
            </Button>
            <ButtonLoading
              variant="highlighted"
              loading={deleteMutation.isPending}
              onClick={() =>
                deleteTarget && deleteMutation.mutate(deleteTarget.id)
              }
            >
              {t('admin.delete')}
            </ButtonLoading>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function AdminSystemSettings() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<string>(
    SystemSettingsTab.ModelSettings,
  );

  return (
    <Card className="!shadow-none relative h-full bg-transparent overflow-hidden">
      <Spotlight />

      <ScrollArea className="size-full">
        <CardHeader className="space-y-0">
          <CardTitle className="leading-10">
            {t('admin.systemSettings')}
          </CardTitle>
          <CardDescription className="text-text-secondary">
            {t('admin.systemSettingsPage.description')}
          </CardDescription>
        </CardHeader>

        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value={SystemSettingsTab.ModelSettings}>
                {t('admin.systemSettingsPage.modelSettings')}
              </TabsTrigger>
            </TabsList>

            <TabsContent value={SystemSettingsTab.ModelSettings}>
              <ModelSettingsPane />
            </TabsContent>
          </Tabs>
        </CardContent>
      </ScrollArea>
    </Card>
  );
}

export default AdminSystemSettings;
