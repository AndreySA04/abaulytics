import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Classification, Filters, ReadingPage, Session, Trend, productionApi, queryString, shareReport } from './api';
import { Button, Field, Panel, ReadingRow } from './ui';

const emptyFields = { start: '', end: '', order_number: '', product: '', width: '', classification: undefined as Classification | undefined };

function dateBoundary(day: string, end: boolean) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('Informe o período como AAAA-MM-DD.');
  const date = new Date(day + 'T00:00:00.000Z');
  if (!Number.isFinite(date.valueOf()) || date.toISOString().slice(0, 10) !== day) throw new Error('Informe uma data de calendário válida.');
  if (end) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString();
}

export function HistoryView({ session, onError }: { session: Session; onError: (error: unknown) => void }) {
  const [form, setForm] = useState(emptyFields);
  const [applied, setApplied] = useState<Filters>({});
  const [page, setPage] = useState<ReadingPage | null>(null);
  const [trends, setTrends] = useState<Trend[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const options = { signal: controller.signal };
    const { classification: _classification, ...trendFilters } = applied;
    setBusy(true);
    Promise.all([
      productionApi<ReadingPage>('/readings' + queryString({ ...applied }), session, options),
      productionApi<{ items: Trend[] }>('/trends' + queryString(trendFilters), session, options)
        .catch(error => { if (!controller.signal.aborted) onError(error); return { items: [] }; }),
    ]).then(([results, groups]) => {
      if (controller.signal.aborted) return;
      setPage(results);
      setTrends(groups.items);
    }).catch(error => { if (!controller.signal.aborted) onError(error); })
      .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [applied, onError, session]);

  function apply() {
    try {
      const width_mm = form.width.trim() ? Number(form.width.trim().replace(',', '.')) : undefined;
      if (width_mm !== undefined && (!Number.isFinite(width_mm) || width_mm < 0.001 || width_mm > 100_000)) {
        throw new Error('Informe uma largura positiva de até 100.000 mm.');
      }
      const start = form.start ? dateBoundary(form.start.trim(), false) : undefined;
      const end = form.end ? dateBoundary(form.end.trim(), true) : undefined;
      if (start && end && start >= end) throw new Error('A data inicial precisa ser anterior ou igual à data final.');
      setPage(null);
      setTrends([]);
      setApplied({ start, end, width_mm, order_number: form.order_number.trim() || undefined,
        product: form.product.trim() || undefined, classification: form.classification });
    } catch (error) { onError(error); }
  }

  async function loadMore() {
    if (!page?.next) return;
    setBusy(true);
    try {
      const data = await productionApi<ReadingPage>('/readings' + queryString({ ...applied, before: page.next, ceiling: page.ceiling }), session);
      setPage({ ...data, items: [...page.items, ...data.items] });
    } catch (error) { onError(error); }
    finally { setBusy(false); }
  }

  async function exportFile(format: 'pdf' | 'csv') {
    if (!page) return;
    setBusy(true);
    try { await shareReport(session, applied, page.ceiling, format); }
    catch (error) { onError(error); }
    finally { setBusy(false); }
  }

  return <>
    <Panel title="Consultar medições">
      <View className="flex-row gap-2">
        <View className="flex-1"><Field label="Início (UTC)" placeholder="AAAA-MM-DD" value={form.start} maxLength={10}
          onChangeText={start => setForm({ ...form, start })} /></View>
        <View className="flex-1"><Field label="Fim (UTC)" placeholder="AAAA-MM-DD" value={form.end} maxLength={10}
          onChangeText={end => setForm({ ...form, end })} /></View>
      </View>
      <Field label="Número da OP" value={form.order_number} onChangeText={order_number => setForm({ ...form, order_number })} />
      <Field label="Produto" value={form.product} onChangeText={product => setForm({ ...form, product })} />
      <Field label="Largura (mm)" value={form.width} keyboardType="decimal-pad" onChangeText={width => setForm({ ...form, width })} />
      <View className="flex-row flex-wrap gap-2">
        {([['Todos', undefined], ['Conforme', 'conforme'], ['Não conforme', 'nao_conforme']] as const).map(([title, classification]) =>
          <Button key={title} title={title} secondary={form.classification !== classification}
            onPress={() => setForm({ ...form, classification })} />)}
      </View>
      <Button title={busy ? 'Aguarde…' : 'Aplicar filtros'} disabled={busy} onPress={apply} />
    </Panel>
    <Panel title="Tendência por dia e OP">
      {trends.length ? trends.map(trend => <View key={trend.day + trend.order_number} className="gap-1">
        <Text className="font-semibold text-slate-800">{trend.day} · OP {trend.order_number}</Text>
        <Text className="text-sm text-slate-600">
          {trend.nonconforming}/{trend.valid} não conformes
          {trend.valid ? ` (${(100 * trend.nonconforming / trend.valid).toFixed(1).replace('.', ',')}%)` : ''}
          {' · '}{trend.failed} falhas
        </Text>
      </View>) : <Text className="text-slate-600">Sem indicadores para os filtros aplicados.</Text>}
    </Panel>
    <Panel title="Resultados">
      <View className="flex-row gap-2">
        <Button title="Exportar PDF" secondary disabled={busy || !page} onPress={() => void exportFile('pdf')} />
        <Button title="Exportar CSV" secondary disabled={busy || !page} onPress={() => void exportFile('csv')} />
      </View>
      {page?.items.map(row => <ReadingRow key={row.id} reading={row} details />)}
      {page?.items.length === 0 && <Text className="text-slate-600">Nenhuma amostra para os filtros aplicados.</Text>}
      {page?.next && <Button title="Carregar mais" secondary disabled={busy} onPress={() => void loadMore()} />}
    </Panel>
  </>;
}
