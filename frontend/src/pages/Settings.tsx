import { ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { PageHeader } from '@/components/PageHeader'
import { SyncSettings } from '@/components/SyncSettings'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useIvyImport } from '@/hooks/useIvyImport'
import { type Theme, useTheme } from '@/hooks/useTheme'
import { useSettings } from '@/hooks/useWallet'

export function Settings() {
  const settings = useSettings()
  const { theme, setTheme } = useTheme()
  const ivyImport = useIvyImport()

  return (
    <>
      <PageHeader title="Settings" />
      <div className="flex flex-col gap-6 px-4">
        <Section title="General">
          <Row label="Currency" value={settings?.currency} />
          <Row label="Theme">
            <ToggleGroup
              type="single"
              size="sm"
              variant="outline"
              spacing={0}
              value={theme}
              onValueChange={(value) => value && setTheme(value as Theme)}
            >
              <ToggleGroupItem value="system">Auto</ToggleGroupItem>
              <ToggleGroupItem value="light">Light</ToggleGroupItem>
              <ToggleGroupItem value="dark">Dark</ToggleGroupItem>
            </ToggleGroup>
          </Row>
          <Link to="/categories" className="flex items-center justify-between py-3">
            Categories
            <ChevronRight className="size-4 text-muted-foreground" />
          </Link>
        </Section>

        <Section title="Google Sheets">
          <SyncSettings />
        </Section>

        <Section title="Data">
          {ivyImport.input}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="my-3">
                Import Ivy Wallet backup
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Replace all data?</AlertDialogTitle>
                <AlertDialogDescription>
                  Importing replaces every account, category and transaction in this app with the backup's.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={ivyImport.open}>
                  Choose backup
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </Section>

        <Section title="About">
          <Link to="/privacy" className="flex items-center justify-between py-3">
            Privacy Policy
            <ChevronRight className="size-4 text-muted-foreground" />
          </Link>
          <Link to="/terms" className="flex items-center justify-between py-3">
            Terms of Service
            <ChevronRight className="size-4 text-muted-foreground" />
          </Link>
          <p className="py-3 text-sm text-muted-foreground">
            Inspired by{' '}
            <a className="underline underline-offset-2" href="https://github.com/Ivy-Apps/ivy-wallet" target="_blank" rel="noreferrer">
              Ivy Wallet
            </a>
            , an open-source budget app. Not affiliated with the Ivy Wallet project.
          </p>
        </Section>
      </div>
    </>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-sm font-medium text-muted-foreground">{title}</h2>
      <div className="flex flex-col divide-y">{children}</div>
    </section>
  )
}

function Row({ label, value, children }: { label: string; value?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex min-h-12 items-center justify-between py-2">
      <span>{label}</span>
      {children ?? <span className="text-muted-foreground">{value}</span>}
    </div>
  )
}
