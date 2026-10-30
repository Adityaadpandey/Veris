// Where the landing page sends people. Internal paths use the router; external ones open in a new tab.
export const OWNER_PORTAL = '/dashboard'
export const VERIFY_PHOTO = '/search'
// TODO: replace with the real docs URL.
export const DOCS = 'https://veris.live/docs'
// Where waitlist sign-ups are POSTed as JSON ({ email, role, device, source }). Defaults to the claim server
// (public-server, POST /api/waitlist); VITE_WAITLIST_URL overrides it. With neither set, local dev simulates
// success and production shows an error.
const CLAIM_SERVER = (import.meta.env.VITE_CLAIM_SERVER_URL || '').replace(/\/$/, '')
export const WAITLIST_URL = import.meta.env.VITE_WAITLIST_URL || (CLAIM_SERVER ? `${CLAIM_SERVER}/api/waitlist` : '')
