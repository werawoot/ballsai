import { redirect } from "next/navigation";
import LoginPanel from "./LoginPanel";
import { safeNextPath } from "@/lib/safe-next";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getPublicPlatformCounts } from "@/lib/public-data";
import { loginStats } from "@/lib/home-stats";
import { bangkokToday } from "@/lib/public-tournaments";

// The athlete-facing page offers Google and email OTP only. The admin password form
// stays reachable at /login?admin=1 but is never advertised on a page used by children,
// so the public entrance has one obvious path and no privileged one to poke at.
export default async function LoginPage(
  props: {
    searchParams: Promise<{ admin?: string; next?: string }>;
  }
) {
  const searchParams = await props.searchParams
  const adminEntry = searchParams.admin === "1"
  const nextPath = safeNextPath(searchParams.next)
  // Someone already signed in goes on to where they were heading (Chrome test, 8 Oct 2026).
  // The admin form stays open to them, so an admin can sign in over another account.
  if (adminEntry) return <LoginPanel adminEntry nextPath={nextPath} stats={[]} />;
  // The stats bar shows real counts only (lib/home-stats loginStats), from the home page's
  // ten-minute cache, read beside the session check. A failed or slow read shows the
  // provinces alone: signing in never waits on the counts.
  const supabase = await createServerSupabaseClient()
  const [{ data: { user } }, stats] = await Promise.all([supabase.auth.getUser(), readLoginStats()])
  if (user) redirect(nextPath)
  return <LoginPanel adminEntry={adminEntry} nextPath={nextPath} stats={stats} />;
}

const STATS_WAIT_MS = 800

async function readLoginStats() {
  const late = new Promise<null>(resolve => setTimeout(() => resolve(null), STATS_WAIT_MS));
  try {
    return loginStats(await Promise.race([getPublicPlatformCounts(bangkokToday()), late]));
  } catch {
    return loginStats(null);
  }
}
