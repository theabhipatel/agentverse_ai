import { BookOpenIcon, SparklesIcon } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Bubble, BubbleContent } from '@/components/ui/bubble'
import { Message, MessageContent } from '@/components/ui/message'
import type { Message as ChatMessage } from '@/types/api'
import { MarkdownContent } from './markdown-content'

export function MessageItem({ message }: { message: ChatMessage }) {
  if (message.role === 'user') {
    return (
      <Message align="end">
        <Bubble align="end">
          <BubbleContent className="whitespace-pre-wrap">{message.content}</BubbleContent>
        </Bubble>
      </Message>
    )
  }

  // Tool results stay in the transcript because the agent needs them, but they are never shown.
  if (message.role === 'tool') {
    return null
  }

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
            <MarkdownContent content={message.content} />
          </BubbleContent>
        </Bubble>
        {message.sources.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Sources from the Intelligence Hub:</span>
            {message.sources.map((source) => (
              <Badge key={source.documentId} variant="outline" className="max-w-64 font-normal">
                <BookOpenIcon />
                <span className="truncate">{source.title}</span>
              </Badge>
            ))}
          </div>
        ) : null}
      </MessageContent>
    </Message>
  )
}
