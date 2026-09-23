/**
 * TextMate grammar for MarkUP, written as JavaScript so the regular expressions
 * stay readable. `build.mjs` writes `markup.tmLanguage.json` from it.
 *
 * The grammar gives instant, approximate colouring; the language server's
 * semantic tokens refine directive names, attributes and data keys.
 */

const EMBEDDED = [
  ['javascript', 'js|javascript|mjs|cjs', 'source.js'],
  ['typescript', 'ts|typescript|mts|cts', 'source.ts'],
  ['tsx', 'tsx', 'source.tsx'],
  ['jsx', 'jsx', 'source.js.jsx'],
  ['json', 'json|jsonc|json5', 'source.json'],
  ['css', 'css', 'source.css'],
  ['scss', 'scss', 'source.css.scss'],
  ['html', 'html|htm', 'text.html.basic'],
  ['xml', 'xml|svg', 'text.xml'],
  ['python', 'py|python', 'source.python'],
  ['rust', 'rs|rust', 'source.rust'],
  ['go', 'go|golang', 'source.go'],
  ['java', 'java', 'source.java'],
  ['csharp', 'cs|csharp|c#', 'source.cs'],
  ['cpp', 'cpp|c\\+\\+|cc|hpp', 'source.cpp'],
  ['c', 'c|h', 'source.c'],
  ['shellscript', 'sh|bash|zsh|shell|console', 'source.shell'],
  ['powershell', 'ps1|powershell|pwsh', 'source.powershell'],
  ['yaml', 'ya?ml', 'source.yaml'],
  ['sql', 'sql', 'source.sql'],
  ['diff', 'diff|patch', 'source.diff'],
  ['markdown', 'md|markdown', 'text.html.markdown'],
  ['markup', 'markup|mkup', 'text.markup'],
];

const attributeBlock = {
  begin: '\\{',
  end: '\\}|$',
  beginCaptures: { 0: { name: 'punctuation.definition.attributes.begin.markup' } },
  endCaptures: { 0: { name: 'punctuation.definition.attributes.end.markup' } },
  name: 'meta.attributes.markup',
  patterns: [
    { match: '#[^\\s{}"\'=#.,]+', name: 'entity.other.attribute-name.id.markup' },
    { match: '\\.[^\\s{}"\'=#.,]+', name: 'entity.other.attribute-name.class.markup' },
    {
      match:
        '([A-Za-z_][\\w:.-]*)(=)("(?:[^"\\\\]|\\\\.)*"?|\'(?:[^\'\\\\]|\\\\.)*\'?|[^\\s"\'=`{},]+)?',
      captures: {
        1: { name: 'entity.other.attribute-name.markup' },
        2: { name: 'punctuation.separator.key-value.markup' },
        3: { name: 'string.unquoted.markup' },
      },
    },
    { match: '[A-Za-z_][\\w:.-]*', name: 'entity.other.attribute-name.flag.markup' },
  ],
};

const directiveLabel = {
  begin: '\\G\\[',
  end: '\\]|$',
  beginCaptures: { 0: { name: 'punctuation.definition.label.begin.markup' } },
  endCaptures: { 0: { name: 'punctuation.definition.label.end.markup' } },
  contentName: 'string.other.label.markup',
  patterns: [{ include: '#inline' }],
};

export const grammar = {
  $schema: 'https://raw.githubusercontent.com/martinring/tmlanguage/master/tmlanguage.json',
  name: 'MarkUP',
  scopeName: 'text.markup',
  fileTypes: ['markup', 'mkup'],
  patterns: [{ include: '#frontMatter' }, { include: '#block' }],
  repository: {
    frontMatter: {
      begin: '\\A(-{3})\\s*$',
      end: '^(-{3}|\\.{3})\\s*$',
      beginCaptures: { 1: { name: 'punctuation.definition.front-matter.markup' } },
      endCaptures: { 1: { name: 'punctuation.definition.front-matter.markup' } },
      name: 'meta.embedded.block.front-matter.markup',
      patterns: [{ include: 'source.yaml' }],
    },
    block: {
      patterns: [
        { include: '#fencedCode' },
        { include: '#comment' },
        { include: '#directiveOpen' },
        { include: '#directiveClose' },
        { include: '#leafDirective' },
        { include: '#heading' },
        { include: '#thematicBreak' },
        { include: '#blockquote' },
        { include: '#listItem' },
        { include: '#table' },
        { include: '#definition' },
        { include: '#inline' },
      ],
    },
    fencedCode: {
      patterns: [
        ...EMBEDDED.map(([id, aliases, scope]) => ({
          begin: `^(\\s*)(\`{3,}|~{3,})\\s*(?i:(${aliases}))((?:\\s|\\{).*)?$`,
          end: '^\\s*(\\2[`~]*)\\s*$',
          beginCaptures: {
            2: { name: 'punctuation.definition.code.fenced.markup' },
            3: { name: 'fenced_code.block.language.markup' },
            4: { name: 'fenced_code.block.language.attributes.markup', patterns: [attributeBlock] },
          },
          endCaptures: { 1: { name: 'punctuation.definition.code.fenced.markup' } },
          name: 'markup.fenced_code.block.markup',
          patterns: [
            {
              begin: '(^|\\G)(\\s*)(.*)',
              while: '(^|\\G)(?!\\s*([`~]{3,})\\s*$)',
              contentName: `meta.embedded.block.${id}`,
              patterns: [{ include: scope }],
            },
          ],
        })),
        {
          begin: '^(\\s*)(`{3,}|~{3,})(.*)$',
          end: '^\\s*(\\2[`~]*)\\s*$',
          beginCaptures: {
            2: { name: 'punctuation.definition.code.fenced.markup' },
            3: { name: 'fenced_code.block.language.markup' },
          },
          endCaptures: { 1: { name: 'punctuation.definition.code.fenced.markup' } },
          name: 'markup.fenced_code.block.markup',
          contentName: 'markup.raw.block.markup',
        },
      ],
    },
    comment: {
      begin: '<!--',
      end: '-->',
      captures: { 0: { name: 'punctuation.definition.comment.markup' } },
      name: 'comment.block.markup',
    },
    directiveOpen: {
      begin: '^\\s*(:{3,})\\s?([A-Za-z][\\w-]*)',
      end: '$',
      beginCaptures: {
        1: { name: 'punctuation.definition.directive.markup' },
        2: { name: 'entity.name.tag.directive.markup' },
      },
      name: 'meta.directive.container.markup',
      patterns: [directiveLabel, attributeBlock],
    },
    directiveClose: {
      match: '^\\s*(:{3,})\\s*$',
      captures: { 1: { name: 'punctuation.definition.directive.end.markup' } },
      name: 'meta.directive.close.markup',
    },
    leafDirective: {
      begin: '^\\s*(::)([A-Za-z][\\w-]*)',
      end: '$',
      beginCaptures: {
        1: { name: 'punctuation.definition.directive.markup' },
        2: { name: 'entity.name.tag.directive.markup' },
      },
      name: 'meta.directive.leaf.markup',
      patterns: [directiveLabel, attributeBlock],
    },
    heading: {
      match: '^\\s*(#{1,6})(\\s+(.*?))?(\\s+#+)?(\\s+\\{[#.][^}]*\\})?\\s*$',
      captures: {
        1: { name: 'punctuation.definition.heading.markup' },
        3: { name: 'entity.name.section.markup', patterns: [{ include: '#inline' }] },
        4: { name: 'punctuation.definition.heading.markup' },
        5: { patterns: [attributeBlock] },
      },
      name: 'markup.heading.markup',
    },
    thematicBreak: {
      match: '^\\s*((\\*\\s*){3,}|(-\\s*){3,}|(_\\s*){3,})$',
      name: 'meta.separator.markup',
    },
    blockquote: {
      match: '^\\s*(>)',
      captures: { 1: { name: 'punctuation.definition.quote.begin.markup' } },
    },
    listItem: {
      match: '^\\s*([-*+]|\\d{1,9}[.)])(\\s+\\[[ xX]\\])?(?=\\s|$)',
      captures: {
        1: { name: 'punctuation.definition.list.begin.markup' },
        2: { name: 'constant.language.task.markup' },
      },
    },
    table: {
      match: '^\\s*\\|?\\s*:?-+:?\\s*(\\|\\s*:?-+:?\\s*)+\\|?\\s*$',
      name: 'punctuation.separator.table.markup',
    },
    definition: {
      match: '^\\s*(\\[)((?!\\^)[^\\]]+)(\\])(:)\\s*(\\S+)',
      captures: {
        1: { name: 'punctuation.definition.constant.markup' },
        2: { name: 'constant.other.reference.link.markup' },
        3: { name: 'punctuation.definition.constant.markup' },
        4: { name: 'punctuation.separator.key-value.markup' },
        5: { name: 'markup.underline.link.markup' },
      },
    },
    inline: {
      patterns: [
        { include: '#escape' },
        { include: '#entity' },
        { include: '#codeSpan' },
        { include: '#comment' },
        { include: '#inlineDirective' },
        { include: '#image' },
        { include: '#link' },
        { include: '#footnote' },
        { include: '#autolink' },
        { include: '#bold' },
        { include: '#italic' },
        { include: '#strike' },
        { match: '\\|', name: 'punctuation.separator.table.markup' },
      ],
    },
    escape: { match: '\\\\[!-/:-@\\[-`{-~]', name: 'constant.character.escape.markup' },
    entity: {
      match: '&(?:[A-Za-z][A-Za-z0-9]{1,31}|#\\d{1,7}|#[xX][0-9A-Fa-f]{1,6});',
      name: 'constant.character.entity.markup',
    },
    codeSpan: {
      match: '(`+)(?!`)(.+?)(?<!`)(\\1)(?!`)',
      captures: {
        1: { name: 'punctuation.definition.raw.markup' },
        2: { name: 'markup.inline.raw.string.markup' },
        3: { name: 'punctuation.definition.raw.markup' },
      },
    },
    inlineDirective: {
      match:
        '(?<![\\w:])(:)([A-Za-z][\\w-]*)(?=[\\[{])(\\[(?:[^\\[\\]\\\\]|\\\\.|\\[[^\\]]*\\])*\\])?(\\{[^{}]*\\})?',
      captures: {
        1: { name: 'punctuation.definition.directive.markup' },
        2: { name: 'entity.name.tag.directive.inline.markup' },
        3: { name: 'string.other.label.markup' },
        4: { patterns: [attributeBlock] },
      },
      name: 'meta.directive.inline.markup',
    },
    image: {
      match: '(!\\[)([^\\]]*)(\\])(\\()([^)\\s]*)(?:\\s+("[^"]*"))?(\\))(\\{[^}]*\\})?',
      captures: {
        1: { name: 'punctuation.definition.link.description.begin.markup' },
        2: { name: 'string.other.link.description.markup' },
        3: { name: 'punctuation.definition.link.description.end.markup' },
        5: { name: 'markup.underline.link.image.markup' },
        6: { name: 'string.other.link.title.markup' },
        8: { patterns: [attributeBlock] },
      },
      name: 'meta.image.inline.markup',
    },
    link: {
      patterns: [
        {
          match:
            '(\\[)((?:[^\\[\\]]|\\[[^\\]]*\\])*)(\\])(\\()([^)\\s]*)(?:\\s+("[^"]*"|\'[^\']*\'))?(\\))',
          captures: {
            1: { name: 'punctuation.definition.link.title.begin.markup' },
            2: { name: 'string.other.link.title.markup', patterns: [{ include: '#inline' }] },
            3: { name: 'punctuation.definition.link.title.end.markup' },
            5: { name: 'markup.underline.link.markup' },
            6: { name: 'string.other.link.description.title.markup' },
          },
          name: 'meta.link.inline.markup',
        },
        {
          match: '(\\[)([^\\]^][^\\]]*)(\\])(\\[)([^\\]]*)(\\])',
          captures: {
            2: { name: 'string.other.link.title.markup' },
            5: { name: 'constant.other.reference.link.markup' },
          },
          name: 'meta.link.reference.markup',
        },
      ],
    },
    footnote: {
      match: '(\\[\\^)([^\\]\\s]+)(\\])',
      captures: {
        1: { name: 'punctuation.definition.constant.begin.markup' },
        2: { name: 'constant.other.reference.footnote.markup' },
        3: { name: 'punctuation.definition.constant.end.markup' },
      },
    },
    autolink: {
      patterns: [
        {
          match: '<([A-Za-z][A-Za-z0-9+.-]{1,31}:[^\\s<>]*)>',
          captures: { 1: { name: 'markup.underline.link.markup' } },
        },
        {
          match: '(?<![\\w/])(?:https?://|www\\.)[^\\s<]*[^\\s<?!.,:*_~\'")]',
          name: 'markup.underline.link.markup',
        },
      ],
    },
    bold: {
      match: '(\\*\\*|__)(?=\\S)(.+?)(?<=\\S)(\\1)',
      captures: {
        1: { name: 'punctuation.definition.bold.markup' },
        2: { name: 'markup.bold.markup', patterns: [{ include: '#inline' }] },
        3: { name: 'punctuation.definition.bold.markup' },
      },
    },
    italic: {
      match: '(?<![\\w*])(\\*|_)(?=\\S)(.+?)(?<=\\S)(\\1)(?![\\w*])',
      captures: {
        1: { name: 'punctuation.definition.italic.markup' },
        2: { name: 'markup.italic.markup', patterns: [{ include: '#inline' }] },
        3: { name: 'punctuation.definition.italic.markup' },
      },
    },
    strike: {
      match: '(~~)(?=\\S)(.+?)(?<=\\S)(~~)',
      captures: {
        1: { name: 'punctuation.definition.strikethrough.markup' },
        2: { name: 'markup.strikethrough.markup' },
        3: { name: 'punctuation.definition.strikethrough.markup' },
      },
    },
  },
};
