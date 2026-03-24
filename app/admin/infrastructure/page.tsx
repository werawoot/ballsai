import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Trophy, Database, MapPin, Building2, Users } from "lucide-react";
import Link from "next/link";
import {
  getAllRegions,
  getAllProvinces,
  getProvincesWithRegion,
} from "@/lib/db/thailand-queries";

export default async function InfrastructurePage() {
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

  // Fetch all infrastructure data with direct queries
  const [
    regions,
    provinces,
    provincesWithRegion,
    sportsData,
    venuesData,
    allProfiles,
  ] = await Promise.all([
    getAllRegions(),
    getAllProvinces(),
    getProvincesWithRegion(),
    supabase.from("sports").select("*").order("id", { ascending: true }),
    supabase.from("venues").select("*").order("id", { ascending: true }),
    supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false }),
  ]);

  // Log data for debugging
  console.log("Sports count:", sportsData.data?.length || 0);
  console.log("Venues count:", venuesData.data?.length || 0);
  console.log("Sample sport:", sportsData.data?.[0]);
  console.log("Sample venue:", venuesData.data?.[0]);

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
          href="/admin"
          style={{
            fontFamily: "var(--font-oswald)",
            fontSize: 20,
            fontWeight: 800,
            letterSpacing: 2,
            color: "white",
            display: "flex",
            alignItems: "center",
            gap: 8,
            textDecoration: "none",
          }}
        >
          <Trophy size={20} strokeWidth={2.5} /> BALLSAI
        </Link>
        <div
          style={{
            fontFamily: "var(--font-oswald)",
            fontSize: 11,
            fontWeight: 700,
            color: "rgba(255,255,255,0.8)",
            letterSpacing: 1,
          }}
        >
          INFRASTRUCTURE
        </div>
      </header>

      {/* HERO */}
      <div
        style={{
          background: "#CC0001",
          padding: "20px 16px 32px",
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
              fontSize: "clamp(24px,6vw,36px)",
              fontWeight: 700,
              color: "white",
              lineHeight: 0.95,
              textTransform: "uppercase",
            }}
          >
            INFRASTRUCTURE
            <br />
            <span
              style={{
                WebkitTextStroke: "2px rgba(255,255,255,0.4)",
                color: "transparent",
              }}
            >
              MANAGEMENT
            </span>
          </h1>
          <p
            style={{
              color: "rgba(255,255,255,0.7)",
              fontSize: 12,
              marginTop: 8,
            }}
          >
            จัดการข้อมูลพื้นฐานของระบบ
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
        {/* STATS */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(5, 1fr)",
            gap: 8,
            marginBottom: 20,
          }}
        >
          {[
            {
              icon: <MapPin size={18} color="#CC0001" />,
              label: "Provinces",
              value: provinces.length,
            },
            {
              icon: <Building2 size={18} color="#3b82f6" />,
              label: "Regions",
              value: regions.length,
            },
            {
              icon: <Trophy size={18} color="#10b981" />,
              label: "Sports",
              value: sportsData?.data?.length ?? 0,
            },
            {
              icon: <Database size={18} color="#f59e0b" />,
              label: "Venues",
              value: venuesData?.data?.length ?? 0,
            },
            {
              icon: <Users size={18} color="#8b5cf6" />,
              label: "Profiles",
              value: allProfiles.data?.length ?? 0,
            },
          ].map((stat, i) => (
            <div
              key={i}
              style={{
                background: "white",
                borderRadius: 10,
                border: "1.5px solid #e5e5e5",
                padding: "12px 8px",
                textAlign: "center",
                boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  marginBottom: 6,
                }}
              >
                {stat.icon}
              </div>
              <div
                style={{
                  fontFamily: "var(--font-oswald)",
                  fontSize: 18,
                  fontWeight: 700,
                  color: "#111",
                  lineHeight: 1,
                }}
              >
                {stat.value}
              </div>
              <div
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  color: "#aaa",
                  marginTop: 2,
                }}
              >
                {stat.label}
              </div>
            </div>
          ))}
        </div>

        {/* REGIONS SECTION */}
        <div style={{ marginBottom: 20 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 12,
            }}
          >
            <div
              style={{
                fontFamily: "var(--font-oswald)",
                fontSize: 16,
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
                  height: 18,
                  background: "#3b82f6",
                  borderRadius: 2,
                }}
              />
              ภูมิภาค (Regions)
            </div>
          </div>

          <div
            style={{
              background: "white",
              borderRadius: 12,
              border: "1.5px solid #e5e5e5",
              overflow: "hidden",
              boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "40px 1fr 1fr",
                padding: "10px 12px",
                background: "#fafafa",
                borderBottom: "1px solid #e5e5e5",
                fontSize: 10,
                fontWeight: 800,
                color: "#666",
                textTransform: "uppercase",
              }}
            >
              <div>ID</div>
              <div>English</div>
              <div>ไทย</div>
            </div>
            {regions.map((region) => (
              <div
                key={region.region_id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "40px 1fr 1fr",
                  padding: "10px 12px",
                  borderBottom: "1px solid #f0f0f0",
                  fontSize: 13,
                  alignItems: "center",
                }}
              >
                <div
                  style={{
                    fontFamily: "var(--font-oswald)",
                    fontWeight: 700,
                    color: "#666",
                  }}
                >
                  {region.region_id}
                </div>
                <div style={{ color: "#111", fontWeight: 600 }}>
                  {region.region_name_en}
                </div>
                <div style={{ color: "#555" }}>{region.region_name_th}</div>
              </div>
            ))}
          </div>
        </div>

        {/* PROVINCES SECTION */}
        <div style={{ marginBottom: 20 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 12,
            }}
          >
            <div
              style={{
                fontFamily: "var(--font-oswald)",
                fontSize: 16,
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
                  height: 18,
                  background: "#CC0001",
                  borderRadius: 2,
                }}
              />
              จังหวัด (Provinces)
            </div>
          </div>

          <div
            style={{
              background: "white",
              borderRadius: 12,
              border: "1.5px solid #e5e5e5",
              overflow: "hidden",
              boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "40px 1fr 1fr 1fr",
                padding: "10px 12px",
                background: "#fafafa",
                borderBottom: "1px solid #e5e5e5",
                fontSize: 10,
                fontWeight: 800,
                color: "#666",
                textTransform: "uppercase",
              }}
            >
              <div>ID</div>
              <div>English</div>
              <div>ไทย</div>
              <div>Region</div>
            </div>
            {provincesWithRegion.map((province) => (
              <div
                key={province.province_id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "40px 1fr 1fr 1fr",
                  padding: "10px 12px",
                  borderBottom: "1px solid #f0f0f0",
                  fontSize: 13,
                  alignItems: "center",
                }}
              >
                <div
                  style={{
                    fontFamily: "var(--font-oswald)",
                    fontWeight: 700,
                    color: "#666",
                  }}
                >
                  {province.province_id}
                </div>
                <div style={{ color: "#111", fontWeight: 600 }}>
                  {province.province_name_en}
                </div>
                <div style={{ color: "#555" }}>{province.province_name_th}</div>
                <div
                  style={{ color: "#3b82f6", fontWeight: 600, fontSize: 11 }}
                >
                  {province.region_name_en}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* SPORTS SECTION */}
        <div style={{ marginBottom: 20 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 12,
            }}
          >
            <div
              style={{
                fontFamily: "var(--font-oswald)",
                fontSize: 16,
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
                  height: 18,
                  background: "#10b981",
                  borderRadius: 2,
                }}
              />
              กีฬา (Sports)
            </div>
          </div>

          <div
            style={{
              background: "white",
              borderRadius: 12,
              border: "1.5px solid #e5e5e5",
              overflow: "hidden",
              boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "40px 1fr",
                padding: "10px 12px",
                background: "#fafafa",
                borderBottom: "1px solid #e5e5e5",
                fontSize: 10,
                fontWeight: 800,
                color: "#666",
                textTransform: "uppercase",
              }}
            >
              <div>ID</div>
              <div>Sport Name</div>
            </div>
            {(sportsData?.data || []).map((sport) => (
              <div
                key={sport.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "40px 1fr",
                  padding: "10px 12px",
                  borderBottom: "1px solid #f0f0f0",
                  fontSize: 13,
                  alignItems: "center",
                }}
              >
                <div
                  style={{
                    fontFamily: "var(--font-oswald)",
                    fontWeight: 700,
                    color: "#666",
                  }}
                >
                  {sport.id}
                </div>
                <div style={{ color: "#111", fontWeight: 600 }}>
                  {sport.name}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* VENUES SECTION */}
        <div style={{ marginBottom: 20 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 12,
            }}
          >
            <div
              style={{
                fontFamily: "var(--font-oswald)",
                fontSize: 16,
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
                  height: 18,
                  background: "#f59e0b",
                  borderRadius: 2,
                }}
              />
              สนามกีฬา (Venues)
            </div>
          </div>

          <div
            style={{
              background: "white",
              borderRadius: 12,
              border: "1.5px solid #e5e5e5",
              overflow: "hidden",
              boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "40px 1fr 1fr 80px",
                padding: "10px 12px",
                background: "#fafafa",
                borderBottom: "1px solid #e5e5e5",
                fontSize: 10,
                fontWeight: 800,
                color: "#666",
                textTransform: "uppercase",
              }}
            >
              <div>ID</div>
              <div>Name</div>
              <div>Location</div>
              <div>Capacity</div>
            </div>
            {(venuesData?.data || []).slice(0, 20).map((venue) => (
              <div
                key={venue.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "40px 1fr 1fr 80px",
                  padding: "10px 12px",
                  borderBottom: "1px solid #f0f0f0",
                  fontSize: 13,
                  alignItems: "center",
                }}
              >
                <div
                  style={{
                    fontFamily: "var(--font-oswald)",
                    fontWeight: 700,
                    color: "#666",
                  }}
                >
                  {venue.id}
                </div>
                <div style={{ color: "#111", fontWeight: 600 }}>
                  {venue.name}
                </div>
                <div style={{ color: "#555", fontSize: 12 }}>
                  <div>{venue.city}</div>
                  <div style={{ fontSize: 11, color: "#888" }}>
                    {venue.province}
                  </div>
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-oswald)",
                    color: "#f59e0b",
                    fontWeight: 700,
                    fontSize: 12,
                  }}
                >
                  {venue.capacity ? venue.capacity.toLocaleString() : "-"}
                </div>
              </div>
            ))}
            {(venuesData?.data?.length ?? 0) > 20 && (
              <div
                style={{
                  padding: "12px",
                  textAlign: "center",
                  fontSize: 12,
                  color: "#888",
                  fontWeight: 600,
                }}
              >
                ...and {(venuesData?.data?.length ?? 0) - 20} more venues
              </div>
            )}
          </div>
        </div>

        {/* PROFILES SECTION */}
        <div style={{ marginBottom: 20 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 12,
            }}
          >
            <div
              style={{
                fontFamily: "var(--font-oswald)",
                fontSize: 16,
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
                  height: 18,
                  background: "#8b5cf6",
                  borderRadius: 2,
                }}
              />
              ผู้ใช้งาน (Profiles)
            </div>
          </div>

          <div
            style={{
              background: "white",
              borderRadius: 12,
              border: "1.5px solid #e5e5e5",
              overflow: "hidden",
              boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "40px 1fr 1fr 60px",
                padding: "10px 12px",
                background: "#fafafa",
                borderBottom: "1px solid #e5e5e5",
                fontSize: 10,
                fontWeight: 800,
                color: "#666",
                textTransform: "uppercase",
              }}
            >
              <div>ID</div>
              <div>Name</div>
              <div>Role</div>
              <div>Team</div>
            </div>
            {allProfiles.data?.map((profile) => (
              <div
                key={profile.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "40px 1fr 1fr 60px",
                  padding: "10px 12px",
                  borderBottom: "1px solid #f0f0f0",
                  fontSize: 13,
                  alignItems: "center",
                }}
              >
                <div
                  style={{
                    fontFamily: "var(--font-oswald)",
                    fontWeight: 700,
                    color: "#666",
                    fontSize: 11,
                  }}
                >
                  {profile.id.slice(0, 6)}...
                </div>
                <div style={{ color: "#111", fontWeight: 600 }}>
                  {profile.full_name || "-"}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 800,
                      padding: "2px 8px",
                      borderRadius: 10,
                      background:
                        profile.role === "admin"
                          ? "#CC0001"
                          : profile.role === "organizer"
                            ? "#f59e0b"
                            : "#e5e5e5",
                      color:
                        profile.role === "admin" || profile.role === "organizer"
                          ? "white"
                          : "#666",
                    }}
                  >
                    {profile.role || "user"}
                  </span>
                </div>
                <div style={{ color: "#555", fontSize: 11 }}>
                  {profile.team || "-"}
                </div>
              </div>
            ))}
          </div>
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
        <Link
          href="/admin"
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
          <Database size={22} />
          <span style={{ fontSize: 10, fontWeight: 700 }}>Players</span>
        </Link>
        <Link
          href="/admin/infrastructure"
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 2,
            padding: "4px 12px",
            textDecoration: "none",
            color: "#CC0001",
            minWidth: 55,
          }}
        >
          <Building2 size={22} />
          <span style={{ fontSize: 10, fontWeight: 700 }}>Infrastructure</span>
        </Link>
      </nav>
    </main>
  );
}
