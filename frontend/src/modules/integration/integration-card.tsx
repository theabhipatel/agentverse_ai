import { CheckIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from '@/components/ui/item'
import { Spinner } from '@/components/ui/spinner'
import type { Integration } from '@/types/api'
import { INTEGRATION_ICONS } from './integration-icons'

export function IntegrationCard({
  integration,
  busy,
  onConnect,
  onDisconnect,
}: {
  integration: Integration
  busy: boolean
  onConnect: () => void
  onDisconnect: () => void
}) {
  const Icon = INTEGRATION_ICONS[integration.slug]

  return (
    <Item variant="outline">
      <ItemMedia variant="icon">
        <Icon />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>{integration.name}</ItemTitle>
        <ItemDescription>{integration.description}</ItemDescription>
      </ItemContent>
      <ItemActions>
        {integration.connected ? (
          <>
            <Badge>
              <CheckIcon />
              Connected
            </Badge>
            <Button variant="outline" size="sm" disabled={busy} onClick={onDisconnect}>
              {busy ? <Spinner /> : null}
              Disconnect
            </Button>
          </>
        ) : (
          <>
            {integration.status === 'pending' ? <Badge variant="secondary">Pending</Badge> : null}
            <Button size="sm" disabled={busy} onClick={onConnect}>
              {busy ? <Spinner /> : null}
              Connect
            </Button>
          </>
        )}
      </ItemActions>
    </Item>
  )
}
