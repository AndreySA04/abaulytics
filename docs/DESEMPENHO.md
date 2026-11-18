# Login no Expo Go

O cadastro e o login usam HMAC-SHA256 com uma chave aleatória por credencial no SecureStore. O SQLite guarda o formato, o identificador e o verificador da senha. Na primeira migração de um banco antigo que ainda contém as senhas, o aplicativo gera os verificadores e preserva as contas e análises. Os usuários entram com o e-mail e a senha que já usavam.

O HMAC depende da proteção do SecureStore. Se a chave ou a credencial original já tiver sido descartada, a manutenção local pode definir uma nova senha para a mesma conta.

## Recuperação por manutenção local

1. Verifique a identidade do titular. Com o aplicativo parado, obtenha uma cópia consistente do banco local `abaulytics.db` seguindo o procedimento de manutenção do dispositivo.
2. Execute `python scripts/reset-password.py --db CAMINHO_DO_BANCO --user-id ID` em um terminal interativo. Digite e confirme a nova senha. O comando atualiza a credencial com PBKDF2-SHA256 e registra a manutenção.
3. Restaure o banco no aplicativo e disponibilize a nova senha ao titular por um canal privado. Na tela de login, o titular entra com o e-mail e a nova senha. Após esse primeiro acesso, o aplicativo vincula a credencial ao SecureStore do dispositivo.

## Validação de desempenho

Em desenvolvimento, `[performance] login até navegação` mede a autenticação, a auditoria, a gravação da sessão e a chamada de navegação. Teste no Expo Go o cadastro, a saída e um novo login com a mesma senha, além de uma senha incorreta e um e-mail inexistente.

Os testes locais usam SQLite real e SecureStore simulado. Eles cobrem cadastro, novo login, migração da senha original, troca em manutenção, invalidação de sessão e bloqueio temporário após tentativas inválidas.

## An?lise de imagens

Na API, a identificação de colunas válidas consulta os pixels encontrados pelo argmax, em vez de percorrer toda a imagem novamente. Os testes de referência continuam passando. Um microbenchmark local em máscara de 3000x4000 pixels mediu cerca de 1,2ms na varredura anterior e 0,045ms na consulta pontual. Isso mede somente essa operação, não a latência completa da análise. A resolução, compressão e cálculo de medição foram preservados.

No console de desenvolvimento, os eventos [performance] separam captura, API e gravação. A API inclui Server-Timing com decode e profile, em milissegundos. O tempo de API observado pelo app inclui transferência, espera e resposta; não deve ser confundido com processamento no servidor. Nenhuma senha, imagem, URL de arquivo ou dado pessoal é registrado nessas métricas.

Os patches versionados são aplicados por npm run postinstall. O patch de react-native-css-interop remove somente o registro automático de ImageBackground, componente não usado pela aplicação. O resolvedor Metro aponta o shim crypto do noble-hashes explicitamente para evitar o fallback de exports. Não foram ocultados avisos com LogBox.ignoreLogs.

Após atualizar, reinicie o Metro com npx.cmd expo start --clear e reinicie também o Uvicorn caso não use --reload. Testar no aparelho: criar conta, tentar e-mail repetido, entrar, realizar análise e comparar os tempos de captura/API/gravação. O tempo de hashing ainda depende do processador do celular.
