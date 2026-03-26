// FixturesCard.jsx
// Spartans Hub — Player Fixtures View
// Patch v2026.03.1
//
// Usage:
//   <FixturesCard booking={booking} />
//
// booking shape:
// {
//   id, game_date, slot_time, format, status,
//   opponent_name, cricheroes_url,
//   tournament: { name, ball_type },        // ball_type: 'red' | 'white' | 'pink'
//   ground: { name, maps_url, hospital_url } // nullable
// }

import { useState } from "react";

// ── Cricket Ball SVG Components ──────────────────────────────────

function RedBall({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 60 60" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="rb" cx="38%" cy="30%" r="62%">
          <stop offset="0%" stopColor="#E8553A"/>
          <stop offset="35%" stopColor="#C0392B"/>
          <stop offset="75%" stopColor="#8B1A0F"/>
          <stop offset="100%" stopColor="#5C0E08"/>
        </radialGradient>
        <clipPath id="rc"><circle cx="30" cy="30" r="28"/></clipPath>
      </defs>
      <circle cx="30" cy="30" r="28" fill="url(#rb)"/>
      <g transform="rotate(-30 30 30)" clipPath="url(#rc)">
        <line x1="2" y1="30" x2="58" y2="30" stroke="#5C0E08" strokeWidth="3"/>
        <line x1="2" y1="24" x2="58" y2="24" stroke="#E8C49A" strokeWidth="1" strokeDasharray="3 2.5"/>
        <line x1="2" y1="36" x2="58" y2="36" stroke="#E8C49A" strokeWidth="1" strokeDasharray="3 2.5"/>
      </g>
      <ellipse cx="21" cy="17" rx="9" ry="5" fill="white" opacity="0.13" transform="rotate(-30 21 17)"/>
    </svg>
  );
}

function WhiteBall({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 60 60" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="wb" cx="38%" cy="30%" r="62%">
          <stop offset="0%" stopColor="#FFFFFF"/>
          <stop offset="45%" stopColor="#EDE9DF"/>
          <stop offset="80%" stopColor="#C8C2B0"/>
          <stop offset="100%" stopColor="#A09880"/>
        </radialGradient>
        <clipPath id="wc"><circle cx="30" cy="30" r="28"/></clipPath>
      </defs>
      <circle cx="30" cy="30" r="28" fill="url(#wb)" stroke="#C0BAA8" strokeWidth="0.5"/>
      <g transform="rotate(-30 30 30)" clipPath="url(#wc)">
        <line x1="2" y1="30" x2="58" y2="30" stroke="#9A9080" strokeWidth="3"/>
        <line x1="2" y1="24" x2="58" y2="24" stroke="#707060" strokeWidth="1" strokeDasharray="3 2.5"/>
        <line x1="2" y1="36" x2="58" y2="36" stroke="#707060" strokeWidth="1" strokeDasharray="3 2.5"/>
      </g>
      <ellipse cx="21" cy="17" rx="9" ry="5" fill="white" opacity="0.45" transform="rotate(-30 21 17)"/>
    </svg>
  );
}

function PinkBall({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 60 60" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="pb" cx="38%" cy="30%" r="62%">
          <stop offset="0%" stopColor="#F780B8"/>
          <stop offset="35%" stopColor="#EC4899"/>
          <stop offset="75%" stopColor="#9D1A5C"/>
          <stop offset="100%" stopColor="#6B0D3A"/>
        </radialGradient>
        <clipPath id="pc"><circle cx="30" cy="30" r="28"/></clipPath>
      </defs>
      <circle cx="30" cy="30" r="28" fill="url(#pb)"/>
      <g transform="rotate(-30 30 30)" clipPath="url(#pc)">
        <line x1="2" y1="30" x2="58" y2="30" stroke="#7A0A3C" strokeWidth="3"/>
        <line x1="2" y1="24" x2="58" y2="24" stroke="#C9956B" strokeWidth="1" strokeDasharray="3 2.5"/>
        <line x1="2" y1="36" x2="58" y2="36" stroke="#C9956B" strokeWidth="1" strokeDasharray="3 2.5"/>
      </g>
      <ellipse cx="21" cy="17" rx="9" ry="5" fill="white" opacity="0.16" transform="rotate(-30 21 17)"/>
    </svg>
  );
}

// ── Jersey Icon ───────────────────────────────────────────────────
function JerseyIcon({ colour = "gold", size = 20 }: { colour?: 'gold' | 'white'; size?: number }) {
  const fill   = colour === "gold" ? "#C9A84C" : "#F8FAFC";
  const stroke = colour === "gold" ? "#9A7A2E" : "#CBD5E1";
  const shadow = colour === "gold" ? "#7A5E1A" : "#94A3B8";
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* collar */}
      <path d="M 14 6 Q 20 11 26 6" stroke={stroke} strokeWidth="1.5" fill="none" strokeLinecap="round"/>
      {/* body */}
      <path d="M 8 10 L 14 6 Q 20 11 26 6 L 32 10 L 29 16 L 26 14 L 26 34 L 14 34 L 14 14 L 11 16 Z"
        fill={fill} stroke={stroke} strokeWidth="1" strokeLinejoin="round"/>
      {/* sleeve shadow */}
      <path d="M 8 10 L 11 16 L 14 14 L 14 10 Z" fill={shadow} opacity="0.3"/>
      <path d="M 32 10 L 29 16 L 26 14 L 26 10 Z" fill={shadow} opacity="0.3"/>
    </svg>
  );
}

// Replace the stageIcon function with:
function stageIcon(stage: string): string {
  const s = stage.toLowerCase()
  if (s.includes('final') || s.includes('quarter')) return '🏆'
  return '🎖️'
}

// ── CricHeroes Icon ───────────────────────────────────────────────
function CricHeroesIcon({ size = 20 }: { size?: number }) {
  return (
    <img
      src="/cricheroes-logo.jpg"
      alt="CricHeroes"
      width={size}
      height={size}
      style={{ borderRadius: "50%", objectFit: "cover" }}
    />
  );
}

// ── Map Pin Icon ──────────────────────────────────────────────────
function MapPinIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"
        fill="#34A853" stroke="#1E7A3A" strokeWidth="0.5"/>
      <circle cx="12" cy="9" r="2.5" fill="white" opacity="0.9"/>
    </svg>
  );
}

// ── Hospital Icon ─────────────────────────────────────────────────
function HospitalIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="3" width="18" height="18" rx="3" fill="#EF4444" stroke="#B91C1C" strokeWidth="0.5"/>
      <rect x="10.5" y="6" width="3" height="12" rx="1" fill="white"/>
      <rect x="6" y="10.5" width="12" height="3" rx="1" fill="white"/>
    </svg>
  );
}

// ── Ball Component Selector ───────────────────────────────────────
function BallIcon({ type, size = 20 }: { type: 'red' | 'white' | 'pink'; size?: number }) {
  if (type === "white") return <WhiteBall size={size} />;
  if (type === "pink")  return <PinkBall  size={size} />;
  return                        <RedBall   size={size} />;
}

// ── Jersey logic ──────────────────────────────────────────────────
function jerseyColour(ballType: 'red' | 'white' | 'pink'): 'gold' | 'white' {
  return ballType === "white" ? "gold" : "white";
}

function jerseyLabel(ballType: 'red' | 'white' | 'pink'): string {
  return ballType === "white" ? "Colour jersey" : "White jersey";
}

// ── Slot label ────────────────────────────────────────────────────
function slotLabel(slot: string): string {
  const map: Record<string, string> = { "07:30": "7:15 AM", "10:30": "10:15 AM", "12:30": "12:15 PM", "14:30": "2:15 PM" };
  return map[slot] || slot;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}

function ShareIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
      xmlns="http://www.w3.org/2000/svg" style={{ display: 'block' }}>
      <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8" stroke="currentColor" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round"/>
      <polyline points="16 6 12 2 8 6" stroke="currentColor" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round"/>
      <line x1="12" y1="2" x2="12" y2="15" stroke="currentColor" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}
// ── Main Card Component ───────────────────────────────────────────
type SquadPlayer = {
  id:               string
  name:             string
  jersey_name:      string | null
  jersey_number:    number | null
  primary_skill:    string | null
  is_match_captain: boolean
  is_vc:            boolean
  is_wk:            boolean
}

type BookingProp = {
  id: string
  game_date: string
  slot_time: string
  format: string
  // after: format: string
  match_time?: string | null
  // In the BookingProp type, add after match_time:
  match_stage?: string | null
  opponent_name?: string | null
  cricheroes_url?: string | null
  matchStatus?: 'upcoming' | 'in_progress'
  tournament?: {
    name: string
    ball_type: 'red' | 'white' | 'pink'
    ground?: { name: string; maps_url: string; hospital_url: string } | null
  } | null
  squad?: SquadPlayer[]
}

export function FixturesCard({ booking }: { booking: BookingProp }) {
  const [squadOpen, setSquadOpen] = useState(false)
  const squad = booking.squad ?? []
  const squadAnnounced = squad.length > 0
  const { game_date, slot_time, format, opponent_name, cricheroes_url, tournament, matchStatus, match_stage } = booking;
  const ground = tournament?.ground;
  const ballType  = tournament?.ball_type || "red";
  const jColour   = jerseyColour(ballType);
  const jLabel    = jerseyLabel(ballType);
  const hasGround = ground?.maps_url;
  const hasHosp   = ground?.hospital_url;

  return (
    <div style={{
      background: "linear-gradient(135deg, #1C2333 0%, #111827 100%)",
      border: "1px solid #2D3748",
      borderRadius: "12px",
      padding: "14px 16px",
      display: "flex",
      flexDirection: "column",
      gap: "10px",
      fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
      boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
      width: "100%",
      position: "relative",
      overflow: "hidden",
    }}>
      {/* Gold top accent bar */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "3px", background: "linear-gradient(90deg, #C9A84C, #F5D78E, #C9A84C)" }} />

      {/* Date + Slot + Format row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: "12px", fontWeight: 600, color: "#C9A84C", letterSpacing: "0.05em" }}>
          {formatDate(game_date)} · {booking.match_time
            ? booking.match_time.slice(0, 5).replace(/^0/, '') + ' ' + (parseInt(booking.match_time) < 12 ? 'AM' : 'PM')
            : slotLabel(slot_time)}
        </span>
        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
          <span style={{
            background: "#1E3A5F", color: "#93C5FD",
            fontSize: "10px", fontWeight: 700,
            padding: "2px 8px", borderRadius: "999px",
            letterSpacing: "0.08em"
          }}>{format}</span>
          {match_stage && (
            <span style={{
              background: '#2d1f00', color: '#f59e0b',
              fontSize: '10px', fontWeight: 700,
              padding: '2px 8px', borderRadius: '999px',
              letterSpacing: '0.06em', border: '1px solid #d97706',
            }}>
              {stageIcon(match_stage)} {match_stage}
            </span>
          )}
          {matchStatus === 'in_progress' && (
            <span style={{
              background: '#0d2b18', color: '#4ade80',
              fontSize: '10px', fontWeight: 700,
              padding: '2px 8px', borderRadius: '999px',
              letterSpacing: '0.06em', border: '1px solid #166534',
            }}>● IN PROGRESS</span>
          )}
        </div>
      </div>

      {/* Tournament + Opponent + Ground */}
      <div>
        <div style={{ fontSize: "15px", fontWeight: 700, color: "#F9FAFB", lineHeight: 1.3, marginBottom: "3px", display: "flex", alignItems: "center", gap: "6px" }}>
          <span>{tournament?.name || "—"}</span>
          {booking.id && (
            <a
              href={`/fixtures/${booking.id}`}
              title="Share this match"
              onClick={e => {
                if (typeof navigator !== 'undefined' && navigator.share) {
                  e.preventDefault()
                  navigator.share({
                    title: 'Spartans Match',
                    url: `${window.location.origin}/fixtures/${booking.id}`,
                  }).catch(() => {})
                }
              }}
              style={{
                display: 'inline-flex', alignItems: 'center', flexShrink: 0,
                color: '#4B5563', textDecoration: 'none',
              }}
              onMouseEnter={e => (e.currentTarget.style.color = '#9CA3AF')}
              onMouseLeave={e => (e.currentTarget.style.color = '#4B5563')}
            >
              <ShareIcon />
            </a>
          )}
        </div>
        <div style={{ fontSize: "12px", color: "#9CA3AF" }}>
          vs <span style={{ color: "#D1D5DB", fontWeight: 500 }}>{opponent_name || "TBD"}</span>
        </div>
        {ground?.name && (
          <div style={{ fontSize: "11px", color: "#6B7280", marginTop: "4px" }}>
            {'@ '}
            {ground.maps_url ? (
              <a href={ground.maps_url} target="_blank" rel="noopener noreferrer"
                style={{ color: "#34A853", textDecoration: "none" }}>
                {ground.name}
              </a>
            ) : (
              <span>{ground.name}</span>
            )}
          </div>
        )}
      </div>

      {/* Divider */}
      <div style={{ height: "1px", background: "#2D3748" }} />

      {/* Icons row */}
      <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>

        {/* Ball */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "3px" }}>
          <BallIcon type={ballType} size={22} />
          <span style={{ fontSize: "9px", color: "#6B7280", textTransform: "capitalize" }}>{ballType} ball</span>
        </div>

        {/* Jersey */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "3px" }}>
          <JerseyIcon colour={jColour} size={22} />
          <span style={{ fontSize: "9px", color: "#6B7280" }}>{jLabel}</span>
        </div>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* CricHeroes */}
        {cricheroes_url && (
          <a href={cricheroes_url} target="_blank" rel="noopener noreferrer"
            title="Open in CricHeroes"
            style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "3px", textDecoration: "none" }}>
            <CricHeroesIcon size={22} />
            <span style={{ fontSize: "9px", color: "#6B7280" }}>CricHeroes</span>
          </a>
        )}

        {/* Ground / Map */}
        {hasGround && (
          <a href={ground.maps_url} target="_blank" rel="noopener noreferrer"
            title="Open ground in Google Maps"
            style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "3px", textDecoration: "none" }}>
            <MapPinIcon size={22} />
            <span style={{ fontSize: "9px", color: "#6B7280" }}>Ground</span>
          </a>
        )}

        {/* Hospital */}
        {hasHosp && (
          <a href={ground.hospital_url} target="_blank" rel="noopener noreferrer"
            title="Nearest hospital"
            style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "3px", textDecoration: "none" }}>
            <HospitalIcon size={22} />
            <span style={{ fontSize: "9px", color: "#6B7280" }}>Hospital</span>
          </a>
        )}
      </div>

      {/* Announced Squad */}
      {squadAnnounced && (
        <div>
          <div style={{ height: "1px", background: "#2D3748" }} />
          <button
            onClick={() => setSquadOpen(v => !v)}
            style={{
              width: '100%', display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', background: 'none', border: 'none',
              cursor: 'pointer', padding: '6px 0',
            }}>
            <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', color: '#4ade80' }}>
              ✅ SQUAD ANNOUNCED · {squad.length} players
            </span>
            <span style={{ fontSize: '14px', color: '#6B7280' }}>{squadOpen ? '▲' : '▼'}</span>
          </button>

          {squadOpen && (
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr',
              gap: '4px 12px', paddingBottom: '6px',
            }}>
              {squad
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((p) => (
                  <div key={p.id} style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    fontSize: '11px', color: '#D1D5DB', padding: '3px 0',
                  }}>
                    <span style={{ flex: 1 }}>
                      {p.name}
                      {p.is_match_captain && (
                        <span style={{
                          marginLeft: '4px', fontSize: '9px', fontWeight: 700,
                          color: '#C9A84C', background: '#2d2400',
                          border: '1px solid #C9A84C', borderRadius: '3px',
                          padding: '0 3px',
                        }}>C</span>
                      )}
                      {p.is_vc && (
                        <span style={{
                          marginLeft: '3px', fontSize: '9px', fontWeight: 700,
                          color: '#C9A84C', background: '#2d2400',
                          border: '1px solid #C9A84C40', borderRadius: '3px',
                          padding: '0 3px', opacity: 0.8,
                        }}>VC</span>
                      )}
                      {p.is_wk && (
                        <span style={{
                          marginLeft: '3px', fontSize: '9px', fontWeight: 700,
                          color: '#93C5FD', background: '#0c1a2e',
                          border: '1px solid #1d4ed8', borderRadius: '3px',
                          padding: '0 3px',
                        }}>WK</span>
                      )}
                    </span>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}  
    </div>
  );
}

// ── Demo preview ──────────────────────────────────────────────────
const DEMO_BOOKINGS: BookingProp[] = [
  {
    id: "1", game_date: "2026-04-05", slot_time: "07:30", format: "T30",
    opponent_name: "Royal Challengers XI",
    cricheroes_url: "https://cricheroes.in/match/123456",
    tournament: { name: "Bengaluru Premier League", ball_type: "red", ground: {
      name: "Chinnaswamy Ground 2",
      maps_url: "https://maps.google.com/?q=M.Chinnaswamy+Stadium,Bengaluru",
      hospital_url: "https://maps.google.com/?q=Bowring+Hospital+Bengaluru",
    }},
  },
  {
    id: "2", game_date: "2026-04-12", slot_time: "10:30", format: "T20",
    opponent_name: "Thunder Strikers",
    cricheroes_url: "https://cricheroes.in/match/789012",
    tournament: { name: "Sunday Super League", ball_type: "white", ground: {
      name: "KSCA Ground B",
      maps_url: "https://maps.google.com/?q=KSCA+Cricket+Ground+Bengaluru",
      hospital_url: "https://maps.google.com/?q=Victoria+Hospital+Bengaluru",
    }},
  },
  {
    id: "3", game_date: "2026-04-19", slot_time: "14:30", format: "T20",
    opponent_name: "Night Owls CC",
    cricheroes_url: null,
    tournament: { name: "Pink Ball Invitational", ball_type: "pink", ground: {
      name: "Kanteerava Stadium",
      maps_url: "https://maps.google.com/?q=Kanteerava+Stadium+Bengaluru",
      hospital_url: "https://maps.google.com/?q=St+Johns+Hospital+Bengaluru",
    }},
  },
];

export default function App() {
  return (
    <div style={{
      minHeight: "100vh",
      background: "#0D1117",
      padding: "32px 20px",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: "8px",
    }}>
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: "24px" }}>
        <div style={{ fontSize: "11px", letterSpacing: "0.2em", color: "#C9A84C", fontWeight: 700, marginBottom: "6px" }}>
          SPARTANS CRICKET CLUB · BENGALURU
        </div>
        <div style={{ fontSize: "22px", fontWeight: 800, color: "#F9FAFB", fontFamily: "'DM Sans', sans-serif" }}>
          My Fixtures
        </div>
        <div style={{ fontSize: "12px", color: "#6B7280", marginTop: "4px" }}>Upcoming confirmed matches</div>
      </div>

      {/* Cards */}
      {DEMO_BOOKINGS.map(b => (
        <FixturesCard key={b.id} booking={b} />
      ))}

      {/* Legend */}
      <div style={{
        marginTop: "24px", padding: "14px 20px",
        background: "#1C2333", borderRadius: "10px", border: "1px solid #2D3748",
        display: "flex", gap: "20px", flexWrap: "wrap", justifyContent: "center",
        maxWidth: "380px"
      }}>
        {[
          { icon: <RedBall size={16}/>,   label: "Red ball → White jersey" },
          { icon: <WhiteBall size={16}/>, label: "White ball → Colour jersey" },
          { icon: <PinkBall size={16}/>,  label: "Pink ball → White jersey" },
        ].map(({ icon, label }) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            {icon}
            <span style={{ fontSize: "10px", color: "#9CA3AF" }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
