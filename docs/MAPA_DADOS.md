# Mapa de dados e acessos

A tabela abaixo descreve o modo **Bancada**. No modo **Produção**, o SQLite institucional separa conta, sessão e vínculos pessoais de lote, medição, imagem, relatório e trilha. O spool do coletor guarda o contador, lacunas e pares pendentes. Analistas e líderes consultam evidências industriais, operadores operam lotes, técnicos administram a calibração e auditores consultam a trilha. [DER e dicionário do modo Produção](e2/E2.md#5-banco-de-dados)

| Dados | Classificação/finalidade | Armazenamento | Acesso e exclusão |
|---|---|---|---|
| Nome e e-mail | Pessoais comuns; identificar conta | SQLite local, users | Titular; correção e exclusão no perfil |
| Verificador HMAC-SHA256 e identificador da chave no SecureStore, ou verificador PBKDF2-SHA256 para acesso após manutenção | Autenticação local | users.password_hash | Serviço de autenticação local; não retornado em perfil/exportação |
| Identificador e validade da sessão | Autenticação por até 8h | Expo SecureStore | Serviço local; apagado ao sair/excluir |
| Imagem da chapa e largura | Entrada técnica; evitar pessoas/documentos | Cache privado transitório e memória da API | Processamento autorizado; limpeza no finally e na abertura seguinte |
| Resultados e datas | Dados operacionais vinculados ao titular | SQLite local, analyses | Somente titular, inclusive auditor; exclusão em cascata |
| Finalidade, versão, aceite/revogação, timestamp UTC | Evidência de autorização | SQLite local, consents | Titular; excluído com a conta |
| Ação, resultado, papel e timestamp UTC | Segurança e auditoria | SQLite local, audit_events | Consulta do auditor, sem edição/exclusão pela aplicação |
| Associação entre evento e conta | Dado pessoal comum; identificar ator/conta afetada | audit_identity, separada dos eventos | Auditor; removida em cascata quando a conta é excluída |
| Contagem de falhas e bloqueio de login | Proteção contra tentativas repetidas | login_throttle, sem e-mail/IP | Serviço local; bloqueio de 60s após 5 falhas |
| JSON e PDF exportados | Cópias dos dados solicitados | Cache transitório, depois destino escolhido pelo titular | Titular e destinatários escolhidos; app remove sua cópia temporária |
| Responsável e contato | Transparência | Configuração pública compilada no app | Visíveis na política |

Não há coleta intencional de saúde, biometria ou outra categoria pessoal sensível. Fotos de chapas não são usadas para reconhecimento de pessoas. Se o escopo mudar, classificar e proteger os novos dados antes de coletá-los.

A API não recebe nome, e-mail, senha, identificador local de conta ou eventos de auditoria. Não há sincronização de contas. Medições legadas em api/medicoes.db e imagens antigas em api/debug não são apagadas por esta entrega; devem ser inventariadas e removidas pelo responsável após revisar sua necessidade.

A associação da trilha é apagada, mas timestamps e contexto podem permitir inferências. A solução não promete anonimização irreversível nem imutabilidade contra controle direto do dispositivo, backups ou SQLite. Nenhuma senha, token, imagem, e-mail ou payload de exportação é incluído nos eventos.
