# Rollback SQL

These files are outside `supabase/migrations`, so `supabase db push` never runs them. Run them by hand, one at a time, in this order:

1. `20261108000013_private_suspension_reason.down.sql` (makes suspension reasons public again, so run it only if migration 13 itself causes an outage)
2. `20261108000012_optional_vehicle_details.down.sql`
3. `20261108000010_email_verification.down.sql` (turn **Confirm email** off first)
4. `20261108000009_driver_phone_access.down.sql`
5. `20261108000008_profile_completion.down.sql`

After each one, update the migration history so a later `db push` applies it again:

```sh
supabase migration repair --status reverted <version>
```

**Migration 11 has no rollback.** It only fills blank values from each user's own signup data. Those values can't be told apart from ones the user entered later, so removing them could delete real data. Rows it adds are harmless once the other migrations are reverted. If you revert it from the history, `db push` re-runs it safely, because it never overwrites anything.
