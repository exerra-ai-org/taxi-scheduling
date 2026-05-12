-- 002_geofence_settings.sql
--
-- Seed admin-tunable geofence dials into app_settings. Idempotent via
-- ON CONFLICT DO NOTHING so any admin-edited values are preserved.
--
-- Keys:
--   geofenceAutoArrive       'true' | 'false' — flip booking to arrived
--                             when driver dwells inside the pickup radius
--   geofencePickupRadiusM    radius around the pickup point (meters)
--   geofencePickupDwellMs    time the driver must remain inside the radius
--                             (milliseconds) before auto-arrive fires
--
-- Defaults match the previous env-driven values in config.ts so existing
-- behaviour is unchanged until admin edits them.

BEGIN;

INSERT INTO "app_settings" ("key", "value") VALUES
    ('geofenceAutoArrive', 'false'),
    ('geofencePickupRadiusM', '75'),
    ('geofencePickupDwellMs', '20000')
ON CONFLICT ("key") DO NOTHING;

COMMIT;
