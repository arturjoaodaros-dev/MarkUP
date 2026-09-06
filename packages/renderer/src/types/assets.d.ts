// `lazyLibs.ts` importa CSS por efeito colateral (`import('katex/dist/katex.min.css')`)
// só para que bundlers baseados em Vite/esbuild injetem a folha de estilo —
// o valor do módulo em si nunca é usado. TypeScript não conhece CSS por
// padrão, daí esta declaração ambiente.
declare module '*.css' {
  const noop: unknown;
  export default noop;
}
