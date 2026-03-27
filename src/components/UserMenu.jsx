import { useUser, useClerk } from '@clerk/clerk-react'

const C = {
  gold:     "#e8a020",
  goldDark: "#b87818",
  text:     "#e8e4dc",
  muted:    "#7a7570",
  surface:  "rgba(255,255,255,0.04)",
  border:   "rgba(255,255,255,0.08)",
}

export default function UserMenu() {
  const { user } = useUser()
  const { signOut } = useClerk()

  if (!user) return null

  const initials = [user.firstName, user.lastName]
    .filter(Boolean)
    .map(n => n[0].toUpperCase())
    .join('') || user.emailAddresses[0]?.emailAddress?.[0]?.toUpperCase() || '?'

  const displayName = user.firstName
    ? `${user.firstName}${user.lastName ? ' ' + user.lastName : ''}`
    : user.emailAddresses[0]?.emailAddress?.split('@')[0] || 'Coach'

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {/* Avatar */}
      {user.imageUrl
        ? <img src={user.imageUrl} alt="" style={{
            width: 30, height: 30, borderRadius: '50%',
            border: `1px solid ${C.gold}55`, objectFit: 'cover',
          }}/>
        : <div style={{
            width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
            background: `linear-gradient(135deg,${C.gold},${C.goldDark})`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 800, color: '#0a0d0f',
          }}>{initials}</div>
      }

      {/* Name */}
      <div style={{ fontSize: 11, color: C.muted, maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {displayName}
      </div>

      {/* Sign out */}
      <button
        onClick={() => signOut()}
        title="Sign out"
        style={{
          padding: '4px 10px', borderRadius: 5,
          border: `1px solid ${C.border}`,
          background: 'transparent', cursor: 'pointer',
          fontSize: 10, color: C.muted, fontFamily: 'inherit', fontWeight: 600,
          transition: 'color 0.15s',
        }}
        onMouseEnter={e => e.target.style.color = '#e74c3c'}
        onMouseLeave={e => e.target.style.color = C.muted}
      >
        Sign out
      </button>
    </div>
  )
}
