# Especificação do MarkUP

MarkUP é uma linguagem de documentos: um superconjunto de sintaxe inspirada no
Markdown, acrescido de diretivas para componentes ricos (gráficos, cards,
alertas, progresso, matemática, código e abas). Este documento é a referência
normativa da linguagem — o comportamento aqui descrito é o que a suíte de
testes em `packages/core/src/__tests__` verifica.

MarkUP não promete compatibilidade byte-a-byte com o CommonMark em cada caso
de borda (ver a seção de ênfase), mas segue as mesmas regras estruturais dele
para todo o Markdown básico — inclusive as que costumam surpreender quem não
conhece a especificação, como o espaço obrigatório depois do `#` de um
heading. O objetivo é: **qualquer documento Markdown razoável continua
funcionando exatamente como esperado**; diretivas MarkUP são um acréscimo,
nunca uma ruptura.

## 1. Markdown básico

| Construção | Sintaxe | Nó da AST |
| --- | --- | --- |
| Heading | `# ` até `###### ` (espaço obrigatório após o `#`) | `heading` (`depth` 1–6) |
| Parágrafo | linhas consecutivas sem outra construção | `paragraph` |
| Negrito | `**texto**` ou `__texto__` | `strong` |
| Itálico | `*texto*` ou `_texto_` | `emphasis` |
| Rasurado (strikethrough) | `~~texto~~` | `strikethrough` |
| Código inline | `` `código` `` | `inlineCode` |
| Link | `[texto](url "título")` | `link` |
| Imagem | `![alt](url "título")` | `image` |
| Lista não ordenada | `- item`, `* item`, `+ item` | `list` (`ordered: false`) |
| Lista ordenada | `1. item`, `1) item` | `list` (`ordered: true`, `start`) |
| Lista aninhada | sub-item indentado até a coluna onde o conteúdo do item pai começa | `list` dentro de `listItem.children` |
| Citação | `> texto` | `blockquote` |
| Bloco de código | ` ``` ` ou `~~~`, com linguagem opcional | `codeBlock` |
| Tabela | `\| a \| b \|` com linha delimitadora `\|---\|---\|` | `table` |
| Régua horizontal | `---`, `***` ou `___` | `thematicBreak` |
| Quebra de linha suave | uma linha normal seguida de outra, dentro do mesmo parágrafo | vira um espaço (sem nó próprio) |
| Quebra de linha rígida | linha terminada em dois ou mais espaços, ou uma `\` solta, antes da quebra | `break` |

### Por que `#texto` (sem espaço) não vira heading

O CommonMark exige espaço (ou tab) entre os `#` de abertura e o texto do
heading — de propósito, para não confundir `#hashtag` dentro de uma frase com
um heading. O MarkUP segue a mesma regra. Uma linha que começa com 1–6 `#`
colados no texto seguinte não é um erro silencioso: o parser emite um
diagnóstico (`heading-missing-space`, aviso) explicando exatamente o que
falta, para que a interface mostre isso ao usuário em vez de só "não
renderizar como heading" sem explicação.

### Ênfase: regras restritas

Para evitar a ambiguidade clássica do Markdown com `*`/`_` aninhados, o MarkUP
define:

- Não há ênfase no meio de palavra: o caractere logo após o marcador de
  abertura não pode ser espaço.
- O fechamento não pode ser precedido de espaço.
- Não há aninhamento de emphasis dentro de emphasis do mesmo tipo.

Casos de borda que o CommonMark resolveria de forma mais permissiva podem
produzir texto literal no MarkUP em vez de ênfase. Isso é intencional.

### Escapes

Barra invertida escapa qualquer pontuação ASCII, o mesmo conjunto do
CommonMark (não só os caracteres que o MarkUP usa como sintaxe):

```text
! " # $ % & ' ( ) * + , - . / : ; < = > ? @ [ \ ] ^ _ ` { | } ~
```

Por exemplo, `\~` produz um til literal (não abre um `~~rasurado~~`), e
`1\.` no início de uma linha não é confundido com uma lista ordenada.

## 2. Diretivas

Sintaxe geral:

```markup
:::nome atributo="valor" outro=valor flag
conteúdo do corpo
:::
```

- Abertura: três ou mais `:` seguidos do nome e atributos opcionais.
- Fechamento: uma linha só de `:`, de comprimento **maior ou igual** ao da
  abertura — a mesma regra das cercas de código do CommonMark.
- **Aninhamento**: use uma cerca mais longa por fora para conter diretivas
  com cerca mais curta por dentro:

  ```markup
  ::::tabs
  ### Aviso
  :::alert type="error"
  Perigo.
  :::
  ::::
  ```

- Diretiva não fechada até o fim do arquivo é fechada implicitamente, com um
  aviso de diagnóstico — nunca derruba o parser.
- Diretiva com nome não registrado vira um nó `unknownDirective`, visível no
  preview com um aviso, em vez de desaparecer silenciosamente.

### Atributos

`chave="valor com espaços"`, `chave=valor` (sem espaços/aspas) ou `chave`
sozinho (booleano `true`).

### `:::chart`

```markup
:::chart type="bar" title="Vendas por trimestre"
Q1: 120
Q2: 180
Q3: 240
:::
```

- `type`: `bar` (padrão), `line` ou `pie`. Valor inválido cai para `bar` com
  aviso.
- `title`: opcional.
- Corpo: uma linha por ponto, no formato `Rótulo: valor`. Linhas fora desse
  formato são ignoradas com aviso; `valor` aceita um `%` final (ignorado no
  cálculo).

### `:::card`

```markup
:::card title="Performance"
CPU: 78%
RAM: 64%
Disk: 42%

Texto adicional em Markdown normal.
:::
```

O prefixo do corpo no formato `Rótulo: valor` vira a grade de métricas; o
restante do corpo é Markdown normal (parágrafos, listas etc.), permitindo
compor um card com mais do que só números.

### `:::alert`

```markup
:::alert type="warning" title="Atenção"
Esta operação pode apagar dados.
:::
```

- `type`: `info` (padrão), `success`, `warning` ou `error`. Inválido cai para
  `info` com aviso.
- `title`: opcional.
- Corpo: Markdown normal.

### `:::progress`

```markup
:::progress value="72" label="Python"
:::
```

- `value` (obrigatório): 0 quando ausente, com erro de diagnóstico.
- `max`: padrão 100.
- `label`: opcional.
- Valor fora de `[0, max]` é ajustado (clamped) com aviso.
- Não tem corpo interpretado — é sempre uma diretiva de linha única.

### `:::math`

```markup
:::math
E = mc^2
:::
```

O corpo é uma expressão LaTeX renderizada com KaTeX (carregado sob demanda).
Erro de sintaxe LaTeX é isolado pelo próprio KaTeX (`throwOnError: false`) e
mostrado como texto de erro, sem derrubar o restante do documento.

### `:::code`

```markup
:::code language="python"
def hello():
    print("Hello World")
:::
```

Equivalente semântico a uma cerca de código com linguagem — é normalizado
para o mesmo nó `codeBlock` de ` ```python `. `language` é opcional.

### `:::tabs`

```markup
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
```

Cada aba é introduzida por um heading de nível 3 (`### Título`) dentro do
corpo. Conteúdo antes da primeira aba é ignorado com aviso. Uma diretiva
`:::tabs` sem nenhuma aba emite aviso.

## 3. Diagnósticos

Todo diagnóstico tem `severity` (`error` | `warning`), `code`, `message` e
`position` (linha/coluna/offset de início e fim). O parser **nunca lança
exceção** — um documento inválido no meio da digitação produz uma AST parcial
mais diagnósticos, nunca uma tela quebrada.

| Código | Severidade | Quando |
| --- | --- | --- |
| `heading-missing-space` | warning | Linha começa com `#`–`######` sem espaço depois (não vira heading) |
| `directive-unknown` | warning | Diretiva sem handler registrado |
| `directive-unclosed` | warning | Diretiva sem fechamento até o EOF |
| `code-fence-unclosed` | warning | Cerca de código sem fechamento |
| `chart-invalid-type` | warning | `type` de chart não reconhecido |
| `chart-invalid-value` | warning | Valor não numérico no corpo do chart |
| `chart-unrecognized-lines` | warning | Linhas do corpo fora do formato `Rótulo: valor` |
| `alert-invalid-type` | warning | `type` de alert não reconhecido |
| `progress-missing-value` | error | `:::progress` sem `value` |
| `progress-value-clamped` | warning | `value` fora de `[0, max]` |
| `tabs-content-before-heading` | warning | Conteúdo antes do primeiro `### Título` |
| `tabs-empty` | warning | `:::tabs` sem nenhuma aba |

## 4. Limitações conhecidas (v1)

- Não é 100% compatível com CommonMark em casos de borda de ênfase (ver seção
  2 acima) — restrição deliberada para evitar a ambiguidade clássica de
  `*`/`_` aninhados, não uma lacuna de implementação.
- Sem suporte a listas de tarefas (`- [ ]`), notas de rodapé ou tabelas com
  células que ocupam múltiplas colunas/linhas.
- **HTML bruto embutido no documento não é interpretado — é escapado como
  texto visível, por design.** Um documento MarkUP pode ser exportado e
  compartilhado como HTML autocontido; permitir HTML bruto executável seria
  abrir a porta para injeção de script em qualquer documento compartilhado.
  Isso vale tanto para HTML inline (`<b>texto</b>` no meio de uma frase)
  quanto para blocos HTML — em ambos os casos, os caracteres aparecem
  literalmente no preview, nunca são interpretados como marcação real.
- Uma linha contendo um caractere de tab (`\t`) real não tem sua indentação
  reconhecida por listas/citações aninhadas — o scanner não expande tabs em
  espaços (fazer isso mudaria o comprimento da linha em relação ao texto
  original, o que quebraria o mapeamento de posições usado pelo indicador de
  erros e pela extensão do VS Code). Na prática isso raramente aparece,
  porque o editor do app web e o CodeMirror inserem espaços ao indentar, não
  tabs — mas um documento colado de outra fonte com tabs reais pode ter
  listas aninhadas não reconhecidas nessas linhas especificamente.
- O HTML exportado referencia os arquivos de fonte do KaTeX por caminho
  relativo (`fonts/...`). Sem esses arquivos ao lado do `.html`, fórmulas
  matemáticas continuam legíveis (KaTeX tem fallback para uma fonte serifada
  do sistema), mas sem a tipografia matemática exata. Embutir as fontes como
  `data:` inflaria todo export em ~600 KB mesmo para documentos com uma única
  fórmula simples — não valeu a pena para a v1.
