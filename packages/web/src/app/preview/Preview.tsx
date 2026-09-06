import type { Document } from '@markup/core';
import { MarkupDocument } from '@markup/renderer';
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
