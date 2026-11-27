import { lazy, Suspense, useCallback, useMemo, useState } from 'react';
import { Keyboard, Volume2, VolumeX, X } from 'lucide-react';

import { useAsync, usePolling } from '@x10/shared/lib';
import { useApp } from '@x10/shared/runtime';
import {
  Badge,
  Button,
  DataState,
  Dialog,
  FloatingPanel,
  IconButton,
  Kbd,
  Legend,
  LensBar,
  LinkButton,
  StageMessage,
  StagePage,
  TodayPanel,
  ViewAsSwitch,
  ViewToggle,
  supportsWebGL,
  useHotkeys,
  useReducedMotion,
  useThemeColors,
  type LegendItem,
  type LensOption,
  type TodayItem,
} from '@x10/shared/ui';

import { CAPS, CHANNEL_LABELS, STATUS_LABELS } from '../domain/config';
import { enrichWorkspace, loadWorkspace } from '../domain/campaigns';
import type { Schema } from '../model';
import { CampaignList } from '../stage/CampaignList';
import { PianoRollSvg } from '../stage/PianoRollSvg';
import type { CylinderFocus, CylinderLens, MusicRole } from '../stage/stageTypes';

const MusicBox3D = lazy(() => import('../stage/MusicBox3D'));

const LENSES: LensOption<CylinderLens>[] = [
  { value: 'touches', label: 'Touches', description: 'Expected touches E(S) and amber overlap collisions' },
  { value: 'channel', label: 'Channel', description: 'Email, SMS, and Push comb tines' },
  { value: 'status', label: 'Status', description: 'Draft, scheduled, sending, sent, paused' },
  { value: 'unsub', label: 'Unsubs', description: 'Unsubscribe rate vs auto-pause threshold' },
  { value: 'owner', label: 'Owner', description: 'Campaign owner vs Messaging lead' },
];

function playSoftChime(channel: 'email' | 'sms' | 'push') {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = channel === 'email' ? 523.25 : channel === 'sms' ? 659.25 : 783.99;
    gain.gain.setValueAtTime(0.06, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.45);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.46);
  } catch {
    // Ignore audio context blocks
  }
}

export function HomePage() {
  const { store, me } = useApp<Schema>();
  const colors = useThemeColors();
  const reduced = useReducedMotion();
  const webglOk = useMemo(() => supportsWebGL() && !reduced, [reduced]);

  const [view, setView] = useState<'stage' | 'list'>('stage');
  const [lens, setLens] = useState<CylinderLens>('touches');
  const [role, setRole] = useState<MusicRole>(me.isAdmin ? 'lead' : 'owner');
  const [focus, setFocus] = useState<CylinderFocus>({ kind: 'all' });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [chimeOn, setChimeOn] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  const load = useCallback(() => loadWorkspace(store), [store]);
  const state = useAsync(load, [load]);
  usePolling(state.reload, 5000);

  useHotkeys({
    'shift+?': () => setHelpOpen((o) => !o),
    escape: () => {
      if (selectedId) setSelectedId(null);
      else if (focus.kind !== 'all') setFocus({ kind: 'all' });
    },
  });

  const enriched = useMemo(() => (state.data ? enrichWorkspace(state.data) : null), [state.data]);

  const todayItems: TodayItem[] = useMemo(() => {
    if (!enriched) return [];
    const overSegs = enriched.segments.filter((s) => s.anyOverCap);
    const quietCamps = enriched.campaigns.filter((c) => c.quietViolations.length > 0);
    const pausedCamps = enriched.campaigns.filter((c) => c.campaign.status === 'paused');
    const warmCamps = enriched.campaigns.filter((c) => c.needsWarmUpFlag);
    const overrideCamps = enriched.campaigns.filter((c) => c.awaitingOverride);

    const list: TodayItem[] = [];
    if (overSegs.length > 0) {
      const top = overSegs[0];
      list.push({
        id: 'overcap',
        title: `${top.segment.name} over cap`,
        severity: 'bad',
        value: top.touchesByChannel.email.touches.toFixed(1),
        unit: `vs cap ${CAPS.email}`,
        lens: 'touches',
        meta: `${overSegs.length} segment${overSegs.length > 1 ? 's' : ''} rimmed red`,
      });
    }
    if (quietCamps.length > 0) {
      const v = quietCamps[0].quietViolations[0];
      list.push({
        id: 'quiet',
        title: 'SMS outside quiet hours',
        severity: 'bad',
        value: v.localTimeLabel,
        unit: v.zoneId,
        lens: 'channel',
        meta: `${quietCamps.length} wave violates 08:00–21:00`,
      });
    }
    if (pausedCamps.length > 0) {
      list.push({
        id: 'paused',
        title: 'Paused for unsub spike',
        severity: 'bad',
        value: `${pausedCamps[0].unsubCheck.unsubRatePct.toFixed(1)}%`,
        unit: 'unsubs',
        lens: 'unsub',
        meta: 'Messaging lead required to resume',
      });
    }
    if (warmCamps.length > 0) {
      list.push({
        id: 'warmup',
        title: 'Volume spike needs warm-up',
        severity: 'warn',
        value: '3×',
        unit: 'recent max',
        lens: 'status',
        meta: 'Split into 3 waves (2h apart)',
      });
    }
    if (overrideCamps.length > 0) {
      list.push({
        id: 'override',
        title: 'Cap overrides awaiting lead',
        severity: 'warn',
        value: String(overrideCamps.length),
        unit: 'pending',
        lens: 'touches',
        meta: 'Review in Comb',
      });
    }
    return list;
  }, [enriched]);

  const legendItems: LegendItem[] = useMemo(() => {
    const teal = colors.dark ? '#52c4b0' : '#1c7d6e';
    switch (lens) {
      case 'touches':
        return [
          { label: 'Within cap', color: colors.accent[9], shape: 'dot' },
          { label: 'Overlap <2h (amber tie)', color: colors.warn, shape: 'dash' },
          { label: 'Over cap (red rim)', color: colors.bad, shape: 'ring' },
        ];
      case 'channel':
        return [
          { label: 'Email (cap 3)', color: colors.accent[9], shape: 'dot' },
          { label: 'SMS (cap 1)', color: colors.warn, shape: 'dot' },
          { label: 'Push (cap 2)', color: teal, shape: 'dot' },
        ];
      case 'status':
        return [
          { label: 'Scheduled', color: colors.accent[9], shape: 'dot' },
          { label: 'Draft / spike', color: colors.warn, shape: 'dot' },
          { label: 'Sending / sent', color: teal, shape: 'dot' },
          { label: 'Auto-paused', color: colors.bad, shape: 'dot' },
        ];
      case 'unsub':
        return [
          { label: 'Clean (<0.3%)', color: teal, shape: 'dot' },
          { label: 'Watch (0.3–0.5%)', color: colors.warn, shape: 'dot' },
          { label: 'Paused (≥0.5%)', color: colors.bad, shape: 'dot' },
        ];
      case 'owner':
        return [
          { label: 'Messaging lead', color: colors.accent[9], shape: 'dot' },
          { label: 'Campaign owner', color: colors.info, shape: 'dot' },
        ];
    }
  }, [lens, colors]);

  const selectedPin = useMemo(
    () => (enriched && selectedId ? enriched.campaigns.find((c) => c.campaign.id === selectedId) ?? null : null),
    [enriched, selectedId],
  );

  const handleChime = useCallback(
    (ch: 'email' | 'sms' | 'push') => {
      if (chimeOn) playSoftChime(ch);
    },
    [chimeOn],
  );

  return (
    <DataState state={state} loadingRows={4}>
      {() =>
        enriched && (
          <>
            <StagePage
              label="Music Box cylinder stage"
              view={view}
              breadcrumb={[
                { label: 'Music Box', onClick: () => { setFocus({ kind: 'all' }); setSelectedId(null); } },
                { label: selectedPin ? selectedPin.campaign.name : focus.kind === 'all' ? '24h Drum' : focus.kind },
              ]}
              title="The music-box cylinder"
              meta={`${enriched.campaigns.length} pins · ${enriched.segments.length} segments · ${enriched.collisions.length} overlap ties`}
              topRight={
                <div className="flex items-center gap-2">
                  <IconButton
                    label={chimeOn ? 'Mute soft chime' : 'Enable soft chime'}
                    icon={chimeOn ? <Volume2 size={16} /> : <VolumeX size={16} />}
                    variant="subtle"
                    onClick={() => setChimeOn((v) => !v)}
                  />
                  <IconButton
                    label="Keyboard shortcuts (?)"
                    icon={<Keyboard size={16} />}
                    variant="subtle"
                    onClick={() => setHelpOpen(true)}
                  />
                  <ViewToggle
                    value={view}
                    onChange={setView}
                    stageLabel="Cylinder"
                    listLabel="List"
                    glass={view === 'stage'}
                  />
                </div>
              }
              lenses={<LensBar lenses={LENSES} value={lens} onChange={setLens} glass />}
              legend={<Legend title={LENSES.find((l) => l.value === lens)?.label ?? 'Key'} items={legendItems} collapsible />}
              bottomRight={
                <ViewAsSwitch
                  options={[
                    { value: 'owner', label: 'Owner' },
                    { value: 'lead', label: 'Lead' },
                  ]}
                  value={role}
                  onChange={(v) => setRole(v as MusicRole)}
                  glass
                />
              }
              side={
                <TodayPanel
                  bare
                  items={todayItems}
                  activeId={focus.kind !== 'all' ? focus.kind : null}
                  onSelect={(it) => {
                    const next = it.id as Exclude<CylinderFocus['kind'], 'all'>;
                    if (focus.kind === next) setFocus({ kind: 'all' });
                    else {
                      setFocus({ kind: next });
                      if (it.lens) setLens(it.lens as CylinderLens);
                    }
                    setSelectedId(null);
                  }}
                  empty="All sends within fatigue caps and quiet hours."
                />
              }
              sideCount={todayItems.length}
              stage={
                <div className="relative h-full w-full">
                  {webglOk ? (
                    <Suspense
                      fallback={
                        <StageMessage title="Winding the brass cylinder…">
                          Loading 3D drum and steel comb.
                        </StageMessage>
                      }
                    >
                      <MusicBox3D
                        data={enriched}
                        lens={lens}
                        role={role}
                        focus={focus}
                        selectedId={selectedId}
                        onSelect={setSelectedId}
                        onChime={handleChime}
                      />
                    </Suspense>
                  ) : (
                    <PianoRollSvg
                      data={enriched}
                      lens={lens}
                      role={role}
                      focus={focus}
                      selectedId={selectedId}
                      onSelect={setSelectedId}
                      onChime={handleChime}
                    />
                  )}

                  {selectedPin && (
                    <div className="pointer-events-auto absolute left-4 top-20 z-20 w-[310px] max-w-[calc(100%-2rem)]">
                      <FloatingPanel
                        title={CHANNEL_LABELS[selectedPin.campaign.channel]}
                        actions={
                          <IconButton
                            label="Close pin inspector"
                            icon={<X size={14} />}
                            size="sm"
                            onClick={() => setSelectedId(null)}
                          />
                        }
                        padding="md"
                      >
                        <div className="space-y-2.5" data-testid="pin-inspector">
                          <div>
                            <div className="text-sm font-semibold text-fg">{selectedPin.campaign.name}</div>
                            <div className="text-xs text-muted">
                              {selectedPin.segment?.name} · {selectedPin.campaign.audience.toLocaleString()} recipients ·{' '}
                              {selectedPin.campaign.sendAt.slice(11, 16)} UTC
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            <Badge tone={selectedPin.campaign.status === 'paused' ? 'bad' : 'info'}>
                              {STATUS_LABELS[selectedPin.campaign.status]}
                            </Badge>
                            <Badge tone={selectedPin.overCap ? 'bad' : 'brand'} variant="soft">
                              E(S) = {selectedPin.expectedTouches.toFixed(1)} / {CAPS[selectedPin.campaign.channel]}
                            </Badge>
                            {selectedPin.collidesWithIds.length > 0 && (
                              <Badge tone="warn" variant="soft">
                                Overlap &lt;2h
                              </Badge>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-2 pt-1">
                            {selectedPin.campaign.status === 'paused' && (
                              <LinkButton to="/stop" size="sm" variant="primary">
                                Open Stop log
                              </LinkButton>
                            )}
                            {selectedPin.awaitingOverride && (
                              <LinkButton to="/comb" size="sm" variant="primary">
                                Review override
                              </LinkButton>
                            )}
                            <LinkButton to="/pinning" size="sm" variant="secondary">
                              Pinning
                            </LinkButton>
                          </div>
                        </div>
                      </FloatingPanel>
                    </div>
                  )}
                </div>
              }
              list={<CampaignList data={enriched} />}
            />

            <Dialog
              open={helpOpen}
              onClose={() => setHelpOpen(false)}
              title="Keyboard shortcuts"
              footer={<Button onClick={() => setHelpOpen(false)}>Close</Button>}
            >
              <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2.5 text-sm">
                <dt><Kbd>1</Kbd>–<Kbd>5</Kbd></dt><dd className="text-muted">Switch active lens</dd>
                <dt><Kbd>V</Kbd></dt><dd className="text-muted">Cycle View as (Owner / Lead)</dd>
                <dt><Kbd>L</Kbd></dt><dd className="text-muted">Toggle Cylinder stage and accessible List view</dd>
                <dt><Kbd>Esc</Kbd></dt><dd className="text-muted">Clear pin selection or Today focus</dd>
                <dt><Kbd>?</Kbd></dt><dd className="text-muted">Open or close this shortcuts sheet</dd>
              </dl>
            </Dialog>
          </>
        )
      }
    </DataState>
  );
}
