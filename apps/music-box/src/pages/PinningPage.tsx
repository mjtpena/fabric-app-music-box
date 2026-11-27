import { useCallback, useMemo, useState } from 'react';
import { AlertTriangle, Pin } from 'lucide-react';

import { useAsync, usePolling } from '@x10/shared/lib';
import { useApp } from '@x10/shared/runtime';
import {
  Badge,
  Button,
  Callout,
  Card,
  Checkbox,
  DataState,
  Field,
  InlineError,
  Input,
  PageHeader,
  Select,
  Stat,
  StatStrip,
  TextArea,
  Toast,
} from '@x10/shared/ui';

import { CAPS, CHANNEL_LABELS, OVERRIDE_REASON_MIN_CHARS, SPIKE_FACTOR } from '../domain/config';
import { loadWorkspace, scheduleCampaign } from '../domain/campaigns';
import { checkCapBreaches, evaluateSmsWaves, evaluateWarmUp, sendDurationHours } from '../domain/rules';
import { CHANNELS, limits, type Channel, type Schema } from '../model';

export function PinningPage() {
  const { store, me } = useApp<Schema>();
  const load = useCallback(() => loadWorkspace(store), [store]);
  const state = useAsync(load, [load]);
  usePolling(state.reload, 5000);

  const defaultDay = (state.data?.now ?? new Date()).toISOString().slice(0, 10);
  const [name, setName] = useState('');
  const [channel, setChannel] = useState<Channel>('email');
  const [segmentId, setSegmentId] = useState('');
  const [sendDate, setSendDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [sendTime, setSendTime] = useState('16:10');
  const [audience, setAudience] = useState('15000');
  const [throttle, setThrottle] = useState('15000');
  const [localTime, setLocalTime] = useState(true);
  const [overrideReason, setOverrideReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const effectiveSegId = segmentId || state.data?.segments[1]?.id || state.data?.segments[0]?.id || '';
  const sendAtIso = `${sendDate || defaultDay}T${sendTime || '16:10'}:00.000Z`;

  const liveMath = useMemo(() => {
    if (!state.data || !effectiveSegId) return null;
    const aud = Math.max(0, Number(audience) || 0);
    const thr = Math.max(1, Number(throttle) || 1);
    const capBreaches = checkCapBreaches(
      { channel, segmentId: effectiveSegId, sendAt: sendAtIso },
      state.data.campaigns,
      state.data.segments,
      state.data.overlaps,
    );
    const smsWaves = evaluateSmsWaves(sendAtIso, channel, localTime);
    const quietViolations = smsWaves.filter((w) => w.violates);
    const warmUp = evaluateWarmUp(aud, channel, sendAtIso, state.data.campaigns, state.data.now);
    const duration = sendDurationHours(aud, thr);
    return { capBreaches, smsWaves, quietViolations, warmUp, duration };
  }, [state.data, effectiveSegId, channel, sendAtIso, audience, throttle, localTime]);

  const handleSubmit = async (submitForOverride: boolean) => {
    if (!effectiveSegId) return;
    setError(null);
    setBusy(true);
    try {
      const res = await scheduleCampaign(
        store,
        me,
        {
          name,
          channel,
          segmentId: effectiveSegId,
          sendAt: sendAtIso,
          audience: Number(audience),
          throttlePerHour: Number(throttle),
          localTime,
          capOverrideReason: overrideReason || undefined,
          submitForOverride,
        },
        state.data?.now ?? new Date(),
      );
      if (res.created.length > 1) {
        setToast(`Split "${name}" into ${res.created.length} warm-up waves (2h apart).`);
      } else if (res.awaitingOverride) {
        setToast(`Saved "${name}" as draft awaiting Messaging lead cap override.`);
      } else {
        setToast(`Pinned "${name}" onto the cylinder.`);
      }
      setName('');
      setOverrideReason('');
      await state.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not schedule campaign.');
    } finally {
      setBusy(false);
    }
  };

  const hasQuietViolation = Boolean(liveMath && liveMath.quietViolations.length > 0);
  const hasCapBreach = Boolean(liveMath && liveMath.capBreaches.length > 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pinning"
        subtitle="Compose a campaign pin with live expected-touch maths, SMS quiet-hour waves, and warm-up checks."
      />

      <DataState state={state} loadingRows={4}>
        {() =>
          state.data && (
            <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
              <Card className="p-5 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Campaign name" htmlFor="pin-name" required>
                    <Input
                      id="pin-name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Last-Minute Gift Guide"
                    />
                  </Field>
                  <Field label="Channel" htmlFor="pin-channel">
                    <Select id="pin-channel" value={channel} onChange={(e) => setChannel(e.target.value as Channel)}>
                      {CHANNELS.map((c) => (
                        <option key={c} value={c}>
                          {CHANNEL_LABELS[c]} (cap {CAPS[c]}/day)
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Target segment" htmlFor="pin-segment">
                    <Select id="pin-segment" value={effectiveSegId} onChange={(e) => setSegmentId(e.target.value)}>
                      {state.data.segments.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.size.toLocaleString()})
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Audience size" htmlFor="pin-audience">
                    <Input
                      id="pin-audience"
                      type="number"
                      min="100"
                      step="500"
                      value={audience}
                      onChange={(e) => setAudience(e.target.value)}
                    />
                  </Field>
                  <Field label="Send date (UTC)" htmlFor="pin-date">
                    <Input id="pin-date" type="date" value={sendDate} onChange={(e) => setSendDate(e.target.value)} />
                  </Field>
                  <Field label="Send time (UTC)" htmlFor="pin-time">
                    <Input id="pin-time" type="time" value={sendTime} onChange={(e) => setSendTime(e.target.value)} />
                  </Field>
                  <Field label="Throttle / hour" htmlFor="pin-throttle">
                    <Input
                      id="pin-throttle"
                      type="number"
                      min="500"
                      step="500"
                      value={throttle}
                      onChange={(e) => setThrottle(e.target.value)}
                    />
                  </Field>
                  <div className="flex items-end pb-1">
                    <Checkbox
                      label="Send in recipient local-time waves"
                      checked={localTime}
                      onChange={setLocalTime}
                    />
                  </div>
                </div>

                {hasCapBreach && (
                  <Field
                    label="Cap override reason"
                    htmlFor="pin-override"
                    required
                    hint={`Required (${OVERRIDE_REASON_MIN_CHARS}+ chars) when exceeding ${CHANNEL_LABELS[channel]} cap (${CAPS[channel]}/day).`}
                    counter={{ value: overrideReason.length, max: limits.overrideReason.max }}
                  >
                    <TextArea
                      id="pin-override"
                      rows={2}
                      value={overrideReason}
                      onChange={(e) => setOverrideReason(e.target.value)}
                      placeholder="Explain why this send must exceed the daily fatigue cap…"
                    />
                  </Field>
                )}

                {error && <InlineError error={error} />}

                <div className="flex flex-wrap gap-2 pt-1">
                  <Button
                    variant="primary"
                    icon={<Pin size={16} />}
                    busy={busy}
                    disabled={hasQuietViolation}
                    onClick={() => handleSubmit(false)}
                    data-testid="schedule-pin-btn"
                  >
                    {liveMath?.warmUp.needsWarmUp
                      ? 'Schedule in 3 warm-up waves'
                      : hasCapBreach && me.isAdmin
                        ? 'Approve override & pin'
                        : 'Pin to cylinder'}
                  </Button>
                  {hasCapBreach && !me.isAdmin && !hasQuietViolation && (
                    <Button
                      variant="secondary"
                      busy={busy}
                      onClick={() => handleSubmit(true)}
                      data-testid="request-override-btn"
                    >
                      Submit for lead override
                    </Button>
                  )}
                </div>
              </Card>

              {liveMath && (
                <div className="space-y-4">
                  <StatStrip columns={2}>
                    <Stat label="Send duration" value={`${liveMath.duration}h`} />
                    <Stat
                      label="Cap breaches"
                      value={String(liveMath.capBreaches.length)}
                      tone={liveMath.capBreaches.length > 0 ? 'bad' : 'ok'}
                    />
                  </StatStrip>

                  {hasCapBreach && (
                    <div data-testid="cap-breach-alert">
                      <Callout tone="bad" icon={<AlertTriangle size={16} />} title="Fatigue cap exceeded (Rule 1)">
                        {liveMath.capBreaches.map((b) => {
                          const segName = state.data?.segments.find((s) => s.id === b.segmentId)?.name ?? b.segmentId;
                          return (
                            <div key={b.segmentId} className="text-xs">
                              {segName}: <strong className="font-mono">{b.touches.toFixed(1)}</strong> expected{' '}
                              {channel} touches (cap {b.cap}).
                            </div>
                          );
                        })}
                      </Callout>
                    </div>
                  )}

                  {channel === 'sms' && liveMath.smsWaves.length > 0 && (
                    <Card className="p-4 space-y-2" data-testid="quiet-hours-panel">
                      <div className="text-xs font-mono uppercase tracking-wider text-muted">
                        SMS recipient-local waves (08:00–21:00)
                      </div>
                      <div className="space-y-1.5">
                        {liveMath.smsWaves.map((w) => (
                          <div
                            key={w.zoneId}
                            className="flex items-center justify-between text-xs"
                            data-testid={`sms-wave-${w.zoneId}`}
                            data-violates={String(w.violates)}
                          >
                            <span className="text-fg">{w.zoneLabel}</span>
                            <div className="flex items-center gap-2">
                              <span className="font-mono tabular-nums">{w.localTimeLabel}</span>
                              <Badge tone={w.violates ? 'bad' : 'ok'} size="sm">
                                {w.violates ? 'Quiet violation' : 'OK'}
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    </Card>
                  )}

                  {liveMath.warmUp.needsWarmUp && (
                    <div data-testid="warmup-preview">
                      <Callout
                        tone="warn"
                        title={`Warm-up split required (>${SPIKE_FACTOR}× recent max ${liveMath.warmUp.recentMaxDayVolume.toLocaleString()})`}
                      >
                        <div className="space-y-1 text-xs mt-1">
                          {liveMath.warmUp.waves.map((w) => (
                            <div key={w.waveIndex} className="font-mono">
                              Wave {w.waveIndex}: {w.audience.toLocaleString()} at {w.sendAt.slice(11, 16)} UTC
                            </div>
                          ))}
                        </div>
                      </Callout>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        }
      </DataState>

      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </div>
  );
}
