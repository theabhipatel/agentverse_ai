import type { RequestHandler } from 'express';
import type { ParamsDictionary } from 'express-serve-static-core';
import { getAuthenticatedUser } from '../../common/middleware/requireAuth.js';
import { sendSuccess } from '../../common/utils/apiResponse.js';
import type { AgentFormInput } from '../agent/agent.schema.js';
import * as agentService from '../agent/agent.service.js';
import * as authService from '../auth/auth.service.js';
import type { ToolkitSlug } from '../integration/integration.constants.js';
import * as integrationService from '../integration/integration.service.js';
import type { CreateUserInput, IntegrationSwitchInput, UpdateUserInput } from './admin.schema.js';
import * as adminService from './admin.service.js';

interface UserParams extends ParamsDictionary {
  id: string;
}

interface ToolkitParams extends ParamsDictionary {
  toolkit: ToolkitSlug;
}

interface AgentParams extends ParamsDictionary {
  id: string;
}

export const getStats: RequestHandler = async (_req, res) => {
  const stats = await adminService.getStats();
  sendSuccess(res, { stats });
};

export const listUsers: RequestHandler = async (_req, res) => {
  const users = await adminService.listUsers();
  sendSuccess(res, { users });
};

export const getUser: RequestHandler<UserParams> = async (req, res) => {
  const user = await adminService.getUser(req.params.id);
  sendSuccess(res, { user });
};

export const createUser: RequestHandler<ParamsDictionary, unknown, CreateUserInput> = async (
  req,
  res,
) => {
  const user = await adminService.createUser(req.body);
  sendSuccess(res, { user }, 201);
};

export const updateUser: RequestHandler<UserParams, unknown, UpdateUserInput> = async (req, res) => {
  const { id: actingAdminId } = getAuthenticatedUser(req);
  const user = await adminService.updateUser(actingAdminId, req.params.id, req.body);
  sendSuccess(res, { user });
};

export const deleteUser: RequestHandler<UserParams> = async (req, res) => {
  const { id: actingAdminId } = getAuthenticatedUser(req);
  await adminService.deleteUser(actingAdminId, req.params.id);
  sendSuccess(res, { deleted: true });
};

export const listAgents: RequestHandler = async (_req, res) => {
  const agents = await agentService.listAdminAgents();
  sendSuccess(res, { agents });
};

export const createAgent: RequestHandler<ParamsDictionary, unknown, AgentFormInput> = async (req, res) => {
  const { id: actingAdminId } = getAuthenticatedUser(req);
  const agent = await agentService.createAgent(actingAdminId, req.body);
  sendSuccess(res, { agent }, 201);
};

export const updateAgent: RequestHandler<AgentParams, unknown, AgentFormInput> = async (req, res) => {
  const { id: actingAdminId } = getAuthenticatedUser(req);
  const agent = await agentService.updateAgent(actingAdminId, req.params.id, req.body);
  sendSuccess(res, { agent });
};

export const setAgentEnabled: RequestHandler<AgentParams, unknown, IntegrationSwitchInput> = async (req, res) => {
  const { id: actingAdminId } = getAuthenticatedUser(req);
  const agent = await agentService.setAgentEnabled(actingAdminId, req.params.id, req.body.enabled);
  sendSuccess(res, { agent });
};

export const deleteAgent: RequestHandler<AgentParams> = async (req, res) => {
  const { id: actingAdminId } = getAuthenticatedUser(req);
  await agentService.deleteAgent(actingAdminId, req.params.id);
  sendSuccess(res, { deleted: true });
};

export const listIntegrations: RequestHandler = async (_req, res) => {
  const integrations = await integrationService.listIntegrationSettings();
  sendSuccess(res, { integrations });
};

export const setIntegrationEnabled: RequestHandler<ToolkitParams, unknown, IntegrationSwitchInput> = async (
  req,
  res,
) => {
  const { id: actingAdminId } = getAuthenticatedUser(req);
  const integration = await integrationService.setIntegrationEnabled(
    actingAdminId,
    req.params.toolkit,
    req.body.enabled,
  );
  sendSuccess(res, { integration });
};

export const getSignupSetting: RequestHandler = async (_req, res) => {
  const enabled = await authService.isSignupEnabled();
  sendSuccess(res, { enabled });
};

export const setSignupSetting: RequestHandler<ParamsDictionary, unknown, IntegrationSwitchInput> = async (
  req,
  res,
) => {
  const { id: actingAdminId } = getAuthenticatedUser(req);
  const enabled = await authService.setSignupEnabled(actingAdminId, req.body.enabled);
  sendSuccess(res, { enabled });
};
