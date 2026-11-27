import { Callout, PageHeader, Section, Table, TableWrap, Td, Th, Tr } from '@x10/shared/ui';

import {
  CAPS,
  MIN_DELIVERED,
  OVERRIDE_REASON_MIN_CHARS,
  PAUSE_UNSUB,
  SMS_WINDOW,
  SPIKE_FACTOR,
  WARM_STEPS,
} from '../domain/config';

export function AboutPage() {
  return (
    <div className="space-y-6 max-w-[920px]">
      <PageHeader
        title="About Music Box"
        subtitle="Shared campaign send calendar, subscriber fatigue caps, quiet-hour guard, and automatic pause."
      />

      <Section title="The problem">
        <p className="text-sm text-muted leading-relaxed">
          During peak holiday promotions, five marketing teams schedule over a dozen email, SMS, and push campaigns
          on the same day. Subscribers in overlapping segments get hit repeatedly before noon, SMS waves land outside
          quiet hours in western time zones, sudden volume spikes damage sender reputation, and unsubscribe spikes
          go unnoticed until the next morning.
        </p>
      </Section>

      <Section title="Rules & thresholds">
        <TableWrap label="Policy thresholds from config.ts">
          <Table>
            <thead>
              <tr>
                <Th>Rule</Th>
                <Th>Threshold</Th>
                <Th>Behaviour</Th>
              </tr>
            </thead>
            <tbody>
              <Tr>
                <Td className="font-medium">1. Expected touches</Td>
                <Td className="font-mono text-xs">Email {CAPS.email} · SMS {CAPS.sms} · Push {CAPS.push}</Td>
                <Td muted>E(S) = Σ shared(S, seg(c)) / size(S). Exceeding cap blocks scheduling unless Messaging lead approves a {OVERRIDE_REASON_MIN_CHARS}+ char reason.</Td>
              </Tr>
              <Tr>
                <Td className="font-medium">2. Quiet hours</Td>
                <Td className="font-mono text-xs">{String(SMS_WINDOW.startHour).padStart(2, '0')}:00–{String(SMS_WINDOW.endHour).padStart(2, '0')}:00 local</Td>
                <Td muted>SMS local-time sends are split by recipient UTC offset; any wave outside 08:00–21:00 blocks scheduling.</Td>
              </Tr>
              <Tr>
                <Td className="font-medium">3. Throughput</Td>
                <Td className="font-mono text-xs">ceil(audience / throttlePerHour)</Td>
                <Td muted>Overlapping sending windows on the same channel raise a throughput warning.</Td>
              </Tr>
              <Tr>
                <Td className="font-medium">4. Warm-up</Td>
                <Td className="font-mono text-xs">&gt;{SPIKE_FACTOR}× 7d max → [{WARM_STEPS.join(', ')}]</Td>
                <Td muted>Volume spikes automatically split into three progressive waves two hours apart.</Td>
              </Tr>
              <Tr>
                <Td className="font-medium">5. Auto-pause</Td>
                <Td className="font-mono text-xs">≥{MIN_DELIVERED.toLocaleString()} delivered · {(PAUSE_UNSUB.email * 100).toFixed(1)}% / {(PAUSE_UNSUB.sms * 100).toFixed(1)}%</Td>
                <Td muted>High unsubscribe rates pause the campaign automatically; only the Messaging lead can resume.</Td>
              </Tr>
            </tbody>
          </Table>
        </TableWrap>
      </Section>

      <Callout tone="neutral" title="Operational support notice">
        Music Box supports messaging governance, TCPA quiet-hour discipline, and sender reputation hygiene; it is not legal or regulatory compliance advice.
      </Callout>
    </div>
  );
}
