import api from '@/utils/api';
import request from '@/utils/request';

export type UserApplicationVersion = {
  id: string;
  version: string;
  description: string | null;
  file_name: string | null;
  file_size: number | null;
  is_latest: boolean;
  create_date: string | null;
};

export type UserApplication = {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  app_type: 'web' | 'exe';
  url: string | null;
  sort: number;
  latest_version: UserApplicationVersion | null;
  versions: UserApplicationVersion[];
};

export const getMyApplications = () => request.get(api.myApplications);

export const downloadApplicationPackage = async (
  id: string,
  fileName: string,
  versionId?: string,
) => {
  const res = await request.get(api.downloadApplication(id), {
    params: versionId ? { version: versionId } : {},
    responseType: 'blob',
  });
  const blob = new Blob([res.data]);
  const objectUrl = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = fileName || 'package';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(objectUrl);
};
