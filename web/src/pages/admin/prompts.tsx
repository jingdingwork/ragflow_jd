import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useMutation, useQuery } from '@tanstack/react-query';

import {
  LucidePlus,
  LucideRefreshCw,
  LucideSquarePen,
  LucideStar,
  LucideTrash2,
} from 'lucide-react';

import Spotlight from '@/components/spotlight';
import { TableEmpty } from '@/components/table-skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { cn } from '@/lib/utils';

import {
  DepartmentNode,
  PromptTemplate,
  deletePrompt,
  listDepartmentTree,
  listPrompts,
} from '@/services/admin-service';

import { PromptFormDialog } from './components/prompt-form-dialog';

function buildDeptNameMap(
  nodes: DepartmentNode[],
  acc: Record<string, string> = {},
) {
  for (const node of nodes) {
    acc[node.id] = node.name;
    if (node.children?.length) buildDeptNameMap(node.children, acc);
  }
  return acc;
}

function AdminPrompts() {
  const { t } = useTranslation();
  const [formPrompt, setFormPrompt] = useState<PromptTemplate | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const { data, isFetching, refetch } = useQuery({
    queryKey: ['admin/prompts'],
    queryFn: async () => (await listPrompts())?.data?.data ?? [],
  });

  const { data: tree } = useQuery({
    queryKey: ['admin/departments/tree'],
    queryFn: async () => (await listDepartmentTree())?.data?.data ?? [],
  });

  const deptNames = useMemo(() => buildDeptNameMap(tree ?? []), [tree]);
  const prompts = useMemo(() => data ?? [], [data]);

  const deleteMutation = useMutation({
    mutationKey: ['admin/prompts/delete'],
    mutationFn: async (id: string) => (await deletePrompt(id))?.data,
    retry: false,
    onSuccess: (res) => {
      if (res?.code === 0) {
        message.success(t('admin.deleteSuccess'));
        refetch();
      }
    },
  });

  const openCreate = () => {
    setFormPrompt(null);
    setFormOpen(true);
  };

  const openEdit = (p: PromptTemplate) => {
    setFormPrompt(p);
    setFormOpen(true);
  };

  const renderRow = (p: PromptTemplate) => (
    <TableRow key={p.id}>
      <TableCell className="font-medium">
        <div className="flex items-center gap-2">
          {p.is_default && (
            <LucideStar className="size-3.5 text-amber-500 fill-amber-500" />
          )}
          <span>{p.name}</span>
        </div>
      </TableCell>
      <TableCell>
        {p.scope === 'default' ? (
          <Badge variant="default">{t('admin.promptScopeDefault')}</Badge>
        ) : p.scope === 'all' ? (
          <Badge variant="default">{t('admin.promptScopeAll')}</Badge>
        ) : (
          <Badge variant="secondary">
            {deptNames[p.department_id] || t('admin.promptScopeDepartment')}
          </Badge>
        )}
      </TableCell>
      <TableCell className="text-sm text-text-secondary">
        <span className="line-clamp-2 max-w-md">{p.system || '-'}</span>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-2">
          <Button size="sm" variant="outline" onClick={() => openEdit(p)}>
            <LucideSquarePen className="size-3.5 mr-1" />
            {t('admin.edit')}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-red-500 hover:text-red-600"
            disabled={deleteMutation.isPending}
            onClick={() => deleteMutation.mutate(p.id)}
          >
            <LucideTrash2 className="size-3.5 mr-1" />
            {t('admin.delete')}
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );

  return (
    <Card className="!shadow-none relative h-full bg-transparent rounded-xl overflow-hidden">
      <Spotlight />

      <ScrollArea className="size-full">
        <CardHeader className="space-y-0 flex flex-row justify-between items-center">
          <CardTitle>{t('admin.promptManagement')}</CardTitle>

          <div className="flex items-center gap-2">
            <Button size="sm" variant="highlighted" onClick={openCreate}>
              <LucidePlus className="size-4 mr-1" />
              {t('admin.newPrompt')}
            </Button>
            <Button
              size="icon-lg"
              variant="outline"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              <LucideRefreshCw
                className={cn('size-4', isFetching && 'animate-spin')}
              />
            </Button>
          </div>
        </CardHeader>

        <CardContent>
          <p className="text-xs text-text-secondary mb-3">
            {t('admin.promptPageHint')}
          </p>
          <div className="border border-border-default rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('admin.promptName')}</TableHead>
                  <TableHead>{t('admin.promptScope')}</TableHead>
                  <TableHead>{t('admin.promptSystem')}</TableHead>
                  <TableHead className="text-right">
                    {t('admin.actions')}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {prompts.length > 0 ? (
                  prompts.map(renderRow)
                ) : (
                  <TableEmpty columnsLength={4} />
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </ScrollArea>

      <PromptFormDialog
        prompt={formPrompt}
        open={formOpen}
        onOpenChange={(o) => {
          setFormOpen(o);
          if (!o) setFormPrompt(null);
        }}
        onSaved={() => refetch()}
      />
    </Card>
  );
}

export default AdminPrompts;
