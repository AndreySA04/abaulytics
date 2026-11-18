# Operação e validação

Este guia cobre contas locais e análise manual no modo **Bancada**. Consulte o [manual da E2](e2/OPERACAO.md) para identidade e armazenamento do modo **Produção**.

## Configuração

Copie .env.example para .env e preencha EXPO_PUBLIC_API_URL, EXPO_PUBLIC_PRIVACY_CONTROLLER e EXPO_PUBLIC_PRIVACY_CONTACT. São valores públicos compilados no aplicativo; nunca use essas variáveis para segredos. Reinicie o Expo após mudanças.

Em desenvolvimento móvel, EXPO_PUBLIC_API_URL pode ser http://IP-DA-MAQUINA:8000. Fora do desenvolvimento, o cliente exige HTTPS. Sem responsável/contato, uma versão de produção não permite conceder consentimento. A política continua acessível e a revogação continua disponível.

Para a API, instale api/requirements.txt e execute a partir da raiz:

```powershell
python -m uvicorn api.main:app --host 0.0.0.0 --port 8000
```

O servidor lê CORS_ORIGINS do ambiente do processo; não carrega automaticamente o .env do Expo. No aplicativo nativo, CORS pode permanecer vazio. Se necessário, configure origens explícitas, separadas por vírgula; curinga não é aceito. Em produção use proxy TLS com limite de corpo, timeout e controle de tráfego. O cliente usa timeout de 30s. A API limita o corpo antes de analisar multipart e admite duas requisições de análise simultâneas por processo; use poucos workers conforme a memória disponível.

Limites: imagem JPEG/PNG de até 10 MiB, corpo até 10 MiB + 64 KiB, no máximo 16 milhões de pixels, lados entre 50 e 8192 pixels, largura real positiva e até 100000 mm. A API retorna códigos 413/415/422/503/500 com erro genérico apropriado. As chaves de sucesso permanecem; id_medicao passa a ser UUID textual e data passa a incluir UTC. IDs numéricos antigos continuam legíveis no histórico.

## Migração

No cadastro, o titular marca o aceite da política e da finalidade de análise; a opção começa desmarcada. Conta, consentimento e auditoria são gravados atomicamente, permitindo analisar imediatamente após o cadastro, sem uma segunda autorização no perfil. Contas antigas sem aceite recebem a política na própria tela de análise e podem aceitar e continuar. Não há concessão automática de consentimento a contas existentes. A revogação permanece em Minha Conta > Privacidade.

A primeira abertura converte as senhas do banco antigo em verificadores vinculados ao SecureStore, preserva IDs, contas e análises com titular válido e remove a coluna antiga. Eventuais análises órfãs não são importadas para a nova tabela com chave estrangeira. E-mails legados duplicados são preservados. Novos cadastros e correções rejeitam duplicidade.

A migração usa transação e só marca a limpeza completa após checkpoint/VACUUM. Ela pode levar alguns segundos por conta existente; o acesso deve aguardar sua conclusão. Uma sessão antiga que contenha somente userId exige novo login. Novas contas exigem senha de 8 a 128 caracteres; senhas legadas continuam verificáveis.

Nenhum reset é executado automaticamente. Embora os dados atuais sejam de teste, mantenha backup controlado se precisar validar atualização. Dados antigos do servidor não são migrados para contas, pois não possuem vínculo de titular.

## Provisionar um auditor local

Somente manutenção externa concede privilégios; não há opção de escolher perfil no cadastro nem endpoint de promoção.

1. Abra o aplicativo atualizado uma vez para concluir a migração e crie a conta destinada ao auditor.
2. Encerre completamente o aplicativo. Em ambiente de desenvolvimento autorizado, use Android Studio Device Explorer ou ferramentas equivalentes para copiar o banco local abaulytics.db e eventuais arquivos -wal/-shm, mantendo os três juntos. Guarde um backup com acesso restrito. Não tente extrair dados de aparelhos sem autorização.
3. Execute sobre a cópia local, substituindo ID e caminho:

```powershell
python scripts/provision-role.py --db CAMINHO/abaulytics.db --user-id 2 --role auditor
```

4. Com a cópia aberta exclusivamente pela manutenção, finalize/checkpointe seu WAL antes de devolver o banco ao dispositivo. A restauração deve substituir um conjunto consistente, sem reutilizar os arquivos -wal/-shm antigos, com o aplicativo encerrado. Use o procedimento de restauração do ambiente de desenvolvimento; não copie apenas o arquivo principal enquanto o app estiver ativo.
5. Reabra o app e entre na conta. A seção Trilha de auditoria aparece em Privacidade. Para revogar, repita com --role operador.

A operação altera perfil e registra role_changed atomicamente. maintenance identifica o contexto de execução externa; a associação ao usuário identifica a conta afetada, não uma autenticação remota do mantenedor. O script não cria contas, não imprime dados pessoais e rejeita banco inexistente.

## Verificação

Requer Node 24 com node:sqlite para os testes de serviços; os testes Python usam as dependências da API.

```powershell
npm.cmd run typecheck
npm.cmd run test:security
npm.cmd run test:api
npm.cmd run check:release
npx.cmd expo export --platform android --output-dir .expo/lgpd-validation
```

check:release deve falhar até os dados institucionais e a URL HTTPS estarem preenchidos. O bundle exportado serve para validar empacotamento, não constitui publicação.

No aparelho, valide também reinício após falha/interrupção, falta de rede, sessão expirada, permissão da câmera negada, exportação cancelada e falha de senha na exclusão. O bloqueio temporário de login é por dispositivo, sem coleta adicional de identificadores. Arquivos compartilhados fora do aplicativo não podem ser recolhidos.

A implementação usa a API nativa de aleatoriedade do Expo e HMAC da biblioteca noble-hashes. A validação da senha definida por manutenção local usa PBKDF2 no primeiro acesso.
- https://docs.expo.dev/versions/v58.0.0/sdk/crypto/
- https://github.com/paulmillr/noble-hashes/tree/1.8.0
