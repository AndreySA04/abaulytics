import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { AuditEvent, Configuration, Session, productionApi } from './api';
import { Button, Field, Panel, readableDate } from './ui';

export function ConfigurationView({ session, onError }: { session: Session; onError: (error: unknown) => void }) {
  const [state, setState] = useState<Configuration | null>(null);
  const [version, setVersion] = useState('');
  const [method, setMethod] = useState('estereo_vertical_v1');
  const [calibrationId, setCalibrationId] = useState('');
  const [calibration, setCalibration] = useState('');
  const [selectedVersion, setSelectedVersion] = useState('');
  const [selectedCalibration, setSelectedCalibration] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    productionApi<Configuration>('/configuration', session, { signal: controller.signal })
      .then(data => {
        if (controller.signal.aborted) return;
        setState(data);
        setSelectedVersion(data.active.version);
        setSelectedCalibration(data.active.calibration_id ?? '');
      }).catch(error => { if (!controller.signal.aborted) onError(error); });
    return () => controller.abort();
  }, [session, onError]);

  async function action(task: () => Promise<void>) {
    setBusy(true);
    try {
      await task();
      setState(await productionApi('/configuration', session));
    } catch (error) { onError(error); }
    finally { setBusy(false); }
  }

  return <>
    <Panel title="Configuração da linha">
      <Text className="text-slate-600">
        {state ? `Ativa: ${state.active.version} · ${state.active.calibration_id ?? 'sem calibração'}` : 'Carregando configuração…'}
      </Text>
      <Text className="text-sm font-semibold text-slate-700">Versão do algoritmo</Text>
      <View className="flex-row flex-wrap gap-2">
        {state?.versions.map(item => <Button key={item.version} title={item.version} disabled={busy}
          secondary={selectedVersion !== item.version} onPress={() => setSelectedVersion(item.version)} />)}
      </View>
      <Text className="text-sm font-semibold text-slate-700">Calibração</Text>
      <View className="flex-row flex-wrap gap-2">
        {state?.calibrations.map(item => <Button key={item.id} title={item.id} disabled={busy}
          secondary={selectedCalibration !== item.id} onPress={() => setSelectedCalibration(item.id)} />)}
      </View>
      <Button title="Ativar configuração" disabled={busy || !selectedVersion || !selectedCalibration}
        onPress={() => void action(() => productionApi('/configuration/active', session, {
          method: 'PUT', data: { version: selectedVersion, calibration_id: selectedCalibration },
        }))} />
    </Panel>
    <Panel title="Registrar versão">
      <Field label="Identificador da versão" value={version} onChangeText={setVersion} autoCapitalize="none" maxLength={64} />
      <View className="flex-row flex-wrap gap-2">
        {['estereo_vertical_v1', 'estereo_vertical_v2'].map(option =>
          <Button key={option} title={option} secondary={method !== option} onPress={() => setMethod(option)} />)}
      </View>
      <Button title="Registrar versão" disabled={busy || !version.trim()} onPress={() => void action(async () => {
        await productionApi('/algorithms/' + encodeURIComponent(version.trim()), session, { method: 'PUT', data: { method } });
        setSelectedVersion(version.trim());
      })} />
    </Panel>
    <Panel title="Registrar calibração">
      <Field label="Identificador da calibração" value={calibrationId} onChangeText={setCalibrationId} autoCapitalize="none" maxLength={64} />
      <Field label="Parâmetros de calibração (JSON)" value={calibration} onChangeText={setCalibration} multiline maxLength={16_384} />
      <Button title="Validar e registrar" disabled={busy || !calibrationId.trim() || !calibration.trim()}
        onPress={() => void action(async () => {
          let data: unknown;
          try { data = JSON.parse(calibration); }
          catch { throw new Error('O arquivo de calibração deve conter JSON válido.'); }
          if (typeof data !== 'object' || !data || Array.isArray(data)) throw new Error('A calibração precisa ser um objeto JSON.');
          await productionApi('/calibrations/' + encodeURIComponent(calibrationId.trim()), session, { method: 'PUT', data });
          setSelectedCalibration(calibrationId.trim());
          setCalibration('');
        })} />
    </Panel>
  </>;
}

export function AuditView({ session, onError }: { session: Session; onError: (error: unknown) => void }) {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [next, setNext] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  async function load(before?: number) {
    setBusy(true);
    try {
      const data = await productionApi<{ items: AuditEvent[]; next: number | null }>(
        '/audit' + (before ? '?before=' + before : ''), session);
      setEvents(previous => before ? [...previous, ...data.items] : data.items);
      setNext(data.next);
    } catch (error) { onError(error); }
    finally { setBusy(false); }
  }

  return <Panel title="Trilha de auditoria">
    <Button title="Consultar eventos" onPress={() => void load()} disabled={busy} />
    {events.map(event => <View key={event.id} className="gap-1 border-b border-slate-100 py-2">
      <Text className="font-semibold text-slate-900">{event.action.replaceAll('_', ' ')}</Text>
      <Text className="text-sm text-slate-600">{readableDate(event.at)} · {event.role}{event.badge ? ' · ' + event.badge : ''}</Text>
      {!!event.detail && <Text selectable className="text-xs text-slate-600">{event.detail}</Text>}
    </View>)}
    {next && <Button title="Carregar mais" secondary onPress={() => void load(next)} disabled={busy} />}
  </Panel>;
}
