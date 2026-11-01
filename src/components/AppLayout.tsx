import { ChartPie, House, Plus, Settings, Wallet } from 'lucide-react'
import { Link, NavLink, Outlet } from 'react-router'
import { useSettings } from '@/hooks/useWallet'
import { cn } from '@/lib/utils'
import { Onboarding } from '@/pages/Onboarding'

/** Root route: shows onboarding until a currency is chosen. */
export function RootLayout() {
  const settings = useSettings()
  if (settings === undefined) return null
  return <div className="mx-auto min-h-dvh max-w-md">{settings ? <Outlet /> : <Onboarding />}</div>
}

const TABS = [
  { to: '/', label: 'Home', icon: House },
  { to: '/stats', label: 'Stats', icon: ChartPie },
  null,
  { to: '/accounts', label: 'Accounts', icon: Wallet },
  { to: '/settings', label: 'Settings', icon: Settings },
]

/** Main screens, with the bottom navigation and the add button. */
export function TabsLayout() {
  return (
    <>
      <main className="pb-24">
        <Outlet />
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="mx-auto grid h-16 max-w-md grid-cols-5 items-center">
          {TABS.map((tab) =>
            tab ? (
              <NavLink
                key={tab.to}
                to={tab.to}
                end
                className={({ isActive }) =>
                  cn(
                    'flex flex-col items-center gap-0.5 text-xs',
                    isActive ? 'text-foreground' : 'text-muted-foreground',
                  )
                }
              >
                <tab.icon className="size-5" />
                {tab.label}
              </NavLink>
            ) : (
              <Link
                key="add"
                to="/tx/new"
                aria-label="Add transaction"
                className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg active:scale-95"
              >
                <Plus className="size-6" />
              </Link>
            ),
          )}
        </div>
      </nav>
    </>
  )
}
