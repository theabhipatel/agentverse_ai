import { useEffect, useLayoutEffect, useRef } from 'react'
import { SparklesIcon } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Bubble, BubbleContent } from '@/components/ui/bubble'
import { Message, MessageContent, MessageGroup } from '@/components/ui/message'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import type { Message as ChatMessage } from '@/types/api'
import { MessageItem } from './message-item'

/** This close to the bottom counts as being at the bottom. */
const NEAR_BOTTOM_PX = 48

function ThinkingBubble() {
  return (
    <Message>
      <Avatar className="size-8 shrink-0">
        <AvatarFallback className="bg-primary/10 text-primary">
          <SparklesIcon className="size-4" />
        </AvatarFallback>
      </Avatar>
      <MessageContent>
        <Bubble variant="muted">
          <BubbleContent>
            <span className="flex gap-1">
              <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.2s]" />
              <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.1s]" />
              <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground" />
            </span>
          </BubbleContent>
        </Bubble>
      </MessageContent>
    </Message>
  )
}

export function MessageList({
  messages,
  loading,
  thinking,
  inert,
  className,
}: {
  messages: ChatMessage[]
  loading: boolean
  thinking: boolean
  /** Hidden behind the voice orb: still there and kept up to date, but out of reach. */
  inert?: boolean
  className?: string
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  /** Whether the list keeps up with new text. Off once the reader scrolls up, on again at the bottom. */
  const followRef = useRef(true)
  const lastTopRef = useRef(0)
  const last = messages.at(-1)
  const lastId = last?.id
  const lastRole = last?.role

  // Opening a chat, or sending in it, always goes to the end.
  useLayoutEffect(() => {
    if (loading || lastRole === 'user') {
      followRef.current = true
    }
  }, [loading, lastId, lastRole])

  // Anything that changes the height, a new message or a spoken reply filling in, keeps the end in view.
  useEffect(() => {
    const scroller = scrollRef.current
    const content = contentRef.current
    if (!scroller || !content) {
      return
    }
    const observer = new ResizeObserver(() => {
      if (followRef.current) {
        // The very end, past the room kept for the voice orb.
        scroller.scrollTop = scroller.scrollHeight
      }
    })
    observer.observe(scroller)
    observer.observe(content)
    return () => observer.disconnect()
  }, [])

  function handleScroll() {
    const scroller = scrollRef.current
    if (!scroller) {
      return
    }
    const fromBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight
    // Moving up is the reader looking back. Content shrinking also moves the list up, but leaves it at the bottom.
    if (scroller.scrollTop < lastTopRef.current && fromBottom > 1) {
      followRef.current = false
    } else if (fromBottom <= NEAR_BOTTOM_PX) {
      followRef.current = true
    }
    lastTopRef.current = scroller.scrollTop
  }

  return (
    <div ref={scrollRef} onScroll={handleScroll} inert={inert} className={cn('overflow-y-auto', className)}>
      <div ref={contentRef} className="mx-auto w-full max-w-3xl px-4 py-6">
        {loading ? (
          <div className="space-y-4">
            <Skeleton className="ml-auto h-12 w-2/3" />
            <Skeleton className="h-20 w-3/4" />
          </div>
        ) : (
          <MessageGroup className="gap-6">
            {messages.map((message) => (
              <MessageItem key={message.id} message={message} />
            ))}
            {thinking ? <ThinkingBubble /> : null}
          </MessageGroup>
        )}
      </div>
    </div>
  )
}
