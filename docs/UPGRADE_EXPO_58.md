# Expo SDK 58

## Versões e mudanças

O projeto usa Expo 58.0.25, React 19.3.0, React Native 0.88.1 e TypeScript 6.0.3. Os módulos Expo, Reanimated/Worklets e bibliotecas nativas seguem as versões recomendadas por `expo install --fix`. A validação local usou Node 24.11.1.

- Splash migrado do campo removido `expo.splash` para o plugin expo-splash-screen, preservando imagem, fundo branco e modo contain.
- expo-font declarado diretamente para atender ao requisito de @expo/vector-icons.
- Formulários usam react-native-keyboard-controller e KeyboardProvider, com rolagem para o campo focado e margem de 50px sobre o teclado.
- Babel usa react-native-worklets/plugin. NativeWind atualizado para 4.2.7.
- Removidos @types/react-native, react-native-keyboard-aware-scroll-view, react-native-vision-camera, react-native-worklets-core e @expo/ui. Os três últimos não eram usados pelo código; a câmera permanece baseada em expo-camera.
- TypeScript mantém a API estrita do React Native, sem habilitar imports legados. Os arquivos de entrada foram explicitados para não analisar backups/artefatos de validação.
- Nenhum diretório nativo android/ios era mantido no projeto. Não houve migração manual de código nativo.

O lockfile foi regenerado para resolver o conflito entre Router 55 e 58, sem --force ou --legacy-peer-deps. Os lockfiles intermediários ficaram em .expo/sdk58-backup, fora do controle de versão. A cópia temporária dos node_modules antigos foi removida após a instalação limpa.

## Executar

Use um Expo Go compatível com SDK 58 ou reconstrua seu development build. Binários nativos de SDKs anteriores precisam ser reconstruídos. Reinicie o Metro após o upgrade:

```powershell
npx.cmd expo start --clear
```

Se a autenticação com os serviços Expo impedir a abertura do projeto, o desenvolvimento local pode usar:

```powershell
npx.cmd expo start --offline --clear
```

O modo offline do CLI não bloqueia chamadas do aplicativo à API configurada no .env. Não altere a URL do backend por causa da versão do SDK. Para desenvolvimento móvel, mantenha celular e computador na mesma rede.

## Verificação

```powershell
npx.cmd expo-doctor@latest
npx.cmd expo install --check
npm.cmd run typecheck
npm.cmd run test:security
npm.cmd run test:api
npx.cmd expo export --platform android --platform ios --output-dir .expo/sdk58-validation --max-workers 2
```

Expo Doctor: 20/20 verificações aprovadas. TypeScript, testes de segurança/API e exportação dos bundles Android/iOS aprovados. O manifesto Android do servidor de desenvolvimento respondeu HTTP 200 em modo offline, sem UnexpectedServerData.

O empacotamento valida os bundles JS/Hermes e a resolução das bibliotecas. A execução nativa e o comportamento visual em aparelho, especialmente teclado, câmera, splash e compartilhamento, ainda precisam de validação. Nenhum APK/IPA foi compilado ou publicado nesta etapa.

## Segurança das dependências

A auditoria npm caiu de 34 ocorrências para 3 moderadas, sem altas ou críticas. As três entradas são o mesmo problema de minimatch 10.2.6, propagado por @expo/fingerprint e expo. A correção publicada exige minimatch 11.0.1, fora da faixa declarada pelo fingerprint atual. Não foi imposto um override de major nem aceita a sugestão de rebaixar o Expo para 52.0.49. Acompanhar a atualização upstream desse componente.

Referências oficiais:

- [Guia de atualização](https://docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough/)
- [Notas do SDK 58](https://expo.dev/changelog/sdk-58)
- [Teclado no SDK 58](https://docs.expo.dev/versions/v58.0.0/sdk/keyboard-controller/)
- [Advisory minimatch](https://github.com/advisories/GHSA-g3hv-75wg-m249)
