import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { ActivityIndicator, Alert, Text, View } from 'react-native';
import { Changes, Dashboard, Lot, Order, Session, productionApi, queryString } from './api';
import { Button, Field, Panel, ReadingRow, millimeters } from './ui';

export function DashboardView({ session, onError }: { session: Session; onError: (error: unknown) => void }) {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [orderQuery, setOrderQuery] = useState('');
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [pendingRenders, setPendingRenders] = useState<number[]>([]);

  useFocusEffect(useCallback(() => {
    const controller = new AbortController();
    const options = { signal: controller.signal };
    let retry: ReturnType<typeof setTimeout> | undefined;
    const follow = async () => {
      try {
        let snapshot = await productionApi<Dashboard>('/dashboard', session, options);
        if (controller.signal.aborted) return;
        setDashboard(snapshot);
        let cursor = snapshot.cursor;
        while (!controller.signal.aborted) {
          const changes = await productionApi<Changes>('/dashboard/changes?after=' + cursor, session, options);
          cursor = changes.cursor;
          snapshot = await productionApi<Dashboard>('/dashboard', session, options);
          if (controller.signal.aborted) return;
          setDashboard(snapshot);
          if (changes.items.length) {
            const visible = new Set(snapshot.recent.map(row => row.id));
            setPendingRenders(changes.items.filter(row => row.captured_at && visible.has(row.id)).map(row => row.id));
          }
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        setDashboard(null);
        onError(error);
        retry = setTimeout(follow, 2500);
      }
    };
    void follow();
    return () => {
      controller.abort();
      if (retry != null) clearTimeout(retry);
    };
  }, [session, onError, refreshKey]));

  useEffect(() => {
    if (!pendingRenders.length) return;
    const frame = requestAnimationFrame(() => {
      const rendered_at = new Date().toISOString();
      for (const sample_id of pendingRenders) {
        void productionApi('/dashboard/rendered', session, { method: 'POST', data: { sample_id, rendered_at } }).catch(() => {});
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [pendingRenders, session]);

  async function action(task: () => Promise<void>) {
    setBusy(true);
    try { await task(); }
    catch (error) { onError(error); }
    finally { setBusy(false); }
  }

  const refresh = () => setRefreshKey(key => key + 1);
  const openLot = (order: Order) => action(async () => {
    await productionApi<Lot>('/lots', session, { method: 'POST', data: { order_number: order.number } });
    setOrders(null);
    refresh();
  });
  const closeLot = (lot: Lot) => Alert.alert('Encerrar lote?', `A linha deixará de amostrar a OP ${lot.order_number}.`, [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Encerrar', onPress: () => void action(async () => {
      await productionApi('/lots/' + lot.id + '/close', session, { method: 'POST' });
      refresh();
    }) },
  ]);

  if (!dashboard) return <ActivityIndicator accessibilityLabel="Buscando dashboard da produção" />;
  const { lot, latest, counts, collector } = dashboard;
  const online = collector && Date.now() - Date.parse(collector.at) < 10_000;
  return <>
    {dashboard.environment === 'bancada' &&
      <Text className="rounded-xl bg-amber-100 p-3 font-semibold text-amber-900">Ambiente simulado · registros de teste</Text>}
    <Panel title={lot ? `OP ${lot.order_number}` : 'Linha sem lote aberto'}>
      {lot && <Text className="text-sm text-slate-600">{lot.product} · {millimeters(lot.width_um)} mm · Lote #{lot.id}</Text>}
      <Text className={online ? 'text-emerald-800' : 'text-red-700'}>
        {online ? `Coletor online · ${collector.buffered} pendentes` : 'Sinal do coletor indisponível'}
      </Text>
      {!!dashboard.sequence_gap && <Text className="text-sm text-amber-900">{dashboard.sequence_gap} lacunas registradas neste lote.</Text>}
      {session.user.role === 'operador' && (lot ?
        <Button title="Encerrar lote" secondary disabled={busy} onPress={() => closeLot(lot)} /> :
        <>
          <Field label="Número da ordem" value={orderQuery} autoCapitalize="characters" onChangeText={setOrderQuery}
            onSubmitEditing={() => void action(async () => setOrders(await productionApi('/orders' + queryString({ q: orderQuery }), session)))} />
          <Button title="Buscar ordens disponíveis" disabled={busy}
            onPress={() => void action(async () => setOrders(await productionApi('/orders' + queryString({ q: orderQuery }), session)))} />
          {orders?.map(order => <Button key={order.number} secondary disabled={busy}
            title={`Abrir OP ${order.number} · ${order.product}`} onPress={() => void openLot(order)} />)}
          {orders?.length === 0 && <Text className="text-slate-600">Nenhuma ordem disponível para esse filtro.</Text>}
        </>)}
    </Panel>
    <Panel title="Última medição">
      {latest ? <ReadingRow reading={latest} /> : <Text className="text-slate-600">Aguardando a primeira leitura válida.</Text>}
      {counts && <View className="flex-row flex-wrap gap-4">
        <Text className="font-semibold text-slate-700">{counts.valid} válidas no lote</Text>
        <Text className="font-semibold text-slate-700">
          {counts.valid ? (100 * counts.nonconforming / counts.valid).toFixed(1).replace('.', ',') + '% não conformes' : 'Sem taxa de não conformidade'}
        </Text>
        <Text className="font-semibold text-slate-700">{counts.failed} falhas</Text>
      </View>}
    </Panel>
    <Panel title="Amostras recentes">
      {dashboard.recent.length ? dashboard.recent.map(item => <ReadingRow key={item.id} reading={item} />) :
        <Text className="text-slate-600">Nenhuma amostra registrada.</Text>}
    </Panel>
  </>;
}
