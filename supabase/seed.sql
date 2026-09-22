-- 1. Crear Organización principal
INSERT INTO public.organizations (id, name, region)
VALUES ('11111111-1111-1111-1111-111111111111', 'Estancia Didáctica Concordia', 'Concordia, Entre Ríos')
ON CONFLICT (id) DO NOTHING;

-- 2. Crear los 3 Lotes con polígonos de prueba en Concordia
-- Polígonos en coordenadas aproximadas ficticias de Concordia (-31.39, -58.02)
INSERT INTO public.plots (id, organization_id, name, crop, polygon, threshold_min, threshold_max)
VALUES 
(
    '22222222-2222-2222-2222-222222222221',
    '11111111-1111-1111-1111-111111111111',
    'Costa 1',
    'Citrus',
    '[
        {"latitude": -31.3850, "longitude": -58.0200},
        {"latitude": -31.3850, "longitude": -58.0150},
        {"latitude": -31.3900, "longitude": -58.0150},
        {"latitude": -31.3900, "longitude": -58.0200}
    ]'::jsonb,
    25.0,
    45.0
),
(
    '22222222-2222-2222-2222-222222222222',
    '11111111-1111-1111-1111-111111111111',
    'Costa 2',
    'Citrus',
    '[
        {"latitude": -31.3910, "longitude": -58.0200},
        {"latitude": -31.3910, "longitude": -58.0150},
        {"latitude": -31.3960, "longitude": -58.0150},
        {"latitude": -31.3960, "longitude": -58.0200}
    ]'::jsonb,
    25.0,
    45.0
),
(
    '22222222-2222-2222-2222-222222222223',
    '11111111-1111-1111-1111-111111111111',
    'Monte A',
    'Soja',
    '[
        {"latitude": -31.3850, "longitude": -58.0260},
        {"latitude": -31.3850, "longitude": -58.0210},
        {"latitude": -31.3900, "longitude": -58.0210},
        {"latitude": -31.3900, "longitude": -58.0260}
    ]'::jsonb,
    20.0,
    40.0
)
ON CONFLICT (id) DO NOTHING;

-- 3. Crear Estaciones de sensores (≥1 por lote)
INSERT INTO public.stations (id, plot_id, name, lat, lng)
VALUES
('33333333-3333-3333-3333-333333333331', '22222222-2222-2222-2222-222222222221', 'Estación C1-Norte', -31.3875, -58.0175),
('33333333-3333-3333-3333-333333333332', '22222222-2222-2222-2222-222222222222', 'Estación C2-Central', -31.3935, -58.0175),
('33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222223', 'Estación MA-Sur', -31.3875, -58.0235)
ON CONFLICT (id) DO NOTHING;

-- 4. Crear Válvulas (≥1 por lote)
INSERT INTO public.valves (id, plot_id, name, status)
VALUES
('44444444-4444-4444-4444-444444444441', '22222222-2222-2222-2222-222222222221', 'Válvula Goteo Costa 1', 'closed'),
('44444444-4444-4444-4444-444444444442', '22222222-2222-2222-2222-222222222222', 'Válvula Principal Costa 2', 'closed'),
('44444444-4444-4444-4444-444444444443', '22222222-2222-2222-2222-222222222223', 'Válvula Aspersión Monte A', 'closed')
ON CONFLICT (id) DO NOTHING;

-- 5. Lecturas iniciales de prueba (para semáforos)
-- Costa 1: Óptimo (32% humedad, reciente)
INSERT INTO public.readings (station_id, measured_at, moisture_pct, temp_c, rain_mm, source)
VALUES ('33333333-3333-3333-3333-333333333331', now(), 32.5, 23.5, 0.0, 'sensor');

-- Costa 2: Seco (18% humedad, reciente -> gatilla alerta/riego H1)
INSERT INTO public.readings (station_id, measured_at, moisture_pct, temp_c, rain_mm, source)
VALUES ('33333333-3333-3333-3333-333333333332', now(), 18.0, 26.8, 0.0, 'sensor');

-- Monte A: Stale (hace más de 20 minutos sin reportar -> gris H4)
INSERT INTO public.readings (station_id, measured_at, moisture_pct, temp_c, rain_mm, source)
VALUES ('33333333-3333-3333-3333-333333333333', now() - INTERVAL '25 minutes', 28.0, 22.1, 0.0, 'sensor');