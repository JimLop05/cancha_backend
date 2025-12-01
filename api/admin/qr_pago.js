// routes/qr_pago.js
const express = require('express');
const pool = require('../../config/database');
const QRCode = require('qrcode');
const fs = require('fs').promises;
const path = require('path');
const { createCanvas, loadImage } = require('canvas');
const { unlinkFile } = require('../../middleware/multer');

const router = express.Router();

// Respuesta estandarizada
const respuesta = (exito, mensaje, datos = null) => ({
  exito,
  mensaje,
  datos,
});

// MODELOS - Funciones puras para operaciones de base de datos

/**
 * Obtener datos específicos de QR de pagos con información del pago y reserva
 */
const obtenerDatosEspecificos = async (limite = 10, offset = 0) => {
  try {
    const queryDatos = `
      SELECT 
        qr.id_qr_pago, qr.fecha_generado, qr.fecha_expira, qr.codigo_qr, qr.estado, qr.verificado,
        qr.link_invitacion, qr.qr_reserva, qr.qr_invitacion, qr.id_control,
        p.id_pago, p.monto, p.metodo_pago, p.fecha_pago,
        r.id_reserva, a.id_anfitrion, u.nombre AS anfitrion_nombre, u.apellido AS anfitrion_apellido,
        ca.id_cancha, ca.nombre AS cancha_nombre,
        -- Datos del control
        ctrl.id_control,
        uc.nombre AS control_nombre, 
        uc.apellido AS control_apellido,
        CONCAT(uc.nombre, ' ', uc.apellido) AS control_nombre_completo
      FROM qr_pago qr
      JOIN pago p ON qr.id_pago = p.id_pago
      JOIN reserva r ON p.id_reserva = r.id_reserva
      JOIN anfitrion a ON r.id_anfitrion = a.id_anfitrion
      JOIN cliente c ON a.id_anfitrion = c.id_cliente
      JOIN usuario u ON c.id_cliente = u.id_persona
      JOIN cancha ca ON r.id_cancha = ca.id_cancha
      LEFT JOIN control ctrl ON qr.id_control = ctrl.id_control
      LEFT JOIN usuario uc ON ctrl.id_control = uc.id_persona
      ORDER BY qr.id_qr_pago DESC
      LIMIT $1 OFFSET $2
    `;
    const queryTotal = `SELECT COUNT(*) FROM qr_pago`;
    const [resultDatos, resultTotal] = await Promise.all([
      pool.query(queryDatos, [limite, offset]),
      pool.query(queryTotal)
    ]);
    return {
      qrs: resultDatos.rows,
      total: parseInt(resultTotal.rows[0].count)
    };
  } catch (error) {
    console.error('Error en obtenerDatosEspecificos:', error);
    throw error;
  }
};

/**
 * Obtener QR de pagos con filtros
 */
const obtenerQRsFiltrados = async (tipoFiltro, limite = 10, offset = 0) => {
  try {
    const ordenesPermitidas = {
      fecha: 'qr.fecha_generado DESC',
      estado: 'qr.estado ASC',
      metodo: 'p.metodo_pago ASC',
      monto: 'p.monto DESC',
      verificado: 'qr.verificado DESC',
      default: 'qr.id_qr_pago DESC'
    };

    const orden = ordenesPermitidas[tipoFiltro] || ordenesPermitidas.default;

    const queryDatos = `
      SELECT 
        qr.id_qr_pago, qr.fecha_generado, qr.fecha_expira, qr.codigo_qr, qr.estado, qr.verificado,
        qr.link_invitacion, qr.qr_reserva, qr.qr_invitacion, qr.id_control,
        p.id_pago, p.monto, p.metodo_pago, p.fecha_pago,
        r.id_reserva, a.id_anfitrion, u.nombre AS anfitrion_nombre, u.apellido AS anfitrion_apellido,
        ca.id_cancha, ca.nombre AS cancha_nombre,
        -- Datos del control
        ctrl.id_control,
        uc.nombre AS control_nombre, 
        uc.apellido AS control_apellido,
        CONCAT(uc.nombre, ' ', uc.apellido) AS control_nombre_completo
      FROM qr_pago qr
      JOIN pago p ON qr.id_pago = p.id_pago
      JOIN reserva r ON p.id_reserva = r.id_reserva
      JOIN anfitrion a ON r.id_anfitrion = a.id_anfitrion
      JOIN cliente c ON a.id_anfitrion = c.id_cliente
      JOIN usuario u ON c.id_cliente = u.id_persona
      JOIN cancha ca ON r.id_cancha = ca.id_cancha
      LEFT JOIN control ctrl ON qr.id_control = ctrl.id_control
      LEFT JOIN usuario uc ON ctrl.id_control = uc.id_persona
      ORDER BY ${orden}
      LIMIT $1 OFFSET $2
    `;

    const queryTotal = `SELECT COUNT(*) FROM qr_pago`;

    const [resultDatos, resultTotal] = await Promise.all([
      pool.query(queryDatos, [limite, offset]),
      pool.query(queryTotal)
    ]);

    return {
      qrs: resultDatos.rows,
      total: parseInt(resultTotal.rows[0].count)
    };
  } catch (error) {
    console.error('Error en obtenerQRsFiltrados:', error);
    throw new Error(`Error al obtener QRs filtrados: ${error.message}`);
  }
};

/**
 * Buscar QR de pagos por texto
 */
const buscarQRs = async (texto, limite = 10, offset = 0) => {
  try {
    const queryDatos = `
      SELECT 
        qr.id_qr_pago, qr.fecha_generado, qr.fecha_expira, qr.codigo_qr, qr.estado, qr.verificado,
        qr.id_control,
        p.id_pago, p.monto, p.metodo_pago,
        r.id_reserva, u.nombre AS anfitrion_nombre, ca.nombre AS cancha_nombre,
        -- Datos del control
        uc.nombre AS control_nombre, 
        uc.apellido AS control_apellido,
        CONCAT(uc.nombre, ' ', uc.apellido) AS control_nombre_completo
      FROM qr_pago qr
      JOIN pago p ON qr.id_pago = p.id_pago
      JOIN reserva r ON p.id_reserva = r.id_reserva
      JOIN anfitrion a ON r.id_anfitrion = a.id_anfitrion
      JOIN cliente c ON a.id_anfitrion = c.id_cliente
      JOIN usuario u ON c.id_cliente = u.id_persona
      JOIN cancha ca ON r.id_cancha = ca.id_cancha
      LEFT JOIN control ctrl ON qr.id_control = ctrl.id_control
      LEFT JOIN usuario uc ON ctrl.id_control = uc.id_persona
      WHERE 
        qr.codigo_qr ILIKE $1 OR 
        u.nombre ILIKE $1 OR 
        u.apellido ILIKE $1 OR 
        ca.nombre ILIKE $1 OR
        p.metodo_pago::text ILIKE $1 OR
        uc.nombre ILIKE $1 OR
        uc.apellido ILIKE $1
      ORDER BY qr.fecha_generado DESC
      LIMIT $2 OFFSET $3
    `;

    const queryTotal = `
      SELECT COUNT(*) 
      FROM qr_pago qr
      JOIN pago p ON qr.id_pago = p.id_pago
      JOIN reserva r ON p.id_reserva = r.id_reserva
      JOIN anfitrion a ON r.id_anfitrion = a.id_anfitrion
      JOIN cliente c ON a.id_anfitrion = c.id_cliente
      JOIN usuario u ON c.id_cliente = u.id_persona
      JOIN cancha ca ON r.id_cancha = ca.id_cancha
      LEFT JOIN control ctrl ON qr.id_control = ctrl.id_control
      LEFT JOIN usuario uc ON ctrl.id_control = uc.id_persona
      WHERE 
        qr.codigo_qr ILIKE $1 OR 
        u.nombre ILIKE $1 OR 
        u.apellido ILIKE $1 OR 
        ca.nombre ILIKE $1 OR
        p.metodo_pago::text ILIKE $1 OR
        uc.nombre ILIKE $1 OR
        uc.apellido ILIKE $1
    `;
    
    const sanitizeInput = (input) => input.replace(/[%_\\]/g, '\\$&');
    const terminoBusqueda = `%${sanitizeInput(texto)}%`;
    
    const [resultDatos, resultTotal] = await Promise.all([
      pool.query(queryDatos, [terminoBusqueda, limite, offset]),
      pool.query(queryTotal, [terminoBusqueda])
    ]);

    return {
      qrs: resultDatos.rows,
      total: parseInt(resultTotal.rows[0].count)
    };
  } catch (error) {
    console.error('Error en buscarQRs:', error);
    throw error;
  }
};

/**
 * Obtener QR de pago por ID
 */
const obtenerQRPorId = async (id) => {
  try {
    const query = `
      SELECT 
        qr.*, 
        p.id_pago, p.monto, p.metodo_pago, p.fecha_pago, p.fecha_limite,
        r.id_reserva, a.id_anfitrion, u.nombre AS anfitrion_nombre, u.apellido AS anfitrion_apellido,
        ca.id_cancha, ca.nombre AS cancha_nombre,
        -- Datos del control
        ctrl.id_control,
        uc.nombre AS control_nombre, 
        uc.apellido AS control_apellido,
        CONCAT(uc.nombre, ' ', uc.apellido) AS control_nombre_completo
      FROM qr_pago qr
      JOIN pago p ON qr.id_pago = p.id_pago
      JOIN reserva r ON p.id_reserva = r.id_reserva
      JOIN anfitrion a ON r.id_anfitrion = a.id_anfitrion
      JOIN cliente c ON a.id_anfitrion = c.id_cliente
      JOIN usuario u ON c.id_cliente = u.id_persona
      JOIN cancha ca ON r.id_cancha = ca.id_cancha
      LEFT JOIN control ctrl ON qr.id_control = ctrl.id_control
      LEFT JOIN usuario uc ON ctrl.id_control = uc.id_persona
      WHERE qr.id_qr_pago = $1
    `;
    const result = await pool.query(query, [id]);
    return result.rows[0] || null;
  } catch (error) {
    console.error('Error en obtenerQRPorId:', error);
    throw error;
  }
};









// ====================
// GENERACIÓN DE QR CON TÍTULO
// ====================
const generarQRConTitulo = async (textoQR, titulo, filePath) => {
  const qrSize = 300;
  const padding = 40;
  const fontSize = 24;
  const canvasWidth = qrSize + padding * 2;
  const canvasHeight = qrSize + padding * 3 + fontSize;

  const canvas = createCanvas(canvasWidth, canvasHeight);
  const ctx = canvas.getContext('2d');

  // Fondo
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // Título
  ctx.fillStyle = 'black';
  ctx.font = `bold ${fontSize}px Arial`;
  ctx.textAlign = 'center';
  ctx.fillText(titulo, canvasWidth / 2, padding + fontSize / 2);

  // Generar QR como DataURL
  const qrDataUrl = await QRCode.toDataURL(textoQR, {
    width: qrSize,
    margin: 1,
    color: { dark: '#000000', light: '#FFFFFF' }
  });

  const qrImage = await loadImage(qrDataUrl);
  ctx.drawImage(qrImage, padding, padding + fontSize + 10, qrSize, qrSize);

  const buffer = canvas.toBuffer('image/png');
  await fs.writeFile(filePath, buffer);
};

// ====================
// MODELOS
// ====================

/**
 * Obtener control aleatorio activo
 */
const obtenerControlAleatorio = async (client) => {
  const res = await client.query(`
    SELECT id_control 
    FROM control 
    WHERE estado = TRUE 
    ORDER BY RANDOM() 
    LIMIT 1
  `);
  if (!res.rows[0]) throw new Error('No hay controles activos');
  return res.rows[0].id_control;
};

/**
 * Obtener fecha de fin del horario de la reserva
 */
const obtenerFechaExpiraReserva = async (client, id_reserva) => {
  const res = await client.query(`
    SELECT rh.fecha, rh.hora_fin 
    FROM reserva_horario rh 
    WHERE rh.id_reserva = $1 
    ORDER BY rh.fecha, rh.hora_inicio 
    LIMIT 1
  `, [id_reserva]);

  if (!res.rows[0]) throw new Error('No se encontró horario de reserva');
  const { fecha, hora_fin } = res.rows[0];
  const [h, m] = hora_fin.split(':');
  const fechaExpira = new Date(fecha);
  fechaExpira.setHours(parseInt(h), parseInt(m), 0, 0);
  return fechaExpira;
};

/**
 * Generar código de invitación único
 */
const generarCodigoInvitacion = () => {
  return 'INV' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5).toUpperCase();
};

/**
 * Generar QRs de reserva e invitación
 */
const generarQRsParaPago = async (client, id_pago, id_reserva) => {
  try {
    const id_control = await obtenerControlAleatorio(client);
    const fechaExpira = await obtenerFechaExpiraReserva(client, id_reserva);

    const codigo_qr = `RES_${id_reserva}_P${id_pago}_${Date.now()}`;
    const codigo_invitacion = generarCodigoInvitacion();

    const urlReserva = `http://localhost:5173/verificar/qr/${codigo_qr}`;
    const urlInvitacion = `http://localhost:5173/invitado/reserva/${codigo_invitacion}`;

    const uploadPath = path.join(__dirname, '../../Uploads', 'qr_pagos');
    await fs.mkdir(uploadPath, { recursive: true });

    const filenameReserva = `qr_reserva_${id_pago}.png`;
    const filenameInvitacion = `qr_invitacion_${id_pago}.png`;
    const pathReserva = path.join(uploadPath, filenameReserva);
    const pathInvitacion = path.join(uploadPath, filenameInvitacion);

    await Promise.all([
      generarQRConTitulo(urlReserva, 'QR RESERVA', pathReserva),
      generarQRConTitulo(urlInvitacion, 'QR INVITACIÓN', pathInvitacion)
    ]);

    const qrRes = await client.query(
      `INSERT INTO qr_pago (
        fecha_generado, fecha_expira, codigo_qr, estado, id_control, verificado,
        link_invitacion, qr_reserva, qr_invitacion, id_pago
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id_qr_pago, codigo_qr, link_invitacion, qr_reserva, qr_invitacion`,
      [
        new Date().toISOString(),
        fechaExpira.toISOString(),
        codigo_qr,
        'activo',
        id_control,
        false,
        urlInvitacion,
        `/Uploads/qr_pagos/${filenameReserva}`,
        `/Uploads/qr_pagos/${filenameInvitacion}`,
        id_pago
      ]
    );

    return {
      ...qrRes.rows[0],
      codigo_invitacion
    };
  } catch (error) {
    throw new Error(`Error al generar QRs: ${error.message}`);
  }
};

/**
 * Crear QR de pago (solo si no existe)
 */
const crearQR = async (datos) => {
  const client = await pool.connect();
  let paths = [];

  try {
    await client.query('BEGIN');

    const { id_pago } = datos;
    if (!id_pago) throw new Error('id_pago es obligatorio');

    // Validar pago
    const pagoRes = await client.query('SELECT id_reserva FROM pago WHERE id_pago = $1', [id_pago]);
    if (!pagoRes.rows[0]) throw new Error('Pago no existe');
    const { id_reserva } = pagoRes.rows[0];

    // Evitar duplicados
    const existe = await client.query('SELECT 1 FROM qr_pago WHERE id_pago = $1', [id_pago]);
    if (existe.rows[0]) throw new Error('Ya existe un QR para este pago');

    const qrGenerado = await generarQRsParaPago(client, id_pago, id_reserva);
    await client.query('COMMIT');

    return qrGenerado;
  } catch (error) {
    await client.query('ROLLBACK');
    // Limpiar archivos si se generaron
    for (const p of paths) {
      await unlinkFile(p).catch(() => {});
    }
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Actualizar QR de pago (solo campos permitidos)
 */
const actualizarQR = async (id, campos) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const camposPermitidos = ['fecha_expira', 'estado', 'id_control', 'verificado', 'link_invitacion'];
    const camposValidos = Object.keys(campos).filter(k => camposPermitidos.includes(k));

    if (camposValidos.length === 0) throw new Error('No hay campos válidos para actualizar');

    // Validaciones
    if (campos.estado && !['activo', 'expirado', 'usado'].includes(campos.estado)) {
      throw new Error('Estado inválido');
    }
    if (campos.id_control) {
      const res = await client.query('SELECT 1 FROM control WHERE id_control = $1', [campos.id_control]);
      if (!res.rows[0]) throw new Error('Control no existe');
    }

    const setClause = camposValidos.map((c, i) => `${c} = $${i + 1}`).join(', ');
    const values = camposValidos.map(c => campos[c]);

    const result = await client.query(
      `UPDATE qr_pago SET ${setClause} WHERE id_qr_pago = $${camposValidos.length + 1} RETURNING *`,
      [...values, id]
    );

    if (!result.rows[0]) throw new Error('QR no encontrado');

    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Eliminar QR y archivos asociados
 */
const eliminarQR = async (id) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const qr = await client.query('SELECT qr_reserva, qr_invitacion FROM qr_pago WHERE id_qr_pago = $1', [id]);
    if (!qr.rows[0]) throw new Error('QR no encontrado');

    await client.query('DELETE FROM qr_pago WHERE id_qr_pago = $1', [id]);

    const paths = [
      path.join(__dirname, '../../', qr.rows[0].qr_reserva),
      path.join(__dirname, '../../', qr.rows[0].qr_invitacion)
    ].filter(Boolean);

    await client.query('COMMIT');

    // Eliminar archivos
    for (const p of paths) {
      await unlinkFile(p).catch(() => {});
    }

    return { id_qr_pago: id };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Obtener reportes de incidencia por ID de encargado (mismos campos que /datos-especificos)
 */
const obtenerReportesPorEncargado = async (id_encargado, limite = 10, offset = 0) => {
  try {
    const queryDatos = `
      SELECT ri.id_reporte, ri.detalle, ri.sugerencia, ri.verificado,
             e.id_encargado, p_e.nombre AS encargado_nombre, p_e.apellido AS encargado_apellido,
             r.id_reserva, a.id_anfitrion, p_c.nombre AS cliente_nombre, p_c.apellido AS cliente_apellido,
             ca.id_cancha, ca.nombre AS cancha_nombre
      FROM reporte_incidencia ri
      JOIN encargado e ON ri.id_encargado = e.id_encargado
      JOIN usuario p_e ON e.id_encargado = p_e.id_persona
      JOIN reserva r ON ri.id_reserva = r.id_reserva
      JOIN anfitrion a ON r.id_anfitrion = a.id_anfitrion
      JOIN cliente c ON a.id_anfitrion = c.id_cliente
      JOIN usuario p_c ON c.id_cliente = p_c.id_persona
      JOIN cancha ca ON r.id_cancha = ca.id_cancha
      WHERE ri.id_encargado = $1
      ORDER BY ri.id_reporte
      LIMIT $2 OFFSET $3
    `;
    const queryTotal = `
      SELECT COUNT(*) FROM reporte_incidencia WHERE id_encargado = $1
    `;
    const [resultDatos, resultTotal] = await Promise.all([
      pool.query(queryDatos, [id_encargado, limite, offset]),
      pool.query(queryTotal, [id_encargado])
    ]);
    return {
      reportes: resultDatos.rows,
      total: parseInt(resultTotal.rows[0].count)
    };
  } catch (error) {
    console.error('Error en obtenerReportesPorEncargado:', error);
    throw error;
  }
};

/**
 * Obtener QR de pago por ID de reserva (mismos campos que por id_qr_pago)
 */
const obtenerQRPorReserva = async (id_reserva) => {
  try {
    const query = `
      SELECT 
        qr.*, 
        p.id_pago, p.monto, p.metodo_pago, p.fecha_pago, p.fecha_limite,
        r.id_reserva, a.id_anfitrion, u.nombre AS anfitrion_nombre, u.apellido AS anfitrion_apellido,
        ca.id_cancha, ca.nombre AS cancha_nombre,
        -- Datos del control
        ctrl.id_control,
        uc.nombre AS control_nombre, 
        uc.apellido AS control_apellido,
        CONCAT(uc.nombre, ' ', uc.apellido) AS control_nombre_completo
      FROM qr_pago qr
      JOIN pago p ON qr.id_pago = p.id_pago
      JOIN reserva r ON p.id_reserva = r.id_reserva
      JOIN anfitrion a ON r.id_anfitrion = a.id_anfitrion
      JOIN cliente c ON a.id_anfitrion = c.id_cliente
      JOIN usuario u ON c.id_cliente = u.id_persona
      JOIN cancha ca ON r.id_cancha = ca.id_cancha
      LEFT JOIN control ctrl ON qr.id_control = ctrl.id_control
      LEFT JOIN usuario uc ON ctrl.id_control = uc.id_persona
      WHERE r.id_reserva = $1
    `;
    const result = await pool.query(query, [id_reserva]);
    return result.rows[0] || null;
  } catch (error) {
    console.error('Error en obtenerQRPorReserva:', error);
    throw error;
  }
};









// CONTROLADORES

const obtenerDatosEspecificosController = async (req, res) => {
  try {
    const limite = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;
    const { qrs, total } = await obtenerDatosEspecificos(limite, offset);
    res.json(respuesta(true, 'QRs de pago obtenidos', { qrs, paginacion: { limite, offset, total } }));
  } catch (error) {
    res.status(500).json(respuesta(false, error.message));
  }
};

const obtenerQRsFiltradosController = async (req, res) => {
  try {
    const { tipo } = req.query;
    const limite = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;
    const validos = ['fecha', 'estado', 'metodo', 'monto', 'verificado'];
    if (!tipo || !validos.includes(tipo)) {
      return res.status(400).json(respuesta(false, 'Tipo de filtro inválido'));
    }
    const { qrs, total } = await obtenerQRsFiltrados(tipo, limite, offset);
    res.json(respuesta(true, `Filtrado por ${tipo}`, { qrs, filtro: tipo, paginacion: { limite, offset, total } }));
  } catch (error) {
    res.status(500).json(respuesta(false, error.message));
  }
};

const buscarQRsController = async (req, res) => {
  try {
    const { q } = req.query;
    const limite = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;
    if (!q) return res.status(400).json(respuesta(false, 'Parámetro q requerido'));
    const { qrs, total } = await buscarQRs(q, limite, offset);
    res.json(respuesta(true, 'Búsqueda completada', { qrs, paginacion: { limite, offset, total } }));
  } catch (error) {
    res.status(500).json(respuesta(false, error.message));
  }
};

const obtenerQRPorIdController = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || isNaN(id)) return res.status(400).json(respuesta(false, 'ID inválido'));
    const qr = await obtenerQRPorId(parseInt(id));
    if (!qr) return res.status(404).json(respuesta(false, 'QR no encontrado'));
    res.json(respuesta(true, 'QR obtenido', { qr }));
  } catch (error) {
    res.status(500).json(respuesta(false, error.message));
  }
};

// ====================
// CONTROLADORES
// ====================

const crearQRController = async (req, res) => {
  try {
    const { id_pago } = req.body;
    if (!id_pago) return res.status(400).json(respuesta(false, 'id_pago es obligatorio'));

    const qr = await crearQR({ id_pago: parseInt(id_pago) });
    res.status(201).json(respuesta(true, 'QR generado con éxito', { qr }));
  } catch (error) {
    res.status(400).json(respuesta(false, error.message));
  }
};

const actualizarQRController = async (req, res) => {
  try {
    const { id } = req.params;
    const campos = req.body;
    if (Object.keys(campos).length === 0) {
      return res.status(400).json(respuesta(false, 'No hay campos para actualizar'));
    }

    const actualizado = await actualizarQR(parseInt(id), campos);
    res.json(respuesta(true, 'QR actualizado', { qr: actualizado }));
  } catch (error) {
    res.status(500).json(respuesta(false, error.message));
  }
};

const eliminarQRController = async (req, res) => {
  try {
    const { id } = req.params;
    await eliminarQR(parseInt(id));
    res.json(respuesta(true, 'QR eliminado correctamente'));
  } catch (error) {
    res.status(500).json(respuesta(false, error.message));
  }
};

const obtenerQRsControlController = async (req, res) => {
  try {
    const { id_control } = req.params;
    if (!id_control || isNaN(id_control)) {
      return res.status(400).json(respuesta(false, 'ID de control inválido'));
    }
    const limite = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;
    const { qrs, total } = await obtenerQRsPorControl(parseInt(id_control), limite, offset);
    res.json(respuesta(true, 'QRs gestionados por el control obtenidos', {
      qrs,
      paginacion: { limite, offset, total }
    }));
  } catch (error) {
    res.status(500).json(respuesta(false, error.message));
  }
};

const obtenerQRPorReservaController = async (req, res) => {
  try {
    const { id_reserva } = req.params;
    if (!id_reserva || isNaN(id_reserva)) {
      return res.status(400).json(respuesta(false, 'ID de reserva inválido'));
    }

    const qr = await obtenerQRPorReserva(parseInt(id_reserva));
    if (!qr) {
      return res.status(404).json(respuesta(false, 'No se encontró QR para esta reserva'));
    }

    // ← CLAVE: devolver qr directamente, no dentro de { qr }
    res.json(respuesta(true, 'QR de reserva obtenido', qr));
  } catch (error) {
    res.status(500).json(respuesta(false, error.message));
  }
};



// RUTAS
router.get('/datos-especificos', obtenerDatosEspecificosController);
router.get('/filtro', obtenerQRsFiltradosController);
router.get('/buscar', buscarQRsController);
router.get('/dato-individual/:id', obtenerQRPorIdController);

router.post('/', crearQRController);
router.patch('/:id', actualizarQRController);
router.delete('/:id', eliminarQRController);

router.get('/datos-segun-rol/:id_control', obtenerQRsControlController);
router.get('/qr-reserva/:id_reserva', obtenerQRPorReservaController);

module.exports = router;