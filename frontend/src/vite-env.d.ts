/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GOOGLE_CLIENT_ID: string
}

/** Markdown rendered to HTML at build time (plugins/markdown.ts). */
declare module '*.md' {
  const html: string
  export default html
}
