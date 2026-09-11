import { NavLink, Outlet } from 'react-router-dom'

const navClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
    isActive ? 'bg-primary-50 text-primary-700' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
  }`

export function AppShell() {
  return (
    <div className="min-h-screen bg-surface-variant">
      <header className="sticky top-0 z-20 bg-surface shadow-elevation-1">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <h1 className="text-xl font-medium text-gray-900">Financial Control</h1>
          <nav className="flex items-center gap-1">
            <NavLink to="/" end className={navClass}>
              Dashboard
            </NavLink>
            <NavLink to="/expenses" className={navClass}>
              Expenses
            </NavLink>
            <NavLink to="/assets" className={navClass}>
              Assets
            </NavLink>
          </nav>
        </div>
      </header>
      <Outlet />
    </div>
  )
}