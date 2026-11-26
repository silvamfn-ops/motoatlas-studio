-- ============================================================================
-- MOTOATLAS ECOSYSTEM - SETUP COMPLETO (TABELAS, RLS, VIEWS E STORAGE)
-- Cola este ficheiro no SQL Editor do Supabase e clica em RUN.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS trips (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL,
    subtitle TEXT,
    trip_type TEXT NOT NULL CHECK (trip_type IN ('motorcycle', 'leisure')),
    status TEXT NOT NULL DEFAULT 'planning' CHECK (status IN ('planning', 'active', 'completed', 'archived')),
    start_date DATE,
    end_date DATE,
    cover_image_url TEXT,
    general_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trip_participants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    trip_id UUID REFERENCES trips(id) ON DELETE CASCADE NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('rider', 'passenger', 'driver', 'companion')),
    phone TEXT,
    emergency_contact_name TEXT,
    emergency_contact_phone TEXT,
    blood_type TEXT,
    allergies_medical_notes TEXT,
    id_document_number TEXT,
    vehicle_model TEXT,
    vehicle_plate TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    trip_id UUID REFERENCES trips(id) ON DELETE CASCADE NOT NULL,
    day_number INTEGER NOT NULL,
    stage_date DATE,
    title TEXT NOT NULL,
    origin_name TEXT NOT NULL,
    destination_name TEXT NOT NULL,
    estimated_distance_km NUMERIC(6,1),
    estimated_duration_minutes INTEGER,
    route_geometry JSONB,
    gpx_file_url TEXT,
    traffic_zbe_alerts TEXT,
    roadbook_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS route_waypoints (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    stage_id UUID REFERENCES stages(id) ON DELETE CASCADE NOT NULL,
    order_index INTEGER NOT NULL,
    name TEXT NOT NULL,
    waypoint_type TEXT NOT NULL CHECK (waypoint_type IN ('fuel', 'viewpoint', 'coffee_stop', 'toll', 'zbe_warning', 'meeting_point')),
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    km_from_start NUMERIC(6,1),
    notes TEXT
);

CREATE TABLE IF NOT EXISTS pois (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    trip_id UUID REFERENCES trips(id) ON DELETE CASCADE NOT NULL,
    stage_id UUID REFERENCES stages(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('monument', 'museum', 'walking_route', 'gastronomy', 'viewpoint', 'nature')),
    city TEXT,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    visit_order INTEGER,
    scheduled_time TIME,
    location_details TEXT,
    classification TEXT,
    construction_period TEXT,
    dimensions_specs TEXT,
    architectural_styles TEXT,
    curiosities TEXT,
    visitor_tips TEXT,
    walking_route_geojson JSONB,
    is_visited BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS accommodations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    trip_id UUID REFERENCES trips(id) ON DELETE CASCADE NOT NULL,
    stage_id UUID REFERENCES stages(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    address TEXT,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    check_in_date DATE,
    check_out_date DATE,
    booking_reference TEXT,
    has_private_parking BOOLEAN DEFAULT FALSE,
    parking_notes TEXT,
    contact_phone TEXT,
    total_cost NUMERIC(10,2),
    currency TEXT DEFAULT 'EUR'
);

CREATE TABLE IF NOT EXISTS vault_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    trip_id UUID REFERENCES trips(id) ON DELETE CASCADE NOT NULL,
    poi_id UUID REFERENCES pois(id) ON DELETE SET NULL,
    accommodation_id UUID REFERENCES accommodations(id) ON DELETE SET NULL,
    participant_id UUID REFERENCES trip_participants(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    doc_type TEXT NOT NULL CHECK (doc_type IN ('ticket', 'hotel_voucher', 'insurance', 'vehicle_doc', 'personal_id', 'other')),
    storage_path TEXT NOT NULL,
    file_mime_type TEXT,
    qr_code_payload TEXT,
    valid_date DATE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS checklist_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    trip_id UUID REFERENCES trips(id) ON DELETE CASCADE NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('rider', 'passenger', 'motorcycle', 'documents', 'electronics')),
    item_name TEXT NOT NULL,
    quantity INTEGER DEFAULT 1,
    is_packed BOOLEAN DEFAULT FALSE,
    notes TEXT
);

CREATE TABLE IF NOT EXISTS vehicle_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    trip_id UUID REFERENCES trips(id) ON DELETE CASCADE NOT NULL,
    stage_id UUID REFERENCES stages(id) ON DELETE SET NULL,
    log_type TEXT NOT NULL CHECK (log_type IN ('fuel', 'maintenance', 'odometer_check', 'incident')),
    logged_at TIMESTAMPTZ DEFAULT NOW(),
    odometer_km INTEGER NOT NULL,
    liters NUMERIC(6,2),
    price_per_liter NUMERIC(5,3),
    total_cost NUMERIC(10,2),
    currency TEXT DEFAULT 'EUR',
    full_tank BOOLEAN DEFAULT TRUE,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_stages_trip_id ON stages(trip_id);
CREATE INDEX IF NOT EXISTS idx_waypoints_stage_id ON route_waypoints(stage_id);
CREATE INDEX IF NOT EXISTS idx_pois_trip_id ON pois(trip_id);
CREATE INDEX IF NOT EXISTS idx_pois_stage_id ON pois(stage_id);
CREATE INDEX IF NOT EXISTS idx_vault_trip_id ON vault_documents(trip_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_logs_trip_id ON vehicle_logs(trip_id);
CREATE INDEX IF NOT EXISTS idx_checklist_trip_id ON checklist_items(trip_id);

ALTER TABLE trips ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Gerir próprias viagens" ON trips;
CREATE POLICY "Gerir próprias viagens" ON trips FOR ALL USING (auth.uid() = user_id);

DO $$ 
DECLARE 
    t_name TEXT;
    child_tables TEXT[] := ARRAY[
        'trip_participants', 'stages', 'pois', 
        'accommodations', 'vault_documents', 'checklist_items', 'vehicle_logs'
    ];
BEGIN
    FOREACH t_name IN ARRAY child_tables LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t_name);
        EXECUTE format('DROP POLICY IF EXISTS "Acesso via dono da viagem" ON %I;', t_name);
        EXECUTE format('
            CREATE POLICY "Acesso via dono da viagem" ON %I
            FOR ALL USING (
                EXISTS (
                    SELECT 1 FROM trips 
                    WHERE trips.id = %I.trip_id 
                    AND trips.user_id = auth.uid()
                )
            );', t_name, t_name);
    END LOOP;
END $$;

ALTER TABLE route_waypoints ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acesso waypoints via dono da viagem" ON route_waypoints;
CREATE POLICY "Acesso waypoints via dono da viagem" ON route_waypoints
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM stages
            JOIN trips ON trips.id = stages.trip_id
            WHERE stages.id = route_waypoints.stage_id
            AND trips.user_id = auth.uid()
        )
    );

CREATE OR REPLACE VIEW fuel_consumption_stats AS
WITH ordered_fuel AS (
    SELECT 
        id, trip_id, stage_id, logged_at, odometer_km, liters, total_cost, full_tank,
        LAG(odometer_km) OVER (PARTITION BY trip_id ORDER BY odometer_km ASC) AS prev_odometer_km,
        LAG(full_tank) OVER (PARTITION BY trip_id ORDER BY odometer_km ASC) AS prev_full_tank
    FROM vehicle_logs
    WHERE log_type = 'fuel'
)
SELECT 
    id, trip_id, stage_id, logged_at, odometer_km,
    (odometer_km - prev_odometer_km) AS distance_since_last_km,
    liters, total_cost,
    CASE 
        WHEN full_tank = TRUE AND prev_full_tank = TRUE AND (odometer_km - prev_odometer_km) > 0 
        THEN ROUND(((liters / (odometer_km - prev_odometer_km)) * 100)::NUMERIC, 2)
        ELSE NULL 
    END AS consumption_l_100km,
    CASE 
        WHEN (odometer_km - prev_odometer_km) > 0 AND total_cost IS NOT NULL
        THEN ROUND((total_cost / (odometer_km - prev_odometer_km))::NUMERIC, 3)
        ELSE NULL
    END AS cost_per_km
FROM ordered_fuel;

INSERT INTO storage.buckets (id, name, public)
VALUES ('mototour-vault', 'mototour-vault', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Acesso privado ao cofre" ON storage.objects;
CREATE POLICY "Acesso privado ao cofre" ON storage.objects
    FOR ALL USING (
        bucket_id = 'mototour-vault' 
        AND auth.uid()::text = (storage.foldername(name))[1]
    );
