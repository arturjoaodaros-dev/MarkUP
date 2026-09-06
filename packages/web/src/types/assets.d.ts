declare module '*.css?raw' {
  const css: string;
  export default css;
}

declare module '*?raw' {
  const content: string;
  export default content;
}

declare module '*.css' {
  const noop: unknown;
  export default noop;
}
