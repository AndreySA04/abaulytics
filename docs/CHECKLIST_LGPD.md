# Checklist do PI

Referência: Requisitos_PI_Auditoria_LGPD.pdf fornecido pelo usuário. Este checklist descreve controles de software e suas limitações; não certifica conformidade jurídica ou operacional.

A tabela do PDF repete RF05: abaixo, RF05-LGPD é minimização e RF05-RBAC é controle de acesso. A tabela tem **sete requisitos de prioridade Alta**, embora o texto final mencione nove.

| Requisito | Prioridade | Situação e evidência |
|---|---|---|
| RF01 Consentimento e revogação | Alta | Implementado: aceite explícito no cadastro, salvo atomicamente com conta/auditoria, finalidade analysis, versão e UTC; contas antigas aceitam na tela de análise; revogação disponível no perfil |
| RF02 Acesso, correção e exclusão | Alta | Implementado: perfil/histórico, JSON, correção reautenticada, exclusão transacional e limpeza da sessão |
| RF03 Política simples | Alta | Implementada no cadastro, perfil e docs/PRIVACIDADE.md; responsável/contato reais ainda precisam ser configurados |
| RF04 Classificar dados sensíveis | Média | Mapeado: não coletados intencionalmente; credenciais separadas do perfil e sem exportação; novos dados sensíveis exigem proteção específica |
| RF05-LGPD Minimização | Média | Implementado: campos existentes mantidos, API sem persistência, imagens transitórias e logs sem payload pessoal |
| RF05-RBAC Acesso por perfil | Alta | Implementado: operador e auditor, cadastro sempre operador, autorização nos repositórios e provisionamento externo |
| RF06 Senhas/dados sens?veis em repouso | Alta | HMAC-SHA256 com chave exclusiva no SecureStore. A manutenção local usa PBKDF2-SHA256 até o primeiro login com a senha substituta. Ver docs/DESEMPENHO.md. O SQLite guarda verificadores de senha. |
| RF07 Padrões restritivos | Baixa | Implementado: aceite desmarcado por padrão, sem privilégio no cadastro, sem persistência de imagem no servidor, CORS explícito, HTTPS no cliente de produção |
| RF08 Quem, o quê, quando | Alta | Implementado: papel + associação separada à conta, ação, resultado, UTC; manutenção externa identificada como maintenance e vinculada à conta afetada |
| RF09 Logs protegidos | Alta | Implementado no modelo local: sem APIs de edição/exclusão e triggers de bloqueio; não protege contra controle direto do arquivo/dispositivo |
| RF10 Consulta por auditor | Média | Implementado: filtro por data UTC/ação e paginação de 50; operador não consulta trilha |
| RF11 Login malsucedido | Baixa | Implementado: eventos sem e-mail/senha e bloqueio temporário por dispositivo após 5 falhas |

## Evidências automatizadas

- `npm run typecheck`: validação TypeScript.
- `npm run test:security`: executa os serviços TypeScript reais com SQLite do Node; simula apenas APIs nativas Expo. Cobre migração, remoção do texto puro, credenciais, sessão, isolamento, consentimento, auditoria, correção/exportação e exclusão.
- `npm run test:api`: valida cálculo de referência, largura, imagens, limites de corpo, concorrência, erros genéricos e ausência de gravação no servidor.
- Bundles Android/iOS exportados com Expo SDK 58; isso valida integração de módulos e empacotamento, não execução nativa.

## Pendências antes de distribuir

- Preencher responsável/contato reais, publicar a API atrás de HTTPS e executar `npm run check:release`.
- Exercitar em aparelho Android/iOS: cadastro/login/logout, permissões da câmera, primeira análise, revogação/novo aceite, exportação JSON/PDF, filtros, correção e exclusão. Testes de toque, acessibilidade e comportamento nativo não foram executados neste ambiente.
- Revisar bases de tratamento, retenção, backups e atendimento do responsável. Logs locais não são uma solução de auditoria externa independente.
- Revisar arquivos legados já existentes no servidor e no Git. Esta mudança impede novas gravações; não reescreve histórico Git nem apaga arquivos previamente existentes.
- Após o upgrade para Expo SDK 58, `npm audit` identificou 3 ocorrências moderadas, sem altas ou críticas. Elas correspondem ao mesmo problema de minimatch propagado por @expo/fingerprint e expo; o fingerprint instalado depende de minimatch 10.2.6. Não foi aplicado `audit fix --force`, que sugeria regressão para Expo 52. Consulte docs/UPGRADE_EXPO_58.md.

## Limites deliberados

Contas permanecem locais por decisão do projeto. A API não autentica chamadas diretas nem verifica consentimento do titular; recebe somente imagem/largura. Seus limites são por processo: infraestrutura deve adicionar TLS, timeouts e limitação de tráfego conforme a exposição do serviço. Dados comuns no SQLite dependem do isolamento do sistema operacional. Copiar ou modificar o banco fora do aplicativo supera RBAC e triggers. Backups e cópias compartilhadas não são apagados remotamente.
