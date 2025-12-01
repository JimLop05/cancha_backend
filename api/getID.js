// getID.js
const express = require('express');
const pool = require('../config/database');

const router = express.Router();

// === FUNCIÓN DE RESPUESTA ESTANDARIZADA ===
const respuesta = (exito, mensaje, datos = null) => ({
  exito,
  mensaje,
  datos,
});

// ===================================================================
// =========================== MODELOS ================================
// ===================================================================

// ---------- USUARIO ----------
const getUsuarioIdNombre = async () => {
  const query = `
    SELECT 
      id_persona AS id, 
      CONCAT(nombre, ' ', apellido) AS nombre_completo
    FROM USUARIO
    ORDER BY id_persona
  `;
  const { rows } = await pool.query(query);
  return rows;
};

// ---------- ADMINISTRADOR ----------
const getAdminIdNombre = async () => {
  const query = `
    SELECT 
      a.id_administrador AS id, 
      CONCAT(COALESCE(u.nombre, ''), ' ', COALESCE(u.apellido, '')) AS nombre_completo
    FROM ADMINISTRADOR a
    JOIN USUARIO u ON a.id_administrador = u.id_persona
    ORDER BY a.id_administrador
  `;
  const { rows } = await pool.query(query);
  return rows;
};

// ---------- ADMIN_ESP_DEP ----------
const getAdminEspDepIdNombre = async () => {
  const query = `
    SELECT 
      a.id_admin_esp_dep AS id, 
      CONCAT(COALESCE(u.nombre, ''), ' ', COALESCE(u.apellido, '')) AS nombre_completo
    FROM ADMIN_ESP_DEP a
    JOIN USUARIO u ON a.id_admin_esp_dep = u.id_persona
    ORDER BY a.id_admin_esp_dep
  `;
  const { rows } = await pool.query(query);
  return rows;
};

// ---------- CLIENTE ----------
const getClienteIdNombre = async () => {
  const query = `
    SELECT 
      c.id_cliente AS id, 
      CONCAT(COALESCE(u.nombre, ''), ' ', COALESCE(u.apellido, '')) AS nombre_completo
    FROM CLIENTE c
    JOIN USUARIO u ON c.id_cliente = u.id_persona
    ORDER BY c.id_cliente
  `;
  const { rows } = await pool.query(query);
  return rows;
};

// ---------- ANFITRION ----------
const getAnfitrionIdNombre = async () => {
  const query = `
    SELECT 
      a.id_anfitrion AS id, 
      CONCAT(COALESCE(u.nombre, ''), ' ', COALESCE(u.apellido, '')) AS nombre_completo
    FROM ANFITRION a
    JOIN CLIENTE c ON a.id_anfitrion = c.id_cliente
    JOIN USUARIO u ON c.id_cliente = u.id_persona
    ORDER BY a.id_anfitrion
  `;
  const { rows } = await pool.query(query);
  return rows;
};

// ---------- INVITADO ----------
const getInvitadoIdNombre = async () => {
  const query = `
    SELECT 
      i.id_invitado AS id, 
      CONCAT(COALESCE(u.nombre, ''), ' ', COALESCE(u.apellido, '')) AS nombre_completo
    FROM INVITADO i
    JOIN CLIENTE c ON i.id_invitado = c.id_cliente
    JOIN USUARIO u ON c.id_cliente = u.id_persona
    ORDER BY i.id_invitado
  `;
  const { rows } = await pool.query(query);
  return rows;
};

// ---------- CONTROL ----------
const getControlIdNombre = async () => {
  const query = `
    SELECT 
      c.id_control AS id, 
      CONCAT(COALESCE(u.nombre, ''), ' ', COALESCE(u.apellido, '')) AS nombre_completo
    FROM CONTROL c
    JOIN USUARIO u ON c.id_control = u.id_persona
    ORDER BY c.id_control
  `;
  const { rows } = await pool.query(query);
  return rows;
};

// ---------- ENCARGADO ----------
const getEncargadoIdNombre = async () => {
  const query = `
    SELECT 
      e.id_encargado AS id, 
      CONCAT(COALESCE(u.nombre, ''), ' ', COALESCE(u.apellido, '')) AS nombre_completo
    FROM ENCARGADO e
    JOIN USUARIO u ON e.id_encargado = u.id_persona
    ORDER BY e.id_encargado
  `;
  const { rows } = await pool.query(query);
  return rows;
};

// ---------- ESPACIO_DEPORTIVO ----------
const getEspacioIdNombre = async () => {
  const query = `
    SELECT id_espacio AS id, nombre
    FROM ESPACIO_DEPORTIVO
    ORDER BY id_espacio
  `;
  const { rows } = await pool.query(query);
  return rows;
};

// ---------- CANCHA ----------
const getCanchaIdNombre = async () => {
  const query = `
    SELECT id_cancha AS id, nombre
    FROM CANCHA
    ORDER BY id_cancha
  `;
  const { rows } = await pool.query(query);
  return rows;
};

// ---------- DISCIPLINA ----------
const getDisciplinaIdNombre = async () => {
  const query = `
    SELECT id_disciplina AS id, nombre
    FROM DISCIPLINA
    ORDER BY id_disciplina
  `;
  const { rows } = await pool.query(query);
  return rows;
};

// ---------- RESERVA ----------
const getReservaIdAnfitrion = async () => {
  const query = `
    SELECT 
      r.id_reserva AS id, 
      CONCAT(COALESCE(u.nombre, ''), ' ', COALESCE(u.apellido, '')) AS nombre_completo
    FROM RESERVA r
    JOIN ANFITRION a ON r.id_anfitrion = a.id_anfitrion
    JOIN CLIENTE c ON a.id_anfitrion = c.id_cliente
    JOIN USUARIO u ON c.id_cliente = u.id_persona
    ORDER BY r.id_reserva
  `;
  const { rows } = await pool.query(query);
  return rows;
};

// ---------- RESERVA_HORARIO ----------
const getReservaHorarioIdFecha = async () => {
  const query = `
    SELECT id_horario AS id, fecha
    FROM RESERVA_HORARIO
    ORDER BY id_horario
  `;
  const { rows } = await pool.query(query);
  return rows;
};

// ---------- PAGO ----------
const getPagoIdMetodoPago = async () => {
  const query = `
    SELECT id_pago AS id, metodo_pago
    FROM PAGO
    ORDER BY id_pago
  `;
  const { rows } = await pool.query(query);
  return rows;
};

// ---------- QR_PAGO ----------
const getQrPagoIdEstado = async () => {
  const query = `
    SELECT id_qr_pago AS id, estado
    FROM QR_PAGO
    ORDER BY id_qr_pago
  `;
  const { rows } = await pool.query(query);
  return rows;
};

// ---------- REPORTE_INCIDENCIA ----------
const getReporteIdCancha = async () => {
  const query = `
    SELECT 
      ri.id_reporte AS id, 
      c.nombre AS nombre_completo
    FROM REPORTE_INCIDENCIA ri
    JOIN RESERVA r ON ri.id_reserva = r.id_reserva
    JOIN CANCHA c ON r.id_cancha = c.id_cancha
    ORDER BY ri.id_reporte
  `;
  const { rows } = await pool.query(query);
  return rows;
};

// ---------- EMPRESA ----------
const getEmpresaIdNombreSistema = async () => {
  const query = `
    SELECT id_empresa AS id, nombre_sistema
    FROM EMPRESA
    ORDER BY id_empresa
  `;
  const { rows } = await pool.query(query);
  return rows;
};

// ===================================================================
// ========================= CONTROLADORES ===========================
// ===================================================================

const crearControlador = (modeloFn, nombreEntidad) => async (req, res) => {
  try {
    const datos = await modeloFn();
    res.json(respuesta(true, `${nombreEntidad} obtenidos correctamente`, { items: datos }));
  } catch (error) {
    console.error(`Error en ${nombreEntidad}:`, error.message);
    res.status(500).json(respuesta(false, error.message));
  }
};

// ===================================================================
// ============================= RUTAS ===============================
// ===================================================================

router.get('/usuario', crearControlador(getUsuarioIdNombre, 'Usuarios'));
router.get('/administrador', crearControlador(getAdminIdNombre, 'Administradores'));
router.get('/admin-esp-dep', crearControlador(getAdminEspDepIdNombre, 'Admin Espacio Deportivo'));
router.get('/cliente', crearControlador(getClienteIdNombre, 'Clientes'));
router.get('/anfitrion', crearControlador(getAnfitrionIdNombre, 'Anfitriones'));
router.get('/invitado', crearControlador(getInvitadoIdNombre, 'Invitados'));
router.get('/control', crearControlador(getControlIdNombre, 'Controles'));
router.get('/encargado', crearControlador(getEncargadoIdNombre, 'Encargados'));
router.get('/espacio-deportivo', crearControlador(getEspacioIdNombre, 'Espacios Deportivos'));
router.get('/cancha', crearControlador(getCanchaIdNombre, 'Canchas'));
router.get('/disciplina', crearControlador(getDisciplinaIdNombre, 'Disciplinas'));
router.get('/reserva', crearControlador(getReservaIdAnfitrion, 'Reservas'));
router.get('/reserva-horario', crearControlador(getReservaHorarioIdFecha, 'Horarios de Reserva'));
router.get('/pago', crearControlador(getPagoIdMetodoPago, 'Pagos'));
router.get('/qr-pago', crearControlador(getQrPagoIdEstado, 'QR Pagos'));
router.get('/reporte-incidencia', crearControlador(getReporteIdCancha, 'Reportes de Incidencia'));
router.get('/empresa', crearControlador(getEmpresaIdNombreSistema, 'Empresas'));

// ===================================================================
// ============================= EXPORT ==============================
// ===================================================================

module.exports = router;