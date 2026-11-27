import { useMemo } from 'react';

import { useThemeColors } from '@x10/shared/ui';

import { CAPS } from '../domain/config';
import type { EnrichedCampaign, EnrichedMusicBox } from '../domain/campaigns';
import type { CylinderFocus, CylinderLens, MusicRole } from './stageTypes';

interface PianoRollSvgProps {
  data: EnrichedMusicBox;
  lens: CylinderLens;
  role: MusicRole;
  focus: CylinderFocus;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChime?: (channel: 'email' | 'sms' | 'push') => void;
}

const LEFT_X = 186;
const RIGHT_X = 876;
const TOP_Y = 74;
const ROW_H = 48;

export function PianoRollSvg({
  data,
  lens,
  role,
  focus,
  selectedId,
  onSelect,
  onChime,
}: PianoRollSvgProps) {
  const colors = useThemeColors();

  const palette = useMemo(
    () => ({
      plum: colors.accent[9],
      teal: colors.dark ? '#52c4b0' : '#1c7d6e',
      amber: colors.warn,
      red: colors.bad,
      blue: colors.info,
      brass: colors.dark ? '#b99352' : '#9c7838',
      brassSoft: colors.dark ? 'rgba(185, 147, 82, 0.14)' : 'rgba(180, 140, 70, 0.12)',
    }),
    [colors],
  );

  const pinColor = (e: EnrichedCampaign): string => {
    switch (lens) {
      case 'touches':
        if (e.overCap) return palette.red;
        if (e.collidesWithIds.length > 0) return palette.amber;
        return palette.plum;
      case 'channel':
        return e.campaign.channel === 'email' ? palette.plum : e.campaign.channel === 'sms' ? palette.amber : palette.teal;
      case 'status':
        if (e.campaign.status === 'paused') return palette.red;
        if (e.campaign.status === 'sending') return palette.teal;
        if (e.campaign.status === 'draft') return palette.amber;
        return palette.plum;
      case 'unsub':
        if (e.unsubCheck.shouldPause || e.campaign.status === 'paused') return palette.red;
        if (e.unsubCheck.unsubRatePct >= 0.3) return palette.amber;
        return palette.teal;
      case 'owner':
        return e.campaign.ownerSub.includes('lead') ? palette.plum : palette.blue;
    }
  };

  const segIndex = useMemo(
    () => new Map(data.segments.map((s, i) => [s.segment.id, i])),
    [data.segments],
  );

  const hourToX = (iso: string): number => {
    const d = new Date(iso);
    const h = d.getUTCHours() + d.getUTCMinutes() / 60;
    return LEFT_X + (h / 24) * (RIGHT_X - LEFT_X);
  };

  const pinPos = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>();
    for (const e of data.campaigns) {
      const row = segIndex.get(e.campaign.segmentId) ?? 0;
      map.set(e.campaign.id, {
        x: hourToX(e.campaign.sendAt),
        y: TOP_Y + row * ROW_H + ROW_H / 2,
      });
    }
    return map;
  }, [data.campaigns, segIndex]);

  const height = TOP_Y + Math.max(6, data.segments.length) * ROW_H + 56;

  return (
    <div className="relative h-full w-[calc(100%-var(--side-w,0px))] flex items-center justify-center overflow-hidden select-none">
      <svg
        viewBox={`0 0 920 ${height}`}
        className="h-full w-full max-h-[calc(100vh-110px)] max-w-[1080px] px-2 pb-12 pt-10"
        role="img"
        aria-label="Unrolled music-box piano roll showing 24 hours across segments with overlapping collision ties"
        data-testid="music-box-svg"
        onClick={(ev) => {
          if (ev.target === ev.currentTarget) onSelect(null);
        }}
      >
        {/* Brass roll frame */}
        <rect
          x={LEFT_X}
          y={TOP_Y}
          width={RIGHT_X - LEFT_X}
          height={data.segments.length * ROW_H}
          rx={10}
          fill={palette.brassSoft}
          stroke={palette.brass}
          strokeWidth={1.25}
        />

        {/* Quiet hours shading (00:00-08:00 and 21:00-24:00) */}
        <rect
          x={LEFT_X}
          y={TOP_Y}
          width={(8 / 24) * (RIGHT_X - LEFT_X)}
          height={data.segments.length * ROW_H}
          fill={colors.dark ? 'rgba(15, 12, 24, 0.35)' : 'rgba(70, 50, 80, 0.06)'}
          pointerEvents="none"
        />
        <rect
          x={LEFT_X + (21 / 24) * (RIGHT_X - LEFT_X)}
          y={TOP_Y}
          width={(3 / 24) * (RIGHT_X - LEFT_X)}
          height={data.segments.length * ROW_H}
          fill={colors.dark ? 'rgba(15, 12, 24, 0.35)' : 'rgba(70, 50, 80, 0.06)'}
          pointerEvents="none"
        />

        {/* 24-hour vertical grid & labels */}
        {[0, 4, 8, 12, 16, 20, 24].map((h) => {
          const x = LEFT_X + (h / 24) * (RIGHT_X - LEFT_X);
          return (
            <g key={h} pointerEvents="none">
              <line
                x1={x}
                y1={TOP_Y}
                x2={x}
                y2={TOP_Y + data.segments.length * ROW_H}
                stroke={colors.world.grid}
                strokeWidth={h === 8 || h === 21 ? 1.2 : 0.8}
                strokeDasharray={h === 8 ? '3 3' : undefined}
              />
              <text
                x={x}
                y={TOP_Y - 12}
                textAnchor="middle"
                fill={colors.world['ink-muted']}
                fontSize={10}
                fontFamily="var(--font-mono)"
              >
                {String(h).padStart(2, '0')}:00
              </text>
            </g>
          );
        })}

        {/* 8 segment rows with over-cap red rim */}
        {data.segments.map((seg, idx) => {
          const y = TOP_Y + idx * ROW_H;
          const over = seg.anyOverCap;
          const eEmail = seg.touchesByChannel.email.touches;
          return (
            <g key={seg.segment.id} data-testid={`roll-row-${seg.segment.name}`}>
              <line
                x1={LEFT_X}
                y1={y + ROW_H}
                x2={RIGHT_X}
                y2={y + ROW_H}
                stroke={colors.world.grid}
                strokeWidth={0.75}
              />
              {over && (
                <rect
                  x={LEFT_X + 1}
                  y={y + 1}
                  width={RIGHT_X - LEFT_X - 2}
                  height={ROW_H - 2}
                  fill="none"
                  stroke={palette.red}
                  strokeWidth={1.6}
                  rx={4}
                />
              )}
              <text
                x={LEFT_X - 12}
                y={y + ROW_H / 2 - 3}
                textAnchor="end"
                fill={over ? palette.red : colors.world.ink}
                fontSize={11}
                fontWeight={over ? 700 : 500}
              >
                {seg.segment.name}
              </text>
              <text
                x={LEFT_X - 12}
                y={y + ROW_H / 2 + 11}
                textAnchor="end"
                fill={over ? palette.red : colors.world['ink-muted']}
                fontSize={9.5}
                fontFamily="var(--font-mono)"
              >
                E={eEmail.toFixed(1)}/{CAPS.email} · {(seg.segment.size / 1000).toFixed(0)}k
              </text>
            </g>
          );
        })}

        {/* Amber collision tie curves between overlapping pins within 2 hours (AC5) */}
        <g pointerEvents="none">
          {data.collisions.map((pair) => {
            const pA = pinPos.get(pair.aId);
            const pB = pinPos.get(pair.bId);
            if (!pA || !pB) return null;
            const cx = (pA.x + pB.x) / 2 + 26;
            const cy = (pA.y + pB.y) / 2;
            return (
              <path
                key={`${pair.aId}-${pair.bId}`}
                d={`M ${pA.x} ${pA.y} Q ${cx} ${cy} ${pB.x} ${pB.y}`}
                fill="none"
                stroke={palette.amber}
                strokeWidth={2}
                strokeDasharray="4 3"
                opacity={0.9}
                data-testid="collision-tie"
              />
            );
          })}
        </g>

        {/* Campaign pins */}
        {data.campaigns.map((e) => {
          const pos = pinPos.get(e.campaign.id);
          if (!pos) return null;
          const selected = selectedId === e.campaign.id;
          const colliding = e.collidesWithIds.length > 0;
          const r = Math.max(5.5, Math.min(12.5, 4.5 + (e.campaign.audience / 60000) * 8));
          const col = pinColor(e);

          const dimmed =
            (focus.kind === 'overcap' && !e.overCap) ||
            (focus.kind === 'quiet' && e.quietViolations.length === 0) ||
            (focus.kind === 'paused' && e.campaign.status !== 'paused') ||
            (focus.kind === 'warmup' && !e.needsWarmUpFlag && !e.campaign.waveGroup) ||
            (focus.kind === 'override' && !e.awaitingOverride) ||
            (focus.kind === 'collision' && !colliding) ||
            (role === 'lead' && focus.kind === 'all' && !e.overCap && !e.awaitingOverride && e.campaign.status !== 'paused' && e.quietViolations.length === 0);

          return (
            <g
              key={e.campaign.id}
              data-testid={`pin-${e.campaign.id}`}
              data-colliding={String(colliding)}
              className="cursor-pointer transition-opacity duration-150"
              opacity={selected ? 1 : dimmed ? 0.2 : 0.96}
              onClick={(ev) => {
                ev.stopPropagation();
                onSelect(selected ? null : e.campaign.id);
                onChime?.(e.campaign.channel);
              }}
            >
              {colliding && (
                <circle cx={pos.x} cy={pos.y} r={r + 5} fill={palette.amber} opacity={0.28} />
              )}
              <circle
                cx={pos.x}
                cy={pos.y}
                r={r}
                fill={col}
                stroke={selected ? colors.world.ink : colliding ? palette.amber : colors.surface}
                strokeWidth={selected ? 2.5 : colliding ? 2 : 1.5}
              />
              <text
                x={pos.x}
                y={pos.y + 3}
                textAnchor="middle"
                fill="#ffffff"
                fontSize={8.5}
                fontWeight={700}
                fontFamily="var(--font-mono)"
                pointerEvents="none"
              >
                {e.campaign.channel === 'email' ? 'E' : e.campaign.channel === 'sms' ? 'S' : 'P'}
              </text>
            </g>
          );
        })}

        {/* 3-tine steel comb legend motif along the bottom */}
        <g pointerEvents="none" transform={`translate(${LEFT_X}, ${TOP_Y + data.segments.length * ROW_H + 22})`}>
          <text x={0} y={10} fill={colors.world['ink-muted']} fontSize={10} fontFamily="var(--font-mono)">
            COMB TINES: [E] EMAIL CAP {CAPS.email} · [S] SMS CAP {CAPS.sms} (08:00–21:00) · [P] PUSH CAP {CAPS.push}
          </text>
        </g>
      </svg>
    </div>
  );
}
