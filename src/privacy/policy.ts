export const POLICY_VERSION = '2026-11-13.1';
export const PURPOSE = 'analysis';
export const privacyController = process.env.EXPO_PUBLIC_PRIVACY_CONTROLLER?.trim() ?? '';
export const privacyContact = process.env.EXPO_PUBLIC_PRIVACY_CONTACT?.trim() ?? '';
export const policyConfigured = Boolean(privacyController && privacyContact);
export const POLICY_TEXT = `Política de privacidade — Abaulytics
Versão ${POLICY_VERSION}

Responsável: ${privacyController || 'Não configurado — distribuição indisponível'}
Contato: ${privacyContact || 'Não configurado — distribuição indisponível'}

No modo Bancada, coletamos nome e e-mail para identificar sua conta local. Sua senha é armazenada somente como hash com salt. Guardamos resultados das medições, escolhas de consentimento e eventos de segurança no dispositivo.

Com seu consentimento, a câmera captura a chapa e envia a imagem e sua largura para a API calcular o abaulamento. Não envie imagens de pessoas, documentos ou dados sensíveis. O serviço não deve guardar imagens ou medições; a configuração padrão as processa apenas em memória.

A finalidade das análises é medir o abaulamento e permitir consultar e exportar seu histórico. Ao criar a conta, você lê esta política e autoriza expressamente esse tratamento. O aceite é registrado com finalidade, versão e data/hora, permitindo analisar sem uma segunda autorização no perfil. Cadastro, sessão e trilha de segurança sustentam a operação e a proteção da conta.

Você pode deixar de criar a conta se não aceitar a política. Após o cadastro, pode revogar a autorização para análises em Minha Conta > Privacidade. Isso impede novas análises e mantém seus dados acessíveis. Um novo aceite permite retomar. Contas antigas sem autorização podem aceitar a política na própria tela de análise.

Em Privacidade você pode acessar/exportar seus dados, corrigir nome/e-mail e excluir a conta com confirmação de senha. A exclusão remove seus dados locais e desvincula sua identidade dos eventos de auditoria. Os eventos sem vínculo pessoal permanecem no dispositivo. Dados são mantidos até a exclusão da conta; não há sincronização ou recuperação remota.

Somente você acessa seus dados de bancada pelo aplicativo. O auditor local consulta eventos de segurança. Quem controla o dispositivo ou seus backups pode ultrapassar essas proteções. Cópias exportadas e backups externos ficam sob responsabilidade de quem os mantém.

O modo Produção usa uma conta institucional com crachá e senha. A câmera da linha registra a chapa e a API guarda as imagens e medições vinculadas à ordem de produção. Operadores, analistas, líderes, técnicos e auditores acessam os recursos autorizados para suas funções. A remoção da conta industrial revoga as sessões e desvincula o crachá das medições, dos relatórios e dos eventos. A evidência industrial permanece disponível. Consulte o contato acima para informações sobre a política institucional e a retenção das imagens.

O Abaulytics não vende dados e não coleta intencionalmente dados pessoais sensíveis. A permissão da câmera é independente desta autorização. Para dúvidas ou solicitações, use o contato acima.`;
