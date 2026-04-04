# Supabase SQL layout

This project now uses a single rollup schema file.

## Schema

Run these files in the Supabase SQL Editor for `irkbdinugnasepjowhzr.supabase.co`:

1. `supabase/schema.sql`
2. `supabase/storage_bucket.sql` (safe to run separately; useful if avatar storage needs a quick fix)

Notes:
- `supabase/schema.sql` is now the source of truth for the merged driver-app + admin-dashboard backend.
- It includes the driver login/password RPCs used by the app: `authenticate_driver` and `set_driver_password`.
- It also includes the trip RPCs used by the app: `start_trip` and `complete_trip`.

## SQL files

- `supabase/schema.sql` is the main merged schema for the app.
- `supabase/storage_bucket.sql` is a focused helper for the `driver-avatars` storage bucket and policies.
