import { create, type StoreApi } from 'zustand'
import { env } from '@/config/env'
import { api, refreshOrSignOut } from '@/lib/api'
import { getAccessToken } from '@/lib/token'
import type {
  ApiErrorResponse,
  ApiSuccessResponse,
  Conversation,
  ConversationListPayload,
  ConversationPayload,
  CreatedConversationPayload,
  Message,
  SendMessagePayload,
  VoiceEvent,
} from '@/types/api'

/** How a voice turn plays: the audio goes to the player, and the turn waits for it to be heard. */
export interface VoiceTurnHandlers {
  signal: AbortSignal
  /** The text of the audio that follows. */
  onSpeech: (text: string) => void
  onAudio: (pcm: ArrayBuffer, sampleRate: number) => void
  /** The part of the reply heard so far. */
  heard: () => string
  /** Resolves once everything received has been played. */
  whenPlayed: () => Promise<void>
}

interface ChatState {
  conversations: Conversation[]
  messages: Message[]
  activeConversationId: string | null
  /** Agent a chat that has not been created yet will belong to. Null means the default agent. */
  newChatAgentId: string | null
  conversationsLoading: boolean
  messagesLoading: boolean
  /** The chat on screen is waiting for a reply. */
  sending: boolean
  /** Chats with a reply on its way, so a chat opened again mid turn still shows it is waiting. */
  awaitingReply: string[]
  /**
   * Goes up each time a different chat is put on screen. A turn only writes to
   * the screen while its own chat is open, and voice mode ends when this changes.
   */
  chatView: number
  fetchConversations: () => Promise<void>
  openConversation: (conversationId: string) => Promise<void>
  startNewChat: (agentId?: string | null) => void
  sendMessage: (content: string) => Promise<string>
  /** A spoken turn. Resolves once the whole reply has been heard. */
  sendVoiceTurn: (content: string, handlers: VoiceTurnHandlers) => Promise<string>
  deleteConversation: (conversationId: string) => Promise<void>
  reset: () => void
}

const OPTIMISTIC_ID = 'optimistic-user-message'
const STREAMING_ID = 'streaming-reply'

function optimisticMessage(conversationId: string | null, content: string): Message {
  return {
    id: OPTIMISTIC_ID,
    conversationId: conversationId ?? '',
    role: 'user',
    content,
    sources: [],
    createdAt: new Date().toISOString(),
  }
}

/** How often a spoken reply's transcript catches up with the voice. */
const REVEAL_INTERVAL_MS = 80

type GetState = StoreApi<ChatState>['getState']
type SetState = StoreApi<ChatState>['setState']

/**
 * Creates the chat for a new chat's first message. It is listed straight away,
 * so it shows up even if that reply never finishes, but it only becomes the
 * chat on screen if the user is still on the new chat it was typed in.
 */
async function createConversation(set: SetState, agentId: string | null, view: number): Promise<string> {
  const { data } = await api.post<ApiSuccessResponse<CreatedConversationPayload>>(
    '/conversations',
    agentId ? { agentId } : {},
  )
  const { conversation } = data.data
  set((state) => ({
    conversations: [conversation, ...state.conversations],
    ...(state.chatView === view ? { activeConversationId: conversation.id } : {}),
  }))
  return conversation.id
}

/**
 * Where a turn is going. The optimistic message shows at once, and a new chat
 * is created first. When that fails, the message is taken back.
 */
async function beginTurn(get: GetState, set: SetState, content: string): Promise<string> {
  const { activeConversationId, newChatAgentId, chatView } = get()
  set((state) => ({
    sending: true,
    messages: [...state.messages, optimisticMessage(activeConversationId, content)],
  }))

  let conversationId: string
  try {
    conversationId = activeConversationId ?? (await createConversation(set, newChatAgentId, chatView))
  } catch (error) {
    set((state) =>
      state.chatView === chatView
        ? { sending: false, messages: state.messages.filter((message) => message.id !== OPTIMISTIC_ID) }
        : state,
    )
    throw error
  }
  set((state) => ({ awaitingReply: [...state.awaitingReply, conversationId] }))
  return conversationId
}

/** A chat's reply arrived or failed. It stops showing it is waiting, unless another reply is still on its way. */
function endTurn(set: SetState, conversationId: string): void {
  set((state) => {
    const index = state.awaitingReply.indexOf(conversationId)
    const awaitingReply = state.awaitingReply.filter((_, position) => position !== index)
    return {
      awaitingReply,
      ...(state.activeConversationId === conversationId ? { sending: awaitingReply.includes(conversationId) } : {}),
    }
  })
}

/** Changes the messages on screen, but only while they are `conversationId`'s. */
function updateChat(set: SetState, conversationId: string, update: (messages: Message[]) => Message[]): void {
  set((state) => (state.activeConversationId === conversationId ? { messages: update(state.messages) } : state))
}

/** A turn's stored messages go at the end, in place of its optimistic copy and of any copy a reload already brought in. */
function withTurn(messages: Message[], turn: Message[]): Message[] {
  const ids = new Set(turn.map((message) => message.id))
  return [...messages.filter((message) => message.id !== OPTIMISTIC_ID && !ids.has(message.id)), ...turn]
}

function listConversation(set: SetState, conversation: Conversation): void {
  set((state) => ({
    conversations: [conversation, ...state.conversations.filter((item) => item.id !== conversation.id)],
  }))
}

/** Shows the part of a spoken reply heard so far, in the chat it belongs to. */
function showHeardReply(set: SetState, conversationId: string, text: string): void {
  set((state) => {
    if (state.activeConversationId !== conversationId) {
      return state
    }
    const streaming = state.messages.some((message) => message.id === STREAMING_ID)
    return {
      sending: false,
      messages: streaming
        ? state.messages.map((message) => (message.id === STREAMING_ID ? { ...message, content: text } : message))
        : [
            ...state.messages,
            {
              id: STREAMING_ID,
              conversationId,
              role: 'assistant',
              content: text,
              sources: [],
              createdAt: new Date().toISOString(),
            },
          ],
    }
  })
}

async function readErrorMessage(response: Response): Promise<string | undefined> {
  const body = (await response.json().catch(() => null)) as ApiErrorResponse | null
  return body?.error?.message
}

/**
 * A streamed body cannot go through axios, so this repeats its auth handling:
 * an expired access token is refreshed once and the request replayed.
 */
async function openVoiceStream(conversationId: string, content: string, signal: AbortSignal): Promise<Response> {
  const post = (token: string | null) =>
    fetch(`${env.apiUrl}/voice/conversations/${conversationId}/turn`, {
      method: 'POST',
      credentials: 'include',
      signal,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ content }),
    })

  const sentToken = getAccessToken()
  let response = await post(sentToken)
  if (response.status === 401) {
    const body = (await response.clone().json().catch(() => null)) as ApiErrorResponse | null
    if (body?.error?.code === 'ACCESS_TOKEN_EXPIRED') {
      // Another request may have refreshed already. Refreshing again would trip reuse detection.
      const current = getAccessToken()
      response = await post(current && current !== sentToken ? current : await refreshOrSignOut())
    }
  }

  if (!response.ok || !response.body) {
    throw new Error((await readErrorMessage(response)) ?? 'Could not start the voice reply')
  }
  return response
}

async function readVoiceEvents(response: Response, onEvent: (event: VoiceEvent) => void): Promise<void> {
  if (!response.body) {
    return
  }
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let pending = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) {
      return
    }
    pending += decoder.decode(value, { stream: true })
    const events = pending.split('\n\n')
    pending = events.pop() ?? ''
    for (const event of events) {
      const json = event.replace(/^data:\s*/, '').trim()
      if (json) {
        onEvent(JSON.parse(json) as VoiceEvent)
      }
    }
  }
}

function decodeBase64(data: string): ArrayBuffer {
  const binary = atob(data)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes.buffer
}

/** Conversation state and the calls that fill it, kept together for the prototype. */
export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  messages: [],
  activeConversationId: null,
  newChatAgentId: null,
  conversationsLoading: false,
  messagesLoading: false,
  sending: false,
  awaitingReply: [],
  chatView: 0,

  fetchConversations: async () => {
    set({ conversationsLoading: true })
    try {
      const { data } = await api.get<ApiSuccessResponse<ConversationListPayload>>('/conversations')
      set({ conversations: data.data.conversations })
    } finally {
      set({ conversationsLoading: false })
    }
  },

  openConversation: async (conversationId) => {
    if (get().activeConversationId === conversationId && get().messages.length > 0) {
      return
    }
    set((state) => ({
      activeConversationId: conversationId,
      chatView: state.chatView + 1,
      messagesLoading: true,
      messages: [],
      sending: state.awaitingReply.includes(conversationId),
    }))
    try {
      const { data } = await api.get<ApiSuccessResponse<ConversationPayload>>(
        `/conversations/${conversationId}`,
      )
      // Another chat may have been opened while this one loaded.
      updateChat(set, conversationId, () => data.data.conversation.messages)
    } finally {
      set((state) => (state.activeConversationId === conversationId ? { messagesLoading: false } : state))
    }
  },

  startNewChat: (agentId = null) => {
    set((state) => ({
      activeConversationId: null,
      chatView: state.chatView + 1,
      messages: [],
      newChatAgentId: agentId,
      sending: false,
    }))
  },

  /** Creates the conversation on the first message, then persists the turn. */
  sendMessage: async (content) => {
    const conversationId = await beginTurn(get, set, content)
    try {
      const { data } = await api.post<ApiSuccessResponse<SendMessagePayload>>(
        `/conversations/${conversationId}/messages`,
        { content },
      )
      const { userMessage, replies, conversation } = data.data
      updateChat(set, conversationId, (messages) => withTurn(messages, [userMessage, ...replies]))
      listConversation(set, conversation)
      return conversationId
    } catch (error) {
      updateChat(set, conversationId, (messages) => messages.filter((message) => message.id !== OPTIMISTIC_ID))
      throw error
    } finally {
      endTurn(set, conversationId)
    }
  },

  sendVoiceTurn: async (content, { signal, onSpeech, onAudio, heard, whenPlayed }) => {
    const conversationId = await beginTurn(get, set, content)

    // The transcript follows the voice rather than racing ahead of it. It only ever grows,
    // because a piece's text arrives before all of its audio.
    let shown = ''
    const reveal = window.setInterval(() => {
      const text = heard()
      if (text.length > shown.length) {
        shown = text
        showHeardReply(set, conversationId, text)
      }
    }, REVEAL_INTERVAL_MS)

    const progress = { userMessageId: OPTIMISTIC_ID, sampleRate: 0, spoke: false, replies: null as Message[] | null }
    try {
      const response = await openVoiceStream(conversationId, content, signal)

      await readVoiceEvents(response, (event) => {
        switch (event.type) {
          case 'start':
            progress.sampleRate = event.sampleRate
            progress.userMessageId = event.userMessage.id
            updateChat(set, conversationId, (messages) =>
              messages.map((message) => (message.id === OPTIMISTIC_ID ? event.userMessage : message)),
            )
            break
          case 'speech':
            progress.spoke = true
            onSpeech(event.text)
            break
          case 'audio':
            onAudio(decodeBase64(event.data), progress.sampleRate)
            break
          case 'reply':
            progress.replies = event.replies
            listConversation(set, event.conversation)
            break
          case 'error':
            throw new Error(event.message)
          case 'done':
            break
        }
      })

      const replies = progress.replies
      if (!replies) {
        throw new Error('The voice reply was cut off. Please try again.')
      }
      // The stored reply takes the transcript's place once all of it is heard.
      await whenPlayed()
      if (signal.aborted) {
        throw new DOMException('Talked over', 'AbortError')
      }
      updateChat(set, conversationId, (messages) => [
        ...messages.filter((message) => message.id !== STREAMING_ID),
        ...replies,
      ])
      return conversationId
    } catch (error) {
      const talkedOver = signal.aborted
      /**
       * Talked over mid reply: what was heard stays, and the server stores the whole turn.
       * Talked over before it spoke: the server took the turn back, and the words are sent
       * again with what the user said next. Failed: only a message never stored goes.
       */
      const keepsReply = talkedOver && progress.spoke
      const dropsUserMessage = talkedOver ? !progress.spoke : progress.userMessageId === OPTIMISTIC_ID
      const suffix = Date.now()
      updateChat(set, conversationId, (messages) =>
        messages
          .filter((message) => !(dropsUserMessage && message.id === progress.userMessageId))
          .filter((message) => keepsReply || message.id !== STREAMING_ID)
          .map((message) => (message.id === STREAMING_ID ? { ...message, id: `${STREAMING_ID}-${suffix}` } : message)),
      )
      throw error
    } finally {
      window.clearInterval(reveal)
      endTurn(set, conversationId)
    }
  },

  deleteConversation: async (conversationId) => {
    await api.delete(`/conversations/${conversationId}`)
    set((state) => ({
      conversations: state.conversations.filter((item) => item.id !== conversationId),
      ...(state.activeConversationId === conversationId
        ? { activeConversationId: null, messages: [] }
        : {}),
    }))
  },

  reset: () => {
    set((state) => ({
      conversations: [],
      messages: [],
      activeConversationId: null,
      newChatAgentId: null,
      sending: false,
      awaitingReply: [],
      chatView: state.chatView + 1,
    }))
  },
}))
