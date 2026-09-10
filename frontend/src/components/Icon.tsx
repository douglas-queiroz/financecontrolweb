interface IconProps {
  name: string
  className?: string
}

export function Icon({ name, className = 'h-5 w-5' }: IconProps) {
  return (
    <svg className={className} aria-hidden="true">
      <use href={`/icons.svg#${name}`} />
    </svg>
  )
}