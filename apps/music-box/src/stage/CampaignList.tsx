import { useState } from 'react';

import {
  Badge,
  FilterSelect,
  SearchInput,
  Table,
  TableWrap,
  Td,
  Th,
  Toolbar,
  Tr,
} from '@x10/shared/ui';

import { CAPS, CHANNEL_LABELS, STATUS_LABELS } from '../domain/config';
import type { EnrichedMusicBox } from '../domain/campaigns';
import { CHANNELS } from '../model';

interface CampaignListProps {
  data: EnrichedMusicBox;
}

export function CampaignList({ data }: CampaignListProps) {
  const [query, setQuery] = useState('');
  const [channel, setChannel] = useState('all');

  const nameById = new Map(data.campaigns.map((c) => [c.campaign.id, c.campaign.name]));

  const filtered = data.campaigns.filter((e) => {
    if (channel !== 'all' && e.campaign.channel !== channel) return false;
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      return (
        e.campaign.name.toLowerCase().includes(q) ||
        (e.segment?.name.toLowerCase().includes(q) ?? false) ||
        e.campaign.ownerName.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="mx-auto max-w-[1200px] space-y-4 px-4 py-6 sm:px-6" data-testid="campaign-list">
      <Toolbar>
        <SearchInput
          value={query}
          onChange={setQuery}
          label="Search campaigns"
          placeholder="Search campaign, segment, owner…"
        />
        <FilterSelect
          label="Channel"
          value={channel}
          onChange={setChannel}
          options={[{ value: 'all', label: 'All' }, ...CHANNELS.map((c) => ({ value: c, label: CHANNEL_LABELS[c] }))]}
        />
      </Toolbar>

      <TableWrap label="Campaign send calendar with E(S) and overlap collisions">
        <Table>
          <thead>
            <tr>
              <Th>Campaign</Th>
              <Th>Segment</Th>
              <Th>Channel</Th>
              <Th>Send (UTC)</Th>
              <Th numeric>Audience</Th>
              <Th numeric>E(S)</Th>
              <Th>Status & signals</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((e) => {
              const colliding = e.collidesWithIds.length > 0;
              const partnerNames = e.collidesWithIds.map((id) => nameById.get(id)).filter(Boolean);
              return (
                <Tr key={e.campaign.id} data-testid={`list-row-${e.campaign.id}`} data-colliding={String(colliding)}>
                  <Td>
                    <div className="font-medium text-fg">{e.campaign.name}</div>
                    <div className="text-xs text-muted">{e.campaign.ownerName}</div>
                  </Td>
                  <Td muted>{e.segment?.name ?? '—'}</Td>
                  <Td>{CHANNEL_LABELS[e.campaign.channel]}</Td>
                  <Td className="font-mono text-xs">{e.campaign.sendAt.slice(0, 16).replace('T', ' ')}</Td>
                  <Td numeric>{e.campaign.audience.toLocaleString()}</Td>
                  <Td numeric>
                    <span className={e.overCap ? 'font-semibold text-bad-text' : 'text-fg'}>
                      {e.expectedTouches.toFixed(1)} / {CAPS[e.campaign.channel]}
                    </span>
                  </Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      <Badge
                        tone={
                          e.campaign.status === 'paused'
                            ? 'bad'
                            : e.campaign.status === 'sent'
                              ? 'ok'
                              : e.campaign.status === 'draft'
                                ? 'warn'
                                : 'info'
                        }
                      >
                        {STATUS_LABELS[e.campaign.status]}
                      </Badge>
                      {colliding && (
                        <span data-testid="list-collision-badge">
                          <Badge tone="warn" variant="soft">
                            Overlap &lt;2h ({partnerNames[0] ?? 'pair'})
                          </Badge>
                        </span>
                      )}
                      {e.quietViolations.length > 0 && (
                        <Badge tone="bad" variant="soft">
                          Quiet-hour {e.quietViolations[0].localTimeLabel}
                        </Badge>
                      )}
                      {e.unsubCheck.shouldPause && (
                        <Badge tone="bad" variant="soft">
                          Unsub {e.unsubCheck.unsubRatePct.toFixed(2)}%
                        </Badge>
                      )}
                    </div>
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      </TableWrap>
    </div>
  );
}
