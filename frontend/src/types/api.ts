/**
 * The frontend's own copy of the API contract. The backend owns its types,
 * this file owns ours. HTTP is the only thing shared between them.
 */

export type UserRole = 'user' | 'admin'

/** How an account can sign in. An account can hold both. */
export type SignInMethod = 'password' | 'google'

export interface User {
  id: string
  email: string
  name: string
  role: UserRole
  signInMethods: SignInMethod[]
  createdAt: string
}

export interface UpdateProfileInput {
  name: string
}

export interface ChangePasswordInput {
  /** Left out for an account that has never had a password. */
  currentPassword?: string
  newPassword: string
}

export interface ApiError {
  code: string
  message: string
  details?: Array<{ field: string; message: string }>
}

export interface ApiSuccessResponse<T> {
  success: true
  data: T
}

export interface ApiErrorResponse {
  success: false
  error: ApiError
}

export interface AuthPayload {
  user: User
  accessToken: string
}

export interface RefreshPayload {
  accessToken: string
}

export interface MePayload {
  user: User
}

export interface LoginInput {
  email: string
  password: string
}

export interface RegisterInput extends LoginInput {
  name: string
}

export type MessageRole = 'user' | 'assistant' | 'tool'

export interface Agent {
  id: string
  name: string
  emoji: string
  description: string
  isDefault: boolean
  /** False while an admin has this agent turned off for everyone. */
  enabled: boolean
  createdAt: string
}

/** The slice of an agent that labels a conversation. */
export interface AgentSummary {
  id: string
  name: string
  emoji: string
  enabled: boolean
}

/** 'all' includes accounts created later. 'selected' is exactly the users picked. */
export type AgentAudience = 'all' | 'selected'

export interface AdminAgentUser {
  id: string
  name: string
  email: string
}

/** Everything an admin manages on one agent. */
export interface AdminAgent {
  id: string
  name: string
  emoji: string
  description: string
  systemPrompt: string
  isDefault: boolean
  /** Chief of Staff or AI Coach: always visible to every user, and never deleted. */
  isBuiltIn: boolean
  enabled: boolean
  usesIntelligenceHub: boolean
  usesIntegrations: boolean
  audience: AgentAudience
  /** Who can see it when the audience is 'selected'. Empty for 'all'. */
  users: AdminAgentUser[]
  createdAt: string
  updatedAt: string
}

export interface AgentFormInput {
  name: string
  emoji: string
  description: string
  systemPrompt: string
  usesIntelligenceHub: boolean
  usesIntegrations: boolean
  audience: AgentAudience
  userIds: string[]
}

export interface AdminAgentListPayload {
  agents: AdminAgent[]
}

export interface AdminAgentPayload {
  agent: AdminAgent
}

export interface AgentListPayload {
  agents: Agent[]
}

// ---------- LLM providers and models ----------

export type ChatProvider = 'openrouter' | 'openai' | 'minimax' | 'glm'
export type SttProvider = 'groq' | 'openai'
export type TtsProvider = 'minimax' | 'elevenlabs'
export type LlmProvider = ChatProvider | 'groq' | 'elevenlabs'
export type LlmSection = 'chat' | 'voice' | 'stt' | 'tts' | 'embedding'

/** A stored key as an admin sees it. The key itself never leaves the server. */
export interface ProviderKey {
  provider: LlmProvider
  name: string
  hasKey: boolean
  /** The last 6 characters, so a key can be recognised without being readable. */
  last6: string | null
  updatedAt: string | null
}

export interface LlmSettings {
  chat: { provider: ChatProvider; model: string }
  /** sameAsChat means voice runs the chat model with its reasoning switched off. */
  voice: { sameAsChat: boolean; provider: ChatProvider | null; model: string | null }
  stt: { provider: SttProvider; model: string }
  tts: { provider: TtsProvider; model: string; voice: string }
  embedding: { provider: LlmProvider; model: string }
  providers: ProviderKey[]
}

export interface LlmSettingsPayload {
  settings: LlmSettings
}

/** An empty apiKey means "keep the stored key". */
export interface ChatModelInput {
  provider: ChatProvider
  model: string
  apiKey?: string
}

export interface VoiceModelInput {
  sameAsChat: boolean
  provider?: ChatProvider
  model?: string
  apiKey?: string
}

export interface SttInput {
  provider: SttProvider
  model: string
  apiKey?: string
}

export interface TtsInput {
  provider: TtsProvider
  model: string
  voice: string
  apiKey?: string
}

export interface EmbeddingInput {
  model: string
  apiKey?: string
}

/** Told to every user when something the app needs has no API key. */
export interface LlmWarning {
  feature: 'chat' | 'voice' | 'knowledge'
  message: string
}

export interface LlmStatusPayload {
  warnings: LlmWarning[]
}

/** One voice a text to speech provider offers, for the admin voice library. */
export interface VoiceOption {
  id: string
  name: string
  /** ElevenLabs hands back a ready made sample. MiniMax does not, so this is null there. */
  previewUrl: string | null
}

export interface VoiceListPayload {
  voices: VoiceOption[]
}

export interface Conversation {
  id: string
  title: string
  agent: AgentSummary
  createdAt: string
  updatedAt: string
}

/** An Intelligence Hub document a reply cited. */
export interface MessageSource {
  documentId: string
  title: string
}

export interface Message {
  id: string
  conversationId: string
  role: MessageRole
  content: string
  sources: MessageSource[]
  createdAt: string
}

export interface ConversationWithMessages extends Conversation {
  messages: Message[]
}

export interface ForgotPasswordPayload {
  sent: boolean
  /** How long the link is valid, already worded for display ("15 minutes"). */
  expiresIn: string
}

export interface ResetPasswordPayload {
  reset: boolean
}

export interface TranscriptionPayload {
  text: string
}

export interface ConversationListPayload {
  conversations: Conversation[]
}

export interface ConversationPayload {
  conversation: ConversationWithMessages
}

export interface CreatedConversationPayload {
  conversation: Conversation
}

export interface SendMessagePayload {
  userMessage: Message
  /** Tool results the agent produced, then its final answer. */
  replies: Message[]
  conversation: Conversation
}

/** One server sent event from POST /voice/conversations/:id/turn. */
export type VoiceEvent =
  /** The stored user message, and the rate of the PCM audio that follows. */
  | { type: 'start'; userMessage: Message; sampleRate: number }
  /** The text of the audio that follows, so the transcript can appear as it is spoken. */
  | { type: 'speech'; text: string }
  /** Base64 16 bit mono PCM. Chunks play back to back in arrival order. */
  | { type: 'audio'; data: string }
  /** The reply as stored. Shown in place of the spoken transcript once it has all been heard. */
  | { type: 'reply'; replies: Message[]; conversation: Conversation }
  | { type: 'error'; message: string }
  | { type: 'done' }

export type ToolkitSlug = 'gmail' | 'googlecalendar' | 'notion' | 'asana' | 'hubspot' | 'youtube'

export type IntegrationStatus = 'connected' | 'pending' | 'not_connected'

export interface Integration {
  slug: ToolkitSlug
  name: string
  description: string
  status: IntegrationStatus
  connected: boolean
}

export interface IntegrationListPayload {
  integrations: Integration[]
}

export interface ConnectIntegrationPayload {
  redirectUrl: string
  connectionRequestId: string
}

export interface AdminUser {
  id: string
  email: string
  name: string
  role: UserRole
  hasPassword: boolean
  googleLinked: boolean
  conversationCount: number
  integrationCount: number
  /** The toolkits an admin has allowed for this user, regardless of the platform wide switch. */
  allowedToolkits: ToolkitSlug[]
  createdAt: string
  updatedAt: string
}

export interface AdminUserListPayload {
  users: AdminUser[]
}

export interface AdminUserPayload {
  user: AdminUser
}

export interface CreateUserInput {
  name: string
  email: string
  password: string
  role: UserRole
  /** Left out means every toolkit. */
  toolkits?: ToolkitSlug[]
}

export interface UpdateUserInput {
  name?: string
  email?: string
  password?: string
  role?: UserRole
  /** Left out means leave the user's toolkit access as it is. */
  toolkits?: ToolkitSlug[]
}

export interface ToolkitUsage {
  toolkit: ToolkitSlug
  name: string
  enabled: boolean
  connectedUsers: number
}

export interface AdminIntegration {
  slug: ToolkitSlug
  name: string
  description: string
  enabled: boolean
  connectedUsers: number
}

export interface AdminIntegrationListPayload {
  integrations: AdminIntegration[]
}

export interface AdminIntegrationPayload {
  integration: AdminIntegration
}

export interface AdminStats {
  totalUsers: number
  adminUsers: number
  newUsersLast7Days: number
  totalConversations: number
  totalMessages: number
  toolCalls: number
  connectedIntegrations: number
  toolkitUsage: ToolkitUsage[]
}

export interface AdminStatsPayload {
  stats: AdminStats
}

export type KnowledgeStatus = 'processing' | 'ready' | 'failed'
export type KnowledgeSourceType = 'file' | 'url'

export interface KnowledgeDocument {
  id: string
  title: string
  sourceType: KnowledgeSourceType
  fileName: string | null
  fileSize: number | null
  url: string | null
  status: KnowledgeStatus
  error: string | null
  chunkCount: number
  createdAt: string
  updatedAt: string
}

export interface KnowledgeDocumentListPayload {
  documents: KnowledgeDocument[]
}

export interface KnowledgeDocumentPayload {
  document: KnowledgeDocument
}

export interface AddKnowledgeUrlInput {
  url: string
  title?: string
}

export interface UpdateKnowledgeDocumentInput {
  title?: string
  url?: string
}

export interface SignupSettingPayload {
  enabled: boolean
}
