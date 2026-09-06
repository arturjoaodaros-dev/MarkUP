import type { Document } from '../../markup/parser';
import { MarkupDocument } from '../../renderer/MarkupDocument';
import { PreviewErrorBoundary } from './PreviewErrorBoundary';

export function Preview({ ast }: { ast: Document }) {
  return (
    <div className="mu-preview">
      <PreviewErrorBoundary>
        <MarkupDocument document={ast} />
      </PreviewErrorBoundary>
    </div>
  );
}
