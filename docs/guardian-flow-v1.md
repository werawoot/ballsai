# Guardian flow V1

This worktree introduces a consented guardian-to-athlete relationship. It does not
make a guardian an athlete's editor, coach, or payment manager.

```text
Guardian creates/logs into a guardian account
→ enters the athlete's BallDoenSai account email at /guardian
→ explicitly confirms guardian consent
→ athlete receives an in-app request and accepts or declines at /guardian
→ guardian can read only that athlete's profile, Level, XP and badge count
→ guardian can revoke the link; if no accepted guardian remains, a minor profile is unpublished
```

`sql/21-guardian-links-v1.sql` must be applied after steps 14, 17 and 20. It replaces
the old browser-only guardian-consent checkbox with a database-enforced accepted link
for minors' public profiles. It is not applied by this worktree.
