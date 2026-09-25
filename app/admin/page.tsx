import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Activity, Database, Plus, ShieldAlert, Trophy, UserCheck, UserX } from "lucide-react";
import Link from "next/link";
import DeletePlayerButton from "./DeletePlayerButton";
import EditPlayerButton from "./EditPlayerButton";
import { ACTIVE_SEASON, ACTIVE_SPORT } from "@/lib/season";

const RANKING_PAGE_SIZE = 25

function pageNumber(value: string | undefined) {
  const number = Number(value)
  return Number.isInteger(number) && number > 0 ? number : 1
}

export default async function AdminPage({ searchParams }: { searchParams?: { page?: string; q?: string } }) {
  const page = pageNumber(searchParams?.page)
  const query = searchParams?.q?.trim().slice(0, 80) ?? ''
  const offset = (page - 1) * RANKING_PAGE_SIZE
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") redirect("/");

  let rankingQuery = supabase
      .from("player_ranks")
      .select("*", { count: 'exact' })
      .eq("sport", ACTIVE_SPORT)
      .eq("season", ACTIVE_SEASON)
  if (query) rankingQuery = rankingQuery.ilike('player_name', `%${query.replace(/[,%_]/g, '')}%`)

  const { data: players, count: playerCount } = await rankingQuery
    .order("pts", { ascending: false })
    .range(offset, offset + RANKING_PAGE_SIZE - 1)
  const totalPlayers = playerCount ?? 0
  const totalPages = Math.max(1, Math.ceil(totalPlayers / RANKING_PAGE_SIZE))
  const pageHref = (target: number) => {
    const params = new URLSearchParams({ page: String(target) })
    if (query) params.set('q', query)
    return `/admin?${params.toString()}`
  }

  return (
    <main
      className="bds-page"
      style={{
        background: "#f8f8f8",
        minHeight: "100vh",
        paddingBottom: 80,
        overflowX: "hidden",
      }}
    >
      {/* TOPBAR */}
      <header className="bds-header"
        style={{
          position: "sticky",
          top: 0,
          zIndex: 100,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "0 16px",
          height: 54,
          background: "#CC0001",
          boxShadow: "0 2px 12px rgba(204,0,1,0.3)",
        }}
      >
        <Link
          href="/"
          style={{
            fontFamily: "var(--font-oswald)",
            fontSize: 24,
            fontWeight: 800,
            letterSpacing: 2,
            color: "white",
            display: "flex",
            alignItems: "center",
            gap: 8,
            textDecoration: "none",
          }}
        >
          <Trophy size={22} strokeWidth={2.5} /> BallDoenSai.com
        </Link>
        <div
          style={{
            fontFamily: "var(--font-oswald)",
            fontSize: 13,
            fontWeight: 700,
            color: "rgba(255,255,255,0.8)",
            letterSpacing: 1,
          }}
        >
          ADMIN
        </div>
      </header>

      {/* HERO */}
      <div className="bds-hero"
        style={{
          background: "#CC0001",
          padding: "20px 16px 36px",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "repeating-linear-gradient(-45deg,transparent,transparent 20px,rgba(255,255,255,0.03) 20px,rgba(255,255,255,0.03) 21px)",
          }}
        />
        <div style={{ position: "relative" }}>
          <h1
            style={{
              fontFamily: "var(--font-oswald)",
              fontSize: "clamp(28px,8vw,48px)",
              fontWeight: 700,
              color: "white",
              lineHeight: 0.9,
              textTransform: "uppercase",
            }}
          >
            ADMIN
            <br />
            <span
              style={{
                WebkitTextStroke: "2px rgba(255,255,255,0.4)",
                color: "transparent",
              }}
            >
              PANEL
            </span>
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, marginTop: 10 }}>จัดการ Power Rating Season 2026</p>
        </div>
      </div>

      {/* Wave */}
      <svg
        viewBox="0 0 375 28"
        preserveAspectRatio="none"
        style={{ display: "block", width: "100%", height: 28, marginTop: -1 }}
      >
        <path d="M0,0 C100,28 275,0 375,20 L375,0 Z" fill="#CC0001" />
      </svg>

      <div style={{ padding: "16px" }}>
        {/* HEADER */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 16,
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-oswald)",
              fontSize: 17,
              fontWeight: 700,
              textTransform: "uppercase",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <div
              style={{
                width: 4,
                height: 20,
                background: "#CC0001",
                borderRadius: 2,
              }}
            />
            {query ? `ผลค้นหา “${query}”` : 'นักกีฬาที่มี Ranking'} ({totalPlayers.toLocaleString()})
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Link
              href="/admin/hall"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                background: "#f5c518",
                color: "#17120a",
                borderRadius: 20,
                padding: "6px 14px",
                fontSize: 12,
                fontWeight: 800,
                textDecoration: "none",
                fontFamily: "var(--font-oswald)",
                letterSpacing: 0.5,
              }}
            >
              <Trophy size={14} /> Hall of Fame
            </Link>
            <Link
              href="/admin/moderation"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                background: "#fff8e6",
                color: "#854d0e",
                borderRadius: 20,
                padding: "6px 14px",
                fontSize: 12,
                fontWeight: 800,
                textDecoration: "none",
                fontFamily: "var(--font-oswald)",
                letterSpacing: 0.5,
              }}
            >
              <ShieldAlert size={14} /> Moderation
            </Link>
            <Link
              href="/admin/operations"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                background: "#111827",
                color: "white",
                borderRadius: 20,
                padding: "6px 14px",
                fontSize: 12,
                fontWeight: 800,
                textDecoration: "none",
                fontFamily: "var(--font-oswald)",
                letterSpacing: 0.5,
              }}
            >
              <Activity size={14} /> Operations
            </Link>
            <Link
              href="/admin/trust"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                background: "#fff8e6",
                color: "#854d0e",
                borderRadius: 20,
                padding: "6px 14px",
                fontSize: 12,
                fontWeight: 800,
                textDecoration: "none",
                fontFamily: "var(--font-oswald)",
                letterSpacing: 0.5,
              }}
            >
              <ShieldAlert size={14} /> Trust Desk
            </Link>
            <Link
              href="/admin/infrastructure"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                background: "white",
                color: "#CC0001",
                border: "2px solid #CC0001",
                borderRadius: 20,
                padding: "6px 14px",
                fontSize: 12,
                fontWeight: 800,
                textDecoration: "none",
                fontFamily: "var(--font-oswald)",
                letterSpacing: 0.5,
              }}
            >
              <Database size={14} /> Infrastructure
            </Link>
            <Link
              href="/admin/create"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                background: "#CC0001",
                color: "white",
                borderRadius: 20,
                padding: "6px 14px",
                fontSize: 12,
                fontWeight: 800,
                textDecoration: "none",
                fontFamily: "var(--font-oswald)",
                letterSpacing: 0.5,
              }}
            >
              <Plus size={14} /> เพิ่มนักกีฬา
            </Link>
          </div>
        </div>

        <form action="/admin" method="GET" style={{ alignItems: 'center', background: 'white', border: '1px solid #e2e7ed', borderRadius: 12, display: 'flex', gap: 8, marginBottom: 14, padding: 9 }}>
          <input name="q" defaultValue={query} placeholder="ค้นหาชื่อนักกีฬาใน Ranking" aria-label="ค้นหาชื่อนักกีฬาใน Ranking" style={{ border: 0, color: '#172033', flex: 1, fontFamily: 'var(--font-sarabun)', fontSize: 13, minWidth: 0, outline: 'none', padding: '6px 8px' }} />
          <button type="submit" style={{ background: '#172033', border: 0, borderRadius: 8, color: 'white', cursor: 'pointer', fontFamily: 'var(--font-oswald)', fontSize: 12, fontWeight: 800, padding: '8px 11px' }}>ค้นหา</button>
          {query && <Link href="/admin" style={{ color: '#cc0001', fontSize: 11, fontWeight: 800, padding: '6px', textDecoration: 'none' }}>ล้าง</Link>}
        </form>

        {/* PLAYER LIST */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {players?.map((p, i) => (
            <div
              key={p.id}
              style={{
                background: "white",
                borderRadius: 12,
                border: "1.5px solid #e5e5e5",
                padding: "14px",
                boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  marginBottom: 10,
                }}
              >
                <div
                  style={{
                    fontFamily: "var(--font-oswald)",
                    fontSize: 20,
                    fontWeight: 700,
                    color: "#ccc",
                    width: 28,
                    textAlign: "center",
                    flexShrink: 0,
                  }}
                >
                  {offset + i + 1}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 15,
                      fontWeight: 800,
                      color: "#111",
                      marginBottom: 3,
                    }}
                  >
                    {p.player_name}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 5, color: p.player_id ? "#15803d" : "#a16207", fontSize: 10, fontWeight: 800 }}>
                    {p.player_id ? <UserCheck size={13} /> : <UserX size={13} />}
                    {p.player_id ? "เชื่อม Athlete Account แล้ว" : "ยังไม่เชื่อมบัญชี"}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      gap: 6,
                      flexWrap: "wrap",
                      alignItems: "center",
                    }}
                  >
                    <span
                      style={{
                        fontSize: 9,
                        fontWeight: 800,
                        background: "#CC0001",
                        color: "white",
                        borderRadius: 4,
                        padding: "1px 6px",
                        fontFamily: "var(--font-barlow)",
                      }}
                    >
                      {p.position}
                    </span>
                    <span style={{ fontSize: 11, color: "#888" }}>
                      {p.team}
                    </span>
                    <span style={{ fontSize: 11, color: "#aaa" }}>
                      {p.province}
                    </span>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flexShrink: 0 }}>
                  <div style={{ fontFamily: 'var(--font-oswald)', fontSize: 20, fontWeight: 700, color: '#CC0001' }}>{p.ovr}</div>
                  <div style={{ fontSize: 10, color: '#aaa', fontWeight: 700 }}>{p.pts.toLocaleString()} Power</div>
                </div>
              </div>

              {/* STATS */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-around",
                  background: "#f8f8f8",
                  borderRadius: 8,
                  padding: "8px",
                  marginBottom: 10,
                }}
              >
                {[
                  ["PAC", p.pac],
                  ["SHO", p.sho],
                  ["PAS", p.pas],
                  ["DRI", p.dri],
                  ["DEF", p.def],
                ].map(([key, val]) => (
                  <div
                    key={key}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 2,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "var(--font-oswald)",
                        fontSize: 14,
                        fontWeight: 700,
                        color: "#111",
                      }}
                    >
                      {val}
                    </span>
                    <span
                      style={{
                        fontSize: 9,
                        fontWeight: 700,
                        color: "#aaa",
                        fontFamily: "var(--font-barlow)",
                      }}
                    >
                      {key}
                    </span>
                  </div>
                ))}
              </div>

              {/* ACTIONS */}
              <div style={{ display: "flex", gap: 8 }}>
                <EditPlayerButton
                  player={p}
                />
                <DeletePlayerButton playerId={p.id} />
              </div>
            </div>
          ))}
          {!players?.length && <div style={{ background: 'white', border: '1.5px dashed #d7dde5', borderRadius: 12, color: '#68768a', fontSize: 13, padding: 32, textAlign: 'center' }}>ไม่พบนักกีฬาในเงื่อนไขนี้</div>}
        </div>
        {totalPages > 1 && <nav aria-label="หน้ารายการ Ranking" style={{ alignItems: 'center', display: 'flex', gap: 8, justifyContent: 'center', marginTop: 18 }}>
          {page > 1 ? <Link href={pageHref(page - 1)} style={{ background: 'white', border: '1px solid #dce3eb', borderRadius: 8, color: '#172033', fontSize: 12, fontWeight: 800, padding: '8px 11px', textDecoration: 'none' }}>ก่อนหน้า</Link> : <span style={{ color: '#9ca7b5', fontSize: 12, fontWeight: 800, padding: '8px 11px' }}>ก่อนหน้า</span>}
          <span style={{ color: '#5e6c7d', fontSize: 12, fontWeight: 700 }}>หน้า {page.toLocaleString()} / {totalPages.toLocaleString()}</span>
          {page < totalPages ? <Link href={pageHref(page + 1)} style={{ background: '#cc0001', border: '1px solid #cc0001', borderRadius: 8, color: 'white', fontSize: 12, fontWeight: 800, padding: '8px 11px', textDecoration: 'none' }}>ถัดไป</Link> : <span style={{ color: '#9ca7b5', fontSize: 12, fontWeight: 800, padding: '8px 11px' }}>ถัดไป</span>}
        </nav>}
      </div>

    </main>
  );
}
