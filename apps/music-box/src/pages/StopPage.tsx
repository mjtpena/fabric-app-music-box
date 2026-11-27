import { useCallback, useMemo, useState } from 'react';
import { OctagonPause, Play, ShieldAlert } from 'lucide-react';

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

import { CHANNEL_LABELS, MIN_DELIVERED, PAUSE_UNSUB, STATUS_LABELS } from '../domain/config';
import { enrichWorkspace, loadWorkspace, pauseCampaign, recordDeliveryMetrics, resumeCampaign } from '../domain/campaigns';
import type { Schema } from '../model';

export function StopPage() {
  const { store, me } = useApp<Schema>();
  const load = useCallback(() => loadWorkspace(store), [store]);
  const state = useAsync(load, [load]);
  usePolling(state.reload, 5000);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const enriched = useMemo(() => (state.data ? enrichWorkspace(state.data) : null), [state.data]);
  const paused = useMemo(() => enriched?.campaigns.filter((c) => c.campaign.status === 'paused') ?? [], [enriched]);
  const active = useMemo(
    () => enriched?.campaigns.filter((c) => c.campaign.status === 'scheduled' || c.campaign.status === 'sending') ?? [],
    [enriched],
  );

  const handleResume = async (id: string, name: string) => {
    setError(null);
    setBusyId(id);
    try {
      await resumeCampaign(store, me, id);
      setToast(`Resumed "${name}".`);
      await state.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not resume campaign.');
    } finally {
      setBusyId(null);
    }
  };

  const handlePause = async (id: string, name: string) => {
    setError(null);
    setBusyId(id);
    try {
      await pauseCampaign(store, me, id);
      setToast(`Paused "${name}".`);
      await state.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not pause campaign.');
    } finally {
      setBusyId(null);
    }
  };

  const handleSimulateSpike = async (id: string, name: string) => {
    setError(null);
    setBusyId(id);
    try {
      const { autoPaused } = await recordDeliveryMetrics(store, me, id, 2500, 18);
      setToast(autoPaused ? `Auto-paused "${name}" at 0.72% unsubscribes (Rule 5).` : `Updated metrics for "${name}".`);
      await state.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update delivery metrics.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Stop"
        subtitle={`Automatic pause at ≥${(PAUSE_UNSUB.email * 100).toFixed(1)}% email or ≥${(PAUSE_UNSUB.sms * 100).toFixed(1)}% SMS/push unsubscribes after ${MIN_DELIVERED.toLocaleString()} delivered.`}
      />

      {!me.isAdmin && (
        <Callout tone="warn" icon={<ShieldAlert size={16} />} title="Messaging lead required to resume">
          Signed in as {me.displayName}. Campaign owners cannot resume auto-paused sends; the Messaging lead must review and resume them.
        </Callout>
      )}

      {error && <InlineError error={error} />}

      <DataState state={state} loadingRows={4}>
        {() =>
          enriched && (
            <>
              <StatStrip>
                <Stat label="Paused campaigns" value={String(paused.length)} tone={paused.length > 0 ? 'bad' : 'ok'} />
                <Stat label="Active / scheduled" value={String(active.length)} />
                <Stat label="Email auto-pause" value={`${(PAUSE_UNSUB.email * 100).toFixed(1)}%`} />
                <Stat label="Min delivered" value={MIN_DELIVERED.toLocaleString()} />
              </StatStrip>

              <Section title="Paused & auto-stopped campaigns">
                {paused.length === 0 ? (
                  <EmptyState title="No paused campaigns" bordered>
                    Campaigns that trip the unsubscribe threshold pause here automatically.
                  </EmptyState>
                ) : (
                  <TableWrap label="Paused campaigns">
                    <Table>
                      <thead>
                        <tr>
                          <Th>Campaign</Th>
                          <Th>Channel</Th>
                          <Th numeric>Delivered</Th>
                          <Th numeric>Unsubs</Th>
                          <Th numeric>Unsub rate</Th>
                          <Th>Action</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {paused.map((e) => (
                          <Tr key={e.campaign.id} data-testid={`paused-row-${e.campaign.name}`}>
                            <Td>
                              <div className="font-medium text-fg">{e.campaign.name}</div>
                              <div className="text-xs text-muted">{e.segment?.name} · {e.campaign.ownerName}</div>
                            </Td>
                            <Td>{CHANNEL_LABELS[e.campaign.channel]}</Td>
                            <Td numeric>{e.campaign.delivered.toLocaleString()}</Td>
                            <Td numeric>{e.campaign.unsubs.toLocaleString()}</Td>
                            <Td numeric className="font-semibold text-bad-text">
                              {e.unsubCheck.unsubRatePct.toFixed(2)}%
                            </Td>
                            <Td>
                              <Button
                                size="sm"
                                variant="primary"
                                icon={<Play size={14} />}
                                disabled={!me.isAdmin}
                                busy={busyId === e.campaign.id}
                                onClick={() => handleResume(e.campaign.id, e.campaign.name)}
                                data-testid={`resume-btn-${e.campaign.name}`}
                              >
                                Resume
                              </Button>
                            </Td>
                          </Tr>
                        ))}
                      </tbody>
                    </Table>
                  </TableWrap>
                )}
              </Section>

              <Section title="Active sends (manual stop or spike test)">
                <TableWrap label="Active campaigns">
                  <Table>
                    <thead>
                      <tr>
                        <Th>Campaign</Th>
                        <Th>Channel</Th>
                        <Th>Status</Th>
                        <Th>Action</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {active.slice(0, 6).map((e) => (
                        <Tr key={e.campaign.id}>
                          <Td className="font-medium text-fg">{e.campaign.name}</Td>
                          <Td>{CHANNEL_LABELS[e.campaign.channel]}</Td>
                          <Td>
                            <Badge tone="info">{STATUS_LABELS[e.campaign.status]}</Badge>
                          </Td>
                          <Td>
                            <div className="flex flex-wrap gap-1.5">
                              <Button
                                size="sm"
                                variant="subtle"
                                icon={<OctagonPause size={14} />}
                                busy={busyId === e.campaign.id}
                                onClick={() => handlePause(e.campaign.id, e.campaign.name)}
                              >
                                Pause
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                busy={busyId === e.campaign.id}
                                onClick={() => handleSimulateSpike(e.campaign.id, e.campaign.name)}
                              >
                                Test 0.7% spike
                              </Button>
                            </div>
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
