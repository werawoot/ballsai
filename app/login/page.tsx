import LoginPanel from "./LoginPanel";
import { safeNextPath } from "@/lib/safe-next";

// The athlete-facing page offers Google and email OTP only. The admin password form
// stays reachable at /login?admin=1 but is never advertised on a page used by children,
// so the public entrance has one obvious path and no privileged one to poke at.
export default async function LoginPage(
  props: {
    searchParams: Promise<{ admin?: string; next?: string }>;
  }
) {
  const searchParams = await props.searchParams
  return <LoginPanel adminEntry={searchParams.admin === "1"} nextPath={safeNextPath(searchParams.next)} />;
}
