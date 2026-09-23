/// <reference types="vite/client" />

declare module '*.markup?raw' {
  const content: string;
  export default content;
}
