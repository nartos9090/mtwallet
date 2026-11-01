import { ChevronLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'

export function PageHeader({ title, back, actions }: { title: ReactNode; back?: boolean; actions?: ReactNode }) {
  const navigate = useNavigate()
  const location = useLocation()
  // Opened directly (a shared link, a shortcut): there's no in-app page to go back to.
  const goBack = () => (location.key === 'default' ? navigate('/', { replace: true }) : navigate(-1))
  return (
    <header className="sticky top-0 z-10 flex h-14 items-center gap-2 bg-background/90 px-2 backdrop-blur">
      {back ? (
        <Button variant="ghost" size="icon" aria-label="Back" onClick={goBack}>
          <ChevronLeft />
        </Button>
      ) : (
        <span className="w-2" />
      )}
      <h1 className="flex-1 truncate text-lg font-semibold">{title}</h1>
      {actions}
    </header>
  )
}
