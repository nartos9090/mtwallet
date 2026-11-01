import { describe, expect, it, vi } from 'vitest'
import { markdown } from './markdown.ts'

type Transform = (this: object, code: string, id: string) => { code: string } | undefined
/** The plugin's transform hook (a plain function here, not Vite's object form). */
const transformOf = (values: Record<string, string | undefined>) => markdown(values).transform as unknown as Transform

/** Runs the transform like Vite would, with a minimal plugin context. */
function render(source: string, values: Record<string, string | undefined>) {
  const context = {
    error: (message: string) => {
      throw new Error(message)
    },
    warn: vi.fn(),
  }
  const result = transformOf(values).call(context, source, '/src/legal/test.md')
  return { html: result && (JSON.parse(result.code.replace(/^export default /, '')) as string), warn: context.warn }
}

describe('markdown plugin', () => {
  it('renders Markdown with escaped values', () => {
    const { html } = render('## Hi\n\nRun by {{operator}}.', { operator: 'Ann <&> "Co"' })
    expect(html).toBe('<h2>Hi</h2>\n<p>Run by Ann &lt;&amp;&gt; &quot;Co&quot;.</p>\n')
  })

  it('opens external links in a new tab and keeps app links in the app', () => {
    const { html } = render('[Google](https://policies.google.com) [Privacy](/privacy) [Mail](mailto:{{email}})', {
      email: 'me@example.com',
    })
    expect(html).toContain('<a href="https://policies.google.com" target="_blank" rel="noreferrer">Google</a>')
    expect(html).toContain('<a href="/privacy">Privacy</a>')
    expect(html).toContain('<a href="mailto:me@example.com">Mail</a>')
  })

  it('shows missing values as [name] and warns once', () => {
    const { html, warn } = render('{{operator}} and {{operator}}', { operator: undefined })
    expect(html).toContain('[operator] and [operator]')
    expect(warn).toHaveBeenCalledOnce()
  })

  it('fails on unknown placeholders', () => {
    expect(() => render('{{operater}}', { operator: 'x' })).toThrow(/Unknown placeholder \{\{operater\}\}/)
  })

  it('leaves other files alone', () => {
    expect(transformOf({}).call({}, 'x', '/src/main.ts')).toBeUndefined()
  })
})
