# Supabase SQL layout

This project now uses a single rollup schema file.

## Schema

Run this file in Supabase SQL Editor:

1. `supabase/schema.sql`

Notes:
- `supabase/schema.sql` is now the source of truth for the merged driver-app + admin-dashboard backend.
- It includes the driver login/password RPCs used by the app: `authenticate_driver` and `set_driver_password`.
- It also includes the trip RPCs used by the app: `start_trip` and `complete_trip`.

## SQL files

- `supabase/schema.sql` is the only SQL file kept in this project.
