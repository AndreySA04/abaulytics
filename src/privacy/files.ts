import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { requireUser } from '../security/session';
const directory = () => {
  if (!FileSystem.cacheDirectory) throw new Error('Armazenamento temporário indisponível.');
  return FileSystem.cacheDirectory + 'abaulytics-private/';
};
export async function clearPrivateFiles() { await FileSystem.deleteAsync(directory(), { idempotent: true }); }
export async function adoptTemporaryFile(uri: string, extension: 'jpg' | 'pdf') {
  if (!FileSystem.cacheDirectory || !uri.startsWith(FileSystem.cacheDirectory)) throw new Error('Arquivo fora do cache temporário.');
  await FileSystem.makeDirectoryAsync(directory(), { intermediates: true });
  const target = directory() + extension + '-' + Date.now() + '.' + extension;
  await FileSystem.moveAsync({ from: uri, to: target });
  return target;
}
export async function shareOwnJson(contents: string) {
  await requireUser();
  if (!await Sharing.isAvailableAsync()) throw new Error('Compartilhamento indisponível neste dispositivo.');
  await FileSystem.makeDirectoryAsync(directory(), { intermediates: true });
  const uri = directory() + 'dados-' + Date.now() + '.json';
  try {
    await FileSystem.writeAsStringAsync(uri, contents);
    await Sharing.shareAsync(uri, { mimeType: 'application/json', dialogTitle: 'Exportar meus dados' });
  } finally { await FileSystem.deleteAsync(uri, { idempotent: true }); }
}
export async function removeCapture(uri: string) {
  if (!FileSystem.cacheDirectory || !uri.startsWith(FileSystem.cacheDirectory)) throw new Error('Arquivo fora do cache da câmera.');
  await FileSystem.deleteAsync(uri, { idempotent: true });
}
