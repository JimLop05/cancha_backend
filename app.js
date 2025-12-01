const express = require('express');
const path = require('path');
const cors = require('cors');

// 🎯 SOLO cargar dotenv si está disponible y estamos en desarrollo
if (process.env.NODE_ENV !== 'production') {
  try {
    // Verificar si dotenv está instalado (solo en dev)
    require.resolve('dotenv');
    require('dotenv').config();
    console.log('🔧 Modo desarrollo: dotenv configurado');
  } catch (error) {
    console.log('🔧 Dotenv no disponible, usando variables del sistema');
  }
} else {
  console.log('🚀 Modo producción: usando variables de entorno de Render');
}

require('./services/expirationService');

require('./services/expirationService');

const getIDRoutes = require('./api/getID');

// En app.js - línea ~11
const controlRoutes = require('./api/admin/control'); //← Eliminar
//const controlRoutes = require('./api/roles/control');   //← Agregar
const usuarioRoutes = require('./api/admin/usuario');
const administradorRoutes = require('./api/admin/administrador');
const admin_esp_depRoutes = require('./api/admin/admin_esp_dep');
const clienteRoutes = require('./api/admin/cliente');
const anfitrionRoutes = require('./api/admin/anfitrion');
const invitadoRoutes = require('./api/admin/invitado');

const espacio_deportivoRoutes = require('./api/admin/espacio_deportivo');
const canchaRoutes = require('./api/admin/cancha');
const disciplinaRoutes = require('./api/admin/disciplina');
const reservaRoutes = require('./api/admin/reserva');
const pagoRoutes = require('./api/admin/pago');
const qr_pagoRoutes = require('./api/admin/qr_pago');
const reporte_incidenciaRoutes = require('./api/admin/reporte_incidencia');
const empresaRoutes = require('./api/admin/empresa');
const reserva_horarioRoutes = require('./api/admin/reserva_horario');

const resenaRoutes = require('./api/admin/resena');
const se_practicaRoutes = require('./api/admin/se_practica');
const adquiere_qrRoutes = require('./api/admin/adquiere_qr');

// rutas casuales
const registroRoutes = require('./api/casual/registro');
const espacio_deportivo_casualRoutes = require('./api/casual/espacio-deportivo-casual');
const cancha_espacio_casualRoutes = require('./api/casual/cancha-espacio-casual');
const cancha_casualRoutes = require('./api/casual/cancha-casual');

// rutas según roles ya definidos
const espacio_adminRoutes = require('./api/roles/espacio_admin');
const cancha_adminRoutes = require('./api/roles/cancha_admin');
const qr_controlRoutes = require('./api/roles/qr_control');
const reporte_encargadoRoutes = require('./api/roles/reporte_encargado');
const resena_clienteRoutes = require('./api/roles/resena_cliente');
const reserva_clienteRoutes = require('./api/roles/reserva_cliente');
const dashboardAdminEspDepRoutes = require('./api/roles/dashboardAdminEspDep');

const x_imagenRoutes = require('./api/x_imagen');

const app = express();

// Middlewares
app.use(cors({
  origin: "*" // IP de tu frontend Vite
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true })); // Para manejar multipart/form-data
app.use('/Uploads', express.static(path.join(__dirname, 'Uploads')));

// En app.js - después de los middlewares y antes de las rutas
// Agrega esto alrededor de la línea ~40:

// Health Check endpoint para detección automática
app.get('/health-check', (req, res) => {
  res.status(200).json({ 
    success: true,
    status: 'ok', 
    message: 'Backend CanchaQR funcionando',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// También agrega un endpoint raíz por si acaso
app.get('/', (req, res) => {
  res.json({ 
    message: 'API CanchaQR Backend',
    version: '1.0.0',
    status: 'active'
  });
});

//aqui termina el Health Check

// Rutas
try {
  app.use(`/ID`, getIDRoutes)

  app.use('/usuario', usuarioRoutes);
  app.use('/administrador', administradorRoutes);
  app.use('/admin_esp_dep', admin_esp_depRoutes);
  app.use('/control', controlRoutes);
  app.use('/cliente', clienteRoutes);
  app.use('/anfitrion', anfitrionRoutes);
  app.use('/invitado', invitadoRoutes);

  app.use('/espacio_deportivo', espacio_deportivoRoutes);
  app.use('/cancha', canchaRoutes);
  app.use('/disciplina', disciplinaRoutes);
  app.use('/reserva', reservaRoutes);
  app.use('/pago', pagoRoutes);
  app.use('/qr_pago', qr_pagoRoutes);
  app.use('/reporte_incidencia', reporte_incidenciaRoutes);
  app.use('/empresa', empresaRoutes);
  app.use('/reserva_horario', reserva_horarioRoutes);

  app.use('/resena', resenaRoutes);
  app.use('/adquiere_qr', adquiere_qrRoutes);
  app.use('/se_practica', se_practicaRoutes);

  // rutas casuales
  app.use('/espacio-deportivo-casual', espacio_deportivo_casualRoutes);
  app.use('/cancha-espacio-casual', cancha_espacio_casualRoutes);
  app.use('/cancha-casual', cancha_casualRoutes);
  app.use('/registro', registroRoutes);

  // ubicacion según roles ya definidos
  app.use('/espacio-admin', espacio_adminRoutes);
  app.use('/cancha-admin', cancha_adminRoutes);
  app.use('/qr-control', qr_controlRoutes);
  app.use('/reporte-encargado', reporte_encargadoRoutes);
  app.use('/resena-cliente', resena_clienteRoutes);
  app.use('/reserva-cliente', reserva_clienteRoutes);
  app.use('/dashboard-admin-esp-dep', dashboardAdminEspDepRoutes);

  app.use('/x_imagen', x_imagenRoutes)

} catch (err) {
  console.error('Error al cargar las rutas:', err);
  process.exit(1); // Termina el proceso si hay un error en las rutas
}

// Manejo de errores
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: 'Error interno del servidor',
  });
});

// Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log('Servidor corriendo en el puerto 3000');
});


module.exports = app;