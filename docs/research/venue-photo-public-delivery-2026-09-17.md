# Venue photos: public delivery from a private Storage bucket

Research date: 17 September 2026. Scope: official Supabase documentation only.
This note is an architecture finding for the proposed SQL43 work. It changes no
code, SQL migration, bucket, policy, environment variable, or production data.

## Short answer

**Yes, a private `venue-photos` bucket can serve moderation-approved venue
photos to public visitors without changing the bucket to public or placing a
service-role key in the app.** The practical boundary is an intentionally narrow
anonymous `SELECT` RLS policy on `storage.objects` for **only** objects whose
matching photo record is `visible`, coupled with time-limited signed URLs.

That is still public *application behaviour*: an anonymous visitor who is
allowed to view an approved photo can obtain a signed URL and can share it until
it expires. A private bucket hides stable public object URLs and keeps pending,
rejected, and owner-only originals inaccessible; it does not make approved
marketing photos secret from the public.

## What Supabase documents

- Private buckets are the default. All operations, including downloads, are
  subject to RLS on `storage.objects`. The documented ways to serve a private
  object are a JWT-authorised download or a time-limited signed URL. [Storage
  buckets fundamentals](https://supabase.com/docs/guides/storage/buckets/fundamentals)
- A private asset has no conventional public URL. Supabase specifically describes
  signing a time-limited URL on the server (for example, an Edge Function) as one
  supported delivery path. [Serving Storage downloads](https://supabase.com/docs/guides/storage/serving/downloads)
- Creating a signed URL requires `SELECT` access to the object. RLS can define
  different `SELECT` policies for object listing versus individual object reads
  using Storage operation-aware helpers. Supabase's example allows read access
  without bucket listing by checking `storage.allow_any_operation(...)`. [Storage
  access control](https://supabase.com/docs/guides/storage/security/access-control)
- Signed URLs remain usable until their expiry even if Auth signing keys change;
  Supabase says revocation requires Support. Smart CDN can also retain a cached
  response until the object cache TTL. Use a short lifetime and delete objects
  whose content must cease being served. [Serving Storage downloads](https://supabase.com/docs/guides/storage/serving/downloads)
  [Smart CDN](https://supabase.com/docs/guides/storage/cdn/smart-cdn)
- Supabase's Next.js SSR guidance distinguishes browser and server clients and
  says a server client in a Route Handler can use cookie-based sessions. This is
  appropriate for owner/admin authorisation; it does not give an unauthenticated
  visitor extra Storage rights. [Creating a Supabase client for SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client?queryGroups=framework&framework=nextjs)

## Comparison of the three delivery choices

| Choice | Works for guest visitors? | Service role in app? | Security property | Recommendation |
| --- | --- | --- | --- | --- |
| Direct private-object access with viewer JWT and RLS | No, not without a guest/anon read policy | No | Strong for private owner/admin review; no shareable URL required | Use for pending, rejected, and owner-only review assets |
| Client or server signs a URL after anonymous `SELECT` RLS allows visible photo | Yes | No | URL expires, but approved media is intentionally readable by any visitor and shareable until expiry | Viable for the public venue gallery if RLS is narrowly tied to `status = 'visible'` and excludes listing |
| Next.js Route Handler signs a URL using the visitor's normal server client | Only if the same visitor has a matching RLS `SELECT` policy | No | Centralises input validation, record lookup, response headers, and auditing; does **not** bypass RLS | Preferred application interface; it still needs the visible-photo RLS rule for guests |

## Consequence for SQL43

There is no no-service-role design in which an unauthenticated visitor can see
an approved image while **no** anonymous permission exists anywhere. The policy
must intentionally authorize that public read. The safe version is not a broad
bucket-wide rule; it should be scoped to all of these conditions:

1. `bucket_id = 'venue-photos'`;
2. the object path matches a photo row for the requested venue;
3. that row is `visible` (never `pending`, `rejected`, or deleted);
4. the RLS operation is object retrieval, not object listing; and
5. owner/admin policies separately cover non-visible moderation/review work.

The exact `storage.objects` predicate must be reviewed for recursion and query
performance before writing SQL43. It is an implementation detail, not an
assumption this research can prove without the final schema.

## Recommended route boundary

Use a Next.js route such as `GET /api/venues/:venueId/photos/:photoId` as the
only UI-facing way to obtain a public-gallery URL:

1. Validate opaque IDs and fetch the photo record through the server client.
2. For a guest, accept only `status = 'visible'`; for an authenticated venue
   owner or admin, allow their own non-visible review records by separate checks.
3. Request a short signed URL for the exact stored path; do not accept a storage
   path directly from the request.
4. Return no-store or deliberately bounded cache headers, and never return a
   signed URL for a non-visible record.

This route improves auditability and protects the application from an arbitrary
path parameter. It cannot turn an unauthenticated request into an authorised
Storage read without either the narrow anonymous `SELECT` policy above or a
privileged server key. Because the requirement excludes a service-role key in
the app, SQL43 should use the narrow RLS policy and test its allow/deny paths.

## Required test cases before any production apply

- anonymous visitor can get a signed URL only for a `visible` photo;
- anonymous visitor cannot list the bucket, obtain a `pending` or `rejected`
  photo, or substitute another venue/photo ID;
- owner can upload and view only their venue's pending photo;
- another venue owner cannot read, update, delete, or sign it;
- admin can moderate according to the explicit approval policy;
- a newly rejected/deleted record no longer receives new signed URLs; and
- cached/signed-URL expiry behaviour is documented as an operational limitation,
  not asserted as instant revocation.
