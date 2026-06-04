import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Analise } from '../types/analyses';

const PX_TO_MM_RATIO = 0.264583;

const getAnalysisDetails = (resultado: string) => {
  const pxValue = parseFloat(resultado) || 0;
  const mm = pxValue * PX_TO_MM_RATIO;
  
  if (mm <= 3) return { label: 'SUCESSO', color: '#10b981' };
  if (mm > 3 && mm <= 5) return { label: 'ATENÇÃO', color: '#f59e0b' };
  return { label: 'CRÍTICO', color: '#ef4444' };
};

const GeneratePDF = async(analyses: Analise[], startDate: string, endDate: string) => {
  const formatDateStr = (str: string) => str.split('-').reverse().join('/');
  
  const tableRowsHtml = analyses.map((item) => {
    const details = getAnalysisDetails(item.resultado);
    const dateObj = new Date(item.created_at);
    const dateFormatted = dateObj.toLocaleDateString('pt-BR');
    const timeFormatted = dateObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    
    return `
      <tr>
        <td><strong>BX-${item.id}</strong></td>
        <td>${dateFormatted} às ${timeFormatted}</td>
        <td>${parseFloat(item.resultado) * PX_TO_MM_RATIO} mm</td>
        <td><span class="status-badge" style="background-color: ${details.color}">${details.label}</span></td>
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
        tr:nth-child(even) { background-color: #f8fafc; }
        .status-badge { color: white; padding: 4px 10px; font-size: 11px; font-weight: bold; rounded; border-radius: 6px; text-transform: uppercase; }
        .footer { position: fixed; bottom: 0; left: 0; right: 0; text-align: center; font-size: 10px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 15px; }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="logo">abaulytics</div>
        <div class="title">Relatório de Análises</div>
      </div>
      
      <h1>Histórico de Medições</h1>
      <div class="period">Período selecionado: <strong>${formatDateStr(startDate)}</strong> até <strong>${formatDateStr(endDate)}</strong></div>
      
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
              <th>Status</th>
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

  try {
    const { uri } = await Print.printToFileAsync({ html: htmlContent });
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Exportar Relatório' });
  } catch (error) {
    console.error("Erro ao gerar/compartilhar PDF:", error);
  }
}

export default GeneratePDF;