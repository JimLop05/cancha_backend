const { Pool } = require('pg');

console.log('🔍 DATABASE_URL:', process.env.DATABASE_URL ? 'DEFINIDA' : 'NO DEFINIDA');
console.log('🔍 NODE_ENV:', process.env.NODE_ENV);

const poolConfig = {
  connectionString: process.env.DATABASE_URL,
};

// Solo en producción agregar SSL
if (process.env.NODE_ENV === 'production') {
  poolConfig.ssl = { rejectUnauthorized: false };
  console.log('🔍 SSL configurado para producción');
}

const pool = new Pool(poolConfig);

// ✅ Hacer una conexión inicial de prueba
(async () => {
  try {
    console.log('🔍 Intentando conectar a PostgreSQL...');
    const client = await pool.connect();
    console.log('✅ Conectado a la base de datos cancha_007 en producción');
    client.release();
  } catch (err) {
    console.error('❌ Error al conectar a la base de datos:', err.message);
    console.error('❌ Detalles:', err);
  }
})();

pool.on('error', (err) => {
  console.error('Error en la conexión a la base de datos:', err.stack);
});

module.exports = pool;