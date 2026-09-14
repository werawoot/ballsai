# Legacy payment-slip remediation — Closed Beta blocker

## Evidence (23 August 2026, read-only)

- Supabase project: `hivedzrwrrcnjrlirhtv`.
- The `slips` bucket is not marked Public.
- The browser upload route accepts only JPG, PNG and WEBP up to 5 MB, and stores new
  files as object paths.
- A read-only count found **4** rows in `public.payments` whose `slip_url` is an
  `http(s)` URL, and zero rows using the current object-path format.
- `GET /api/payments/[paymentId]/slip` deliberately redirects those legacy URL rows.

This means the private signed-URL guarantee is not yet demonstrable for historic slips.
Do not open individual URLs during the audit: they may contain payment evidence.

## Safe decision path

1. An authorized payment owner or administrator checks each historic payment inside the
   established admin workflow and records whether it must be retained.
2. For any retained record, request a new upload through the private `slips` bucket;
   the new payment row must keep only the object path.
3. After the owner confirms the replacement, an operator removes or quarantines the
   legacy URL through a separately reviewed migration. Never overwrite it silently.
4. The viewer route now rejects every `http(s)` value, rather than redirecting it. SQL37
   clears the four known references only after owner approval.
5. With a disposable new slip, test authorized signed access, signed-out denial and
   expiry. Record only pass/fail evidence, never the URL itself.

## Approval boundary

The next step touches real payment evidence and can make historic records unavailable.
It requires an explicit owner decision and a separately reviewed production migration.
`sql/37-quarantine-legacy-payment-slip-links-v1.sql` is prepared in the worktree but
is not applied. It fails closed if the number of URL-format rows is no longer exactly
four, and it does not delete Storage objects.
