import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import OnboardingFlow from "./OnboardingFlow";
import { safeNextPath } from "@/lib/safe-next";

export default async function WelcomePage(props: { searchParams: Promise<{ next?: string }> }) {
  const searchParams = await props.searchParams;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(safeNextPath(searchParams.next))}`);

  const { data: profile } = await supabase
    .from("profiles")
    .select("onboarding_completed_at")
    .eq("id", user.id)
    .maybeSingle();

  const nextPath = safeNextPath(searchParams.next);
  if (profile?.onboarding_completed_at) redirect(nextPath);

  return <OnboardingFlow email={user.email ?? ""} nextPath={nextPath} userId={user.id} />;
}
