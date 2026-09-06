import { Component } from 'react';
import type { ReactNode } from 'react';

// Um componente de diretiva com bug não deve derrubar a aplicação inteira —
// só o preview mostra um aviso, e o editor continua funcionando.
export class PreviewErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidUpdate(prevProps: { children: ReactNode }) {
    if (prevProps.children !== this.props.children && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="mu-preview-error">
          <strong>Erro ao renderizar o preview.</strong>
          <p>{this.state.error.message}</p>
        </div>
      );
    }
    return this.props.children;
  }
}
