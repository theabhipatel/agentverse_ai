import type { RequestHandler } from 'express';
import type { ParamsDictionary } from 'express-serve-static-core';
import { getAuthenticatedUser } from '../../common/middleware/requireAuth.js';
import { sendSuccess } from '../../common/utils/apiResponse.js';
import type { CreateConversationInput, CreateMessageInput } from './conversation.schema.js';
import * as conversationService from './conversation.service.js';

interface ConversationParams extends ParamsDictionary {
  id: string;
}

export const create: RequestHandler<ParamsDictionary, unknown, CreateConversationInput> = async (
  req,
  res,
) => {
  const { id: userId } = getAuthenticatedUser(req);
  const conversation = await conversationService.createConversation(userId, req.body);
  sendSuccess(res, { conversation }, 201);
};

export const list: RequestHandler = async (req, res) => {
  const { id: userId } = getAuthenticatedUser(req);
  const conversations = await conversationService.listConversations(userId);
  sendSuccess(res, { conversations });
};

export const getById: RequestHandler<ConversationParams> = async (req, res) => {
  const { id: userId } = getAuthenticatedUser(req);
  const conversation = await conversationService.getConversation(userId, req.params.id);
  sendSuccess(res, { conversation });
};

export const remove: RequestHandler<ConversationParams> = async (req, res) => {
  const { id: userId } = getAuthenticatedUser(req);
  await conversationService.deleteConversation(userId, req.params.id);
  sendSuccess(res, { deleted: true });
};

export const listMessages: RequestHandler<ConversationParams> = async (req, res) => {
  const { id: userId } = getAuthenticatedUser(req);
  const messages = await conversationService.listMessages(userId, req.params.id);
  sendSuccess(res, { messages });
};

export const createMessage: RequestHandler<ConversationParams, unknown, CreateMessageInput> = async (
  req,
  res,
) => {
  const { id: userId } = getAuthenticatedUser(req);
  const result = await conversationService.sendMessage(userId, req.params.id, req.body.content);
  sendSuccess(res, result, 201);
};
