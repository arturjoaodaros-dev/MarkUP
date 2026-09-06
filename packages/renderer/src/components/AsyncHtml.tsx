import { useEffect, useState } from 'react';

/**
 * Renderiza HTML resolvido de forma assíncrona (KaTeX, highlight.js). O
 * conteúdo já passou por escape/whitelisting nas bibliotecas de origem, e o
 * `value` de entrada nunca vem de HTML bruto do usuário — apenas de
 * expressões matemáticas e código, que essas bibliotecas tratam como texto.
 */
export function AsyncHtml({
  as: Tag = 'span',
  loader,
  deps,
  className,
  fallback = null,
}: {
  as?: keyof JSX.IntrinsicElements;
  loader: () => Promise<string>;
  deps: unknown[];
  className?: string;
  fallback?: React.ReactNode;
}) {
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setHtml(null);
    loader().then((result) => {
      if (!cancelled) setHtml(result);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  if (html === null) return <Tag className={className}>{fallback}</Tag>;
  return <Tag className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}
