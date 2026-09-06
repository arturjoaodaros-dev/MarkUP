# Guia completo do MarkUP

> Markdown was designed for text. MarkUP is designed for documents.

Este é o guia de referência completo da linguagem MarkUP e das ferramentas
que a acompanham (o app web e a extensão do VS Code). Para a especificação
normativa, mais tersa e testada linha a linha, veja [`SPEC.md`](SPEC.md) — este
guia é a versão explicada, com exemplos, para quem está escrevendo
documentos ou construindo em cima da linguagem.

## Sumário

1. [O que é o MarkUP](#1-o-que-é-o-markup)
2. [Como começar](#2-como-começar)
3. [Markdown suportado](#3-markdown-suportado)
4. [Sintaxe geral de diretivas](#4-sintaxe-geral-de-diretivas)
5. [As sete diretivas](#5-as-sete-diretivas)
   - [`:::chart`](#chart)
   - [`:::card`](#card)
   - [`:::alert`](#alert)
   - [`:::progress`](#progress)
   - [`:::math`](#math)
   - [`:::code`](#code)
   - [`:::tabs`](#tabs)
6. [Diagnósticos](#6-diagnósticos)
7. [Exportação para HTML](#7-exportação-para-html)
8. [App web](#8-app-web)
9. [Extensão do VS Code](#9-extensão-do-vs-code)
10. [Limitações conhecidas](#10-limitações-conhecidas)
11. [Exemplo completo](#11-exemplo-completo)

---

## 1. O que é o MarkUP

MarkUP é Markdown mais um conjunto de **diretivas** — blocos delimitados por
`:::nome` que viram componentes visuais reais (gráficos, cartões, alertas,
barras de progresso, matemática, código e abas) em vez de texto puro.

A regra central da linguagem: **diretivas nunca substituem o Markdown, elas
convivem com ele.** Você pode ter negrito, listas, links e tabelas normais
antes, depois e *dentro* de uma diretiva, e nada disso quebra o outro. Um
documento pode ser só Markdown, só diretivas, ou qualquer mistura das duas
coisas.

## 2. Como começar

**App web** (editor com Edit/Preview/Split, ao vivo no navegador):

```bash
npm install
npm run dev --workspace=packages/web
```

**Extensão do VS Code** (highlighting, autocomplete, diagnósticos, preview
nativo — ver [seção 9](#9-extensão-do-vs-code)):

```bash
npm run build --workspace=packages/vscode
npm run package --workspace=packages/vscode
code --install-extension packages/vscode/markup-lang-0.1.0.vsix
```

Documentos MarkUP usam a extensão `.markup` ou `.mkup`.

## 3. Markdown suportado

Tudo que segue funciona exatamente como no Markdown que você já conhece —
com as regras do CommonMark nos pontos onde ele é preciso (espaço obrigatório
em headings, por exemplo), porque é isso que evita que `#hashtag` dentro de
uma frase vire um heading por acidente.

### Headings

```markup
# Título nível 1
## Título nível 2
###### Título nível 6
```

Produz `<h1>`–`<h6>`. **Precisa de um espaço depois do(s) `#`** — `#título`
colado, sem espaço, não é reconhecido como heading (é tratado como um
parágrafo normal começando com `#`). Se isso acontecer, o MarkUP avisa: a
diagnóstico `heading-missing-space` aponta a linha exata e sugere a correção.
Isso é proposital, não uma limitação: é a mesma regra do CommonMark, para que
`Eu gosto de #café` no meio de uma frase não vire um heading indesejado.

### Ênfase

| Sintaxe | Resultado |
| --- | --- |
| `**negrito**` ou `__negrito__` | **negrito** |
| `*itálico*` ou `_itálico_` | *itálico* |
| `~~rasurado~~` | ~~rasurado~~ |

Sem ênfase no meio de palavra (`a*b*c` não vira ênfase) e sem aninhamento
arbitrário de três níveis — restrição deliberada para evitar a ambiguidade
clássica do Markdown com `*`/`_` misturados.

### Código

````markup
Código `inline` numa frase.

```python
def hello():
    print("Hello World")
```
````

Cerca de código aceita ` ``` ` ou `~~~`, com linguagem opcional logo depois
da cerca de abertura. O preview realça a sintaxe via highlight.js (carregado
sob demanda, só quando o documento tem um bloco de código).

### Links e imagens

```markup
[texto do link](https://example.com "título opcional")
![texto alternativo](caminho/da/imagem.png)
```

### Listas

```markup
- item não ordenado
- outro item
  - sub-item (indentado até a coluna onde o conteúdo do item pai começa)
  - outro sub-item

1. item ordenado
2. outro item
   1. sub-item ordenado
```

Listas não ordenadas aceitam `-`, `*` ou `+` como marcador. Listas ordenadas
aceitam `1.` ou `1)`. **Aninhamento funciona em qualquer profundidade** —
basta indentar o sub-item até a coluna onde o texto do item pai começa (2
espaços para `- `, 3 para `1. `, e assim por diante).

### Citações

```markup
> Uma citação.
> Continua na linha seguinte.
```

### Tabelas

```markup
| Coluna A | Coluna B |
|:---------|---------:|
| esquerda | direita  |
```

`:---` alinha à esquerda, `---:` à direita, `:---:` ao centro, `---` sem
alinhamento explícito.

### Régua horizontal

```markup
---
```

Também aceita `***` ou `___`.

### Quebras de linha

- **Quebra suave**: uma linha normal seguida de outra, dentro do mesmo
  parágrafo, vira só um espaço no texto renderizado (é assim que navegadores
  tratam quebra de linha em HTML há décadas).
- **Quebra rígida**: termine a linha com **dois ou mais espaços**, ou com uma
  **barra invertida solta** (`\`), para forçar uma quebra de linha real
  (`<br>`) dentro do mesmo parágrafo.

```markup
Primeira linha  
Segunda linha (a linha acima termina com dois espaços)
```

### Escapes

Barra invertida escapa qualquer caractere de pontuação ASCII — o mesmo
conjunto do CommonMark, não só os símbolos que o MarkUP usa como sintaxe:

```text
! " # $ % & ' ( ) * + , - . / : ; < = > ? @ [ \ ] ^ _ ` { | } ~
```

`\~` produz um til literal (não abre `~~rasurado~~`), `1\.` no início de uma
linha não é confundido com uma lista ordenada, e assim por diante.

### HTML bruto

**Não é interpretado.** Um `<b>texto</b>` digitado no meio de um parágrafo
aparece literalmente como texto (`<b>texto</b>`), nunca vira negrito de
verdade via HTML. Isso é proposital: um documento MarkUP pode ser exportado
como HTML autocontido e compartilhado livremente, e permitir HTML bruto
executável abriria a porta para injeção de script em qualquer documento
compartilhado.

## 4. Sintaxe geral de diretivas

Toda diretiva segue o mesmo formato:

```markup
:::nome atributo="valor" outro=valor flag
conteúdo do corpo (quando a diretiva tem corpo)
:::
```

- **Abertura**: três ou mais `:` seguidos do nome da diretiva e,
  opcionalmente, atributos.
- **Fechamento**: uma linha só de `:`, com comprimento **maior ou igual** ao
  da abertura — a mesma regra das cercas de código do Markdown.
- **Atributos**: `chave="valor com espaços"`, `chave=valor` (sem espaços/
  aspas) ou `chave` sozinho (vira booleano `true`).
- **Aninhamento**: use uma cerca mais longa por fora para conter uma diretiva
  com cerca mais curta por dentro:

  ```markup
  ::::tabs
  ### Aviso
  :::alert type="error"
  Perigo.
  :::
  ::::
  ```

- Diretiva **não fechada** até o fim do documento é fechada implicitamente,
  com um aviso — nunca derruba o resto do parse.
- Diretiva com **nome desconhecido** (não é nenhuma das sete abaixo) vira um
  bloco visível no preview avisando qual nome não foi reconhecido, em vez de
  desaparecer silenciosamente.
- **Nenhuma diretiva é obrigada a ficar isolada.** Markdown normal antes,
  depois, e — para `card`, `alert` e `tabs` — dentro do corpo, sempre
  funciona.

## 5. As sete diretivas

### `:::chart`

Gráfico de barras, linha ou pizza a partir de uma série de pontos.

```markup
:::chart type="bar" title="Vendas por trimestre"
Q1: 120
Q2: 180
Q3: 240
Q4: 310
:::
```

| Atributo | Obrigatório | Valores aceitos | Padrão |
| --- | --- | --- | --- |
| `type` | não | `bar`, `line`, `pie` | `bar` |
| `title` | não | texto livre | — |

**Corpo**: uma linha por ponto, no formato `Rótulo: valor`. `valor` aceita
um `%` final, que é ignorado no cálculo (útil para escrever `78%` em vez de
`78`). Linhas que não seguem esse formato são ignoradas, com aviso.

Tipo inválido (`type="pizza"`, por exemplo) cai para `bar` e emite um aviso
apontando os valores válidos — nunca quebra a diretiva inteira.

### `:::card`

Cartão com uma grade de métricas e, opcionalmente, mais conteúdo Markdown
abaixo.

```markup
:::card title="Performance"
CPU: 78%
RAM: 64%
Disk: 42%

Nota: medido em produção, *não* em staging.
:::
```

| Atributo | Obrigatório | Valores aceitos | Padrão |
| --- | --- | --- | --- |
| `title` | não | texto livre | — |

**Corpo**: as linhas iniciais no formato `Rótulo: valor` viram a grade de
métricas (renderizadas como pares rótulo/valor). Assim que uma linha não
segue esse formato, o resto do corpo é tratado como Markdown normal —
parágrafos, listas, links, o que fizer sentido dentro do cartão.

### `:::alert`

Caixa de destaque para avisos, com quatro níveis de severidade.

```markup
:::alert type="warning" title="Atenção"
Esta operação **pode apagar dados**. Confirme antes de continuar.
:::
```

| Atributo | Obrigatório | Valores aceitos | Padrão |
| --- | --- | --- | --- |
| `type` | não | `info`, `success`, `warning`, `error` | `info` |
| `title` | não | texto livre | — |

**Corpo**: Markdown normal, sem restrição — negrito, listas, links, o que for
preciso.

Tipo inválido cai para `info` e emite aviso, seguindo o mesmo padrão do
`:::chart`.

### `:::progress`

Barra de progresso de linha única.

```markup
:::progress value="72" label="Python"
:::
```

| Atributo | Obrigatório | Valores aceitos | Padrão |
| --- | --- | --- | --- |
| `value` | **sim** | número | — (erro se ausente, vira `0`) |
| `max` | não | número | `100` |
| `label` | não | texto livre | — |

Não tem corpo interpretado — é sempre uma diretiva de linha única (o `:::`
de fechamento pode vir logo na linha seguinte). `value` fora do intervalo
`[0, max]` é ajustado (clamped) automaticamente, com aviso.

### `:::math`

Expressão matemática em LaTeX, renderizada com KaTeX.

```markup
:::math
E = mc^2
:::
```

Sem atributos. O corpo é a expressão LaTeX bruta — KaTeX é carregado sob
demanda (só quando o documento tem pelo menos um `:::math`), e um erro de
sintaxe LaTeX é isolado pelo próprio KaTeX (não derruba o restante do
documento), aparecendo como texto de erro no lugar da fórmula.

### `:::code`

Bloco de código, equivalente a uma cerca ` ``` ` com linguagem.

```markup
:::code language="python"
def hello():
    print("Hello World")
:::
```

| Atributo | Obrigatório | Valores aceitos | Padrão |
| --- | --- | --- | --- |
| `language` | não | nome de linguagem (ex.: `python`, `javascript`) | — |

É semanticamente idêntico a uma cerca ` ```python `/` ``` ` — o parser
normaliza os dois para o mesmo tipo de nó internamente, então o preview
realça a sintaxe do mesmo jeito nos dois casos. Use o que for mais confortável
de digitar.

### `:::tabs`

Conjunto de abas, cada uma introduzida por um heading de nível 3 dentro do
corpo.

````markup
::::tabs
### Python
```python
print("hello")
```
### JavaScript
```javascript
console.log("hello")
```
::::
````

Sem atributos. **Corpo**: uma seção `### Título` por aba, seguida do
conteúdo dessa aba (qualquer coisa em Markdown, incluindo outras diretivas —
é o caso de uso típico para aninhamento, como no exemplo de `:::alert` dentro
de `:::tabs` na [seção 4](#4-sintaxe-geral-de-diretivas)). Conteúdo antes da
primeira `### Título` é ignorado com aviso; uma diretiva `:::tabs` sem
nenhuma aba também emite aviso.

Repare que a cerca de abertura usa **quatro** `:` (`::::tabs`) neste exemplo
— não é obrigatório, mas é a convenção recomendada quando o corpo da aba
pode conter suas próprias diretivas de três `:`, para deixar o aninhamento
inequívoco visualmente.

## 6. Diagnósticos

Todo diagnóstico tem `severity` (`error` ou `warning`), um `code`, uma
`message` legível e a posição exata (linha/coluna) do problema. **O parser
nunca lança exceção** — um documento inválido no meio da digitação sempre
produz uma AST parcial mais diagnósticos, nunca uma tela quebrada.

| Código | Severidade | Quando acontece |
| --- | --- | --- |
| `heading-missing-space` | aviso | Linha começa com `#`–`######` sem espaço depois |
| `directive-unknown` | aviso | Nome de diretiva não é nenhuma das sete registradas |
| `directive-unclosed` | aviso | Diretiva sem `:::` de fechamento até o fim do documento |
| `code-fence-unclosed` | aviso | Cerca de código sem fechamento |
| `chart-invalid-type` | aviso | `type` do `:::chart` não é `bar`/`line`/`pie` |
| `chart-invalid-value` | aviso | Valor não numérico numa linha `Rótulo: valor` do chart |
| `chart-unrecognized-lines` | aviso | Linha do corpo do chart fora do formato `Rótulo: valor` |
| `alert-invalid-type` | aviso | `type` do `:::alert` não é `info`/`success`/`warning`/`error` |
| `progress-missing-value` | **erro** | `:::progress` sem o atributo `value` |
| `progress-value-clamped` | aviso | `value` fora do intervalo `[0, max]` |
| `tabs-content-before-heading` | aviso | Conteúdo antes do primeiro `### Título` dentro de `:::tabs` |
| `tabs-empty` | aviso | `:::tabs` sem nenhuma aba |

No app web esses diagnósticos aparecem sublinhados no editor, contados na
barra de status, e listados (clicáveis, saltam para a linha) no painel de
problemas. Na extensão do VS Code aparecem como diagnósticos nativos —
sublinhado no editor e entrada no painel *Problems*.

## 7. Exportação para HTML

Tanto o app web (botões **Exportar HTML** / **Copiar HTML**) quanto a
extensão do VS Code (comandos `MarkUP: Export to HTML...` / `MarkUP: Copy as
HTML`) produzem o **mesmo HTML**, gerado pela mesma função (`exportHtml` de
`@markup/renderer`) — não existe um segundo renderer para exportação. Isso
garante que o arquivo exportado nunca diverge visualmente do preview ao
vivo.

O HTML gerado é **autocontido**: abre direto do disco, sem precisar de
servidor. CSS do documento (incluindo tema) fica embutido inline; CSS do
KaTeX também, quando o documento tem `:::math`. As fontes do KaTeX são
referenciadas por caminho relativo (`fonts/...`) em vez de embutidas — sem
esses arquivos ao lado do `.html`, fórmulas continuam legíveis (KaTeX cai
para uma fonte serifada do sistema), só sem a tipografia matemática exata.

Todo texto é escapado no HTML gerado (a mesma política de "HTML bruto não é
interpretado" da seção 3) — o arquivo exportado é seguro para compartilhar.

## 8. App web

Interface com três modos, alternáveis pela barra de ferramentas:

- **Edit** — só o editor (CodeMirror 6), com realce de sintaxe, numeração de
  linha e sublinhado de diagnósticos.
- **Preview** — só o documento renderizado.
- **Split** — os dois lado a lado, o modo padrão.

**Barra lateral**: lista de documentos abertos (clique para trocar, `×` para
excluir), estrutura do documento atual (headings, extraídos direto da AST —
clique não navega ainda, é só um índice visual), e templates prontos
(**Documento em branco**, **Relatório de vendas**, **Todos os recursos** —
este último exercitando as sete diretivas e todo o Markdown suportado, útil
como referência rápida).

**Persistência**: documentos ficam salvos no `localStorage` do navegador,
automaticamente, atrás de uma interface `DocumentRepository` (trocável por
outro backend de armazenamento sem tocar no resto do app). **Salvar como…**
grava o arquivo-fonte `.markup` no disco, além do autosave contínuo no
navegador.

**Tema**: claro/escuro, alternável pelo ícone de sol/lua na barra de
ferramentas, respeitando a preferência do sistema por padrão.

## 9. Extensão do VS Code

A extensão oficial (`packages/vscode`, ver o [README dela](../packages/vscode/README.md)
para detalhes de arquitetura) reaproveita o mesmo `@markup/core` e
`@markup/renderer` do app web — nenhuma lista de diretivas ou de valores
válidos é duplicada.

**Comandos** (paleta `Ctrl+Shift+P` / `Cmd+Shift+P`):

| Comando | O que faz |
| --- | --- |
| `MarkUP: Open Preview` | Abre o preview nativo ao lado do editor (atalho `Ctrl+Shift+V` / `Cmd+Shift+V`, ou o ícone no canto superior direito do editor) |
| `MarkUP: Export to HTML...` | Gera o HTML autocontido e pede onde salvar |
| `MarkUP: Copy as HTML` | Copia o mesmo HTML para a área de transferência |

**Editor**: highlighting que diferencia diretiva/atributo/valor de Markdown
normal, diagnósticos em tempo real (mesmos códigos da seção 6), autocomplete
de nome de diretiva (digite `:::`) e de atributos/valores (`type="` dentro
de `:::chart` sugere `bar`/`line`/`pie`), e hover com a documentação de cada
diretiva.

**Preview**: atualiza incrementalmente ao editar (sem recarregar o webview),
e sincroniza com o editor nos dois sentidos — clicar num bloco do preview
move o cursor até o trecho correspondente no editor, e mover o cursor no
editor destaca o bloco correspondente no preview.

**Snippets**: digite o nome da diretiva e pressione Tab para expandir um
modelo pronto:

| Prefixo | Expande para |
| --- | --- |
| `chart` | `:::chart type="..." title="..."` com duas linhas de dado de exemplo |
| `card` | `:::card title="..."` com uma métrica de exemplo |
| `alert` | `:::alert type="..."` com espaço para a mensagem |
| `progress` | `:::progress value="..." label="..."` |
| `math` | `:::math` com uma expressão de exemplo |
| `code` | `:::code language="..."` com uma linha de código de exemplo |
| `tabs` | `::::tabs` com duas abas de exemplo, cada uma com um bloco de código |

## 10. Limitações conhecidas

- Sem listas de tarefas (`- [ ]`), notas de rodapé, ou células de tabela que
  ocupam múltiplas colunas/linhas.
- Ênfase (`*`/`_`) segue regras propositalmente mais restritas que o
  CommonMark em casos de aninhamento ambíguo (ver [SPEC.md](SPEC.md)).
- HTML bruto nunca é executado (ver seção 3) — decisão de segurança, não
  lacuna.
- Uma linha com um caractere de tab real não tem sua indentação reconhecida
  por listas/citações aninhadas (o editor sempre insere espaços ao indentar,
  então isso raramente aparece na prática).
- No editor do VS Code, `:::code language="X"` não ganha highlighting
  específico da linguagem `X` dentro da cerca (o preview já colore
  normalmente via highlight.js; só o *editor* fica sem essa camada extra).

Lista completa e atualizada sempre em [`SPEC.md`](SPEC.md#4-limitações-conhecidas-v1).

## 11. Exemplo completo

Um documento único exercitando Markdown básico, as sete diretivas, e
aninhamento — o mesmo padrão do template **Todos os recursos** no app web:

````markup
# Relatório de vendas

## Resultado

As vendas cresceram **18%** no último trimestre, puxadas por `Q4`.

:::chart type="bar" title="Vendas por trimestre"
Q1: 120
Q2: 180
Q3: 240
Q4: 310
:::

:::card title="Performance"
CPU: 78%
RAM: 64%
Disk: 42%
:::

:::alert type="warning"
Esta operação pode apagar dados.
:::

## Progresso da equipe

:::progress value="72" label="Python"
:::

:::math
E = mc^2
:::

::::tabs
### Python
```python
print("hello")
```
### JavaScript
```javascript
console.log("hello")
```
::::

| Recurso | Suportado |
|---|---|
| Tabelas | sim |
| Gráficos | sim |

Veja o [repositório](https://example.com) para mais detalhes.
````

Isso é exatamente o que a suíte de testes de aceitação
([`mixing.test.ts`](../packages/core/src/__tests__/mixing.test.ts)) verifica
com zero diagnósticos: headings, parágrafo com negrito e código inline, as
sete diretivas, tabela e link, todos juntos, sem um atropelar o outro.
