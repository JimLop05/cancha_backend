//cancha_backend/config/database.js
const { Pool } = require('pg');

console.log('🚀 Iniciando conexión a PostgreSQL en modo:', process.env.NODE_ENV);

// DEBUG: Mostrar info de conexión (sin password)
if (process.env.DATABASE_URL) {
  try {
    const url = new URL(process.env.DATABASE_URL);
    console.log('🔍 Conectando a host:', url.hostname);
    console.log('🔍 Base de datos:', url.pathname.replace('/', ''));
    console.log('🔍 Usuario:', url.username);
  } catch (e) {
    console.log('🔍 DATABASE_URL no es una URL válida');
  }
} else {
  console.error('❌ ERROR: DATABASE_URL no está definida');
  console.log('❌ Variables disponibles:', Object.keys(process.env).filter(k => k.includes('DATABASE') || k.includes('DB')));
}

const poolConfig = {
  connectionString: process.env.DATABASE_URL,
};

// Solo SSL en producción
if (process.env.NODE_ENV === 'production') {
  poolConfig.ssl = { 
    rejectUnauthorized: false,
    require: true
  };
  console.log('🔐 SSL activado para producción');
}

const pool = new Pool(poolConfig);

// ✅ Conexión de prueba
(async () => {
  try {
    console.log('🔗 Intentando conexión...');
    const client = await pool.connect();
    console.log('✅ CONEXIÓN EXITOSA a PostgreSQL');
    
    // Verificar
    const dbResult = await client.query('SELECT current_database() as db, version() as version');
    console.log('📊 Base de datos:', dbResult.rows[0].db);
    console.log('🐘 PostgreSQL:', dbResult.rows[0].version.split('\n')[0]);
    
    client.release();
  } catch (err) {
    console.error('❌ ERROR de conexión PostgreSQL:');
    console.error('   Mensaje:', err.message);
    console.error('   Código:', err.code);
    console.error('   Host:', err.address || 'no especificado');
    console.error('   Puerto:', err.port || 'no especificado');
    
    // Salir si no puede conectar
    if (process.env.NODE_ENV === 'production') {
      console.error('💀 Apagando servicio por error de conexión a BD');
      process.exit(1);
    }
  }
})();

// ... resto del código igual

// ✅ Hacer una conexión inicial de prueba
(async () => {
  try {
    const client = await pool.connect();
    console.log('Conectado a la base de datos cancha_007'); // 🔥 solo una vez
    client.release();
  } catch (err) {
    console.error('❌ Error al conectar a la base de datos:', err.stack);
  }
})();

pool.on('error', (err) => {
  console.error('Error en la conexión a la base de datos:', err.stack);
});

module.exports = pool;