import { CircleOffIcon, MessageSquareIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { Agent } from '@/types/api'

export function AgentCard({ agent, onChat }: { agent: Agent; onChat: (agent: Agent) => void }) {
  return (
    <Card className={cn('h-full', !agent.enabled && 'opacity-70')}>
      <CardContent className="flex h-full flex-col gap-4">
        <div className="flex items-start justify-between gap-2">
          <span className="flex size-12 items-center justify-center rounded-xl bg-muted text-2xl" aria-hidden>
            {agent.emoji}
          </span>
          {!agent.enabled ? (
            <Badge variant="outline">Disabled</Badge>
          ) : agent.isDefault ? (
            <Badge variant="secondary">Default</Badge>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <h3 className="font-heading text-lg font-semibold">{agent.name}</h3>
          <p className="text-sm text-muted-foreground">
            {agent.enabled ? agent.description : 'This agent has been turned off by your administrator.'}
          </p>
        </div>

        <Button className="mt-auto w-full" disabled={!agent.enabled} onClick={() => onChat(agent)}>
          {agent.enabled ? <MessageSquareIcon /> : <CircleOffIcon />}
          {agent.enabled ? 'Chat now' : 'Disabled'}
        </Button>
      </CardContent>
    </Card>
  )
}
