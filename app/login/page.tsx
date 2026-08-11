import LoginPanel from "./LoginPanel";

function safeNextPath(value?: string) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/";
}

// The athlete-facing page offers Google and email OTP only. The admin password form
// stays reachable at /login?admin=1 but is never advertised on a page used by children,
// so the public entrance has one obvious path and no privileged one to poke at.
export default function LoginPage({
  searchParams,
}: {
  searchParams: { admin?: string; next?: string };
}) {
  return <LoginPanel adminEntry={searchParams.admin === "1"} nextPath={safeNextPath(searchParams.next)} />;
}
