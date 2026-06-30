import api from '@/utils/api';
import { registerNextServer } from '@/utils/register-server';

const {
  createChat,
  listPromptTemplates,
  createPromptTemplate,
  deletePromptTemplate,
  listChats,
  getDefaultChat,
  getChat,
  updateChat,
  patchChat,
  deleteChat,
  bulkDeleteChats,
  listAllConversations,
  createSession,
  listSessions,
  getSession,
  updateSession,
  removeSessions,
  deleteMessage,
  thumbup,
  chatsTts,
  chatsMindmap,
  chatsRelatedQuestions,
  documentInfoUpload,
  fetchExternalChatInfo,
  shareSession,
  listSharedConversations,
  reorderSharedConversations,
  getSharedConversation,
  renameSharedConversation,
  publishSharedConversation,
  hideSharedConversation,
  deleteSharedConversation,
  forkSharedConversation,
} = api;

const methods = {
  createChat: {
    url: createChat,
    method: 'post',
  },
  listPromptTemplates: {
    url: listPromptTemplates,
    method: 'get',
  },
  createPromptTemplate: {
    url: createPromptTemplate,
    method: 'post',
  },
  deletePromptTemplate: {
    url: deletePromptTemplate,
    method: 'delete',
  },
  listChats: {
    url: listChats,
    method: 'get',
  },
  getDefaultChat: {
    url: getDefaultChat,
    method: 'get',
  },
  getChat: {
    url: getChat,
    method: 'get',
  },
  updateChat: {
    url: updateChat,
    method: 'put',
  },
  patchChat: {
    url: patchChat,
    method: 'patch',
  },
  deleteChat: {
    url: deleteChat,
    method: 'delete',
  },
  bulkDeleteChats: {
    url: bulkDeleteChats,
    method: 'delete',
  },
  listAllConversations: {
    url: listAllConversations,
    method: 'get',
  },
  createSession: {
    url: createSession,
    method: 'post',
  },
  listSessions: {
    url: listSessions,
    method: 'get',
  },
  getSession: {
    url: getSession,
    method: 'get',
  },
  updateSession: {
    url: updateSession,
    method: 'patch',
  },
  removeSessions: {
    url: removeSessions,
    method: 'delete',
  },
  deleteMessage: {
    url: deleteMessage,
    method: 'delete',
  },
  thumbup: {
    url: thumbup,
    method: 'put',
  },
  chatsTts: {
    url: chatsTts,
    method: 'post',
  },
  chatsMindmap: {
    url: chatsMindmap,
    method: 'post',
  },
  chatsRelatedQuestions: {
    url: chatsRelatedQuestions,
    method: 'post',
  },
  documentInfoUpload: {
    method: 'post',
    url: documentInfoUpload,
  },
  fetchExternalChatInfo: {
    url: fetchExternalChatInfo,
    method: 'get',
  },
  shareSession: {
    url: shareSession,
    method: 'post',
  },
  listSharedConversations: {
    url: listSharedConversations,
    method: 'get',
  },
  getSharedConversation: {
    url: getSharedConversation,
    method: 'get',
  },
  reorderSharedConversations: {
    url: reorderSharedConversations,
    method: 'post',
  },
  renameSharedConversation: {
    url: renameSharedConversation,
    method: 'patch',
  },
  publishSharedConversation: {
    url: publishSharedConversation,
    method: 'post',
  },
  hideSharedConversation: {
    url: hideSharedConversation,
    method: 'post',
  },
  deleteSharedConversation: {
    url: deleteSharedConversation,
    method: 'delete',
  },
  forkSharedConversation: {
    url: forkSharedConversation,
    method: 'post',
  },
} as const;

const chatService = registerNextServer<keyof typeof methods>(methods);

export default chatService;
