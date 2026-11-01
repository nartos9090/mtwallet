import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router'
import { RootLayout, TabsLayout } from '@/components/AppLayout'
import { Toaster } from '@/components/ui/sonner'
import { Accounts } from '@/pages/Accounts'
import { Categories } from '@/pages/Categories'
import { Home } from '@/pages/Home'
import { PrivacyPolicy, TermsOfService } from '@/pages/Legal'
import { Settings } from '@/pages/Settings'
import { TransactionForm } from '@/pages/TransactionForm'
import { startAutoSync } from '@/sync/syncManager'
import './index.css'

const loadStats = () => import('@/pages/Stats')

const router = createBrowserRouter([
  {
    element: <RootLayout />,
    // Shown while a lazy route (Statistics) loads on a direct visit.
    HydrateFallback: () => null,
    children: [
      {
        element: <TabsLayout />,
        children: [
          { index: true, element: <Home /> },
          // Charts are a big chunk, kept out of the first load (and preloaded below).
          { path: 'stats', lazy: async () => ({ Component: (await loadStats()).Stats }) },
          { path: 'accounts', element: <Accounts /> },
          { path: 'settings', element: <Settings /> },
        ],
      },
      { path: 'tx/new', element: <TransactionForm /> },
      { path: 'tx/:id', element: <TransactionForm /> },
      { path: 'categories', element: <Categories /> },
    ],
  },
  // Outside RootLayout: readable before onboarding and when opened from a link.
  { path: 'privacy', element: <PrivacyPolicy /> },
  { path: 'terms', element: <TermsOfService /> },
])

startAutoSync()

// Once the app is up and idle, fetch the Statistics code so the page opens without waiting.
window.addEventListener('load', () => {
  const idle = window.requestIdleCallback ?? ((callback: () => void) => setTimeout(callback, 1500))
  idle(() => void loadStats())
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
    {/* Above the bottom nav and the form's Save bar, so it never covers header actions. */}
    <Toaster position="bottom-center" offset={{ bottom: 88 }} mobileOffset={{ bottom: 88 }} />
  </StrictMode>,
)
