import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useMutation, useQuery } from '@tanstack/react-query';

import {
  LucideBuilding2,
  LucideChevronDown,
  LucideChevronRight,
  LucideDownload,
  LucideFolderSync,
  LucideLogIn,
  LucidePackageSearch,
  LucideRefreshCw,
  LucideServerCog,
  LucideSettings2,
  LucideShieldCheck,
  LucideSlidersHorizontal,
  LucideUsers,
} from 'lucide-react';

import Spotlight from '@/components/spotlight';
import { TableEmpty } from '@/components/table-skeleton';
import { Badge } from '@/components/ui/badge';
import { Button, ButtonLoading } from '@/components/ui/button';
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
  exportDepartmentMembers,
  impersonateUser,
  listDepartmentTree,
  resyncAllDepartmentModels,
  setDeptAdmin,
  syncDepartments,
} from '@/services/admin-service';

import { DepartmentLlmDialog } from './components/department-llm-dialog';
import { GlobalLlmDialog } from './components/global-llm-dialog';
import { UserLlmDialog } from './components/user-llm-dialog';

function flattenIds(nodes: DepartmentNode[], acc: string[] = []) {
  for (const node of nodes) {
    acc.push(node.id);
    if (node.children?.length) {
      flattenIds(node.children, acc);
    }
  }
  return acc;
}

function findNode(
  nodes: DepartmentNode[],
  id: string | null,
): DepartmentNode | null {
  if (!id) return null;
  for (const node of nodes) {
    if (node.id === id) return node;
    const found = findNode(node.children ?? [], id);
    if (found) return found;
  }
  return null;
}

type TreeProps = {
  nodes: DepartmentNode[];
  depth: number;
  selectedId: string | null;
  expanded: Record<string, boolean>;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
  onConfig: (node: DepartmentNode) => void;
};

function DepartmentTree({
  nodes,
  depth,
  selectedId,
  expanded,
  onSelect,
  onToggle,
  onConfig,
}: TreeProps) {
  const { t } = useTranslation();
  return (
    <ul className="space-y-0.5">
      {nodes.map((node) => {
        const hasChildren = !!node.children?.length;
        const isExpanded = expanded[node.id];
        const isSelected = selectedId === node.id;
        return (
          <li key={node.id}>
            <div
              className={cn(
                'flex items-center gap-1.5 rounded-md px-2 py-1.5 cursor-pointer text-sm transition-colors',
                isSelected
                  ? 'bg-primary/10 text-text-primary'
                  : 'hover:bg-bg-card text-text-secondary',
              )}
              style={{ paddingLeft: `${depth * 16 + 8}px` }}
              onClick={() => onSelect(node.id)}
            >
              <button
                type="button"
                className={cn(
                  'flex size-4 items-center justify-center shrink-0',
                  !hasChildren && 'invisible',
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggle(node.id);
                }}
              >
                {isExpanded ? (
                  <LucideChevronDown className="size-4" />
                ) : (
                  <LucideChevronRight className="size-4" />
                )}
              </button>
              <LucideBuilding2 className="size-4 shrink-0 opacity-70" />
              <span className="truncate flex-1">{node.name}</span>
              <Badge variant="secondary" className="shrink-0">
                {node.member_count}
              </Badge>
              <button
                type="button"
                className={cn(
                  'flex size-5 items-center justify-center shrink-0 rounded hover:bg-bg-card',
                  node.llm_configured
                    ? 'text-[#F39800] hover:text-[#FFA826]'
                    : 'text-text-secondary hover:text-text-primary',
                )}
                title={
                  node.llm_configured
                    ? t('admin.departmentLlmConfigured')
                    : t('admin.departmentLlmConfig')
                }
                onClick={(e) => {
                  e.stopPropagation();
                  onConfig(node);
                }}
              >
                <LucideSettings2 className="size-3.5" />
              </button>
            </div>
            {hasChildren && isExpanded && (
              <DepartmentTree
                nodes={node.children}
                depth={depth + 1}
                selectedId={selectedId}
                expanded={expanded}
                onSelect={onSelect}
                onToggle={onToggle}
                onConfig={onConfig}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}

function AdminDepartments() {
  const { t } = useTranslation();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [configNode, setConfigNode] = useState<DepartmentNode | null>(null);
  const [configOpen, setConfigOpen] = useState(false);
  const [globalOpen, setGlobalOpen] = useState(false);
  const [userEdit, setUserEdit] = useState<{
    email: string;
    nickname: string;
  } | null>(null);
  const [userEditOpen, setUserEditOpen] = useState(false);

  const openConfig = (node: DepartmentNode) => {
    setConfigNode(node);
    setConfigOpen(true);
  };

  const openUserEdit = (email: string, nickname: string) => {
    setUserEdit({ email, nickname });
    setUserEditOpen(true);
  };

  const deptAdminMutation = useMutation({
    mutationKey: ['admin/users/dept-admin'],
    mutationFn: async (vars: { email: string; isDeptAdmin: boolean }) => {
      const res = await setDeptAdmin(vars.email, vars.isDeptAdmin);
      return res?.data;
    },
    onSuccess: (data) => {
      if (data?.code === 0) {
        message.success(t('admin.saveSuccess'));
        refetch();
      }
    },
    retry: false,
  });

  const impersonateMutation = useMutation({
    mutationKey: ['admin/users/impersonate'],
    mutationFn: async (email: string) => {
      const res = await impersonateUser(email);
      return res?.data?.data;
    },
    onSuccess: (result) => {
      if (result?.auth) {
        window.open(
          `${window.location.origin}/?auth=${encodeURIComponent(result.auth)}`,
          '_blank',
          'noopener',
        );
        message.success(
          t('admin.impersonateOpened', { name: result.nickname }),
        );
      }
    },
    retry: false,
  });

  const { data, isFetching, refetch } = useQuery({
    queryKey: ['admin/departments/tree'],
    queryFn: async () => {
      const res = await listDepartmentTree();
      return res?.data?.data ?? [];
    },
  });

  const syncMutation = useMutation({
    mutationKey: ['admin/departments/sync'],
    mutationFn: async () => {
      const res = await syncDepartments();
      return res?.data?.data;
    },
    onSuccess: (stats) => {
      if (stats) {
        message.success(
          t('admin.syncDepartmentsResult', {
            created: stats.created,
            updated: stats.updated,
            total: stats.keycloak_users,
          }),
        );
      }
      refetch();
    },
    retry: false,
  });

  const resyncModelsMutation = useMutation({
    mutationKey: ['admin/departments/resync-models'],
    mutationFn: async () => {
      const res = await resyncAllDepartmentModels();
      return res?.data?.data;
    },
    onSuccess: (stats) => {
      if (stats) {
        message.success(
          t('admin.syncModelsResult', {
            departments: stats.departments,
            added: stats.added,
            removed: stats.removed,
          }),
        );
      }
      refetch();
    },
    retry: false,
  });

  const exportMutation = useMutation({
    mutationKey: ['admin/departments/export'],
    mutationFn: async () => {
      const res = await exportDepartmentMembers();
      return res?.data as Blob;
    },
    onSuccess: (blob) => {
      if (!blob) return;
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'departments.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    },
    retry: false,
  });

  const tree = useMemo(() => data ?? [], [data]);

  const selectedNode = useMemo(
    () => findNode(tree, selectedId),
    [tree, selectedId],
  );

  const expandAll = () => {
    const all = flattenIds(tree);
    setExpanded(Object.fromEntries(all.map((id) => [id, true])));
  };

  const collapseAll = () => setExpanded({});

  const handleToggle = (id: string) =>
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <Card className="!shadow-none relative h-full bg-transparent rounded-xl overflow-hidden">
      <Spotlight />

      <ScrollArea className="size-full">
        <CardHeader className="space-y-0 flex flex-row justify-between items-center">
          <CardTitle>{t('admin.departmentManagement')}</CardTitle>

          <div className="flex items-center gap-2">
            <ButtonLoading
              size="sm"
              variant="highlighted"
              loading={syncMutation.isPending}
              onClick={() => syncMutation.mutate()}
            >
              <LucideFolderSync className="size-4 mr-1" />
              {t('admin.syncDepartments')}
            </ButtonLoading>
            <ButtonLoading
              size="sm"
              variant="outline"
              loading={resyncModelsMutation.isPending}
              onClick={() => resyncModelsMutation.mutate()}
            >
              <LucidePackageSearch className="size-4 mr-1" />
              {t('admin.syncModels')}
            </ButtonLoading>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setGlobalOpen(true)}
            >
              <LucideServerCog className="size-4 mr-1" />
              {t('admin.otherModelSettings')}
            </Button>
            <ButtonLoading
              size="sm"
              variant="outline"
              loading={exportMutation.isPending}
              onClick={() => exportMutation.mutate()}
            >
              <LucideDownload className="size-4 mr-1" />
              {t('admin.exportExcel')}
            </ButtonLoading>
            <Button size="sm" variant="outline" onClick={expandAll}>
              {t('admin.expandAll')}
            </Button>
            <Button size="sm" variant="outline" onClick={collapseAll}>
              {t('admin.collapseAll')}
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
          <div className="flex gap-4">
            {/* Department tree */}
            <div className="w-80 shrink-0 border border-border-default rounded-lg p-2">
              {tree.length === 0 ? (
                <div className="text-text-secondary text-sm p-4 text-center">
                  {t('admin.noDepartments')}
                </div>
              ) : (
                <DepartmentTree
                  nodes={tree}
                  depth={0}
                  selectedId={selectedId}
                  expanded={expanded}
                  onSelect={setSelectedId}
                  onToggle={handleToggle}
                  onConfig={openConfig}
                />
              )}
            </div>

            {/* Members of the selected department */}
            <div className="flex-1 min-w-0 border border-border-default rounded-lg">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border-default">
                <LucideUsers className="size-4 opacity-70" />
                <span className="font-medium">
                  {selectedNode
                    ? selectedNode.name
                    : t('admin.selectDepartment')}
                </span>
                {selectedNode && (
                  <Badge variant="secondary">
                    {selectedNode.members.length}
                  </Badge>
                )}
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('admin.nickname')}</TableHead>
                    <TableHead>{t('admin.employeeId')}</TableHead>
                    <TableHead>{t('admin.email')}</TableHead>
                    <TableHead>{t('admin.status')}</TableHead>
                    <TableHead>{t('admin.models')}</TableHead>
                    <TableHead className="text-right">
                      {t('admin.actions')}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedNode && selectedNode.members.length > 0 ? (
                    selectedNode.members.map((member) => (
                      <TableRow key={member.email}>
                        <TableCell className="font-medium">
                          {member.nickname}
                          {member.is_superuser && (
                            <Badge variant="outline" className="ml-2">
                              admin
                            </Badge>
                          )}
                          {member.is_dept_admin && (
                            <Badge
                              variant="default"
                              className="ml-2 bg-[#F39800] hover:bg-[#F39800]"
                            >
                              {t('admin.deptAdmin')}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {member.username || '-'}
                        </TableCell>
                        <TableCell>{member.email}</TableCell>
                        <TableCell>
                          {member.is_departed ? (
                            <Badge variant="destructive">
                              {t('admin.departed')}
                            </Badge>
                          ) : (
                            <Badge
                              variant={
                                member.is_active === '1'
                                  ? 'default'
                                  : 'secondary'
                              }
                            >
                              {member.is_active === '1'
                                ? t('admin.active')
                                : t('admin.inactive')}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {member.models && member.models.length > 0 ? (
                            <div className="flex flex-wrap gap-1 max-w-md">
                              {member.models.map((name) => (
                                <Badge
                                  key={name}
                                  variant="secondary"
                                  className="font-normal"
                                >
                                  {name}
                                </Badge>
                              ))}
                            </div>
                          ) : (
                            <span className="text-text-secondary">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              size="sm"
                              variant={
                                member.is_dept_admin ? 'default' : 'outline'
                              }
                              title={t('admin.deptAdminHint')}
                              disabled={deptAdminMutation.isPending}
                              onClick={() =>
                                deptAdminMutation.mutate({
                                  email: member.email,
                                  isDeptAdmin: !member.is_dept_admin,
                                })
                              }
                            >
                              <LucideShieldCheck className="size-3.5 mr-1" />
                              {member.is_dept_admin
                                ? t('admin.revokeDeptAdmin')
                                : t('admin.makeDeptAdmin')}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                openUserEdit(member.email, member.nickname)
                              }
                            >
                              <LucideSlidersHorizontal className="size-3.5 mr-1" />
                              {t('admin.editModels')}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              title={t('admin.impersonateHint')}
                              disabled={impersonateMutation.isPending}
                              onClick={() =>
                                impersonateMutation.mutate(member.email)
                              }
                            >
                              <LucideLogIn className="size-3.5 mr-1" />
                              {t('admin.impersonate')}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableEmpty columnsLength={6} />
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </CardContent>
      </ScrollArea>

      <DepartmentLlmDialog
        departmentId={configNode?.id ?? null}
        departmentName={configNode?.name ?? ''}
        open={configOpen}
        onOpenChange={(o) => {
          setConfigOpen(o);
          if (!o) setConfigNode(null);
        }}
        onSaved={() => refetch()}
      />

      <UserLlmDialog
        email={userEdit?.email ?? null}
        nickname={userEdit?.nickname ?? ''}
        open={userEditOpen}
        onOpenChange={(o) => {
          setUserEditOpen(o);
          if (!o) setUserEdit(null);
        }}
        onSaved={() => refetch()}
      />

      <GlobalLlmDialog
        open={globalOpen}
        onOpenChange={setGlobalOpen}
        onSaved={() => refetch()}
      />
    </Card>
  );
}

export default AdminDepartments;
