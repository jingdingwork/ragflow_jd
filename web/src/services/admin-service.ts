import { history } from '@/utils/simple-history-util';
import axios from 'axios';

import message from '@/components/ui/message';
import { Authorization } from '@/constants/authorization';
import i18n from '@/locales/config';
import { Routes } from '@/routes';
import api from '@/utils/api';
import authorizationUtil, {
  getAuthorization,
} from '@/utils/authorization-util';
import { convertTheKeysOfTheObjectToSnake } from '@/utils/common-util';
import { ResultCode, RetcodeMessage } from '@/utils/request';

const request = axios.create({
  timeout: 300000,
});

request.interceptors.request.use((config) => {
  const data = convertTheKeysOfTheObjectToSnake(config.data);
  const params = convertTheKeysOfTheObjectToSnake(config.params) as any;

  const newConfig = { ...config, data, params };

  // @ts-ignore
  if (!newConfig.skipToken) {
    newConfig.headers.set(Authorization, getAuthorization());
  }

  return newConfig;
});

request.interceptors.response.use(
  (response) => {
    if (response.config.responseType === 'blob') {
      return response;
    }

    const { data } = response ?? {};

    if (data?.code === 100) {
      message.error(data?.message);
    } else if (data?.code === 401) {
      message.error(data?.message, {
        description: data?.message,
      });

      authorizationUtil.removeAll();
      history.push(Routes.Admin);
      window.location.reload();
    } else if (data?.code && data.code !== 0) {
      message.error(`${i18n.t('message.hint')}: ${data?.code}`, {
        description: data?.message,
      });
    }

    return response;
  },
  (error) => {
    const { response } = error;
    const { data } = response ?? {};

    if (error.message === 'Failed to fetch') {
      message.error({
        description: i18n.t('message.networkAnomalyDescription'),
        message: i18n.t('message.networkAnomaly'),
      });
    } else if (data?.code === 100) {
      message.error(data?.message);
    } else if (response.status === 401 || data?.code === 401) {
      message.error({
        message: data?.message || response.statusText,
        description:
          data?.message || RetcodeMessage[response?.status as ResultCode],
        duration: 3,
      });

      authorizationUtil.removeAll();
      history.push(Routes.Admin);
      window.location.reload();
    } else if (data?.code && data.code !== 0) {
      message.error({
        message: `${i18n.t('message.hint')}: ${data?.code}`,
        description: data?.message,
        duration: 3,
      });
    } else if (response.status) {
      message.error({
        message: `${i18n.t('message.requestError')} ${response.status}: ${response.config.url}`,
        description:
          RetcodeMessage[response.status as ResultCode] || response.statusText,
      });
    } else if (response.status === 413 || response?.status === 504) {
      message.error(RetcodeMessage[response?.status as ResultCode]);
    }

    throw error;
  },
);

const {
  adminLogin,
  adminLogout,
  adminListUsers,
  adminCreateUser,
  adminGetUserDetails,
  adminUpdateUserStatus,
  adminUpdateUserPassword,
  adminDeleteUser,
  adminListUserDatasets,
  adminListUserAgents,

  adminListServices,
  adminShowServiceDetails,

  adminListRoles,
  adminListRolesWithPermission,
  adminCreateRole,
  adminDeleteRole,
  adminUpdateRoleDescription,
  adminGetRolePermissions,
  adminAssignRolePermissions,
  adminRevokeRolePermissions,

  adminGetUserPermissions,
  adminUpdateUserRole,

  adminListResources,

  adminDepartmentTree,
  adminSyncDepartments,
  adminExportDepartments,
  adminFetchDepartmentModels,
  adminDepartmentLlmConfigs,
  adminResyncAllDepartmentModels,
  adminGlobalLlm,
  adminFetchGlobalModels,
  adminModelCatalog,
  adminModelCatalogSync,
  adminModelCatalogItem,

  adminChatHistoryStats,
  adminChatHistoryOverview,

  adminListApplications,
  adminCreateApplication,

  adminEsListKnowledgebases,

  adminListPrompts,
  adminCreatePrompt,
  adminPrompt,

  adminListWhitelist,
  adminCreateWhitelistEntry,
  adminUpdateWhitelistEntry,
  adminDeleteWhitelistEntry,
  adminImportWhitelist,

  adminGetSystemVersion,

  adminListSandboxProviders,
  adminGetSandboxProviderSchema,
  adminGetSandboxConfig,
  adminSetSandboxConfig,
  adminTestSandboxConnection,
  adminGetVariables,
  adminSetVariable,
} = api;

type ResponseData<D = NonNullable<unknown>> = {
  code: number;
  message: string;
  data: D;
};

export const login = (params: { email: string; password: string }) =>
  request.post<ResponseData<AdminService.LoginData>>(adminLogin, params);
export const logout = () => request.get<ResponseData<boolean>>(adminLogout);
export const listUsers = () =>
  request.get<ResponseData<AdminService.ListUsersItem[]>>(adminListUsers, {});

export const createUser = (email: string, password: string) =>
  request.post<ResponseData<boolean>>(adminCreateUser, {
    username: email,
    password,
  });

export const grantSuperuser = (email: string) =>
  request.put<ResponseData<void>>(api.adminSetSuperuser(email));

export const revokeSuperuser = (email: string) =>
  request.delete<ResponseData<void>>(api.adminSetSuperuser(email));

export const getUserDetails = (email: string) =>
  request.get<ResponseData<[AdminService.UserDetail]>>(
    adminGetUserDetails(email),
  );
export const listUserDatasets = (email: string) =>
  request.get<ResponseData<AdminService.ListUserDatasetItem[]>>(
    adminListUserDatasets(email),
  );
export const listUserAgents = (email: string) =>
  request.get<ResponseData<AdminService.ListUserAgentItem[]>>(
    adminListUserAgents(email),
  );
export const updateUserStatus = (email: string, status: 'on' | 'off') =>
  request.put(adminUpdateUserStatus(email), { activate_status: status });
export const updateUserPassword = (email: string, password: string) =>
  request.put(adminUpdateUserPassword(email), { new_password: password });
export const deleteUser = (email: string) =>
  request.delete(adminDeleteUser(email));

export type DepartmentMember = {
  email: string;
  nickname: string;
  avatar?: string | null;
  is_active: string;
  is_superuser: boolean;
  is_dept_admin?: boolean;
  username?: string | null;
  is_departed?: boolean;
  last_login_time?: string | null;
  models: string[];
};

export type DepartmentNode = {
  id: string;
  name: string;
  parent_id: string | null;
  path_key: string;
  llm_configured: boolean;
  member_count: number;
  members: DepartmentMember[];
  children: DepartmentNode[];
};

export type DepartmentSyncStats = {
  keycloak_users: number;
  local_users: number;
  created: number;
  updated: number;
  unchanged: number;
  no_ou: number;
  failed: number;
};

export const listDepartmentTree = () =>
  request.get<ResponseData<DepartmentNode[]>>(adminDepartmentTree);

export const exportDepartmentMembers = () =>
  request.get<Blob>(adminExportDepartments, { responseType: 'blob' });

export const syncDepartments = () =>
  request.post<ResponseData<DepartmentSyncStats>>(adminSyncDepartments);

// Admin-assigned capability tags for a department model (classification only).
export type ModelCapability = 'web_search' | 'image_parse' | 'multimodal';

export const MODEL_CAPABILITIES: ModelCapability[] = [
  'web_search',
  'image_parse',
  'multimodal',
];

// Maps each capability to its i18n key (labels live in locales/{zh,en}.ts).
export const MODEL_CAPABILITY_I18N: Record<ModelCapability, string> = {
  web_search: 'admin.modelCapWebSearch',
  image_parse: 'admin.modelCapImageParse',
  multimodal: 'admin.modelCapMultimodal',
};

// Admin-curated catalog of models exposed to end users.
export type ModelCatalogItem = {
  id: string;
  llm_name: string;
  capabilities: ModelCapability[];
  custom_tags: string[];
  sort: number;
};

export type ModelCatalogInput = {
  llm_name: string;
  capabilities: ModelCapability[];
  custom_tags: string[];
};

export const listModelCatalog = () =>
  request.get<ResponseData<ModelCatalogItem[]>>(adminModelCatalog);

export const createModelCatalog = (params: ModelCatalogInput) =>
  request.post<ResponseData<ModelCatalogItem>>(adminModelCatalog, params);

export const updateModelCatalog = (id: string, params: ModelCatalogInput) =>
  request.put<ResponseData<ModelCatalogItem>>(
    adminModelCatalogItem(id),
    params,
  );

export const deleteModelCatalog = (id: string) =>
  request.delete<ResponseData<{ deleted: string }>>(adminModelCatalogItem(id));

export type ModelCatalogSyncResult = {
  added: number;
  configured: number;
  total: number;
};

export const syncModelCatalog = () =>
  request.post<ResponseData<ModelCatalogSyncResult>>(adminModelCatalogSync);

export type DepartmentLlmModel = {
  llm_name: string;
  enabled: boolean;
  model_types?: ModelCapability[];
};

export type DepartmentLlmConfig = {
  department_id: string;
  api_base: string;
  api_key: string;
  models: DepartmentLlmModel[];
};

export const fetchDepartmentModels = (params: {
  api_base: string;
  api_key: string;
}) => request.post<ResponseData<string[]>>(adminFetchDepartmentModels, params);

export type DepartmentLlmConfigSummary = {
  department_id: string;
  department_name: string;
  api_base: string;
  enabled_count: number;
  total_count: number;
  models: DepartmentLlmModel[];
};

export const listDepartmentLlmConfigs = () =>
  request.get<ResponseData<DepartmentLlmConfigSummary[]>>(
    adminDepartmentLlmConfigs,
  );

export const getDepartmentLlm = (departmentId: string) =>
  request.get<ResponseData<DepartmentLlmConfig>>(
    api.adminDepartmentLlm(departmentId),
  );

export const saveDepartmentLlm = (
  departmentId: string,
  params: { api_base: string; api_key: string; models: DepartmentLlmModel[] },
) =>
  request.post<ResponseData<NonNullable<unknown>>>(
    api.adminDepartmentLlm(departmentId),
    params,
  );

export type UserLlmConfig = {
  email: string;
  nickname: string;
  department_id: string | null;
  api_base: string;
  has_token: boolean;
  models: DepartmentLlmModel[];
};

export type ResyncModelsStats = {
  departments: number;
  added: number;
  removed: number;
  failed: number;
};

export const resyncAllDepartmentModels = () =>
  request.post<ResponseData<ResyncModelsStats>>(adminResyncAllDepartmentModels);

// Global "other models": one provider + one model name per auxiliary type.
export type GlobalModelType =
  | 'embedding'
  | 'rerank'
  | 'image2text'
  | 'speech2text'
  | 'tts';

export type GlobalLlmConfig = {
  api_base: string;
  api_key: string;
  models: Record<GlobalModelType, string>;
};

export type GlobalLlmStats = {
  users: number;
  models_configured: number;
};

export const fetchGlobalModels = (params: {
  api_base: string;
  api_key: string;
}) => request.post<ResponseData<string[]>>(adminFetchGlobalModels, params);

export const getGlobalLlm = () =>
  request.get<ResponseData<GlobalLlmConfig>>(adminGlobalLlm);

export const saveGlobalLlm = (params: {
  api_base: string;
  api_key: string;
  models: Record<GlobalModelType, string>;
}) => request.post<ResponseData<GlobalLlmStats>>(adminGlobalLlm, params);

export type ImpersonateResult = {
  auth: string;
  email: string;
  nickname: string;
};

export const impersonateUser = (email: string) =>
  request.post<ResponseData<ImpersonateResult>>(
    api.adminImpersonateUser(email),
  );

export const setDeptAdmin = (email: string, isDeptAdmin: boolean) =>
  request.post<ResponseData<{ email: string; is_dept_admin: boolean }>>(
    api.adminSetDeptAdmin(email),
    { is_dept_admin: isDeptAdmin },
  );

export const getUserLlm = (email: string) =>
  request.get<ResponseData<UserLlmConfig>>(api.adminUserLlm(email));

export const saveUserLlm = (
  email: string,
  params: { models: DepartmentLlmModel[] },
) =>
  request.post<ResponseData<NonNullable<unknown>>>(
    api.adminUserLlm(email),
    params,
  );

export type ChatHistoryStats = {
  today_sessions: number;
  today_rounds: number;
  week_sessions: number;
  week_rounds: number;
};

export type ChatHistoryMember = {
  user_id: string;
  email: string;
  nickname: string;
  is_active: string;
  is_superuser: boolean;
  is_dept_admin: boolean;
  session_count: number;
  round_count: number;
};

export type ChatHistoryDeptNode = {
  id: string;
  name: string;
  parent_id: string | null;
  children: ChatHistoryDeptNode[];
  members: ChatHistoryMember[];
  member_count: number;
  session_count: number;
  round_count: number;
};

export type ChatHistoryConversation = {
  id: string;
  source: 'chat' | 'agent';
  name: string | null;
  app_name: string;
  dialog_id: string | null;
  create_time: number | null;
  create_date: string | null;
  round_count: number;
  msg_count: number;
};

export type ChatHistoryConversationList = {
  total: number;
  page: number;
  size: number;
  items: ChatHistoryConversation[];
};

export type ChatHistoryMessage = {
  role: string;
  content: string;
  created_at: number | null;
};

export type ChatHistoryConversationDetail = {
  id: string;
  source: 'chat' | 'agent';
  name: string | null;
  app_name: string;
  user_id: string | null;
  user_nickname: string | null;
  user_email: string | null;
  create_date: string | null;
  messages: ChatHistoryMessage[];
};

export const getChatHistoryStats = () =>
  request.get<ResponseData<ChatHistoryStats>>(adminChatHistoryStats);

export const getChatHistoryOverview = (params: {
  start?: number;
  end?: number;
}) =>
  request.get<ResponseData<ChatHistoryDeptNode[]>>(adminChatHistoryOverview, {
    params,
  });

export const listUserConversations = (
  userId: string,
  params: { start?: number; end?: number; page?: number; size?: number },
) =>
  request.get<ResponseData<ChatHistoryConversationList>>(
    api.adminChatHistoryUserConversations(userId),
    { params },
  );

export const getConversationDetail = (
  conversationId: string,
  source: 'chat' | 'agent',
) =>
  request.get<ResponseData<ChatHistoryConversationDetail>>(
    api.adminChatHistoryConversationDetail(conversationId),
    { params: { source } },
  );

export type ApplicationVersion = {
  id: string;
  application_id?: string;
  version: string;
  description: string | null;
  file_name: string | null;
  file_size: number | null;
  is_latest: boolean;
  create_date: string | null;
};

export type Application = {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  app_type: 'web' | 'exe';
  url: string | null;
  /** Web apps only: 'inline' embeds in an iframe, 'newtab' opens a new window. */
  open_mode: 'inline' | 'newtab';
  visibility: 'all' | 'dept';
  sort: number;
  status: string;
  create_date: string | null;
  version_count: number;
  latest_version: string | null;
  // present in detail responses
  versions?: ApplicationVersion[];
  department_ids?: string[];
};

export type ApplicationPayload = {
  name: string;
  description?: string;
  icon?: string;
  app_type: 'web' | 'exe';
  url?: string;
  open_mode?: 'inline' | 'newtab';
  visibility: 'all' | 'dept';
  sort?: number;
  department_ids?: string[];
};

export const listApplications = () =>
  request.get<ResponseData<Application[]>>(adminListApplications);

export const getApplication = (id: string) =>
  request.get<ResponseData<Application>>(api.adminGetApplication(id));

export const createApplication = (payload: ApplicationPayload) =>
  request.post<ResponseData<Application>>(adminCreateApplication, payload);

export const updateApplication = (
  id: string,
  payload: Partial<ApplicationPayload>,
) =>
  request.put<ResponseData<Application>>(
    api.adminUpdateApplication(id),
    payload,
  );

export const deleteApplication = (id: string) =>
  request.delete<ResponseData<{ deleted: boolean }>>(
    api.adminDeleteApplication(id),
  );

export const addApplicationVersion = (
  id: string,
  params: { version: string; description?: string; file: File },
) => {
  const form = new FormData();
  form.append('version', params.version);
  form.append('description', params.description ?? '');
  form.append('file', params.file);
  return request.post<ResponseData<Application>>(
    api.adminAddApplicationVersion(id),
    form,
  );
};

export const deleteApplicationVersion = (id: string, versionId: string) =>
  request.delete<ResponseData<Application>>(
    api.adminDeleteApplicationVersion(id, versionId),
  );

export const setLatestApplicationVersion = (id: string, versionId: string) =>
  request.put<ResponseData<Application>>(
    api.adminSetLatestApplicationVersion(id, versionId),
  );

// ---- ES data inspection (read-only) ----

export type EsKnowledgebase = {
  id: string;
  name: string;
  tenant_id: string;
  created_by: string;
  creator_name: string;
  department_id: string | null;
  department_name: string | null;
  permission: string;
  download_disabled: boolean;
  doc_num: number;
  chunk_num: number;
  token_num: number;
  language: string | null;
  parser_id: string;
  create_date: string | null;
};

export type EsKbStats = {
  kb: {
    id: string;
    name: string;
    tenant_id: string;
    doc_num: number;
    chunk_num: number;
    token_num: number;
  };
  engine: string;
  index_name: string;
  index_exist: boolean;
  es_total: number;
  doc_aggregation: { name: string; count: number }[];
  health: Record<string, unknown>;
};

export type EsKbDocument = {
  id: string;
  name: string;
  chunk_num: number;
};

export type EsChunk = {
  id: string;
  doc_id: string;
  docnm_kwd: string;
  content: string;
  highlighted: boolean;
  important_kwd: string[];
  question_kwd: string[];
  doc_type_kwd: string;
  available: boolean;
  positions: number[][] | number[];
  img_id: string;
  score?: number;
};

export type EsChunkSearchResult = {
  total: number;
  chunks: EsChunk[];
};

export const esListKnowledgebases = () =>
  request.get<ResponseData<EsKnowledgebase[]>>(adminEsListKnowledgebases);

/** Promote / demote a knowledge base to company-wide visibility (admin only). */
export const setKbCompanyLevel = (kbId: string, enabled: boolean) =>
  request.put<ResponseData<{ id: string; name: string; permission: string }>>(
    api.adminKbCompanyLevel(kbId),
    { enabled },
  );

/** Enable / disable the KB's file-download restriction (admin only). */
export const setKbDownloadLimit = (kbId: string, enabled: boolean) =>
  request.put<
    ResponseData<{ id: string; name: string; download_disabled: boolean }>
  >(api.adminKbDownloadLimit(kbId), { enabled });

export const esGetKbStats = (kbId: string) =>
  request.get<ResponseData<EsKbStats>>(api.adminEsKbStats(kbId));

export const esListKbDocuments = (kbId: string) =>
  request.get<ResponseData<EsKbDocument[]>>(api.adminEsKbDocuments(kbId));

export const esSearchChunks = (
  kbId: string,
  params: { q?: string; doc_id?: string; page?: number; size?: number },
) =>
  request.get<ResponseData<EsChunkSearchResult>>(api.adminEsKbChunks(kbId), {
    params,
  });

export const esGetChunkDetail = (kbId: string, chunkId: string) =>
  request.get<ResponseData<Record<string, unknown>>>(
    api.adminEsKbChunkDetail(kbId, chunkId),
  );

export type RetrievalChunk = {
  chunk_id: string;
  doc_id: string;
  docnm_kwd: string;
  content: string;
  similarity: number;
  vector_similarity: number;
  term_similarity: number;
  important_kwd: string[];
};

export type RetrievalRanks = {
  total: number;
  chunks: RetrievalChunk[];
};

export type RetrievalTestResult = {
  kb: { id: string; name: string };
  embedding_model: string;
  rerank_model: string | null;
  rerank_available: boolean;
  rerank_error: string | null;
  vector_similarity_weight: number;
  similarity_threshold: number;
  question: string;
  base: RetrievalRanks;
  reranked: RetrievalRanks | null;
};

export type RetrievalTestParams = {
  kb_id: string;
  question: string;
  doc_id?: string;
  top_k?: number;
  page_size?: number;
  similarity_threshold?: number;
  vector_similarity_weight?: number;
};

export const retrievalTest = (params: RetrievalTestParams) =>
  request.post<ResponseData<RetrievalTestResult>>(
    api.adminRetrievalTest,
    params,
  );

export const listServices = () =>
  request.get<ResponseData<AdminService.ListServicesItem[]>>(adminListServices);
export const showServiceDetails = (serviceId: number) =>
  request.get<ResponseData<AdminService.ServiceDetail>>(
    adminShowServiceDetails(String(serviceId)),
  );

export const createRole = (params: {
  roleName: string;
  description?: string;
}) =>
  request.post<ResponseData<AdminService.RoleDetail>>(adminCreateRole, params);
export const updateRoleDescription = (role: string, description: string) =>
  request.put<ResponseData<AdminService.RoleDetail>>(
    adminUpdateRoleDescription(role),
    { description },
  );
export const deleteRole = (role: string) =>
  request.delete<ResponseData<ResponseData<never>>>(adminDeleteRole(role));
export const listRoles = () =>
  request.get<
    ResponseData<{ roles: AdminService.ListRoleItem[]; total: number }>
  >(adminListRoles);
export const listRolesWithPermission = () =>
  request.get<
    ResponseData<{
      roles: AdminService.ListRoleItemWithPermission[];
      total: number;
    }>
  >(adminListRolesWithPermission);
export const getRolePermissions = (role: string) =>
  request.get<ResponseData<AdminService.RoleDetailWithPermission>>(
    adminGetRolePermissions(role),
  );
export const assignRolePermissions = (
  role: string,
  permissions: Partial<AdminService.AssignRolePermissionsInput>,
) =>
  request.post<ResponseData<never>>(adminAssignRolePermissions(role), {
    new_permissions: permissions,
  });
export const revokeRolePermissions = (
  role: string,
  permissions: Partial<AdminService.RevokeRolePermissionInput>,
) =>
  request.delete<ResponseData<never>>(adminRevokeRolePermissions(role), {
    data: { revoke_permissions: permissions },
  });

export const updateUserRole = (username: string, role: string) =>
  request.put<ResponseData<never>>(adminUpdateUserRole(username), {
    role_name: role,
  });
export const getUserPermissions = (username: string) =>
  request.get<ResponseData<AdminService.UserDetailWithPermission>>(
    adminGetUserPermissions(username),
  );
export const listResources = () =>
  request.get<ResponseData<AdminService.ResourceType>>(adminListResources);

export const listWhitelist = () =>
  request.get<
    ResponseData<{
      total: number;
      white_list: AdminService.ListWhitelistItem[];
    }>
  >(adminListWhitelist);

export const createWhitelistEntry = (email: string) =>
  request.post<ResponseData<never>>(adminCreateWhitelistEntry, { email });

export const updateWhitelistEntry = (id: number, email: string) =>
  request.put<ResponseData<never>>(adminUpdateWhitelistEntry(id), { email });

export const deleteWhitelistEntry = (email: string) =>
  request.delete<ResponseData<never>>(adminDeleteWhitelistEntry(email));

export const importWhitelistFromExcel = (file: File) => {
  const fd = new FormData();

  fd.append('file', file);

  return request.post<ResponseData<never>>(adminImportWhitelist, fd);
};

export const getSystemVersion = () =>
  request.get<ResponseData<{ version: string }>>(adminGetSystemVersion);

// Sandbox settings APIs
export const listSandboxProviders = () =>
  request.get<ResponseData<AdminService.SandboxProvider[]>>(
    adminListSandboxProviders,
  );

export const getSandboxProviderSchema = (providerId: string) =>
  request.get<ResponseData<Record<string, AdminService.SandboxConfigField>>>(
    adminGetSandboxProviderSchema(providerId),
  );

export const getSandboxConfig = () =>
  request.get<ResponseData<AdminService.SandboxConfig>>(adminGetSandboxConfig);

export const setSandboxConfig = (params: {
  providerType: string;
  config: Record<string, unknown>;
}) =>
  request.post<ResponseData<AdminService.SandboxConfig>>(
    adminSetSandboxConfig,
    {
      provider_type: params.providerType,
      config: params.config,
    },
  );

export const testSandboxConnection = (params: {
  providerType: string;
  config: Record<string, unknown>;
}) =>
  request.post<
    ResponseData<{
      success: boolean;
      message: string;
      details?: {
        exit_code: number;
        execution_time: number;
        stdout: string;
        stderr: string;
      };
    }>
  >(adminTestSandboxConnection, {
    provider_type: params.providerType,
    config: params.config,
  });

// System settings variables (system_settings table via SettingsMgr).
export type SystemVariable = {
  name: string;
  source: string;
  data_type: string;
  value: string;
};

export const listVariables = () =>
  request.get<ResponseData<SystemVariable[]>>(adminGetVariables);

export const setVariable = (name: string, value: string) =>
  request.put<ResponseData<null>>(adminSetVariable, {
    var_name: name,
    var_value: value,
  });

export type PromptScope = 'default' | 'all' | 'department';

export type PromptTemplate = {
  id: string;
  name: string;
  scope: PromptScope;
  department_id: string;
  system: string;
  prologue: string;
  is_default: boolean;
  sort: number;
  create_time?: number;
  update_time?: number;
};

export type PromptTemplatePayload = {
  name: string;
  scope: PromptScope;
  department_id?: string;
  system: string;
  prologue: string;
  is_default: boolean;
  sort?: number;
};

export const listPrompts = () =>
  request.get<ResponseData<PromptTemplate[]>>(adminListPrompts);

export const createPrompt = (params: PromptTemplatePayload) =>
  request.post<ResponseData<{ id: string }>>(adminCreatePrompt, params);

export const updatePrompt = (
  id: string,
  params: Partial<PromptTemplatePayload>,
) => request.put<ResponseData<{ id: string }>>(adminPrompt(id), params);

export const deletePrompt = (id: string) =>
  request.delete<ResponseData<{ id: string }>>(adminPrompt(id));

// ---- Department shared-folder data sources ----

export type DeptFolderLastSync = {
  status: string | null;
  total_docs_indexed: number | null;
  docs_removed: number | null;
  update_date: string | null;
  error_msg: string | null;
};

export type DeptFolder = {
  id: string;
  name: string;
  department_id: string | null;
  department_name: string | null;
  kb_id: string | null;
  kb_name: string | null;
  kb_doc_num: number | null;
  root_path: string;
  recursive: boolean;
  sync_deleted_files: boolean;
  exclude_dirs: string[];
  refresh_freq: number;
  status: string | null;
  last_sync: DeptFolderLastSync | null;
};

export type DeptFolderPayload = {
  name?: string;
  department_id?: string;
  kb_id?: string;
  root_path: string;
  recursive?: boolean;
  allow_images?: boolean;
  sync_deleted_files?: boolean;
  exclude_dirs?: string[];
  refresh_freq?: number;
};

export type DeptFolderTestResult = {
  accessible: boolean;
  file_count?: number;
};

export type DeptFolderFile = {
  id: string;
  name: string;
  size: number;
  type: string;
  progress: number;
  run: string;
  kb_id: string;
  create_date: string | null;
};

export const listDeptFolders = () =>
  request.get<ResponseData<DeptFolder[]>>(api.adminListDeptFolders);

export const testDeptFolder = (params: {
  root_path: string;
  recursive?: boolean;
  allow_images?: boolean;
  exclude_dirs?: string[];
}) =>
  request.post<ResponseData<DeptFolderTestResult>>(
    api.adminTestDeptFolder,
    params,
  );

export const createDeptFolder = (params: DeptFolderPayload) =>
  request.post<ResponseData<{ id: string }>>(api.adminCreateDeptFolder, params);

export const updateDeptFolder = (
  id: string,
  params: Partial<DeptFolderPayload>,
) => request.put<ResponseData<{ id: string }>>(api.adminDeptFolder(id), params);

export const deleteDeptFolder = (id: string) =>
  request.delete<ResponseData<{ id: string }>>(api.adminDeptFolder(id));

export const syncDeptFolder = (id: string) =>
  request.post<ResponseData<{ id: string }>>(api.adminSyncDeptFolder(id));

export const rebuildDeptFolder = (id: string) =>
  request.post<ResponseData<{ id: string; errors: string[] }>>(
    api.adminRebuildDeptFolder(id),
  );

// Sensitive-word blocklist used to gate document uploads.
export type SensitiveWord = {
  id: string;
  word: string;
  created_by: string | null;
  create_date: string | null;
};

export const listSensitiveWords = () =>
  request.get<ResponseData<SensitiveWord[]>>(api.adminListSensitiveWords);

export const addSensitiveWord = (word: string) =>
  request.post<ResponseData<{ word: string }>>(api.adminAddSensitiveWord, {
    word,
  });

export const deleteSensitiveWord = (id: string) =>
  request.delete<ResponseData<{ id: string }>>(api.adminSensitiveWord(id));

export type Announcement = {
  id: string;
  title: string;
  content: string;
  is_pinned: boolean;
  pop_enabled: boolean;
  view_count: number;
  viewer_count: number;
  status: string;
  created_by: string;
  create_time: number;
  update_time: number;
};

export type AnnouncementPayload = {
  title: string;
  content: string;
  is_pinned?: boolean;
  pop_enabled?: boolean;
  status?: string;
};

export const listAnnouncements = () =>
  request.get<ResponseData<Announcement[]>>(api.adminListAnnouncements);

export const createAnnouncement = (params: AnnouncementPayload) =>
  request.post<ResponseData<Announcement>>(api.adminCreateAnnouncement, params);

export const updateAnnouncement = (
  id: string,
  params: Partial<AnnouncementPayload>,
) => request.put<ResponseData<Announcement>>(api.adminAnnouncement(id), params);

export const pinAnnouncement = (id: string, is_pinned: boolean) =>
  request.post<ResponseData<Announcement>>(api.adminPinAnnouncement(id), {
    is_pinned,
  });

export const deleteAnnouncement = (id: string) =>
  request.delete<ResponseData<{ id: string }>>(api.adminAnnouncement(id));

export const listDeptFolderFiles = (id: string) =>
  request.get<ResponseData<DeptFolderFile[]>>(api.adminDeptFolderFiles(id));
