export interface MarkupTemplate {
  id: string;
  title: string;
  content: string;
}

const blank: MarkupTemplate = {
  id: 'blank',
  title: 'Documento em branco',
  content: '# Novo documento\n\nComece a escrever em MarkUP.\n',
};

const salesReport: MarkupTemplate = {
  id: 'sales-report',
  title: 'Relatório de vendas',
  content: `# Relatório de vendas

## Resultado

As vendas cresceram **18%** no último trimestre, puxadas por \`Q4\`.

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
`,
};

const showcase: MarkupTemplate = {
  id: 'showcase',
  title: 'Todos os recursos',
  content: `# MarkUP — visão geral

Markdown foi desenhado para texto. **MarkUP** é desenhado para documentos.

## Markdown básico

Um parágrafo com *itálico*, **negrito**, \`código inline\` e um [link](https://example.com).

- item um
- item dois

1. primeiro
2. segundo

> Uma citação relevante.

| Recurso | Suportado |
|:--|--:|
| Tabelas | sim |
| Gráficos | sim |

---

## Gráficos

:::chart type="bar" title="Vendas por trimestre"
Q1: 120
Q2: 180
Q3: 240
Q4: 310
:::

:::chart type="line" title="Tendência"
Jan: 10
Fev: 25
Mar: 18
Abr: 30
:::

:::chart type="pie" title="Participação"
Produto A: 45
Produto B: 30
Produto C: 25
:::

## Card e alertas

:::card title="Performance"
CPU: 78%
RAM: 64%
Disk: 42%
:::

:::alert type="info"
Isto é uma informação.
:::

:::alert type="success"
Operação concluída com sucesso.
:::

:::alert type="warning"
Esta operação pode apagar dados.
:::

:::alert type="error"
Falha ao conectar ao servidor.
:::

## Progresso

:::progress value="72" label="Python"
:::

## Matemática

:::math
E = mc^2
:::

## Código

:::code language="python"
def hello():
    print("Hello World")
:::

## Abas

::::tabs
### Python
\`\`\`python
print("hello")
\`\`\`
### JavaScript
\`\`\`javascript
console.log("hello")
\`\`\`
::::
`,
};

export const templates: MarkupTemplate[] = [blank, salesReport, showcase];
