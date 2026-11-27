import { useCallback, useMemo, useState } from 'react';
import { CheckCircle2, ShieldAlert } from 'lucide-react';

import { useAsync, usePolling } from '@x10/shared/lib';
import { useApp } from '@x10/shared/runtime';
import {
  Badge,
  Button,
  Callout,
  DataState,
  EmptyState,
  InlineError,
  PageHeader,
  Section,
  Stat,
  StatStrip,
  Table,
  TableWrap,
  Td,
  Th,
  Toast,
  Tr,
} from '@x10/shared/ui';

import { CAPS, CHANNEL_LABELS } from '../domain/config';
import { approveCapOverride, enrichWorkspace, loadWorkspace } from '../domain/campaigns';
import type { Schema } from '../model';

export function CombPage() {
  const { store, me } = useApp<Schema>();
  const load = useCallback(() => loadWorkspace(store), [store]);
  const state = useAsync(load, [load]);
  usePolling(state.reload, 5000);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const enriched = useMemo(() => (state.data ? enrichWorkspace(state.data) : null), [state.data]);
  const pendingOverrides = useMemo(
    () => enriched?.campaigns.filter((c) => c.awaitingOverride) ?? [],
    [enriched],
  );

  const handleApprove = async (id: string, name: string) => {
    setError(null);
    setBusyId(id);
    try {
      await approveCapOverride(store, me, id);
      setToast(`Approved cap override for "${name}".`);
      await state.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Approval failed.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Comb"
        subtitle={`Daily channel fatigue caps (Email ${CAPS.email} · SMS ${CAPS.sms} · Push ${CAPS.push}) and Messaging lead override approvals.`}
      />

      {!me.isAdmin && (
        <Callout tone="warn" icon={<ShieldAlert size={16} />} title="Messaging lead required for overrides">
          Signed in as {me.displayName}. Only the Messaging lead can approve cap overrides.
        </Callout>
      )}

      {error && <InlineError error={error} />}

      <DataState state={state} loadingRows={4}>
        {() =>
          enriched && (
            <>
              <StatStrip>
                <Stat
                  label="Segments over cap"
                  value={String(enriched.segments.filter((s) => s.anyOverCap).length)}
                  tone={enriched.segments.some((s) => s.anyOverCap) ? 'bad' : 'ok'}
                />
                <Stat
                  label="Pending overrides"
                  value={String(pendingOverrides.length)}
                  tone={pendingOverrides.length > 0 ? 'warn' : 'ok'}
                />
                <Stat label="Throughput warnings" value={String(enriched.throughput.length)} />
              </StatStrip>

              <Section title="Pending cap overrides">
                {pendingOverrides.length === 0 ? (
                  <EmptyState title="No cap overrides awaiting approval" bordered>
                    Draft campaigns that exceed a channel cap with a 20+ character reason appear here.
                  </EmptyState>
                ) : (
                  <TableWrap label="Pending cap overrides">
                    <Table>
                      <thead>
                        <tr>
                          <Th>Campaign</Th>
                          <Th>Segment</Th>
                          <Th>Channel</Th>
                          <Th>Override reason</Th>
                          <Th>Action</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {pendingOverrides.map((e) => (
                          <Tr key={e.campaign.id} data-testid={`override-row-${e.campaign.id}`}>
                            <Td className="font-medium text-fg">{e.campaign.name}</Td>
                            <Td muted>{e.segment?.name ?? '—'}</Td>
                            <Td>{CHANNEL_LABELS[e.campaign.channel]}</Td>
                            <Td className="max-w-[360px] text-xs text-muted">{e.campaign.capOverrideReason}</Td>
                            <Td>
                              <Button
                                size="sm"
                                variant="primary"
                                icon={<CheckCircle2 size={14} />}
                                disabled={!me.isAdmin}
                                busy={busyId === e.campaign.id}
                                onClick={() => handleApprove(e.campaign.id, e.campaign.name)}
                                data-testid={`approve-override-${e.campaign.id}`}
                              >
                                Approve
                              </Button>
                            </Td>
                          </Tr>
                        ))}
                      </tbody>
                    </Table>
                  </TableWrap>
                )}
              </Section>

              <Section title="Expected touches E(S) by segment today">
                <TableWrap label="Segment expected touches">
                  <Table>
                    <thead>
                      <tr>
                        <Th>Segment</Th>
                        <Th numeric>Size</Th>
                        <Th numeric>Email (cap {CAPS.email})</Th>
                        <Th numeric>SMS (cap {CAPS.sms})</Th>
                        <Th numeric>Push (cap {CAPS.push})</Th>
                        <Th>Status</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {enriched.segments.map((s) => (
                        <Tr key={s.segment.id}>
                          <Td className="font-medium text-fg">{s.segment.name}</Td>
                          <Td numeric>{s.segment.size.toLocaleString()}</Td>
                          <Td numeric className={s.touchesByChannel.email.overCap ? 'font-semibold text-bad-text' : undefined}>
                            {s.touchesByChannel.email.touches.toFixed(1)}
                          </Td>
                          <Td numeric className={s.touchesByChannel.sms.overCap ? 'font-semibold text-bad-text' : undefined}>
                            {s.touchesByChannel.sms.touches.toFixed(1)}
                          </Td>
                          <Td numeric className={s.touchesByChannel.push.overCap ? 'font-semibold text-bad-text' : undefined}>
                            {s.touchesByChannel.push.touches.toFixed(1)}
                          </Td>
                          <Td>
                            <Badge tone={s.anyOverCap ? 'bad' : 'ok'}>
                              {s.anyOverCap ? 'Over cap' : 'Within cap'}
                            </Badge>
                          </Td>
                        </Tr>
                      ))}
                    </tbody>
                  </Table>
                </TableWrap>
              </Section>
            </>
          )
        }
      </DataState>

      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </div>
  );
}
