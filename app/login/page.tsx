import { redirect } from "next/navigation";
import LoginPanel from "./LoginPanel";
import { safeNextPath } from "@/lib/safe-next";
import { createServerSupabaseClient } from "@/lib/supabase-server";

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
  if (!adminEntry) {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) redirect(nextPath)
  }
  return <LoginPanel adminEntry={adminEntry} nextPath={nextPath} />;
}
