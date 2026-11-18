# Política de privacidade — Abaulytics

O fluxo de conta local e captura manual deste documento corresponde ao modo **Bancada**. O modo **Produção** usa um servidor institucional e segue a política industrial aprovada.

No modo Produção, o crachá identifica a conta e o servidor registra o papel, sessões e eventos. As imagens da linha, medições, OPs e relatórios são mantidos como evidências industriais. A remoção da conta industrial revoga as sessões e retira os vínculos pessoais com lotes, relatórios e auditoria. Dados de bancada seguem a exclusão local descrita abaixo. A referência de política institucional, a retenção de imagens e o contato precisam estar validados antes do piloto. [Manual da E2](e2/OPERACAO.md#preparar-produção-e-homologar)

Versão: 2026-11-13.1. Preencher responsável e contato em `.env` antes de distribuir; o aplicativo usa esses valores na política exibida em tela.

**Responsável:** EXPO_PUBLIC_PRIVACY_CONTROLLER  
**Contato:** EXPO_PUBLIC_PRIVACY_CONTACT

Coletamos nome e e-mail para identificar a conta local. A senha fica somente como hash com salt. Resultados de medições, consentimentos e eventos de segurança ficam no dispositivo.

Com sua autorização, a câmera captura a chapa e envia imagem e largura à API para calcular o abaulamento. Não envie imagens de pessoas, documentos ou dados sensíveis. A API processa a imagem em memória, sem salvar imagens ou medições. Arquivos temporários de captura e exportação são removidos após a operação e o cache privado remanescente é limpo na próxima abertura.

A finalidade das análises é medir o abaulamento e consultar/exportar o histórico. No cadastro, o titular lê a política e marca explicitamente o aceite para esse tratamento. Conta e autorização são registradas na mesma transação, sem exigir um segundo aceite no perfil. Cadastro, sessão e trilha de segurança sustentam a operação e proteção da conta. Não vendemos dados nem coletamos intencionalmente dados pessoais sensíveis.

Você pode deixar de criar a conta se não aceitar a política. Após o cadastro, pode revogar a autorização em **Minha Conta > Privacidade e meus dados**. Isso bloqueia novas análises e mantém seus dados acessíveis. Um novo aceite permite retomar. Contas antigas sem aceite podem ler e aceitar na própria tela de análise. A permissão da câmera é independente dessa autorização.

Na mesma área, você pode acessar/exportar seu cadastro, histórico, consentimentos e eventos vinculados em JSON; corrigir nome/e-mail; ou excluir sua conta com confirmação de senha. A exclusão remove os dados locais e os vínculos de identidade da trilha. Eventos sem vínculo pessoal permanecem no dispositivo. Os dados da conta são mantidos até sua exclusão. Não há recuperação ou sincronização remota.

Operadores acessam seus próprios dados. Auditores locais consultam eventos de segurança. Quem controla o aparelho ou seus backups pode ultrapassar essas proteções: proteja seu dispositivo. Cópias compartilhadas e backups externos precisam ser tratados por seus responsáveis. Para dúvidas ou solicitações, use o contato informado na política do aplicativo.
