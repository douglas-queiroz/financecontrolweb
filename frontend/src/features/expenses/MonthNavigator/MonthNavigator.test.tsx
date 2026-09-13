import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MonthNavigator } from './MonthNavigator'

describe('MonthNavigator', () => {
  it('shows the formatted month and year label', () => {
    render(<MonthNavigator year={2026} month={9} onPrevious={vi.fn()} onNext={vi.fn()} />)
    expect(screen.getByTestId('month-nav-label')).toHaveTextContent('Setembro de 2026')
  })

  it('calls onPrevious when the previous button is clicked', () => {
    const onPrevious = vi.fn()
    render(<MonthNavigator year={2026} month={9} onPrevious={onPrevious} onNext={vi.fn()} />)
    screen.getByTestId('month-nav-previous').click()
    expect(onPrevious).toHaveBeenCalled()
  })

  it('calls onNext when the next button is clicked', () => {
    const onNext = vi.fn()
    render(<MonthNavigator year={2026} month={9} onPrevious={vi.fn()} onNext={onNext} />)
    screen.getByTestId('month-nav-next').click()
    expect(onNext).toHaveBeenCalled()
  })
})