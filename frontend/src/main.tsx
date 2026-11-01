import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router'
import { RootLayout, TabsLayout } from '@/components/AppLayout'
import { Toaster } from '@/components/ui/sonner'
import { Accounts } from '@/pages/Accounts'
import { Categories } from '@/pages/Categories'
import { Home } from '@/pages/Home'
import { Settings } from '@/pages/Settings'
import { TransactionForm } from '@/pages/TransactionForm'
import { startAutoSync } from '@/sync/syncManager'
import './index.css'

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
          // Charts are a big chunk: load them only when Statistics opens.
          { path: 'stats', lazy: async () => ({ Component: (await import('@/pages/Stats')).Stats }) },
          { path: 'accounts', element: <Accounts /> },
          { path: 'settings', element: <Settings /> },
        ],
      },
      { path: 'tx/new', element: <TransactionForm /> },
      { path: 'tx/:id', element: <TransactionForm /> },
      { path: 'categories', element: <Categories /> },
    ],
  },
])

startAutoSync()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
    {/* Above the bottom nav and the form's Save bar, so it never covers header actions. */}
    <Toaster position="bottom-center" offset={{ bottom: 88 }} mobileOffset={{ bottom: 88 }} />
  </StrictMode>,
)
