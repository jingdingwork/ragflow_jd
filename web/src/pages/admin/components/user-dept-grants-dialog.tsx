import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useMutation } from '@tanstack/react-query';

import { LucideBuilding2, LucideSearch, LucideX } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button, ButtonLoading } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import message from '@/components/ui/message';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

import {
  DepartmentNode,
  DeptGrant,
  DeptGrantRole,
  getUserDeptGrants,
  saveUserDeptGrants,
} from '@/services/admin-service';

type Props = {
  email: string | null;
  nickname: string;
  tree: DepartmentNode[];
  homeDepartmentId?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
};

type FlatDept = {
  id: string;
  name: string;
  path: string;
};

// The role selectable per department: 'none' means no grant (row omitted on save).
type RoleChoice = 'none' | DeptGrantRole;

function flattenTree(
  nodes: DepartmentNode[],
  ancestors: string[],
  acc: FlatDept[],
) {
  for (const node of nodes) {
    const path = [...ancestors, node.name].join(' / ');
    acc.push({ id: node.id, name: node.name, path });
    if (node.children?.length) {
      flattenTree(node.children, [...ancestors, node.name], acc);
    }
  }
  return acc;
}

export function UserDeptGrantsDialog({
  email,
  nickname,
  tree,
  homeDepartmentId,
  open,
  onOpenChange,
  onSaved,
}: Props) {
  const { t } = useTranslation();
  const [roles, setRoles] = useState<Record<string, DeptGrantRole>>({});
  const [search, setSearch] = useState('');

  const flat = useMemo(() => flattenTree(tree, [], []), [tree]);

  // Load the user's existing grants each time the dialog opens.
  useEffect(() => {
    if (!open || !email) return;
    setRoles({});
    setSearch('');
    getUserDeptGrants(email).then((res) => {
      const grants = res?.data?.data?.grants;
      if (Array.isArray(grants)) {
        const next: Record<string, DeptGrantRole> = {};
        for (const g of grants) next[g.department_id] = g.role;
        setRoles(next);
      }
    });
  }, [open, email]);

  const setRole = (deptId: string, choice: RoleChoice) => {
    setRoles((prev) => {
      const next = { ...prev };
      if (choice === 'none') {
        delete next[deptId];
      } else {
        next[deptId] = choice;
      }
      return next;
    });
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return flat;
    return flat.filter((d) => d.path.toLowerCase().includes(q));
  }, [flat, search]);

  const selectedCount = Object.keys(roles).length;

  const saveMutation = useMutation({
    mutationKey: ['admin/users/dept-grants/save'],
    mutationFn: async () => {
      if (!email) return undefined;
      const grants: DeptGrant[] = Object.entries(roles).map(
        ([department_id, role]) => ({ department_id, role }),
      );
      const res = await saveUserDeptGrants(email, grants);
      return res?.data;
    },
    onSuccess: (data) => {
      if (data?.code === 0) {
        message.success(t('admin.saveSuccess'));
        onSaved?.();
        onOpenChange(false);
      }
    },
    retry: false,
  });

  const ROLE_OPTIONS: { value: RoleChoice; label: string }[] = [
    { value: 'none', label: t('admin.deptGrantNone') },
    { value: 'employee', label: t('admin.deptGrantEmployee') },
    { value: 'dept_admin', label: t('admin.deptGrantAdmin') },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {t('admin.deptGrantsTitle', { name: nickname })}
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-text-secondary">
          {t('admin.deptGrantsHint')}
        </p>

        <div className="relative">
          <LucideSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-text-secondary pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('admin.deptGrantsSearchPlaceholder')}
            className="pl-8 pr-8"
          />
          {search && (
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary"
              onClick={() => setSearch('')}
            >
              <LucideX className="size-4" />
            </button>
          )}
        </div>

        <ScrollArea className="h-96 border border-border-default rounded-lg">
          <ul className="divide-y divide-border-default">
            {filtered.map((dept) => {
              const current: RoleChoice = roles[dept.id] ?? 'none';
              const isHome = homeDepartmentId === dept.id;
              return (
                <li key={dept.id} className="flex items-center gap-2 px-3 py-2">
                  <LucideBuilding2 className="size-4 shrink-0 opacity-70" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm text-text-primary">
                        {dept.name}
                      </span>
                      {isHome && (
                        <Badge variant="secondary" className="shrink-0">
                          {t('admin.deptGrantHome')}
                        </Badge>
                      )}
                    </div>
                    <div className="truncate text-xs text-text-secondary">
                      {dept.path}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {ROLE_OPTIONS.map((opt) => (
                      <Button
                        key={opt.value}
                        type="button"
                        size="sm"
                        variant={current === opt.value ? 'default' : 'outline'}
                        className={cn(
                          'h-7 px-2 text-xs',
                          current === opt.value &&
                            opt.value === 'dept_admin' &&
                            'bg-[#F39800] hover:bg-[#F39800]',
                        )}
                        onClick={() => setRole(dept.id, opt.value)}
                      >
                        {opt.label}
                      </Button>
                    ))}
                  </div>
                </li>
              );
            })}
            {filtered.length === 0 && (
              <li className="px-3 py-6 text-center text-sm text-text-secondary">
                {t('admin.deptGrantsNoResult')}
              </li>
            )}
          </ul>
        </ScrollArea>

        <DialogFooter className="items-center sm:justify-between">
          <span className="text-sm text-text-secondary">
            {t('admin.deptGrantsSelectedCount', { count: selectedCount })}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t('admin.cancel')}
            </Button>
            <ButtonLoading
              loading={saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
              disabled={!email}
            >
              {t('admin.save')}
            </ButtonLoading>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
