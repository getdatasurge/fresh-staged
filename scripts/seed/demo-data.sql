-- FreshTrack Pro Demo Data
-- Populates a demo organization with realistic data

DO $$
DECLARE
    org_id text;
    site_id text;
    area_id text;
    unit_id text;
    sensor_id text;
    i integer;
BEGIN
    -- 1. Create Organization (idempotent check)
    INSERT INTO organizations (name, slug, status, billing_status)
    VALUES ('Demo Foods Inc.', 'demo-foods', 'active', 'active')
    ON CONFLICT (slug) DO NOTHING;
    
    SELECT id INTO org_id FROM organizations WHERE slug = 'demo-foods';

    -- 2. Create Site
    INSERT INTO sites (organization_id, name, type, timezone)
    VALUES (org_id, 'Downtown Kitchen', 'commissary', 'America/New_York')
    RETURNING id INTO site_id;

    -- 3. Create Area
    INSERT INTO areas (site_id, name, type)
    VALUES (site_id, 'Walk-in Freezer', 'storage')
    RETURNING id INTO area_id;

    -- 4. Create Unit
    INSERT INTO units (area_id, name, type, temp_range_min, temp_range_max)
    VALUES (area_id, 'Freezer 01', 'freezer', -20, -10)
    RETURNING id INTO unit_id;

    -- 5. Create Sensor
    INSERT INTO lora_sensors (organization_id, device_eui, name, status, battery_level)
    VALUES (org_id, 'AABBCCDDEEFF0011', 'Sensor-F01', 'online', 95)
    ON CONFLICT (device_eui) DO UPDATE SET status = 'online'
    RETURNING id INTO sensor_id;

    -- Link sensor to unit
    INSERT INTO sensor_assignments (sensor_id, unit_id, active_from)
    VALUES (sensor_id, unit_id, NOW() - INTERVAL '30 days');

    -- 6. Generate 24 hours of data (every 15 mins)
    FOR i IN 0..96 LOOP
        INSERT INTO sensor_readings (sensor_id, temperature, humidity, battery, rssi, read_at)
        VALUES (
            sensor_id, 
            -15 + (random() * 2), -- Random temp between -15 and -13
            45 + (random() * 5),  -- Random humidity
            95, 
            -80, 
            NOW() - (INTERVAL '15 minutes' * i)
        );
    END LOOP;

    -- Create an alert
    INSERT INTO alerts (organization_id, unit_id, type, severity, status, message, created_at)
    VALUES (org_id, unit_id, 'temperature_high', 'critical', 'new', 'Temperature -5C exceeds max -10C', NOW() - INTERVAL '1 hour');

END $$;
