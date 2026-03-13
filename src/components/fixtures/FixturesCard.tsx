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
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="red-grad" cx="38%" cy="32%" r="62%">
          <stop offset="0%" stopColor="#E05A4A" />
          <stop offset="45%" stopColor="#C0392B" />
          <stop offset="100%" stopColor="#7B1A12" />
        </radialGradient>
      </defs>
      <circle cx="20" cy="20" r="19" fill="url(#red-grad)" />
      {/* seam lines */}
      <path d="M 8 14 Q 20 10 32 14" stroke="#1a0a08" strokeWidth="1.2" fill="none" strokeLinecap="round"/>
      <path d="M 8 26 Q 20 30 32 26" stroke="#1a0a08" strokeWidth="1.2" fill="none" strokeLinecap="round"/>
      {/* seam thread stitches */}
      {[10,13,16,19,22,25,28].map((x, i) => (
        <line key={i} x1={x} y1="12.5" x2={x+1} y2="11" stroke="#E8C9A0" strokeWidth="0.8" strokeLinecap="round"/>
      ))}
      {[10,13,16,19,22,25,28].map((x, i) => (
        <line key={i} x1={x} y1="27.5" x2={x+1} y2="29" stroke="#E8C9A0" strokeWidth="0.8" strokeLinecap="round"/>
      ))}
      {/* shine */}
      <ellipse cx="14" cy="13" rx="4" ry="2.5" fill="white" opacity="0.12" transform="rotate(-20 14 13)" />
    </svg>
  );
}

function WhiteBall({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="white-grad" cx="38%" cy="32%" r="62%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="50%" stopColor="#F0EDE5" />
          <stop offset="100%" stopColor="#C8C4B8" />
        </radialGradient>
      </defs>
      <circle cx="20" cy="20" r="19" fill="url(#white-grad)" stroke="#D0CCC2" strokeWidth="0.5"/>
      <path d="M 8 14 Q 20 10 32 14" stroke="#555" strokeWidth="1.2" fill="none" strokeLinecap="round"/>
      <path d="M 8 26 Q 20 30 32 26" stroke="#555" strokeWidth="1.2" fill="none" strokeLinecap="round"/>
      {[10,13,16,19,22,25,28].map((x, i) => (
        <line key={i} x1={x} y1="12.5" x2={x+1} y2="11" stroke="#888" strokeWidth="0.8" strokeLinecap="round"/>
      ))}
      {[10,13,16,19,22,25,28].map((x, i) => (
        <line key={i} x1={x} y1="27.5" x2={x+1} y2="29" stroke="#888" strokeWidth="0.8" strokeLinecap="round"/>
      ))}
      <ellipse cx="14" cy="13" rx="4" ry="2.5" fill="white" opacity="0.6" transform="rotate(-20 14 13)" />
    </svg>
  );
}

function PinkBall({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="pink-grad" cx="38%" cy="32%" r="62%">
          <stop offset="0%" stopColor="#F472B6" />
          <stop offset="45%" stopColor="#EC4899" />
          <stop offset="100%" stopColor="#9D174D" />
        </radialGradient>
      </defs>
      <circle cx="20" cy="20" r="19" fill="url(#pink-grad)" />
      <path d="M 8 14 Q 20 10 32 14" stroke="#1a0a10" strokeWidth="1.2" fill="none" strokeLinecap="round"/>
      <path d="M 8 26 Q 20 30 32 26" stroke="#1a0a10" strokeWidth="1.2" fill="none" strokeLinecap="round"/>
      {[10,13,16,19,22,25,28].map((x, i) => (
        <line key={i} x1={x} y1="12.5" x2={x+1} y2="11" stroke="#C9A06B" strokeWidth="0.8" strokeLinecap="round"/>
      ))}
      {[10,13,16,19,22,25,28].map((x, i) => (
        <line key={i} x1={x} y1="27.5" x2={x+1} y2="29" stroke="#C9A06B" strokeWidth="0.8" strokeLinecap="round"/>
      ))}
      <ellipse cx="14" cy="13" rx="4" ry="2.5" fill="white" opacity="0.15" transform="rotate(-20 14 13)" />
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

// ── CricHeroes Icon ───────────────────────────────────────────────
function CricHeroesIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="20" cy="20" r="19" fill="#1A1A2E"/>
      <circle cx="20" cy="20" r="19" fill="none" stroke="#E63946" strokeWidth="1.5"/>
      {/* stylised CH monogram */}
      <text x="20" y="26" textAnchor="middle" fontFamily="Georgia, serif" fontWeight="bold" fontSize="14" fill="#E63946">CH</text>
    </svg>
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
function jerseyColour(ballType) {
  // red or pink → white jersey; white ball → gold jersey
  return ballType === "white" ? "gold" : "white";
}

function jerseyLabel(ballType) {
  return ballType === "white" ? "Gold jersey" : "White jersey";
}

// ── Slot label ────────────────────────────────────────────────────
function slotLabel(slot) {
  const map = { "07:30": "7:30 AM", "10:30": "10:30 AM", "12:30": "12:30 PM", "14:30": "2:30 PM" };
  return map[slot] || slot;
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}

// ── Main Card Component ───────────────────────────────────────────
type BookingProp = {
  id: string
  game_date: string
  slot_time: string
  format: string
  opponent_name?: string | null
  cricheroes_url?: string | null
  tournament?: { name: string; ball_type: 'red' | 'white' | 'pink' } | null
  ground?: { name: string; maps_url: string; hospital_url: string } | null
}

export function FixturesCard({ booking }: { booking: BookingProp }) {
  const { game_date, slot_time, format, opponent_name, cricheroes_url, tournament, ground } = booking;
  const ballType  = tournament?.ball_type  || "red";
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
      maxWidth: "380px",
      position: "relative",
      overflow: "hidden",
    }}>
      {/* Gold top accent bar */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "3px", background: "linear-gradient(90deg, #C9A84C, #F5D78E, #C9A84C)" }} />

      {/* Date + Slot + Format row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: "12px", fontWeight: 600, color: "#C9A84C", letterSpacing: "0.05em" }}>
          {formatDate(game_date)}
        </span>
        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
          <span style={{
            background: "#1E3A5F", color: "#93C5FD",
            fontSize: "10px", fontWeight: 700,
            padding: "2px 8px", borderRadius: "999px",
            letterSpacing: "0.08em"
          }}>{format}</span>
          <span style={{ fontSize: "11px", color: "#6B7280" }}>{slotLabel(slot_time)}</span>
        </div>
      </div>

      {/* Tournament + Opponent */}
      <div>
        <div style={{ fontSize: "15px", fontWeight: 700, color: "#F9FAFB", lineHeight: 1.3, marginBottom: "3px" }}>
          {tournament?.name || "—"}
        </div>
        <div style={{ fontSize: "12px", color: "#9CA3AF" }}>
          vs <span style={{ color: "#D1D5DB", fontWeight: 500 }}>{opponent_name || "TBD"}</span>
        </div>
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
            <span style={{ fontSize: "9px", color: "#6B7280" }}>Venue</span>
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
    </div>
  );
}

// ── Demo preview ──────────────────────────────────────────────────
const DEMO_BOOKINGS = [
  {
    id: "1", game_date: "2026-04-05", slot_time: "07:30", format: "T30", status: "confirmed",
    opponent_name: "Royal Challengers XI",
    cricheroes_url: "https://cricheroes.in/match/123456",
    tournament: { name: "Bengaluru Premier League", ball_type: "red" },
    ground: {
      name: "Chinnaswamy Ground 2",
      maps_url: "https://maps.google.com/?q=M.Chinnaswamy+Stadium,Bengaluru",
      hospital_url: "https://maps.google.com/?q=Bowring+Hospital+Bengaluru",
    }
  },
  {
    id: "2", game_date: "2026-04-12", slot_time: "10:30", format: "T20", status: "confirmed",
    opponent_name: "Thunder Strikers",
    cricheroes_url: "https://cricheroes.in/match/789012",
    tournament: { name: "Sunday Super League", ball_type: "white" },
    ground: {
      name: "KSCA Ground B",
      maps_url: "https://maps.google.com/?q=KSCA+Cricket+Ground+Bengaluru",
      hospital_url: "https://maps.google.com/?q=Victoria+Hospital+Bengaluru",
    }
  },
  {
    id: "3", game_date: "2026-04-19", slot_time: "14:30", format: "T20", status: "confirmed",
    opponent_name: "Night Owls CC",
    cricheroes_url: null,
    tournament: { name: "Pink Ball Invitational", ball_type: "pink" },
    ground: {
      name: "Kanteerava Stadium",
      maps_url: "https://maps.google.com/?q=Kanteerava+Stadium+Bengaluru",
      hospital_url: "https://maps.google.com/?q=St+Johns+Hospital+Bengaluru",
    }
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
          { icon: <WhiteBall size={16}/>, label: "White ball → Gold jersey" },
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
