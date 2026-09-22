require('dotenv').config();
const WebSocket = require('ws');
const { Kafka } = require('kafkajs');
const { createClient } = require('@supabase/supabase-js');

// 1. Conexión con Supabase BaaS (usando service_role key en el backend)
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('[Worker] ERROR: Faltan variables EXPO_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

// Inyección de WebSocket para Node.js < 22
const supabase = createClient(supabaseUrl, supabaseKey, {
  realtime: {
    transport: WebSocket,
  },
});

// 2. Conexión con Broker Redpanda/Kafka
const kafkaBrokers = (process.env.KAFKA_BROKERS || 'localhost:9092').split(',');
const kafka = new Kafka({
  clientId: 'agropulse-worker-simulator',
  brokers: kafkaBrokers,
  retry: {
    initialRetryTime: 1000,
    retries: 10
  }
});

const producer = kafka.producer();
const consumer = kafka.consumer({ groupId: 'agropulse-ingest-group' });

// IDs estáticos de estaciones definidas en supabase/seed.sql
const STATIONS = {
  COSTA_1: '33333333-3333-3333-3333-333333333331', // Óptimo (~32%)
  COSTA_2: '33333333-3333-3333-3333-333333333332', // Seco (~18%)
  MONTE_A: '33333333-3333-3333-3333-333333333333'  // Stale (apagado didáctico)
};

function getRandomVariation(base, delta) {
  const variation = (Math.random() * (delta * 2)) - delta;
  return Number((base + variation).toFixed(2));
}

async function startSimulator() {
  console.log('[Simulator] Iniciando bucle de publicación IoT...');

  setInterval(async () => {
    try {
      const now = new Date().toISOString();

      const payloadCosta1 = {
        station_id: STATIONS.COSTA_1,
        moisture_pct: getRandomVariation(32.0, 1.2),
        temp_c: getRandomVariation(24.5, 0.8),
        rain_mm: 0.0,
        ts: now
      };

      const payloadCosta2 = {
        station_id: STATIONS.COSTA_2,
        moisture_pct: getRandomVariation(18.0, 0.6),
        temp_c: getRandomVariation(27.0, 1.1),
        rain_mm: 0.0,
        ts: now
      };

      await producer.send({
        topic: 'soil.moisture',
        messages: [
          { key: STATIONS.COSTA_1, value: JSON.stringify(payloadCosta1) },
          { key: STATIONS.COSTA_2, value: JSON.stringify(payloadCosta2) }
        ]
      });

      console.log(`[Simulator Produced] ${now} -> Costa 1: ${payloadCosta1.moisture_pct}% | Costa 2: ${payloadCosta2.moisture_pct}%`);
    } catch (err) {
      console.error('[Simulator] Error publicando tick:', err.message);
    }
  }, 5000);
}

async function startConsumer() {
  await consumer.connect();
  await consumer.subscribe({ topic: 'soil.moisture', fromBeginning: false });

  console.log('[Consumer] Escuchando topic soil.moisture...');

  await consumer.run({
    eachMessage: async ({ message }) => {
      try {
        const data = JSON.parse(message.value.toString());

        const { error } = await supabase.from('readings').insert({
          station_id: data.station_id,
          measured_at: data.ts,
          moisture_pct: data.moisture_pct,
          temp_c: data.temp_c,
          rain_mm: data.rain_mm,
          source: 'sensor'
        });

        if (error) {
          console.error('[Consumer Upsert Error]:', error.message);
        } else {
          console.log(`[Consumer Consumed] station_id: ${data.station_id} -> Supabase DB [OK]`);
        }
      } catch (err) {
        console.error('[Consumer] Error procesando mensaje:', err.message);
      }
    }
  });
}

async function startCommandProcessor() {
  console.log('[Commands] Iniciando observador de comandos pendientes...');

  setInterval(async () => {
    try {
      const { data: commands, error } = await supabase
        .from('irrigation_commands')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(5);

      if (error || !commands || commands.length === 0) return;

      for (const cmd of commands) {
        console.log(`[Commands] Procesando comando ${cmd.id} para válvula ${cmd.valve_id} (acción: ${cmd.action})...`);

        await new Promise(res => setTimeout(res, 2000));

        const newValveStatus = cmd.action === 'open' ? 'open' : 'closed';
        await supabase
          .from('valves')
          .update({ status: newValveStatus, updated_at: new Date().toISOString() })
          .eq('id', cmd.valve_id);

        await supabase
          .from('irrigation_commands')
          .update({
            status: 'applied',
            applied_at: new Date().toISOString()
          })
          .eq('id', cmd.id);

        console.log(`[Commands] Comando ${cmd.id} aplicado con éxito -> Válvula: ${newValveStatus}`);
      }
    } catch (err) {
      console.error('[Commands] Error en bucle de comandos:', err.message);
    }
  }, 3000);
}

async function main() {
  console.log('[Worker] Iniciando AgroPulse Backend Worker...');
  try {
    await producer.connect();
    console.log('[Producer] Conectado a Redpanda exitosamente');

    await startConsumer();
    await startSimulator();
    startCommandProcessor();
  } catch (err) {
    console.error('[Worker] Error fatal al iniciar:', err);
    process.exit(1);
  }
}

main();