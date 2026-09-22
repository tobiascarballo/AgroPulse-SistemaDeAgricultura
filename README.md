# 🌱 AgroPulse — Agricultura de Precisión y Telemetría IoT

Trabajo Práctico N° 4 para la cátedra **Desarrollo y Arquitectura en Aplicaciones Móviles** (2026).  
**Licenciatura en Sistemas de Información** — Facultad de Ciencia y Tecnología (FCyT), Sede Concepción del Uruguay.

---

## 🌾 1. Descripción del Sistema

**AgroPulse** es una aplicación móvil integrada para agricultura de precisión y gestión de riego automatizado en establecimientos agrícolas. Conecta una aplicación móvil desarrollada en **React Native (Expo + TypeScript + Expo Router)** con un backend BaaS (**Supabase**: Auth, Postgres, RLS y Realtime) y una arquitectura orientada a eventos desacoplada (**Redpanda / Kafka** + Worker simulador IoT).

### Objetivos de Aprendizaje Demostrados
* **OA-1:** Modelado de dominio con roles (`producer`, `operator`, `advisor`) y aislamiento estricto perimetral mediante **Row Level Security (RLS)**.
* **OA-2:** Cartografía interactiva con cálculo de semáforo agronómico (`optimal`, `dry`, `wet`, `stale`) y validación de presencia GPS (*"Estoy en el lote"*).
* **OA-3:** Visualización de series temporales de telemetría (humedad de suelo, temperatura, lluvia) con actualización reactiva en tiempo real.
* **OA-4 & OA-7:** Arquitectura *event-driven* desacoplada: el broker de streaming (Redpanda) opera exclusivamente en backend; la app móvil nunca consume Kafka directamente.
* **OA-5 & RF-16:** Gestión asíncrona de órdenes de riego (`pending` → `applied` / `failed`) con garantía de idempotencia vía `client_request_id` (UUID) y restricción estricta de una sola orden pendiente por válvula.

---

## 🏗️ 2. Arquitectura de la Solución

```text
┌────────────────────────────────────────────────────────┐
│                   DISPOSITIVO MÓVIL                    │
│                                                        │
│           App Expo (React Native + Router)             │
│        [ Auth JWT | Mapa Semáforo | Comandos ]         │
└───────────────────────┬────────────────────────────────┘
                        │
                        │ HTTPS (REST / RLS) + WebSockets (Realtime)
                        │ (Sin SDK ni credenciales de Kafka)
                        v
┌────────────────────────────────────────────────────────┐
│                   SUPABASE (BaaS)                      │
│                                                        │
│   • Auth (Sesiones JWT persistentes)                   │
│   • Postgres DB (RLS: organizaciones, lotes, válvulas) │
│   • Realtime Engine (Publicación de ticks y estados)   │
└───────────────────────▲────────────────────────────────┘
                        │
                        │ Escribe lecturas y actualiza válvulas
                        │ (Service Role Key)
                        │
┌───────────────────────┴────────────────────────────────┐
│             BACKEND & WORKER (Docker Compose)          │
│                                                        │
│   ┌──────────────────┐          ┌──────────────────┐   │
│   │  Simulador IoT   │          │  Worker Ingest   │   │
│   │  (Genera ticks)  │          │  & Comandos      │   │
│   └────────┬─────────┘          └────────▲─────────┘   │
│            │                             │             │
│            │ Topic: soil.moisture        │ Consume     │
│            └──────────────┬──────────────┘             │
│                           v                            │
│               ┌───────────────────────┐                │
│               │ Redpanda Broker Kafka │                │
│               │ (Puerto 9092)         │                │
│               └───────────────────────┘                │
└────────────────────────────────────────────────────────┘
```

### ¿Por qué el dispositivo móvil no se conecta directamente a Kafka? (OA-7)
1. **Seguridad y Perímetro de Red:** Los brokers Kafka no están diseñados para autenticar miles de clientes móviles no confiables. Exponer Kafka directamente al exterior implicaría distribuir credenciales sensibles en binarios móviles descompilables.
2. **Consumo de Batería y Red Móvil:** Las conexiones persistentes y el protocolo binario de Kafka consumen un alto volumen de datos y batería, inviables en redes celulares inestables del campo (4G/3G/Edge).
3. **Control de Acceso y RLS:** Supabase gestiona la seguridad granular basada en filas (Row Level Security) según la membresía y el rol del usuario conectado.
4. **Gestión de Contrapresión (Backpressure):** El simulador puede generar cientos de ticks de telemetría por segundo; el worker los consolida y persiste en PostgreSQL de forma controlada.

---

## 📐 3. Reglas de Negocio del Semáforo (§08)

El estado agronómico de cada lote (`plot_status`) es un valor derivado que se calcula según el siguiente orden de precedencia estricto:

| Estado | Color | Condición de Activación | Acción / Sugerencia |
| :--- | :---: | :--- | :--- |
| **`stale`** | **Gris** | No hay mediciones registradas o `now - measured_at > 15 min`. | Alerta de telemetría: estación caída o sin señal. |
| **`dry`** | **Rojo** | `moisture_pct < threshold_min` (default 25.0%). | **Riesgo hídrico:** Se dispara sugerencia de riego in-app (RF-22). |
| **`optimal`** | **Verde** | `threshold_min <= moisture_pct <= threshold_max` (default 45.0%). | Rango adecuado para el cultivo. |
| **`wet`** | **Azul** | `moisture_pct > threshold_max` (default 45.0%). | Suelo saturado / anegado. No regar. |

### Ciclo de Comandos de Riego (RF-14, RF-15, RF-16)
1. El usuario selecciona una válvula cerrada y emite la orden (`action: 'open'`, duración: 1 a 120 min).
2. Se genera un `client_request_id` (UUID único) en el cliente para garantizar **idempotencia**.
3. El backend rechaza la operación si la válvula ya tiene una orden en estado `pending` (índice único parcial condicional).
4. El worker toma el comando, espera entre 1 y 3 segundos simulando la apertura física, y actualiza `valves.status = 'open'` y `command.status = 'applied'`.
5. La pantalla del lote se actualiza automáticamente vía **Realtime** sin recargar la app.

---

## 🚀 4. Despliegue y Puesta en Marcha

### Requisitos Previos
* **Docker Desktop** en ejecución.
* **Node.js v20+** y `npm`.
* Dispositivo móvil con la aplicación **Expo Go** instalada (o emulador Android/iOS / navegador web).

### Paso 1: Configurar Variables de Entorno (`.env`)
Crear un archivo `.env` en la raíz del proyecto tomando como plantilla `.env.example`:

```bash
cp .env.example .env
```

Configurar las credenciales de tu proyecto de Supabase:
```env
# Supabase BaaS
EXPO_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=tu_anon_publishable_key
SUPABASE_SERVICE_ROLE_KEY=tu_service_role_key_solo_backend

# Redpanda / Kafka Broker
KAFKA_BROKERS=localhost:9092

# Credenciales de Prueba Didácticas
TEST_USER_PRODUCER=productor@agropulse.test
TEST_USER_OPERATOR=operador@agropulse.test
TEST_USER_ADVISOR=asesor@agropulse.test
TEST_USER_PASSWORD=AgroPulse2026!
```

> **Nota:** La aplicación móvil en `apps/agropulse/.env` consume las variables prefijadas con `EXPO_PUBLIC_`.

### Paso 2: Configurar la Base de Datos en Supabase
Desde el panel de control de Supabase (**SQL Editor**), ejecutar secuencialmente:
1. `supabase/migrations/01_initial_schema.sql`: Crea tablas (`organizations`, `memberships`, `plots`, `stations`, `readings`, `valves`, `irrigation_commands`), índices, tipos enum, políticas **RLS** y publicaciones **Realtime**.
2. `supabase/seed.sql`: Inserta los datos del establecimiento didáctico *"Estancia Didáctica Concordia"*, sus lotes (`Costa 1`, `Costa 2`, `Monte A`), estaciones de telemetría y válvulas.

### Paso 3: Levantar Infraestructura Backend (Redpanda + Worker)
Desde la raíz del repositorio:
```powershell
docker compose -f infra/docker-compose.yml up --build -d
```

Para verificar los logs del worker y la publicación periódica de telemetría:
```powershell
docker logs -f agropulse-worker
```
Deberás observar los eventos generados por el simulador (`soil.moisture`) y persistidos en Supabase.

### Paso 4: Iniciar la Aplicación Móvil Expo
Navegar al directorio de la aplicación:
```powershell
cd apps/agropulse
npm install
npx expo start -c
```

* **Dispositivo Físico:** Escanear el código QR con la app **Expo Go** (Android / iOS).
* **Navegador Web:** Presionar la tecla `w` en la consola interactiva de Metro.

---

## 🧪 5. Usuarios de Prueba y Guía para la Demo Oral

La pantalla de inicio de sesión dispone de **botones de acceso rápido con 1 tap** para alternar de forma inmediata entre los diferentes roles definidos en la especificación:

| Usuario | Contraseña | Rol | Alcance de Permisos | Historia a Validar |
| :--- | :---: | :---: | :--- | :--- |
| **`productor@agropulse.test`** | `AgroPulse2026!` | `producer` | **Control Total:** Ver mapas, editar umbrales de lote y emitir órdenes de riego. | **H1:** Flujo Happy Path completo. |
| **`operador@agropulse.test`** | `AgroPulse2026!` | `operator` | **Operativo:** Ver lotes, abrir/cerrar válvulas y consultar historial; no edita umbrales. | Operación de válvulas en campo. |
| **`asesor@agropulse.test`** | `AgroPulse2026!` | `advisor` | **Solo Lectura:** Ver mapa, gráficos históricos y telemetría. La app desactiva y rechaza el botón de riego. | **H2:** Intento de riego bloqueado. |