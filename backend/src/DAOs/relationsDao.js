import { getDatabase } from '../database.js';

export const relationsDao = {
  // User <-> Project
  async connectUserAndProject(userId, projectId, db = getDatabase()) {
    return db.project.update({
      where: { id: projectId },
      data: { userId },
    });
  },

  async disconnectUserAndProject(projectId, db = getDatabase()) {
    return db.project.update({
      where: { id: projectId },
      data: { userId: null },
    });
  },

  // Project <-> ProjectSkeleton
  async connectProjectAndSkeleton(projectId, skeletonId, db = getDatabase()) {
    return db.projectSkeleton.update({
      where: { id: skeletonId },
      data: { projectId },
    });
  },

  // User <-> Session
  async connectUserAndSession(userId, tokenHash, db = getDatabase()) {
    return db.session.update({
      where: { tokenHash },
      data: { userId },
    });
  },

  // User <-> Conversation
  async connectUserAndConversation(userId, conversationId, db = getDatabase()) {
    return db.conversation.update({
      where: { id: conversationId },
      data: { userId },
    });
  },

  async disconnectUserAndConversation(conversationId, db = getDatabase()) {
    return db.conversation.update({
      where: { id: conversationId },
      data: { userId: null },
    });
  },

  // Project <-> Conversation
  async connectProjectAndConversation(projectId, conversationId, db = getDatabase()) {
    return db.conversation.update({
      where: { id: conversationId },
      data: { projectId },
    });
  },

  async disconnectProjectAndConversation(conversationId, db = getDatabase()) {
    return db.conversation.update({
      where: { id: conversationId },
      data: { projectId: null },
    });
  },

  // Conversation <-> Message
  async connectConversationAndMessage(conversationId, messageId, db = getDatabase()) {
    return db.message.update({
      where: { id: messageId },
      data: { conversationId },
    });
  },

  // User <-> Message
  async connectUserAndMessage(userId, messageId, db = getDatabase()) {
    return db.message.update({
      where: { id: messageId },
      data: { userId },
    });
  },

  async disconnectUserAndMessage(messageId, db = getDatabase()) {
    return db.message.update({
      where: { id: messageId },
      data: { userId: null },
    });
  },

  // Message <-> ModelRoute
  async connectMessageAndRoute(messageId, routeId, db = getDatabase()) {
    return db.modelRoute.update({
      where: { id: routeId },
      data: { messageId },
    });
  },
};

export default relationsDao;
