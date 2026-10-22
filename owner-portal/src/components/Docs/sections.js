import { GETTING_STARTED, CONCEPTS } from './sectionsA'
import { PRODUCTS } from './sectionsB'
import { OPERATIONS, REFERENCE } from './sectionsC'

const byId = (list, ids) => ids.map((id) => list.find((s) => s.id === id))

// Sidebar groups, in reading order.
export const GROUPS = [
  { title: 'Getting started', items: GETTING_STARTED },
  { title: 'Concepts', items: CONCEPTS },
  { title: 'Product', items: PRODUCTS },
  { title: 'Operations', items: byId(OPERATIONS, ['setup', 'hardware-web3-service-api', 'public-server-api', 'smart-contracts']) },
  { title: 'Reference', items: REFERENCE },
]

export const SECTIONS = GROUPS.flatMap((g) => g.items.map((s) => ({ ...s, group: g.title })))
