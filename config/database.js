//cancha_backend/config/database.js
const { Pool } = require('pg');

const pool = new Pool({
  //user: process.env.DB_USER || 'postgres',
  //host: process.env.DB_HOST || 'localhost',
  //database: 'cancha_007',
  //password: process.env.DB_PASSWORD || 'Queonda123',
  //port: process.env.DB_PORT || 5432,
  //Agregado
    connectionString: process.env.DATABASE_URL || 'postgresql://postgrase:Queonda123@localhost:5432/cancha_007',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

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