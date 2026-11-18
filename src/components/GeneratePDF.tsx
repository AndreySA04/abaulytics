import * as FileSystem from 'expo-file-system/legacy';
import { requireUser } from '../security/session';
import { recordOwnAction } from '../privacy/repository';
import { adoptTemporaryFile } from '../privacy/files';
const escapeHtml = (value: unknown) => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { formatMeasurementMm, getAnalysisDetails, measurementPresentation } from '../utils/analyze';

export interface AnalisePDF {
  id: number;
  user_id: number;
  result?: string;
  resultado?: string;
  created_at: string;
}

const GeneratePDF = async(analyses: AnalisePDF[], startDate: string, endDate: string) => {
  const user = await requireUser();
  if (analyses.some(item => item.user_id !== user.id)) throw new Error('Acesso não autorizado.');
  const formatDateStr = (str: string) => str.split('-').reverse().join('/');
  
  const tableRowsHtml = analyses.map((item) => {
    const { id, mm, isEstimated, isContour, classification } = getAnalysisDetails(item.result || item.resultado || '');
    const quality = measurementPresentation(classification);

    const date = item.created_at.replace(' ', 'T');
    const safeDateString = /(?:Z|[+-]\d{2}:\d{2})$/.test(date) ? date : date + 'Z';
    const dateObj = new Date(safeDateString);

    const dateFormatted = dateObj.toLocaleDateString('pt-BR');
    const timeFormatted = dateObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    
    const displayId = id ?? item.id;

    return `
      <tr>
        <td><strong>BX-${escapeHtml(displayId)}</strong></td>
        <td>${dateFormatted} às ${timeFormatted}</td>
        <td>${isEstimated ? '≈ ' : ''}${formatMeasurementMm(mm)}${mm === null ? '' : ' mm'}${isContour ? ' (contorno)' : ''}</td>
        <td><span class="status-badge" style="background-color: ${quality.color}">${escapeHtml(quality.label)}</span></td>
      </tr>
    `;
  }).join('');

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <title>Relatório Abaulytics</title>
      <style>
        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #1e293b; margin: 0; padding: 30px; }
        .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #e2e8f0; padding-bottom: 20px; margin-bottom: 30px; }
        .logo { font-size: 26px; font-weight: bold; color: #ff6b00; letter-spacing: -0.5px; }
        .title { font-size: 14px; color: #64748b; text-align: right; }
        h1 { font-size: 20px; color: #0f172a; margin-top: 0; margin-bottom: 8px; }
        .period { font-size: 13px; color: #64748b; margin-bottom: 25px; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        th { background-color: #0f172a; color: #ffffff; text-align: left; padding: 12px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
        td { padding: 14px 12px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #334155; }
        td:first-child { overflow-wrap: anywhere; word-break: break-all; }
        tr:nth-child(even) { background-color: #f8fafc; }
        .status-badge { color: white; padding: 4px 10px; font-size: 11px; font-weight: bold; border-radius: 6px; text-transform: uppercase; }
        .footer { position: fixed; bottom: 0; left: 0; right: 0; text-align: center; font-size: 10px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 15px; }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="logo">abaulytics</div>
        <div class="title">Relatório de Análises</div>
      </div>
      
      <h1>Histórico de Medições</h1>
      <div class="period">Período selecionado: <strong>${escapeHtml(formatDateStr(startDate))}</strong> até <strong>${escapeHtml(formatDateStr(endDate))}</strong></div>
      
      ${analyses.length === 0 ? `
        <div style="text-align: center; padding: 40px; color: #64748b; background: #f8fafc; border-radius: 12px;">
          Nenhum registro encontrado neste intervalo de tempo.
        </div>
      ` : `
        <table>
          <thead>
            <tr>
              <th>ID da Caixa</th>
              <th>Data / Hora</th>
              <th>Abaulamento (mm)</th>
              <th>Classificação</th>
            </tr>
          </thead>
          <tbody>
            ${tableRowsHtml}
          </tbody>
        </table>
      `}
      
      <div class="footer">
        Gerado automaticamente pelo aplicativo Abaulytics em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}
      </div>
    </body>
    </html>
  `;

  let temporaryUri: string | undefined;
  try {
    const { uri } = await Print.printToFileAsync({ html: htmlContent });
    temporaryUri = uri;
    temporaryUri = await adoptTemporaryFile(uri, 'pdf');
    await recordOwnAction('pdf_exported');
    await Sharing.shareAsync(temporaryUri, { mimeType: 'application/pdf', dialogTitle: 'Exportar Relatório' });
  } catch (error) {
    throw error;
  } finally {
    if (temporaryUri) await FileSystem.deleteAsync(temporaryUri, { idempotent: true });
  }
}

export default GeneratePDF;
