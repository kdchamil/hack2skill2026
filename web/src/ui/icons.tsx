import type { ReactNode } from 'react'

const P = { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, focusable: false } as const
const mk = (d: ReactNode) => ({ size = 24 }: { size?: number }) => <svg {...P} width={size} height={size}>{d}</svg>

export const Octagon = mk(<><path d="M8 3h8l5 5v8l-5 5H8l-5-5V8z" /><path d="M9 9l6 6M15 9l-6 6" /></>)
export const Triangle = mk(<><path d="M12 3l10 18H2z" /><path d="M12 10v4M12 17.5v.5" /></>)
export const Tick = mk(<><circle cx="12" cy="12" r="9" /><path d="M8 12l3 3 5-6" /></>)
export const ShieldTick = mk(<><path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z" /><path d="M8.5 12l2.5 2.5 4.5-5" /></>)
export const Doc = mk(<><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 8h6M9 12h6M9 16h4" /></>)
export const Help = mk(<><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6M12 17h.01" /></>)
export const Dash = mk(<><circle cx="12" cy="12" r="9" /><path d="M8 12h8" /></>)
export const ListIcon = mk(<><path d="M9 6h11M9 12h11M9 18h11" /><path d="M4 6h.01M4 12h.01M4 18h.01" /></>)
export const Book = mk(<><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" /><path d="M4 21V5" /></>)
export const Camera = mk(<><path d="M4 8h3l2-3h6l2 3h3v12H4z" /><circle cx="12" cy="13.5" r="3.5" /></>)
export const Basket = mk(<><path d="M3 9h18l-2 11H5z" /><path d="M8 9l3-5M16 9l-3-5" /></>)
export const People = mk(<><circle cx="9" cy="8" r="3.2" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" /><circle cx="17.5" cy="9" r="2.5" /><path d="M17 14.2c2.4.3 4 2.2 4 4.8" /></>)
export const Play = mk(<path d="M7 4l13 8-13 8z" />)
export const Pause = mk(<path d="M7 4v16M17 4v16" />)
export const Next = mk(<path d="M5 12h14M13 6l6 6-6 6" />)
export const Body = mk(<><circle cx="12" cy="5" r="2.5" /><path d="M6 21l2-9-3-3h14l-3 3 2 9M10 21l2-5 2 5" /></>)
export const Planet = mk(<><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" /></>)
export const Truth = mk(<><circle cx="11" cy="11" r="6.5" /><path d="M16 16l5 5M8.5 11l2 2 3.5-4" /></>)
export const Choice = mk(<path d="M12 21V9M12 9c0-3 2-5 6-5 0 4-2 6-6 5zM12 13c0-2.5-1.8-4-5-4 0 3.5 1.8 5 5 4z" />)
export const AREA_ICONS = { body: Body, planet: Planet, people: People, truth: Truth, choice: Choice } as const
