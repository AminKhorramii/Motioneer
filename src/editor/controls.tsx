import type { ReactNode } from 'react'
import { Icon, type IconName } from './icons'
/** A control wears a glyph badge on its left; a select also wears the chevron on its right, since the native arrow is the one part of it that cannot be styled. */
export function Control({ icon, select = false, children }: { icon: IconName; select?: boolean; children: ReactNode }) {
  return <div className={'control' + (select ? ' select' : '')}><span className="badge"><Icon name={icon}/></span>{children}{select && <span className="badge right"><Icon name="chevron-down"/></span>}</div>
}
