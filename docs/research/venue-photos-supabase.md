# Supabase Storage research — Venue photos SQL43

Research date: 16 September 2026. Scope: official Supabase documentation only.
This is a design finding for the proposed SQL43 venue-photo feature. It does not
change the Supabase project, Storage configuration, database schema, or deployed
application.

## Confirmed platform facts

### Private bucket and object access

- Buckets are private by default. For a private bucket, every operation, including
  download, is subject to Row Level Security (RLS) policies on `storage.objects`.
  A private object can be downloaded by an authorised request with the user's JWT,
  or through a time-limited signed URL. [Storage bucket fundamentals](https://supabase.com/docs/guides/storage/buckets/fundamentals)
- Storage denies uploads unless an RLS policy permits them. `INSERT` is the basic
  permission for upload; `upsert` additionally needs `SELECT` and `UPDATE`.
  Supabase documents folder-prefix checks through `storage.foldername(name)` and
  the caller identity in `auth.jwt()`. [Storage access control](https://supabase.com/docs/guides/storage/security/access-control)
- Objects created using a user JWT receive an `owner_id`, but that field does not
  enforce access on its own. Policies must explicitly compare it (or a trusted
  application relationship) with the caller. [Storage ownership](https://supabase.com/docs/guides/storage/security/ownership)
- Supabase's current upload troubleshooting note says upload performs `INSERT
  RETURNING *`; a matching `SELECT` policy may therefore be required for an upload
  to complete without a 403. This needs an integration test for the exact policies
  adopted by SQL43. [Storage upload 403 troubleshooting](https://supabase.com/docs/guides/troubleshooting/storage-error-403-forbidden-new-row-violates-row-level-security-policy-on-upload-a94384)

### Signed URLs

- `createSignedUrl(path, expiresIn)` creates a URL valid for the supplied number
  of seconds, and requires `SELECT` access to the object. [JavaScript SDK reference](https://supabase.com/docs/reference/javascript/storage-from-createsignedurl)
- A Storage signed URL remains valid until its expiry even if Auth signing keys are
  changed; Supabase says revocation requires contacting Support. A short expiry is
  therefore a boundary, not a revocation system. [Serving Storage downloads](https://supabase.com/docs/guides/storage/serving/downloads)
- Smart CDN caching can allow a previously cached response to outlive URL expiry
  until the object cache TTL; deleting the object removes access. Do not treat a
  signed URL as a per-request revocation mechanism. [Smart CDN](https://supabase.com/docs/guides/storage/cdn/smart-cdn)

### Image transformations and metadata

- Supabase can resize and optimize image responses. A transformed request may
  automatically return WebP when the client supports it, and transform options can
  be embedded in a signed URL so they cannot be altered after signing. [Storage image transformations](https://supabase.com/docs/guides/storage/serving/image-transformations)
- The official documentation does **not** state that transforms or WebP conversion
  remove EXIF, GPS, or other metadata. We must not claim that either one sanitizes
  uploads. A SQL43 implementation should explicitly decode and re-encode images
  before upload, strip metadata by design, and add a test that confirms the output
  has no location metadata.

## Design implications for BallDoenSai

These are design recommendations inferred from the facts above, not current
production state:

1. Create a dedicated **private** `venue-photos` bucket. Do not add a broad public
   `SELECT` policy to `storage.objects`.
2. Store photo records separately with a moderation status. New uploads are
   `pending`; only records marked `visible` may receive viewer signed URLs.
3. Authorise signed-URL minting in an application route: verify that the photo is
   visible for a visitor, or that the current user owns the venue (or is an admin)
   for pending/rejected photos. Then mint a deliberately short-lived URL.
4. Scope upload object names to the venue and owner relationship, and enforce that
   relationship in RLS rather than trusting a caller-provided path alone. A future
   SQL43 policy needs a dedicated integration test for insert, select, update, and
   delete allow/deny cases.
5. Treat media sanitisation as an application processing requirement, separate from
   image delivery optimization. Validate MIME type, byte size, and decoded image
   dimensions before storing; re-encode a sanitized output rather than preserving
   arbitrary original metadata.

## Questions to resolve before implementation

- Which trusted server-side runtime will perform decode/re-encode and metadata
  removal? Supabase's transform feature is delivery optimization, not documented
  upload sanitization.
- What exact maximum count, bytes, and pixel dimensions apply per venue photo?
- Does a deleted/rejected record immediately delete its Storage object, or use a
  retention window for moderation/audit? This affects signed-URL exposure and
  operational recovery.
- What role and audit flow approves `pending` photos? This must be explicit before
  an admin surface or policy is written.
