# MarkUP

Markdown foi desenhado para texto. MarkUP é desenhado para documentos.

MarkUP é Markdown completo, mais um punhado de diretivas — `:::chart`,
`:::card`, `:::alert`, `:::progress`, `:::math`, `:::code`, `:::tabs` — que
viram componentes visuais reais em vez de texto puro. Nada é substituído:
Markdown e diretivas convivem no mesmo documento, em qualquer ordem, uma
dentro da outra quando fizer sentido.

## Um documento MarkUP

```markup
# Relatório de vendas

As vendas cresceram **18%** no último trimestre.

:::chart type="bar" title="Vendas por trimestre"
Q1: 120
Q2: 180
Q3: 240
:::

:::alert type="warning"
Esta operação pode apagar dados.
:::
```

## Comece por aqui

- **[Guia completo](guide.html)** — toda a linguagem, explicada com exemplos: Markdown suportado, as sete diretivas, diagnósticos, exportação, a extensão do VS Code.
- **[Especificação](spec.html)** — a referência normativa, testada linha a linha pela suíte de testes do parser.
- **[Interpretador](interpreter.html)** — escreva MarkUP e veja o resultado ao vivo, direto no navegador.
- **[Instalação](install.html)** — baixe a extensão do VS Code ou o aplicativo desktop.

## Por que outra linguagem de documentos

Ferramentas de documento ricas em geral pedem para você abandonar o texto
simples: editores WYSIWYG, formatos binários, ou uma sintaxe própria que não
é Markdown de jeito nenhum. MarkUP não pede essa troca — todo Markdown que
você já sabe escrever continua funcionando exatamente como espera, e as
diretivas são um acréscimo estritamente opcional para quando texto simples
não é suficiente.
