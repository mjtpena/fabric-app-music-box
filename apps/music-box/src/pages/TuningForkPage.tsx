import { useCallback, useState } from 'react';
import { Save } from 'lucide-react';

import { useAsync, usePolling } from '@x10/shared/lib';
import { useApp } from '@x10/shared/runtime';
import {
  Button,
  Card,
  DataState,
  Field,
  InlineError,
  Input,
  PageHeader,
  Section,
  Select,
  Table,
  TableWrap,
  Td,
  Th,
  Toast,
  Tr,
} from '@x10/shared/ui';

import { loadWorkspace, upsertOverlap } from '../domain/campaigns';
import { sharedCountBetween } from '../domain/rules';
import type { Schema } from '../model';

export function TuningForkPage() {
  const { store, me } = useApp<Schema>();
  const load = useCallback(() => loadWorkspace(store), [store]);
  const state = useAsync(load, [load]);
  usePolling(state.reload, 5000);

  const [segA, setSegA] = useState('');
  const [segB, setSegB] = useState('');
  const [sharedCount, setSharedCount] = useState('4000');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const effectiveA = segA || state.data?.segments[0]?.id || '';
  const effectiveB = segB || state.data?.segments[1]?.id || '';

  const handleSave = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await upsertOverlap(store, me, effectiveA, effectiveB, Number(sharedCount));
      setToast('Updated segment overlap count.');
      await state.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save overlap.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tuning fork"
        subtitle="Edit shared subscriber counts between segments to keep expected-touch arithmetic accurate."
      />

      <DataState state={state} loadingRows={4}>
        {() =>
          state.data && (
            <>
              <Section title="Update pair overlap">
                <Card className="p-4 space-y-3">
                  <form onSubmit={handleSave} className="grid gap-3 sm:grid-cols-4 sm:items-end">
                    <Field label="Segment A" htmlFor="tf-a">
                      <Select id="tf-a" value={effectiveA} onChange={(e) => setSegA(e.target.value)}>
                        {state.data.segments.map((s) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Segment B" htmlFor="tf-b">
                      <Select id="tf-b" value={effectiveB} onChange={(e) => setSegB(e.target.value)}>
                        {state.data.segments.map((s) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Shared subscribers" htmlFor="tf-shared">
                      <Input
                        id="tf-shared"
                        type="number"
                        min="0"
                        step="100"
                        value={sharedCount}
                        onChange={(e) => setSharedCount(e.target.value)}
                      />
                    </Field>
                    <Button type="submit" variant="primary" icon={<Save size={16} />} busy={busy}>
                      Save overlap
                    </Button>
                  </form>
                  {error && <InlineError error={error} />}
                </Card>
              </Section>

              <Section title="Overlap matrix (shared subscribers)">
                <TableWrap label="Segment overlap matrix">
                  <Table density="compact">
                    <thead>
                      <tr>
                        <Th>Segment</Th>
                        {state.data.segments.map((s) => (
                          <Th key={s.id} numeric>
                            {s.name.split(' ')[0]}
                          </Th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {state.data.segments.map((row) => (
                        <Tr key={row.id}>
                          <Td className="font-medium text-fg">{row.name}</Td>
                          {state.data!.segments.map((col) => {
                            const val = sharedCountBetween(row.id, col.id, state.data!.segments, state.data!.overlaps);
                            const diag = row.id === col.id;
                            return (
                              <Td
                                key={col.id}
                                numeric
                                className={diag ? 'bg-surface-sunken/70 font-semibold' : val > 0 ? 'text-accent-11' : 'text-faint'}
                              >
                                {val > 0 ? `${(val / 1000).toFixed(1)}k` : '—'}
                              </Td>
                            );
                          })}
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
