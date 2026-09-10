import { Link } from 'react-router-dom'
import { Icon } from './Icon'

interface FabProps {
  to: string
  label: string
  icon?: string
}

export function Fab({ to, label, icon = 'add-icon' }: FabProps) {
  return (
    <Link
      to={to}
      aria-label={label}
      className="fixed bottom-6 right-6 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-primary-600 text-white shadow-elevation-2 transition-colors hover:bg-primary-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-300"
    >
      <Icon name={icon} className="h-6 w-6" />
    </Link>
  )
}