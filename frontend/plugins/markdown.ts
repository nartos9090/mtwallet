import { Marked } from 'marked'
import type { Plugin } from 'vite'

/**
 * Imports .md files as HTML strings, rendered at build time so no Markdown
 * parser ships to the browser. `{{name}}` placeholders are filled from
 * `values` (HTML-escaped). An unknown name fails the build; a known one with
 * no value warns and renders as "[name]".
 */
export function markdown(values: Record<string, string | undefined>): Plugin {
  const escape = (text: string) =>
    text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  const marked = new Marked({
    renderer: {
      // External links open in a new tab; app links (/terms) stay in the app.
      link({ href, title, tokens }) {
        const external = /^https?:\/\//.test(href) ? ' target="_blank" rel="noreferrer"' : ''
        const titleAttr = title ? ` title="${escape(title)}"` : ''
        return `<a href="${escape(href)}"${titleAttr}${external}>${this.parser.parseInline(tokens)}</a>`
      },
    },
  })
  const warned = new Set<string>()

  return {
    name: 'markdown',
    enforce: 'pre',
    transform(source, id) {
      if (!id.endsWith('.md')) return
      const filled = source.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, name: string) => {
        if (!(name in values)) this.error(`Unknown placeholder {{${name}}}. Known: ${Object.keys(values).join(', ')}`)
        const value = values[name]
        if (value) return escape(value)
        if (!warned.has(name)) {
          warned.add(name)
          this.warn(`{{${name}}} has no value: set it in .env (see .env.example)`)
        }
        return `[${name}]`
      })
      return { code: `export default ${JSON.stringify(marked.parse(filled, { async: false }))}`, map: null }
    },
  }
}
