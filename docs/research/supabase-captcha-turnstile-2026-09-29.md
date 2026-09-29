# CAPTCHA before an email code (T19) — 29 Sep 2026

Question: T19 asks for a CAPTCHA before `/login` requests an email code, using Supabase
Auth's built-in CAPTCHA with Cloudflare Turnstile (hCaptcha as the fallback). Which Auth
endpoints check the token, how does the JS client send it, what does a refusal look
like, how does a Turnstile token behave, and what must ship before the owner turns it on?

Sources are primary and pinned (see the list at the end): the Supabase Auth server source,
the `@supabase/auth-js` source installed in this repo, the Supabase docs source and the
Cloudflare docs source. supabase.com, developers.cloudflare.com and www.cloudflare.com
are blocked from this environment, so the docs were read from their GitHub repositories.
The Turnstile Privacy Addendum is hosted only on www.cloudflare.com and **could not be
read** (see finding 9).

## Short answer

- With CAPTCHA on, Auth checks a token on `POST /otp`, `/magiclink`, `/signup` (also
  anonymous sign-in), `/recover`, `/resend`, `/token` for `grant_type=password` and
  `web3`, passkey sign-in options and `/sso`. It does **not** check `POST /verify`
  (typing the code), OAuth `/authorize` (Google, Facebook), or `/token` with
  `grant_type=pkce`, `refresh_token` or `id_token`.
- In this app, **two calls break** once CAPTCHA is on: sending the email code
  (`signInWithOtp`, including "send a new code") and the admin password login
  (`signInWithPassword` at `/login?admin=1`). Entering the code, Google, Facebook, the
  OAuth callback and session refresh are unaffected.
- A missing or bad token gets **HTTP 400, `error_code: "captcha_failed"`**. auth-js
  turns that into an `AuthApiError` with `status 400` and `code "captcha_failed"`.
- A Turnstile token is **single-use and expires 300 seconds** after it is issued. Every
  code request needs a new token, so the widget must be reset after each attempt,
  **whether or not it succeeded**.
- Auth has no warn-only mode: once the toggle is on, every request without a token is
  refused. **The widget has to be in production before the owner turns CAPTCHA on.**

## Findings

1. **Which routes check the token.** The router puts the `verifyCaptcha` middleware on
   `/signup`, `/recover`, `/resend`, `/magiclink`, `/otp`, `/token`,
   `/passkeys/authentication/options` and `/sso`. `/verify` (GET and POST) and
   `/authorize` get no captcha middleware.
   — `supabase/auth` `internal/api/api.go` L226 (`r.Get("/authorize", api.ExternalProviderRedirect)`),
   L229 (`r.With(api.verifyCaptcha).Route("/signup", …)`; the same route calls
   `SignupAnonymously` when there is no email or phone), L255–268:
   ```go
   With(api.verifyCaptcha).With(api.requireEmailProvider).Post("/recover", api.Recover)
   With(api.verifyCaptcha).Post("/resend", api.Resend)
   With(api.verifyCaptcha).Post("/magiclink", api.MagicLink)
   With(api.verifyCaptcha).Post("/otp", api.Otp)
   r.With(api.verifyCaptcha).Post("/token", api.Token)
   ```
   L270–273: `r.With(api.limitHandler(api.limiterOpts.Verify)).Route("/verify", …)`,
   with no captcha. Passkey options are at L329 and SSO at L349. Commit `ce9a8eee0cc0`.

2. **`/token` is checked only for some grant types.** `isIgnoreCaptchaRoute` skips the
   check for `/token` when `grant_type` is `pkce`, `refresh_token` or `id_token`. For
   `password`, `web3` and any other value the check runs.
   — `internal/api/middleware.go` L283–305:
   ```go
   switch req.FormValue("grant_type") {
   case "pkce": return true
   case "refresh_token": return true
   case "id_token": return true
   case "password": return false
   case "web3": return false
   }
   return false
   ```
   What this means here: Google and Facebook go through `/authorize` (not checked), and
   the callback's `exchangeCodeForSession` is `grant_type=pkce` (not checked), so OAuth
   sign-in keeps working. `signInWithPassword` is `grant_type=password`, so **the admin
   login needs a token**.

3. **The check itself, and who skips it.** `verifyCaptcha` returns straight away if
   CAPTCHA is disabled, or if the request carries admin (service-role) credentials. It
   then reads `gotrue_meta_security.captcha_token` from the JSON body and sends it to the
   provider with the client IP.
   — `internal/api/middleware.go` L31–37 (`Security captchaSecurity \`json:"gotrue_meta_security"\``,
   `Token string \`json:"captcha_token"\``), L242–281 (`if !config.Security.Captcha.Enabled { return ctx, nil }`,
   `// skip captcha validation if authorization header contains an admin role`).
   `internal/security/captcha.go` L59–63 posts `secret`, `response` and `remoteip` to
   `https://challenges.cloudflare.com/turnstile/v0/siteverify` (L91–92) or
   `https://hcaptcha.com/siteverify` (L89–90). There is a 10-second timeout by default
   (L38–41). Supabase checks `success` only: the hostname the provider returns is read
   into the struct but never compared (`// TODO (darora): pipe through sitekey`, L64).
   Limiting where the widget runs therefore depends on the Turnstile widget's own
   hostname list in Cloudflare.

4. **Refusal responses (Q3).**
   - No token: `400`, `captcha_failed`, `"captcha protection: request disallowed (no captcha_token found)"`.
   - Token refused by the provider: `400`, `captcha_failed`,
     `"captcha protection: request disallowed (<provider error-codes>)"`, e.g.
     `timeout-or-duplicate` for a reused or expired Turnstile token.
   - Provider unreachable or not JSON: `500`, `"captcha verification process failed"`.
   — `internal/api/middleware.go` L262–279. `apierrors/errorcode.go` L51
   (`ErrorCodeCaptchaFailed ErrorCode = "captcha_failed"`). `apierrors/apierrors.go`
   L48–51 (JSON keys `code`, `error_code`, `msg`) and L65–66 (`NewBadRequestError` →
   `http.StatusBadRequest`).
   Client side: auth-js takes `data.code` (newer API version) or `data.error_code` as the
   error code and throws `new AuthApiError(message, status, errorCode)`.
   — `@supabase/auth-js` 2.98.0 `src/lib/fetch.ts` L57–70 and L102. `captcha_failed` is
   in the typed list, `src/lib/error-codes.ts` L43.
   Today `lib/otp.ts` `otpErrorKey` would map `captcha_failed` to `'failed'`
   ("send failed"). It needs its own key and message.

5. **How the JS client sends the token (Q2).** Each call takes `options.captchaToken`
   and puts it in the body as `gotrue_meta_security: { captcha_token }`.
   — `node_modules/@supabase/auth-js/src/GoTrueClient.ts` (v2.98.0):
   - `signInWithOtp` L1233, email branch L1245–1256:
     `body: { email, data, create_user, gotrue_meta_security: { captcha_token: options?.captchaToken }, code_challenge, … }` → `POST /otp`.
   - `signInWithPassword` L687–702 → `POST /token?grant_type=password`, same key.
   - `verifyOtp` L1290–1306 also sends `gotrue_meta_security` if one is given, but the
     server never checks it on `/verify` (finding 1).
   - Also: `signInAnonymously` L565 (→ `/signup`), `signUp` (→ `/signup`), `resend`
     L1432 (→ `/resend`), `resetPasswordForEmail` (→ `/recover`), `signInWithIdToken`
     (→ `/token?grant_type=id_token`, sent but not checked).
   - `signInWithOAuth` L751 → `_handleProviderSignIn` L2542 only builds an
     `${this.url}/authorize` URL and redirects. It has no captcha option.

6. **Turnstile tokens are single-use and last 300 s (Q4).**
   "Each token is valid for 300 seconds (5 minutes) after generation." "Each token can
   only be validated once. A replayed token will be rejected with the
   `timeout-or-duplicate` error code."
   — cloudflare-docs `src/content/docs/turnstile/get-started/server-side-validation.mdx`
   L24–25, L58–62, L580.
   What this means here:
   (a) Reset the widget after **every** `signInWithOtp` / `signInWithPassword` call,
   including failed ones. In the `/otp` route the IP limiter runs before the captcha
   check, but the per-address "wait 60 s" limit runs inside the handler, after it
   (finding 1). So a request refused as too frequent has still used up its token.
   (b) "Send a new code" on the code screen needs a new token. This app resends by
   calling `signInWithOtp` again, which goes to `POST /otp`.
   (c) If the user waits on the form for more than 5 minutes, the token expires. The
   default `refresh-expired: auto` gets a new one; an `expired-callback` should clear the
   stored token (`widget-configurations.mdx` L305, L391).

7. **Client integration (Q5).**
   - Script: `https://challenges.cloudflare.com/turnstile/v0/api.js`; for explicit
     rendering use `?render=explicit`. "The `api.js` file must be fetched from the exact
     URL shown above. Proxying or caching this file will cause Turnstile to fail."
     — `get-started/client-side-rendering/index.mdx` L65–72, L271.
   - API: `turnstile.render(container, opts)` returns a `widgetId`. The other calls are
     `turnstile.reset(widgetId)`, `turnstile.getResponse(widgetId)`,
     `turnstile.isExpired(widgetId)`, `turnstile.remove(widgetId)` and
     `turnstile.execute(container)`. — same file L286–322, L482–512.
   - Options: `sitekey`; `theme` (`auto|light|dark`); `size` (`normal|flexible|compact`);
     `callback`; `error-callback`; `expired-callback`; `timeout-callback`; `execution`
     (`render|execute`); `appearance` (`always|execute|interaction-only`); `language`;
     `refresh-expired`. — same file L526–535; `widget-configurations.mdx` L72–82,
     L171–172, L257–265, L305–306, L391.
   - Thai is supported: code `th` (or `th-th`). `auto` follows the browser, and an
     unsupported language falls back to English. — `reference/supported-languages.mdx`
     L14, L59; `widget-configurations.mdx` L259–265.
   - Test keys. Sitekeys: `1x00000000000000000000AA` always passes (visible),
     `2x00000000000000000000AB` always fails, `3x00000000000000000000FF` forces an
     interactive challenge; `1x00000000000000000000BB` / `2x00000000000000000000BB` are
     the invisible versions. Secrets: `1x0000000000000000000000000000000AA` passes,
     `2x0000000000000000000000000000000AA` fails, `3x…AA` returns
     `timeout-or-duplicate`. Test sitekeys issue `XXXX.DUMMY.TOKEN.XXXX`. "Production
     secret keys will reject the dummy token", and test secrets reject real tokens.
     Dummy sitekeys work on any domain, including `localhost`.
     — `troubleshooting/testing.mdx` L28–45, L61, L114–122, L157–161.
   - CSP: "add … **script-src**: `https://challenges.cloudflare.com`, **frame-src**:
     `https://challenges.cloudflare.com`". A nonce with `strict-dynamic` is the
     recommended alternative. — `reference/content-security-policy.mdx` L14–21.
   - Free plan: up to 20 widgets, unlimited challenges, 10 hostnames per widget.
     — `plans.mdx` L39–45. This is enough for Staging + Production + localhost.

8. **Where the owner turns it on (Q6).** "find the **Enable CAPTCHA protection** toggle
   under Settings > Authentication > Bot and Abuse Protection > Enable CAPTCHA
   protection. Select your CAPTCHA provider from the dropdown, enter your CAPTCHA
   **Secret key**, and click **Save**." The dashboard link is
   `/dashboard/project/_/auth/protection`.
   — supabase `apps/docs/content/guides/auth/auth-captcha.mdx` L45–49 at `5573d0dfbc13`.
   Server config: `CaptchaConfiguration{Enabled, Provider (default "hcaptcha"), Secret, Timeout 10s}`;
   provider must be `hcaptcha` or `turnstile`, and an empty secret is rejected.
   — `internal/conf/configuration.go` L852–875.
   The secret goes only into the Supabase dashboard. The sitekey is public and can be
   `NEXT_PUBLIC_TURNSTILE_SITE_KEY`. The docs' own examples reset the widget after each
   call (`captcha.current.resetCaptcha()`, L110–133).
   **Enabling it breaks old clients immediately.** This comes from the code, not the
   docs: `verifyCaptcha` has no report-only mode. With `Enabled` true, an empty token is
   a 400 (finding 4). The setting is per project, so Staging (`vorpnkedpscsqhnrssrl`) and
   Production (`hivedzrwrrcnjrlirhtv`) are switched separately.

9. **Privacy and PDPA (Q7). Partly verified.** Cloudflare's docs say: "Turnstile processes
   only the data strictly necessary to provide this security function. Turnstile does
   not access, store, or transmit user communications, form entries, or other page
   inputs." The browser runs "proof-of-work …, probing for web APIs, and various other
   challenges for detecting browser-quirks and human behavior".
   — `turnstile/index.mdx` L48–52. Invisible mode requires the site to reference
   Cloudflare's Turnstile Privacy Addendum in its own privacy policy
   (`partials/turnstile/privacy-policy.mdx`; `concepts/widget.mdx` L51–53).
   Supabase Auth also sends the **user's IP address** to Cloudflare with every check
   (`remoteip`, `captcha.go` L63).
   **Not verified:** the Addendum (www.cloudflare.com/turnstile-privacy-policy/) was
   blocked, so the exact data categories, retention and Cloudflare's controller or
   processor role are unconfirmed. The owner should read it and update our privacy
   policy to name Cloudflare as a recipient of IP address and browser signals for bot
   protection. The users are Thai minors, so this is a decision for the owner or legal,
   not something to assume.

## Affected call sites in this repo

Searched `app/`, `lib/`, `components/` for `signInWithOtp`, `signInWithPassword`,
`resend(`, `verifyOtp`, `signInWithOAuth`, `signInAnonymously`, `signUp(`,
`resetPasswordForEmail`, `exchangeCodeForSession`.

| Call | File:line | Endpoint | Needs token? |
| --- | --- | --- | --- |
| `signInWithOtp` (first send and "send a new code") | `app/login/LoginPanel.tsx:91` | `POST /otp` | **Yes** |
| `signInWithPassword` (admin, `/login?admin=1`) | `app/login/LoginPanel.tsx:124` | `POST /token?grant_type=password` | **Yes** |
| `verifyOtp` | `app/login/LoginPanel.tsx:112` | `POST /verify` | No |
| `signInWithOAuth` Google | `app/login/LoginPanel.tsx:45` | `GET /authorize` | No |
| `signInWithOAuth` Facebook | `app/login/LoginPanel.tsx:63` | `GET /authorize` | No |
| `exchangeCodeForSession` | `app/auth/callback/route.ts:29` | `POST /token?grant_type=pkce` | No |

There are no `auth.resend`, `signInAnonymously`, `signUp` or `resetPasswordForEmail`
calls. Session refresh (`grant_type=refresh_token`, used by `middleware.ts` through
`@supabase/ssr`) is exempt.

**CSP:** the repo sets no Content-Security-Policy. `next.config.js` has no `headers()`,
`middleware.ts` only handles Supabase cookies and the login redirect, and there is no
`vercel.json`. Nothing blocks the Turnstile script or iframe today. If a CSP is added
later (T-list security work), it must allow `https://challenges.cloudflare.com` in
`script-src` and `frame-src`.

## Recommendation for implementation

1. **Feature flag on `NEXT_PUBLIC_TURNSTILE_SITE_KEY`.** When it is unset or empty,
   render no widget and send no `captchaToken`, so behaviour is exactly as today. When
   it is set, render the widget and disable "send code" and admin "sign in" until a
   token exists.
2. **One small client component** (e.g. `components/TurnstileWidget.tsx`):
   - load `api.js?render=explicit` once, straight from Cloudflare (no proxying);
   - call `turnstile.render` with `sitekey`, `language` from the active next-intl locale
     (`th`/`en`), `size: 'flexible'` (phone width), and `theme` matching the page;
   - wire `callback` to set the token, and `expired-callback` / `error-callback` to
     clear it;
   - expose `reset()`, and call `turnstile.remove` on unmount.
   Use the managed widget, not invisible mode (invisible adds the privacy-policy
   requirement in finding 9). `appearance: 'interaction-only'` hides it for most users
   if the owner wants less friction.
3. **Pass `options: { captchaToken }`** to `signInWithOtp` (L91) and
   `signInWithPassword` (L124). **Reset the widget and clear the token after every call,
   success or failure**, because the token is single-use (finding 6). The code screen's
   "send a new code" must show the widget again, or keep one mounted, and wait for a
   fresh token.
4. **Error mapping:** add `'captcha'` to `otpErrorKey` for `code === 'captcha_failed'`
   (status 400), with a Thai/English message such as "please complete the check again".
   Reset the widget at the same time. Do not show the raw `msg`.
5. **Tests:** unit-test `otpErrorKey` for `captcha_failed`. For end-to-end or local
   runs, use sitekey `1x00000000000000000000AA` with a Supabase project whose secret is
   `1x0000000000000000000000000000000AA`. Use `2x…AB` to exercise the failure path.
6. **Rollout order.** Each step can be undone on its own.
   1. Ship the code with the env var unset. Production is unchanged.
   2. Owner: create a Turnstile widget (hostnames: staging domain, production domain,
      `localhost`). Set `NEXT_PUBLIC_TURNSTILE_SITE_KEY` on **Staging** and redeploy.
      Confirm in the network tab that `/otp` requests carry
      `gotrue_meta_security.captcha_token`.
   3. Owner: turn on CAPTCHA (Turnstile + secret) in the **Staging** Supabase project
      (`vorpnkedpscsqhnrssrl`). Test the email code, "send a new code", the admin login,
      Google, and a scripted `/otp` POST with no token, which must get
      `400 captcha_failed`. The scripted POST is T19's acceptance: "a bot asking for
      codes repeatedly is blocked".
   4. Set the env var on **Production** and redeploy. Check that the widget appears.
   5. Only then turn on CAPTCHA in Production Supabase (`hivedzrwrrcnjrlirhtv`).
   Rollback runs in reverse: turn off CAPTCHA in Supabase **first**, then unset the env
   var. If the env var is unset while CAPTCHA is on, all email and admin logins break.
7. **Nationwide checklist.**
   - (1) No new rows or queries.
   - (2) Tokens are single-use by design, and a double-click can at worst consume one
     token and get a 400. Disable the button while a request is in flight (already
     done with `loading`).
   - (3) CAPTCHA limits bots per request; it does not replace the per-IP and
     per-address limits. T20 still stands.
   - (4) No per-user manual step. Setup is a one-time step for each Supabase project.
   - (5) Evidence is the Staging test in step 6.3, and it is **not yet run**. Until then
     T19 is "not ready for nationwide use".

## Sources

- Supabase Auth server, `github.com/supabase/auth` @ `ce9a8eee0cc042be8c7a42981a7ddae631e41d91`
  (commit date 22 Sep 2026, retrieved 29 Sep 2026): `internal/api/api.go`,
  `internal/api/middleware.go`, `internal/security/captcha.go`,
  `internal/api/apierrors/{apierrors,errorcode}.go`, `internal/conf/configuration.go`.
- `@supabase/auth-js` **2.98.0** as installed in this repo
  (`node_modules/@supabase/auth-js/src/GoTrueClient.ts`, `src/lib/fetch.ts`,
  `src/lib/error-codes.ts`), pulled in by `@supabase/supabase-js ^2.97.0`.
- Supabase docs source, `github.com/supabase/supabase` @ `5573d0dfbc1375cecaa3c46ff01a5631f902d59b`
  (retrieved 29 Sep 2026): `apps/docs/content/guides/auth/auth-captcha.mdx`.
- Cloudflare docs source, `github.com/cloudflare/cloudflare-docs` @ `392129a358884b7eb55003f4b8511458535c4464`
  (commit date 29 Sep 2026): `src/content/docs/turnstile/` → `index.mdx`,
  `get-started/server-side-validation.mdx`,
  `get-started/client-side-rendering/{index,widget-configurations}.mdx`,
  `troubleshooting/testing.mdx`, `reference/content-security-policy.mdx`,
  `reference/supported-languages.mdx`, `concepts/widget.mdx`, `plans.mdx`;
  `src/content/partials/turnstile/privacy-policy.mdx`.
  These are published at developers.cloudflare.com/turnstile/…
- Not reachable: `https://www.cloudflare.com/turnstile-privacy-policy/` (egress blocked,
  29 Sep 2026). Finding 9 is incomplete until someone reads it.
