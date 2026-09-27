import {
  Blocks,
  Bold,
  ChartPie,
  Italic,
  Link,
  List,
  ListTodo,
  Strikethrough,
  Underline,
} from 'lucide-react';
import { useWorkbench } from '../context.ts';
import { formatShortcut } from '../lib/keys.ts';
import { editor } from '../editor/controller.ts';
import {
  insertLink,
  PIE_CHART_SNIPPET,
  toggleInline,
  toggleLines,
  type InlineFormat,
} from '../editor/format.ts';

interface Action {
  label: string;
  /** The syntax it writes, shown in the tooltip. */
  syntax: string;
  icon: typeof Bold;
  run: () => void;
}

const inline = (format: InlineFormat) => () => editor.apply((s) => toggleInline(s, format));

/** Compact formatting toolbar above the editor. Every action writes real MarkUP syntax. */
export function FormatBar() {
  const { wb } = useWorkbench();
  const groups: Action[][] = [
    [
      { label: 'Bold', syntax: '**text**', icon: Bold, run: inline('bold') },
      { label: 'Italic', syntax: '*text*', icon: Italic, run: inline('italic') },
      { label: 'Underline', syntax: ':u[text]', icon: Underline, run: inline('underline') },
      {
        label: 'Strikethrough',
        syntax: '~~text~~',
        icon: Strikethrough,
        run: inline('strikethrough'),
      },
    ],
    [
      {
        label: 'Bulleted list',
        syntax: '- item',
        icon: List,
        run: () => editor.apply((s) => toggleLines(s, 'bullet')),
      },
      {
        label: 'Checkbox',
        syntax: '- [ ] task',
        icon: ListTodo,
        run: () => editor.apply((s) => toggleLines(s, 'task')),
      },
      { label: 'Link', syntax: '[text](url)', icon: Link, run: () => editor.apply(insertLink) },
    ],
    [
      {
        label: 'Pie chart',
        syntax: ':::chart{type=pie}',
        icon: ChartPie,
        run: () => editor.insertBlock(PIE_CHART_SNIPPET),
      },
      {
        label: 'Insert component…',
        syntax: formatShortcut('mod+alt+i'),
        icon: Blocks,
        run: () => wb.openPalette('components'),
      },
    ],
  ];

  return (
    <div className="format-bar" role="toolbar" aria-label="Formatting">
      {groups.map((group, i) => (
        <div key={i} className="format-group">
          {group.map(({ label, syntax, icon: Icon, run }) => (
            <button
              key={label}
              type="button"
              className="format-button"
              title={`${label}  ${syntax}`}
              aria-label={label}
              // Keep the editor focused so the selection survives the click.
              onMouseDown={(event) => event.preventDefault()}
              onClick={run}
            >
              <Icon size={15} strokeWidth={1.75} />
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
