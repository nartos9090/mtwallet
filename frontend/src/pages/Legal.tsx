import type { MouseEvent } from 'react'
import { useNavigate } from 'react-router'
import { PageHeader } from '@/components/PageHeader'
import privacyHtml from '@/legal/privacy.md'
import termsHtml from '@/legal/terms.md'

/**
 * Privacy Policy and Terms of Service. The text lives in src/legal/*.md and is
 * rendered at build time (plugins/markdown.ts), with details from .env. Plain
 * pages outside onboarding, so they open directly from a link (Google's app
 * verification asks for both URLs).
 */

function LegalPage({ title, html }: { title: string; html: string }) {
  const navigate = useNavigate()

  // Links to app pages (/privacy, /terms) navigate in the app instead of reloading it.
  function onClick(event: MouseEvent) {
    const link = (event.target as Element).closest('a')
    const href = link?.getAttribute('href')
    if (href?.startsWith('/') && !event.metaKey && !event.ctrlKey) {
      event.preventDefault()
      navigate(href)
    }
  }

  return (
    <div className="mx-auto min-h-dvh max-w-2xl">
      <PageHeader title={title} back />
      <article
        onClick={onClick}
        className={[
          'px-4 pb-16 text-[15px] leading-relaxed text-foreground/90',
          '[&>p:first-child]:text-sm [&>p:first-child]:text-muted-foreground',
          '[&_h2]:mt-8 [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-foreground',
          '[&_p]:my-3 [&_ul]:my-3 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5',
          '[&_a]:underline [&_a]:underline-offset-2 [&_strong]:font-semibold [&_strong]:text-foreground',
        ].join(' ')}
        // Built from our own Markdown at build time; .env values are escaped.
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  )
}

export function PrivacyPolicy() {
  return <LegalPage title="Privacy Policy" html={privacyHtml} />
}

export function TermsOfService() {
  return <LegalPage title="Terms of Service" html={termsHtml} />
}
