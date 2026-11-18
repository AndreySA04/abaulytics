## CENTRO ESTADUAL DE EDUCAÇÃO TECNOLÓGICA PAULA SOUZA FACULDADE DE TECNOLOGIA DE INDAIATUBA

DR. ARCHIMEDES LAMOGLIA

CURSO DE TECNOLOGIA EM ANÁLISE E DESENVOLVIMENTO DE SISTEMAS

Alan Suzuki

Andrey de Souza Almeida Heitor Vicenzo Cantuaria

João Gabriel Rebouças Dias

## Laboratório de Engenharia de Software

## INDAIATUBA 2026


## CENTRO ESTADUAL DE EDUCAÇÃO TECNOLÓGICA PAULA SOUZA FACULDADE DE TECNOLOGIA DE INDAIATUBA

DR. ARCHIMEDES LAMOGLIA

CURSO DE TECNOLOGIA EM ANÁLISE E DESENVOLVIMENTO DE SISTEMAS

## ABAULYTICS

Breve descrição do sistema e do problema que resolve

INDAIATUBA

2026


## 1 IDENTIFICAÇÃO DO PROJETO

## Título do sistema

Abaulytics

## Empresa / cliente

Irani

## Problema identificado

O abaulamento em chapas de papelão é um problema recorrente na indústria de papel ondulado, impactando diretamente: a qualidade do produto final, a eficiência dos processos de conversão e o volume de refugo gerado.

Atualmente, a detecção desse problema é, em muitos casos, manual ou reativa, o que reduz a capacidade de intervenção rápida.

## Grupo e integrantes (nome completo · e-mail · função no projeto)

Alan Suzuki

Andrey de Souza Almeida

Heitor Vicenzo Cantuaria

João Gabriel Rebouças Dias

## Repositório GitHub (URL pública)

https://github.com/AndreySA04/abaulytics

## Stack tecnológica utilizada

React Native e Python


## 2 ESCOPO E REQUISITOS

## 2.1 Escopo do sistema

O que o sistema FAZ (dentro do escopo):

Medição em Tempo Real: Avaliação automatizada do abaulamento via processamento de imagem.

Cálculo de Flecha: Quantificação precisa do ponto máximo de empenamento da chapa.

Classificação de Qualidade: Identificação automática de chapas como conformes ou não conformes.

Baixa Latência: Processamento e entrega de dados no dashboard em até 2 segundos.

Amostragem Automatizada: Captura fotográfica na proporção de 1 a cada 50 chapas.

Persistência de Dados: Armazenamento seguro de imagens, medição e dados da ordem de produção.

Visualização (Dashboard): Exibição dos dados em tempo real e módulo de consulta histórica.

Integração de Sistemas: Comunicação de dados com softwares corporativos externos.

## O que o sistema NÃO FAZ (fora do escopo):

Intervenção Física: O sistema não atua no maquinário; atua estritamente como monitoramento analítico.

Análise 3D/Multidimensional: A detecção avaliará exclusivamente a deformação no eixo vertical (unidimensional).

Múltiplas Linhas no MVP: A implantação inicial está estrita ao monitoramento de apenas uma linha de produção.


## 2.2 Requisitos Funcionais — RF

| ID | Descrição | Prioridad |
| --- | --- | --- |
|   |   | e |
| RF01 | Capturar automaticamente a imagem de 1 chapa a cada 50 produzidas. Alta |   |
| RF02 | Processar a imagem utilizando a técnica de triangulação para cálculo | Alta |
| de flecha. |   |   |
| RF03 | Identificar automaticamente o maior valor de abaulamento ao longo | Alta |
| da largura da chapa. |   |   |
| RF04 | Exibir os dados no dashboard com atualização máxima de 2 segundos. Alta |   |
| RF05 | Classificar automaticamente a chapa (Conforme <= 12mm / Não | Alta |
| Conforme > 12 mm) |   |   |
| RF06 | Armazenar imagem, valor da flecha, data/hora, ordem de produção. | Alta |
| FR07 | Permitir consulta de medições por período, número da ordem e dados | Média |
| de produção. |   |   |
| RF08 O sistema deve permitir atualização do algoritmo de processamento |   | Baixa |
|   | garantindo compatibilidade. |   |

## 2.3 Requisitos Não-Funcionais — RNF

| ID | Descrição | Categoria |
| --- | --- | --- |
| RNF01 A medição deve possuir precisão mínima de 0,2mm. |   | Alta |
| RNF02 O tempo entre captura e exibição no dashboard não deve exceder 2 |   | Alta |
| segundos. |   |   |
| RNF03 O sistema deve operar com resolução mínima de 480p. |   | Média |
| RNF04 O sistema deve possuir disponibilidade mínima de 95% durante o |   | Alta |
| período produtivo. |   |   |
|   | RNF05 O sistema deve operar em ambiente com poeira e iluminação variável. Alta |   |
| RNF06 O sistema deve garantir que não haja perda de dados, mesmo em |   | Média |
| falhas (buffer persistente). |   |   |
| RNF07 Dados protegidos contra alterações não autorizadas. |   | Média |
| RNF08 O sistema deve operar adequadamente em linhas de até 237 m/min. |   | Alta |


## 2.4 Regras de Negócio — RN

| ID | Descrição |
| --- | --- |
| RN01 | Chapas de abaulamento <= 12mm são consideradas conformes. |
| RN02 | Chapas com abaulamento > 12mm são não conformes. |
| RN03 | A medição ocorre na proporção de 1 para 50 chapas. |
| RN04 | Toda medição deve estar vinculada a uma ordem de produção. |
| RN05 | Os dados de medição não podem ser excluídos. |
| RN06 | A classificação considera exclusivamente a flecha máxima. |
| RN07 | A análise considera apenas o eixo vertical (flecha). |
| RN08 | A medição deve ter prioridade sobre outras operações. |
| RN09 | Atualizações de algoritmo devem manter dados históricos. |
| RN10 | O sistema deve gerar indicadores de tendência para redução de refugo. |


## 3 MODELAGEM DE PROCESSOS (BPMN)

## Descrição resumida do processo mapeado

Iniciamos o lote de chapas, informamos o número do crachá do funcionário e a ordem de produção, depois de autenticar o usuário o aplicativo vai detectar os pontos das bordas da chapa e realizar o cálculo do abaulamento. O cálculo é realizado via API python e essas informações são classificadas como aprovadas ou reprovadas, depois ele consolida a leitura e grava no banco de dados para acesso posterior.


## 4 DIAGRAMAS UML

## 4.1 Diagrama de Casos de Uso

## Descrição

O diagrama de casos de uso apresenta as principais funcionalidades do sistema Abaulytics e a interação entre seus atores. O sistema permite autenticação, calibração, captura automática de imagens e medição do abaulamento das chapas. Também realiza a classificação das chapas, o armazenamento dos dados e a geração de relatórios. Essas funcionalidades possibilitam o monitoramento da produção, a análise de indicadores e o controle de qualidade.


## 4.2 Diagrama de Classes

## Descrição

O diagrama de classes apresenta a estrutura do sistema Abaulytics, destacando suas principais classes, atributos, métodos e relacionamentos. A classe LeituraChapa centraliza os dados das medições, relacionando usuários, ordens de produção, imagens capturadas e versões do algoritmo. Os serviços de autenticação, amostragem, processamento e relatórios são responsáveis pelas operações do sistema, garantindo o armazenamento, a rastreabilidade e a análise dos dados de produção.


## 4.3 Diagrama de Sequência

## Caso de uso representado

Capturar imagem automaticamente


## Caso de uso representado

Consultar histórico por período ou OP e Gerar relatório e exportar dados


## 4.4 Diagrama de Atividades

## Descrição

O diagrama de atividades representa o fluxo de monitoramento e medição do abaulamento das chapas no sistema Abaulytics. O processo envolve a amostragem a cada 50 chapas, validação da ordem de produção, captura da imagem e cálculo da flecha máxima. Após a classificação da chapa como conforme ou não conforme, os dados são armazenados e disponibilizados no dashboard. O fluxo também contempla o tratamento de erros e a recuperação de falhas no armazenamento.


## 5 MODELAGEM DO BANCO DE DADOS

## 5.1 Diagrama Entidade-Relacionamento (DER Conceitual)


## 5.2 Modelo Lógico Relacional

## ABAULYTICS — MODELO LÓGICO RELACIONAL

## 5.3 Dicionário de Dados

[Para cada tabela principal: nome do atributo, descrição, tipo, PK/FK.]

| Tabela | Atributo | Tipo | Descrição | PK/FK |
| --- | --- | --- | --- | --- |
| USUARIO | id_usuario | INTEGER | Identificador único do usuário | PK |
| USUARIO | nome | TEXT | Nome completo do usuário | — |
| USUARIO | numero_cracha | TEXT | Número do crachá do usuário | UK |
| RELATORIO | id_relatorio | INTEGER | Identificador único do relatório | PK |
| RELATORIO | id_usuario | INTEGER | Usuário responsável pela geração do | FK |
|   |   |   | relatório |   |
| RELATORIO | data_geracao | TEXT | Data e hora da geração do relatório — |   |
| RELATORIO | conteudo | TEXT | Conteúdo do relatório gerado | — |
| ORDEM_PRODUCAO id_ordem |   | INTEGER | Identificador único da ordem de | PK |
|   |   |   | produção |   |


| ORDEM_PRODUCAO numero_ordem | TEXT | Número de identificação da ordem | UK |
| --- | --- | --- | --- |
|   |   | de produção |   |
| ORDEM_PRODUCAO data_inicio | TEXT | Data e hora de início da produção — |   |
| ORDEM_PRODUCAO status | TEXT | Situação atual da ordem de | — |
|   |   | produção |   |
| LEITURA_CHAPA id_leitura | INTEGER | Identificador único da medição | PK |
| LEITURA_CHAPA id_usuario | INTEGER | Usuário responsável pela leitura | FK |
| LEITURA_CHAPA id_ordem | INTEGER | Ordem de produção associada à | FK |
|   |   | medição |   |
| LEITURA_CHAPA id_algoritmo | INTEGER | Versão do algoritmo utilizada na | FK |
|   |   | medição |   |
| LEITURA_CHAPA | flecha_abaulamento REAL | Valor máximo do abaulamento da | — |
|   |   | chapa (mm) |   |
| LEITURA_CHAPA largura_chapa | REAL | Largura da chapa analisada (mm) — |   |
| LEITURA_CHAPA data_hora | TEXT | Data e hora da realização da | — |
|   |   | medição |   |
| LEITURA_CHAPA classificacao | TEXT | Resultado: Conforme ou Não | — |
|   |   | Conforme |   |
| VERSAO_ALGORITMO id_algoritmo | INTEGER | Identificador único do algoritmo | PK |
| VERSAO_ALGORITMO versao | TEXT | Código da versão do algoritmo | UK |
| VERSAO_ALGORITMO data_implantacao | TEXT | Data e hora de implantação da | — |
|   |   | versão |   |
| IMAGEM_CAPTURADA id_imagem | INTEGER | Identificador único da imagem | PK |
|   |   | capturada |   |
| IMAGEM_CAPTURADA id_leitura | INTEGER | Medição associada à imagem | FK / UK |
|   |   | capturada |   |
| IMAGEM_CAPTURADA caminho_imagem TEXT |   | Caminho de armazenamento da | — |
|   |   | imagem |   |
| IMAGEM_CAPTURADA data_captura | TEXT | Data e hora da captura da imagem — |   |


## 6 ARQUITETURA DE SOFTWARE

## 6.1 Visão geral e padrão arquitetural

## Padrão utilizado (ex: MVC, camadas, microsserviços) e justificativa

Utilizamos o modelo cliente servidor, precisávamos de um cliente rápido, fácil e acessível na interface mobile para o usuário final utilizar. Além disso, precisávamos de um processamento adequado que o python no servidor poderia nos proporcionar.

## 6.2 Stack tecnológica

| Camada | Tecnologia | Versão | Justificativa |
| --- | --- | --- | --- |
| Usuário | Mobile | - | É a plataforma que mais se adapta |
|   |   |   | para a execução da aplicação. |
| Front-end | React Native | - | Tecnologia que permite um |
|   |   |   | desenvolvimento para várias |
|   |   |   | aplicações nativas tanto IOS quanto |
|   |   | Android. |   |
| Back-end | Python + Fast API | - | Tecnologia que permite o |
|   |   |   | processamento da imagem de forma |
|   |   |   | rápida e adequada. |
| Banco | SQLite | - | Banco de dados leve, local e |
|   |   |   | suficiente para a aplicação. |
| Infra | Servidor Local + | - | Hospedagem gratuita e |
|   | Github |   | versionamento eficiente. |


## 6.3 Diagrama da arquitetura


## 7 PLANO E RESULTADO DE TESTES

## 7.1 Escopo dos testes

O que será testado (funcionalidades cobertas)

O que está fora do escopo dos testes

## 7.2 Ambiente de testes

| Item | Especificação |
| --- | --- |

## 7.3 Casos de teste

[ID, funcionalidade, entrada, procedimento, resultado esperado, resultado obtido, status (Aprovado/Reprovado).]

| ID | Funcionalidade | Entrada | Resultado | Resultado obtido | Status |
| --- | --- | --- | --- | --- | --- |
|   |   |   | esperado |   |   |

## 7.4 Conclusão dos testes


Resumo dos testes realizados, bugs encontrados e status final


## 8 MANUAL DO SISTEMA

## 8.1 Requisitos para execução

| Item | Especificação |
| --- | --- |

## 8.2 Como instalar e executar

[Passo a passo para clonar o repositório, instalar dependências e executar o sistema localmente.]

Pré-requisitos (softwares, versões, variáveis de ambiente)

Passo 1

Passo 2

Passo 3

Passo 4

## 8.3 Principais funcionalidades

[Para cada funcionalidade principal: como acessar e o que ela faz. Incluir prints de tela se possível.]


Funcionalidade 1 — como usar

Funcionalidade 2 — como usar

Funcionalidade 3 — como usar

## 8.4 Problemas conhecidos e solução

| Problema | Causa provável | Solução |
| --- | --- | --- |
