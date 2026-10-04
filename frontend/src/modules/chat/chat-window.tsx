import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { getApiErrorMessage } from '@/lib/api'
import { cn } from '@/lib/utils'
import { findAgent, useAgentStore } from '@/stores/agent-store'
import { useChatStore, type VoiceTurnHandlers } from '@/stores/chat-store'
import { ChatInput, type VoiceModeControls } from './chat-input'
import { MessageList } from './message-list'
import { useVoiceConversation } from './use-voice-conversation'
import { VoiceOrb } from './voice-orb'

export function ChatWindow() {
  const messages = useChatStore((state) => state.messages)
  const messagesLoading = useChatStore((state) => state.messagesLoading)
  const sending = useChatStore((state) => state.sending)
  const chatView = useChatStore((state) => state.chatView)
  const activeId = useChatStore((state) => state.activeConversationId)
  const conversations = useChatStore((state) => state.conversations)
  const newChatAgentId = useChatStore((state) => state.newChatAgentId)
  const sendMessage = useChatStore((state) => state.sendMessage)
  const sendVoiceTurn = useChatStore((state) => state.sendVoiceTurn)
  const agents = useAgentStore((state) => state.agents)
  const agentsLoaded = useAgentStore((state) => state.loaded)
  const navigate = useNavigate()

  const activeConversation = conversations.find((conversation) => conversation.id === activeId)
  const title = activeConversation?.title
  // An open chat names its own agent. A chat not created yet shows the one it will use.
  const agent = activeConversation?.agent ?? (activeId ? undefined : findAgent(agents, newChatAgentId))
  const isBlank = !activeId && messages.length === 0

  // An admin can turn agents off for everyone. Their chats stay readable, but locked.
  const lockedReason =
    agent && !agent.enabled
      ? `${agent.name} has been turned off by your administrator.${activeId ? ' You can still read this chat.' : ''}`
      : !activeId && agentsLoaded && !agent
        ? 'All agents have been turned off by your administrator.'
        : null

  // A new chat gets its address once its first message creates it, unless the user has moved to another chat since.
  const showCreatedChat = (conversationId: string) => {
    if (conversationId !== activeId && useChatStore.getState().activeConversationId === conversationId) {
      navigate(`/chat/${conversationId}`, { replace: true })
    }
  }

  const [orbExpanded, setOrbExpanded] = useState(false)

  const voice = useVoiceConversation({
    sendTurn: async (content: string, handlers: VoiceTurnHandlers) => {
      showCreatedChat(await sendVoiceTurn(content, handlers))
    },
  })

  // Voice mode belongs to the chat it was opened in. Opening another chat ends it, as in ChatGPT.
  const { active: voiceActive, stop: stopVoice } = voice
  useEffect(() => stopVoice, [chatView, stopVoice])

  // A locked chat has no controls, so an open voice session there is closed.
  useEffect(() => {
    if (lockedReason && voiceActive) {
      stopVoice()
    }
  }, [lockedReason, voiceActive, stopVoice])

  const voiceMode: VoiceModeControls = {
    active: voice.active,
    muted: voice.muted,
    onStart: () => {
      setOrbExpanded(false)
      void voice.start()
    },
    onEnd: voice.stop,
    onToggleMute: () => void voice.toggleMute(),
  }

  async function handleSend(content: string) {
    if (voice.active) {
      voice.sendText(content)
      return
    }
    try {
      showCreatedChat(await sendMessage(content))
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Could not send your message'))
    }
  }

  const renderOrb = (className?: string) => (
    <VoiceOrb
      phase={voice.phase}
      muted={voice.muted}
      getLevel={voice.getLevel}
      className={cn('animate-in fade-in zoom-in-50 duration-700', className)}
    />
  )
  // Clicking the orb grows it into the middle and hides the chat behind it, as ChatGPT does. The chat keeps going.
  const expanded = voice.active && orbExpanded

  return (
    <div className="flex h-svh flex-col">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
        <SidebarTrigger />
        {agent ? (
          <>
            <span className="flex shrink-0 items-center gap-1.5 text-sm font-medium">
              <span aria-hidden>{agent.emoji}</span>
              {agent.name}
            </span>
            <span className="text-muted-foreground" aria-hidden>
              /
            </span>
          </>
        ) : null}
        <h1 className="truncate text-sm text-muted-foreground">{title ?? 'New chat'}</h1>
      </header>

      {isBlank ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-8 px-4">
          {voice.active ? (
            renderOrb('size-32')
          ) : (
            <h2 className="text-center font-heading text-4xl font-bold tracking-tight sm:text-5xl">
              What can I help you with?
            </h2>
          )}
          <ChatInput
            onSend={handleSend}
            disabled={sending}
            lockedReason={lockedReason}
            autoFocus
            voiceMode={voiceMode}
            className="w-full max-w-2xl"
          />
        </div>
      ) : (
        <>
          <div className="relative flex min-h-0 flex-1 flex-col">
            {/* In voice mode the list keeps room at the bottom, so the last message can scroll clear of the orb. */}
            <MessageList
              messages={messages}
              loading={messagesLoading}
              thinking={sending}
              inert={expanded}
              className={cn(
                'min-h-0 flex-1 transition-opacity duration-500',
                voice.active && 'pb-32',
                expanded && 'opacity-0',
              )}
            />
            {voice.active ? (
              // As big as the list, so the orb can rest at its bottom or grow into its middle.
              <div className="pointer-events-none absolute inset-0 grid place-items-center @container-size">
                <button
                  type="button"
                  aria-label={expanded ? 'Show the conversation' : 'Hide the conversation'}
                  aria-pressed={expanded}
                  onClick={() => setOrbExpanded((current) => !current)}
                  className={cn(
                    'pointer-events-auto cursor-pointer rounded-full outline-none transition-[translate,scale] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] focus-visible:ring-[3px] focus-visible:ring-ring/50',
                    !expanded && 'translate-y-[calc(50cqh-3.5rem)] scale-40',
                  )}
                >
                  {renderOrb('size-48')}
                </button>
              </div>
            ) : null}
          </div>
          <div className="shrink-0 px-4 pb-6">
            <ChatInput
              onSend={handleSend}
              disabled={sending}
              lockedReason={lockedReason}
              voiceMode={voiceMode}
              className="mx-auto max-w-3xl"
            />
          </div>
        </>
      )}
    </div>
  )
}
