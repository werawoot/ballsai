import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  Trophy,
  House,
  ClipboardList,
  User,
  Plus,
  Database,
} from "lucide-react";
import Link from "next/link";
import DeletePlayerButton from "./DeletePlayerButton";
import EditPlayerButton from "./EditPlayerButton";

export default async function AdminPage() {
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

  const { data: players } = await supabase
    .from("player_ranks")
    .select("*")
    .eq("sport", "football")
    .eq("season", "2026")
    .order("pts", { ascending: false });

  return (
    <main
      style={{
        background: "#f8f8f8",
        minHeight: "100vh",
        paddingBottom: 80,
        overflowX: "hidden",
      }}
    >
      {/* TOPBAR */}
      <header
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
          <Trophy size={22} strokeWidth={2.5} /> BALLSAI
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
      <div
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
          <p
            style={{
              color: "rgba(255,255,255,0.7)",
              fontSize: 13,
              marginTop: 10,
            }}
          >
            จัดการ Player Rankings Season 2026
          </p>
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
            นักกีฬาทั้งหมด ({players?.length ?? 0})
          </div>
          <div style={{ display: "flex", gap: 8 }}>
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
                  {i + 1}
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
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-end",
                    gap: 2,
                    flexShrink: 0,
                  }}
                >
                  <div
                    style={{
                      fontFamily: "var(--font-oswald)",
                      fontSize: 20,
                      fontWeight: 700,
                      color: "#CC0001",
                    }}
                  >
                    {p.ovr}
                  </div>
                  <div style={{ fontSize: 10, color: "#aaa", fontWeight: 700 }}>
                    {p.pts.toLocaleString()} pts
                  </div>
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
                <EditPlayerButton player={p} />
                <DeletePlayerButton playerId={p.id} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* BOTTOM NAV */}
      <nav
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          background: "white",
          borderTop: "1.5px solid #e5e5e5",
          display: "flex",
          justifyContent: "space-around",
          padding: "6px 0",
          zIndex: 100,
          boxShadow: "0 -4px 20px rgba(0,0,0,0.06)",
        }}
      >
        {[
          {
            icon: <House size={22} />,
            label: "หน้าแรก",
            href: "/",
            active: false,
          },
          {
            icon: <Trophy size={22} />,
            label: "Ranking",
            href: "/ranking",
            active: false,
          },
          {
            icon: <ClipboardList size={22} />,
            label: "รายการแข่ง",
            href: "/tournaments",
            active: false,
          },
          {
            icon: <User size={22} />,
            label: "โปรไฟล์",
            href: "/profile",
            active: false,
          },
        ].map((item) => (
          <Link
            key={item.href}
            href={item.href}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 2,
              padding: "4px 12px",
              textDecoration: "none",
              color: "#aaa",
              minWidth: 55,
            }}
          >
            {item.icon}
            <span style={{ fontSize: 10, fontWeight: 700 }}>{item.label}</span>
          </Link>
        ))}
      </nav>
    </main>
  );
}
