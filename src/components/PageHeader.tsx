import { ChevronLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'

export function PageHeader({ title, back, actions }: { title: ReactNode; back?: boolean; actions?: ReactNode }) {
  const navigate = useNavigate()
  return (
    <header className="sticky top-0 z-10 flex h-14 items-center gap-2 bg-background/90 px-2 backdrop-blur">
      {back ? (
        <Button variant="ghost" size="icon" aria-label="Back" onClick={() => navigate(-1)}>
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
