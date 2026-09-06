import type { Table as TableNode } from '../../markup/parser';
import { InlineList } from '../MarkupDocument';

export function Table({ node }: { node: TableNode }) {
  return (
    <div className="mu-table-wrap">
      <table className="mu-table">
        <thead>
          <tr>
            {node.header.cells.map((cell, i) => (
              <th key={i} style={{ textAlign: node.align[i] ?? undefined }}>
                <InlineList nodes={cell.children} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {node.rows.map((row, r) => (
            <tr key={r}>
              {row.cells.map((cell, i) => (
                <td key={i} style={{ textAlign: node.align[i] ?? undefined }}>
                  <InlineList nodes={cell.children} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
