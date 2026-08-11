import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import OnboardingFlow from "./OnboardingFlow";

function getSafeNext(value?: string) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/";
}

export default async function WelcomePage({ searchParams }: { searchParams: { next?: string } }) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(getSafeNext(searchParams.next))}`);

  const { data: profile } = await supabase
    .from("profiles")
    .select("onboarding_completed_at")
    .eq("id", user.id)
    .maybeSingle();

  const nextPath = getSafeNext(searchParams.next);
  if (profile?.onboarding_completed_at) redirect(nextPath);

  return <OnboardingFlow email={user.email ?? ""} nextPath={nextPath} userId={user.id} />;
}
