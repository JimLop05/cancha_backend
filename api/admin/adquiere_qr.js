//cancha_backend/api/admin/adquiere_qr.js
const express = require('express');
const pool = require('../../config/database');
const { createCanvas, loadImage } = require('canvas');
const crypto = require('crypto');
const { unlinkFile, createUploadAndProcess } = require('../../middleware/multer');
const QRCode = require('qrcode'); 

const router = express.Router();

// Función de respuesta estandarizada
const respuesta = (exito, mensaje, datos = null) => ({
  exito,
  mensaje,
  datos,
});

// MODELOS - Funciones puras para operaciones de base de datos

/**
 * Obtener datos de los invitados de una reserva específica con información adicional
 */
const obtenerDatosDeMisInvitados = async (id_reserva) => {
  try {
    // Query principal para obtener los invitados
    const queryInvitados = `
      SELECT 
        u.nombre,
        u.apellido,
        u.id_persona,
        aq.fecha_confirmacion,
        aq.estado_asistencia,
        aq.codigo_invitacion
      FROM adquiere_qr aq
      JOIN invitado i ON aq.id_invitado = i.id_invitado
      JOIN usuario u ON i.id_invitado = u.id_persona
      WHERE aq.id_reserva = $1
      ORDER BY aq.fecha_confirmacion DESC, u.nombre ASC
    `;
    
    // Query para obtener información de la reserva y cancha
    const queryReservaCancha = `
      SELECT 
        r.cupo,
        c.capacidad,
        c.nombre as nombre_cancha
      FROM reserva r
      JOIN cancha c ON r.id_cancha = c.id_cancha
      WHERE r.id_reserva = $1
    `;

    // Ejecutar ambas consultas en paralelo
    const [resultInvitados, resultReservaCancha] = await Promise.all([
      pool.query(queryInvitados, [id_reserva]),
      pool.query(queryReservaCancha, [id_reserva])
    ]);

    return {
      invitados: resultInvitados.rows,
      cupo_reserva: resultReservaCancha.rows[0]?.cupo || 0,
      capacidad_cancha: resultReservaCancha.rows[0]?.capacidad || 0,
      nombre_cancha: resultReservaCancha.rows[0]?.nombre_cancha || 'Cancha no encontrada'
    };

  } catch (error) {
    console.error('Error en obtenerDatosDeMisInvitados:', error);
    throw error;
  }
};

/**
 * Obtener nombre de usuario (alias)
 */
const obtenerUsuarioAlias = async (id_usuario) => {
  try {
    const query = 'SELECT usuario FROM usuario WHERE id_persona = $1';
    const result = await pool.query(query, [id_usuario]);
    return result.rows[0]?.usuario || null;
  } catch (error) {
    throw error;
  }
};

/**
 * Generar código de invitación único
 */
const generarCodigoInvitacionUnico = async () => {
  let codigoUnico = false;
  let codigo;
  let intentos = 0;
  const maxIntentos = 10;

  while (!codigoUnico && intentos < maxIntentos) {
    const randomBytes = crypto.randomBytes(8).toString('hex');
    codigo = `Inv${randomBytes}`.toUpperCase();
    
    const result = await pool.query(
      'SELECT 1 FROM adquiere_qr WHERE codigo_invitacion = $1',
      [codigo]
    );
    
    if (!result.rows[0]) {
      codigoUnico = true;
    }
    intentos++;
  }

  if (!codigoUnico) {
    throw new Error('No se pudo generar un código único después de varios intentos');
  }

  return codigo;
};





/**
 * Generar QR real con la librería qrcode y guardar - CON TEXTOS ADICIONALES
 */
const generarYGuardarQR = async (codigo_invitacion, usuarioAlias, nombreCancha) => {
  try {
    // Generar QR real con los datos codificados
    const qrData = {
      tipo: "invitacion_personal",
      codigo: codigo_invitacion,
      usuario: usuarioAlias,
      timestamp: new Date().toISOString()
    };

    const qrDataString = JSON.stringify(qrData);
    
    // Crear canvas con espacio para título, QR y textos adicionales
    const qrSize = 280; // Tamaño del QR (reducido para dar espacio a textos)
    const titleHeight = 40; // Espacio para el título
    const textHeight = 60; // Espacio para los textos adicionales
    const totalHeight = qrSize + titleHeight + textHeight - 35;
    
    const canvas = createCanvas(qrSize, totalHeight);
    const ctx = canvas.getContext('2d');

    // Fondo blanco
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // ========== TÍTULO SUPERIOR ==========
    // Título en la parte superior
    ctx.fillStyle = '#333333';
    ctx.font = 'bold 18px Arial'; // TAMAÑO: 18px bold
    ctx.textAlign = 'center';
    ctx.fillText(`QR para @${usuarioAlias}`, canvas.width / 2, 25);

    // ========== CÓDIGO QR ==========
    // Generar el QR como data URL
    const qrDataURL = await QRCode.toDataURL(qrDataString, {
      width: qrSize - 40, // Más pequeño para mejor legibilidad
      margin: 1,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });

    // Cargar el QR generado en el canvas - justo debajo del título
    const qrImage = await loadImage(qrDataURL);
    ctx.drawImage(qrImage, 20, titleHeight, qrSize - 40, qrSize - 40);

    // ========== TEXTO INFORMATIVO ==========
    const qrBottom = titleHeight + qrSize - 40; // Posición debajo del QR
    
    // Texto 1: "Muestra a personal de Control..."
    ctx.fillStyle = '#2c3e50';
    ctx.font = 'bold 12px Arial'; // TAMAÑO: 12px bold
    ctx.textAlign = 'center';
    ctx.fillText(`Muestra al personal de Control para entrar a`, canvas.width / 2, qrBottom + 20);
    
    // Nombre de la cancha
    ctx.fillStyle = '#571811ff';
    ctx.font = 'bold 12px Arial'; // TAMAÑO: 14px bold (más grande para destacar)
    ctx.fillText(nombreCancha, canvas.width / 2, qrBottom + 35);

    // ========== FECHA ==========
    ctx.fillStyle = '#7f8c8d';
    ctx.font = '10px Arial'; // TAMAÑO: 10px normal
    const fecha = new Date().toLocaleDateString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
    ctx.fillText(`Generado: ${fecha}`, canvas.width / 2, qrBottom + 50);

    // Guardar el archivo
    const fs = require('fs');
    const path = require('path');
    const crypto = require('crypto');
    
    const timestamp = Date.now();
    const randomHash = crypto.randomBytes(4).toString('hex');
    const nombreArchivo = `qr_${timestamp}_${randomHash}.png`;
    
    const uploadsDir = path.join(__dirname, '../../Uploads/adquiere_qr');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    
    const filePath = path.join(uploadsDir, nombreArchivo);
    
    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(filePath, buffer);

    return `/Uploads/adquiere_qr/${nombreArchivo}`;

  } catch (error) {
    console.error('❌ Error generando QR real:', error);
    throw error;
  }
};

/**
 * Crear invitación automática completa
 */
const crearInvitacionCompleta = async (id_reserva, id_usuario) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Verificar que el usuario existe y es/crear invitado
    const id_invitado = await verificarUsuarioInvitado(id_usuario);

    // 2. Verificar que la reserva existe
    const reservaExiste = await client.query(
      'SELECT 1 FROM reserva WHERE id_reserva = $1', 
      [id_reserva]
    );
    if (!reservaExiste.rows[0]) {
      throw new Error('La reserva no existe');
    }

    // 3. Verificar que no existe ya una relación
    const relacionExistente = await client.query(
      'SELECT 1 FROM adquiere_qr WHERE id_invitado = $1 AND id_reserva = $2',
      [id_invitado, id_reserva]
    );
    if (relacionExistente.rows[0]) {
      throw new Error('El usuario ya tiene una invitación para esta reserva');
    }

    // 4. Obtener información del usuario para el QR - AHORA USAMOS EL ALIAS
    const usuarioAlias = await obtenerUsuarioAlias(id_usuario);
    if (!usuarioAlias) {
      throw new Error('No se pudo obtener el alias del usuario');
    }

    // 4.1 Obtener nombre de la cancha para el QR
    const nombreCancha = await obtenerNombreCancha(id_reserva);

    // 5. Obtener control aleatorio
    const id_control = await obtenerControlAleatorio();

    // 6. Obtener fecha_expiracion de la reserva
    const fecha_expiracion = await obtenerFechaExpiracionReserva(id_reserva);
    if (!fecha_expiracion) {
      throw new Error('No se pudo obtener la fecha de expiración de la reserva');
    }

    // 7. Generar código de invitación único
    const codigo_invitacion = await generarCodigoInvitacionUnico();

    // 8. Generar y guardar QR automáticamente - CON EL ALIAS Y NOMBRE DE CANCHA
    const qr_invitacion_path = await generarYGuardarQR(codigo_invitacion, usuarioAlias, nombreCancha);

    // 9. Insertar en la tabla adquiere_qr
    const query = `
      INSERT INTO adquiere_qr (
        id_invitado, 
        id_reserva, 
        id_control, 
        fecha_confirmacion, 
        fecha_expiracion, 
        qr_invitacion, 
        codigo_invitacion, 
        estado_asistencia
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;

    const values = [
      id_invitado,
      id_reserva,
      id_control,
      new Date(),
      fecha_expiracion,
      qr_invitacion_path,
      codigo_invitacion,
      'pendiente'
    ];

    const result = await client.query(query, values);
    await client.query('COMMIT');
    
    return result.rows[0];

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const obtenerControlAleatorio = async () => {
  try {
    const query = `
      SELECT id_control 
      FROM control 
      WHERE estado = true 
      ORDER BY RANDOM() 
      LIMIT 1
    `;
    const result = await pool.query(query);
    return result.rows[0]?.id_control || null;
  } catch (error) {
    throw error;
  }
};

const obtenerFechaExpiracionReserva = async (id_reserva) => {
  try {
    const query = 'SELECT fecha_expiracion FROM reserva WHERE id_reserva = $1';
    const result = await pool.query(query, [id_reserva]);
    return result.rows[0]?.fecha_expiracion || null;
  } catch (error) {
    throw error;
  }
};

/**
 * Verificar si el usuario es invitado, y si no existe CREARLO
 */
const verificarUsuarioInvitado = async (id_usuario) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Primero verificar si el usuario existe en CLIENTE
    const clienteExiste = await client.query(
      'SELECT 1 FROM cliente WHERE id_cliente = $1',
      [id_usuario]
    );

    if (!clienteExiste.rows[0]) {
      throw new Error('El usuario no existe en la tabla cliente');
    }

    // 2. Verificar si ya existe en INVITADO
    const invitadoExiste = await client.query(
      'SELECT id_invitado FROM invitado WHERE id_invitado = $1',
      [id_usuario]
    );

    let id_invitado;

    if (invitadoExiste.rows[0]) {
      // Ya existe, devolver el ID
      id_invitado = invitadoExiste.rows[0].id_invitado;
      
      // Actualizar fecha_ultima_invitacion
      await client.query(
        'UPDATE invitado SET fecha_ultima_invitacion = $1, estado_activo = true WHERE id_invitado = $2',
        [new Date(), id_invitado]
      );
    } else {
      // No existe, CREAR registro en INVITADO
      const queryInsertInvitado = `
        INSERT INTO invitado (
          id_invitado, 
          fecha_ultima_invitacion, 
          estado_activo, 
          estado_preferencia
        ) VALUES ($1, $2, $3, $4)
        RETURNING id_invitado
      `;

      const values = [
        id_usuario,
        new Date(), // fecha_ultima_invitacion
        true,       // estado_activo
        'activo'    // estado_preferencia
      ];

      const result = await client.query(queryInsertInvitado, values);
      id_invitado = result.rows[0].id_invitado;
    }

    await client.query('COMMIT');
    return id_invitado;

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Obtener nombre de la cancha desde la reserva
 */
const obtenerNombreCancha = async (id_reserva) => {
  try {
    const query = `
      SELECT ca.nombre 
      FROM reserva r
      JOIN cancha ca ON r.id_cancha = ca.id_cancha
      WHERE r.id_reserva = $1
    `;
    const result = await pool.query(query, [id_reserva]);
    return result.rows[0]?.nombre || 'Cancha Desconocida';
  } catch (error) {
    console.error('Error obteniendo nombre de cancha:', error);
    return 'Cancha Desconocida';
  }
};







/**
 * Obtener datos específicos de relaciones adquiere_qr
 */
const obtenerDatosEspecificos = async (limite = 10, offset = 0) => {
  try {
    const queryDatos = `
      SELECT 
        adq.id_invitado, adq.id_reserva, adq.fecha_confirmacion, adq.qr_invitacion,
        i.id_invitado, u_i.nombre AS invitado_nombre, u_i.apellido AS invitado_apellido,
        r.id_reserva, a.id_anfitrion, u_a.nombre AS anfitrion_nombre, u_a.apellido AS anfitrion_apellido,
        ca.id_cancha, ca.nombre AS cancha_nombre,
        ctrl.id_control
      FROM adquiere_qr adq
      JOIN invitado i ON adq.id_invitado = i.id_invitado
      JOIN usuario u_i ON i.id_invitado = u_i.id_persona
      JOIN reserva r ON adq.id_reserva = r.id_reserva
      JOIN anfitrion a ON r.id_anfitrion = a.id_anfitrion
      JOIN cliente c ON a.id_anfitrion = c.id_cliente
      JOIN usuario u_a ON c.id_cliente = u_a.id_persona
      JOIN cancha ca ON r.id_cancha = ca.id_cancha
      LEFT JOIN control ctrl ON adq.id_control = ctrl.id_control
      ORDER BY adq.id_invitado, adq.id_reserva
      LIMIT $1 OFFSET $2
    `;
    const queryTotal = `SELECT COUNT(*) FROM adquiere_qr`;
    const [resultDatos, resultTotal] = await Promise.all([
      pool.query(queryDatos, [limite, offset]),
      pool.query(queryTotal)
    ]);
    return {
      adquiere_qr: resultDatos.rows,
      total: parseInt(resultTotal.rows[0].count)
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Obtener relaciones adquiere_qr con filtros
 */
const obtenerAdquiereQrFiltradas = async (tipoFiltro, limite = 10, offset = 0) => {
  try {
    const ordenesPermitidas = {
      invitado: 'adq.id_invitado ASC',
      reserva: 'adq.id_reserva ASC',
      fecha: 'adq.fecha_confirmacion DESC',
      anfitrion: 'u_a.nombre ASC, u_a.apellido ASC',
      default: 'adq.id_invitado ASC, adq.id_reserva ASC'
    };

    const orden = ordenesPermitidas[tipoFiltro] || ordenesPermitidas.default;

    const queryDatos = `
      SELECT 
        adq.id_invitado, adq.id_reserva, adq.fecha_confirmacion, adq.qr_invitacion,
        u_i.nombre AS invitado_nombre, u_i.apellido AS invitado_apellido,
        u_a.nombre AS anfitrion_nombre, u_a.apellido AS anfitrion_apellido,
        ca.nombre AS cancha_nombre, ctrl.id_control
      FROM adquiere_qr adq
      JOIN invitado i ON adq.id_invitado = i.id_invitado
      JOIN usuario u_i ON i.id_invitado = u_i.id_persona
      JOIN reserva r ON adq.id_reserva = r.id_reserva
      JOIN anfitrion a ON r.id_anfitrion = a.id_anfitrion
      JOIN cliente c ON a.id_anfitrion = c.id_cliente
      JOIN usuario u_a ON c.id_cliente = u_a.id_persona
      JOIN cancha ca ON r.id_cancha = ca.id_cancha
      LEFT JOIN control ctrl ON adq.id_control = ctrl.id_control
      ORDER BY ${orden}
      LIMIT $1 OFFSET $2
    `;
    const queryTotal = `SELECT COUNT(*) FROM adquiere_qr`;

    const [resultDatos, resultTotal] = await Promise.all([
      pool.query(queryDatos, [limite, offset]),
      pool.query(queryTotal)
    ]);

    return {
      adquiere_qr: resultDatos.rows,
      total: parseInt(resultTotal.rows[0].count)
    };
  } catch (error) {
    throw new Error(`Error al obtener relaciones adquiere_qr filtradas: ${error.message}`);
  }
};

/**
 * Buscar relaciones adquiere_qr por texto
 */
const buscarAdquiereQr = async (texto, limite = 10, offset = 0) => {
  try {
    const queryDatos = `
      SELECT 
        adq.id_invitado, adq.id_reserva, adq.fecha_confirmacion, adq.qr_invitacion,
        u_i.nombre AS invitado_nombre, u_i.apellido AS invitado_apellido,
        u_a.nombre AS anfitrion_nombre, u_a.apellido AS anfitrion_apellido,
        ca.nombre AS cancha_nombre
      FROM adquiere_qr adq
      JOIN invitado i ON adq.id_invitado = i.id_invitado
      JOIN usuario u_i ON i.id_invitado = u_i.id_persona
      JOIN reserva r ON adq.id_reserva = r.id_reserva
      JOIN anfitrion a ON r.id_anfitrion = a.id_anfitrion
      JOIN cliente c ON a.id_anfitrion = c.id_cliente
      JOIN usuario u_a ON c.id_cliente = u_a.id_persona
      JOIN cancha ca ON r.id_cancha = ca.id_cancha
      WHERE 
        u_i.nombre ILIKE $1 OR 
        u_i.apellido ILIKE $1 OR 
        u_a.nombre ILIKE $1 OR 
        u_a.apellido ILIKE $1 OR 
        ca.nombre ILIKE $1
      ORDER BY adq.id_invitado, adq.id_reserva
      LIMIT $2 OFFSET $3
    `;

    const queryTotal = `
      SELECT COUNT(*) 
      FROM adquiere_qr adq
      JOIN invitado i ON adq.id_invitado = i.id_invitado
      JOIN usuario u_i ON i.id_invitado = u_i.id_persona
      JOIN reserva r ON adq.id_reserva = r.id_reserva
      JOIN anfitrion a ON r.id_anfitrion = a.id_anfitrion
      JOIN cliente c ON a.id_anfitrion = c.id_cliente
      JOIN usuario u_a ON c.id_cliente = u_a.id_persona
      JOIN cancha ca ON r.id_cancha = ca.id_cancha
      WHERE 
        u_i.nombre ILIKE $1 OR 
        u_i.apellido ILIKE $1 OR 
        u_a.nombre ILIKE $1 OR 
        u_a.apellido ILIKE $1 OR 
        ca.nombre ILIKE $1
    `;
    
    const sanitizeInput = (input) => input.replace(/[%_\\]/g, '\\$&');
    const terminoBusqueda = `%${sanitizeInput(texto)}%`;
    
    const [resultDatos, resultTotal] = await Promise.all([
      pool.query(queryDatos, [terminoBusqueda, limite, offset]),
      pool.query(queryTotal, [terminoBusqueda])
    ]);

    return {
      adquiere_qr: resultDatos.rows,
      total: parseInt(resultTotal.rows[0].count)
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Obtener relación adquiere_qr por ID compuesto
 */
const obtenerAdquiereQrPorId = async (id_invitado, id_reserva) => {
  try {
    const query = `
      SELECT 
        adq.*, 
        u_i.nombre AS invitado_nombre, u_i.apellido AS invitado_apellido, u_i.correo AS invitado_correo,
        u_a.nombre AS anfitrion_nombre, u_a.apellido AS anfitrion_apellido,
        ca.nombre AS cancha_nombre, ctrl.id_control
      FROM adquiere_qr adq
      JOIN invitado i ON adq.id_invitado = i.id_invitado
      JOIN usuario u_i ON i.id_invitado = u_i.id_persona
      JOIN reserva r ON adq.id_reserva = r.id_reserva
      JOIN anfitrion a ON r.id_anfitrion = a.id_anfitrion
      JOIN cliente c ON a.id_anfitrion = c.id_cliente
      JOIN usuario u_a ON c.id_cliente = u_a.id_persona
      JOIN cancha ca ON r.id_cancha = ca.id_cancha
      LEFT JOIN control ctrl ON adq.id_control = ctrl.id_control
      WHERE adq.id_invitado = $1 AND adq.id_reserva = $2
    `;
    const result = await pool.query(query, [id_invitado, id_reserva]);
    return result.rows[0] || null;
  } catch (error) {
    throw error;
  }
};

/**
 * Función principal crearAdquiereQr
 */
const crearAdquiereQr = async (datos) => {
  const { id_reserva, id_usuario } = datos;

  // Si se envían solo id_reserva e id_usuario, asumimos creación automática
  if (id_reserva && id_usuario && 
      Object.keys(datos).length === 2) {
    return await crearInvitacionCompleta(id_reserva, id_usuario);
  }

  // Caso tradicional (mantener compatibilidad)
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { id_invitado, id_reserva: reservaId, id_control, fecha_confirmacion, qr_invitacion } = datos;

    if (!id_invitado || !reservaId) {
      throw new Error('id_invitado e id_reserva son obligatorios para creación manual');
    }

    const invitadoRes = await client.query('SELECT 1 FROM invitado WHERE id_invitado = $1', [id_invitado]);
    if (!invitadoRes.rows[0]) throw new Error('Invitado no existe');

    const reservaRes = await client.query('SELECT 1 FROM reserva WHERE id_reserva = $1', [reservaId]);
    if (!reservaRes.rows[0]) throw new Error('Reserva no existe');

    if (id_control) {
      const controlRes = await client.query('SELECT 1 FROM control WHERE id_control = $1', [id_control]);
      if (!controlRes.rows[0]) throw new Error('Control no existe');
    }

    if (fecha_confirmacion && isNaN(Date.parse(fecha_confirmacion))) {
      throw new Error('fecha_confirmacion no válida');
    }

    const query = `
      INSERT INTO adquiere_qr (
        id_invitado, id_reserva, id_control, fecha_confirmacion, qr_invitacion
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;

    const values = [
      id_invitado,
      reservaId,
      id_control || null,
      fecha_confirmacion || null,
      qr_invitacion || null
    ];

    const result = await client.query(query, values);
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
 * Actualizar relación adquiere_qr parcialmente
 */
const actualizarAdquiereQr = async (id_invitado, id_reserva, campos) => {
  try {
    const camposPermitidos = ['id_control', 'fecha_confirmacion', 'qr_invitacion'];
    const campos = Object.keys(campos).filter(k => camposPermitidos.includes(k));
    if (campos.length === 0) throw new Error('No hay campos válidos para actualizar');

    // Validaciones
    if (campos.includes('id_control') && campos.id_control) {
      const res = await pool.query('SELECT 1 FROM control WHERE id_control = $1', [campos.id_control]);
      if (!res.rows[0]) throw new Error('Control no existe');
    }

    if (campos.includes('fecha_confirmacion') && campos.fecha_confirmacion) {
      if (isNaN(Date.parse(campos.fecha_confirmacion))) throw new Error('fecha_confirmacion no válida');
    }

    const setClause = campos.map((c, i) => `${c} = $${i + 3}`).join(', ');
    const values = campos.map(c => campos[c]);
    values.push(id_invitado, id_reserva);

    const query = `
      UPDATE adquiere_qr 
      SET ${setClause}
      WHERE id_invitado = $${campos.length + 1} AND id_reserva = $${campos.length + 2}
      RETURNING *
    `;

    const result = await pool.query(query, values);
    return result.rows[0] || null;
  } catch (error) {
    throw error;
  }
};

/**
 * Eliminar relación adquiere_qr Y su archivo QR
 */
const eliminarAdquiereQr = async (id_invitado, id_reserva) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Primero obtener la información para saber qué archivo eliminar
    const querySelect = `
      SELECT qr_invitacion 
      FROM adquiere_qr 
      WHERE id_invitado = $1 AND id_reserva = $2
    `;
    const resultSelect = await client.query(querySelect, [id_invitado, id_reserva]);
    
    if (!resultSelect.rows[0]) {
      return null; // No existe la relación
    }

    const qr_invitacion_path = resultSelect.rows[0].qr_invitacion;

    // 2. Eliminar el registro de la base de datos
    const queryDelete = `
      DELETE FROM adquiere_qr 
      WHERE id_invitado = $1 AND id_reserva = $2 
      RETURNING id_invitado, id_reserva
    `;
    const result = await client.query(queryDelete, [id_invitado, id_reserva]);
    
    if (!result.rows[0]) {
      await client.query('ROLLBACK');
      return null;
    }

    // 3. Eliminar el archivo físico del QR si existe
    if (qr_invitacion_path) {
      try {
        await unlinkFile(qr_invitacion_path);
      } catch (fileError) {
        console.warn(`⚠️ No se pudo eliminar el archivo QR: ${qr_invitacion_path}`, fileError.message);
      }
    }

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
 * Obtener invitaciones QR recibidas por un cliente (como invitado)
 */
const obtenerMisInvitacionesPorCliente = async (id_cliente, limite = 10, offset = 0) => {
  try {
    const queryDatos = `
      SELECT 
        adq.id_invitado, 
        adq.id_reserva, 
        adq.fecha_confirmacion, 
        adq.qr_invitacion,
        adq.estado_asistencia,
        adq.fecha_expiracion,
        adq.codigo_invitacion,
        -- Datos del INVITADO (el cliente que consulta)
        i.id_invitado, 
        u_i.nombre AS invitado_nombre, 
        u_i.apellido AS invitado_apellido,
        u_i.usuario AS invitado_usuario,
        -- Datos del ANFITRIÓN (quien hizo la reserva)
        r.id_reserva, 
        a.id_anfitrion, 
        u_a.nombre AS anfitrion_nombre, 
        u_a.apellido AS anfitrion_apellido,
        u_a.usuario AS anfitrion_usuario,
        -- Datos de la CANCHA
        ca.id_cancha, 
        ca.nombre AS cancha_nombre,
        esp.nombre AS espacio_nombre,
        esp.latitud AS espacio_latitud,
        esp.longitud AS espacio_longitud,
        -- Datos de la RESERVA
        r.fecha_reserva,
        r.estado AS estado_reserva,
        r.disciplina_escogida,
        -- Datos del CONTROL
        ctrl.id_control,
        CONCAT(ctrl_usuario.nombre, ' ', ctrl_usuario.apellido) AS control_nombre_completo,
        ctrl_usuario.nombre AS control_nombre,
        ctrl_usuario.apellido AS control_apellido,
        -- Agregar horarios como array JSON
        (
          SELECT JSON_AGG(
            JSON_BUILD_OBJECT(
              'id_horario', rh.id_horario,
              'fecha', rh.fecha,
              'hora_inicio', rh.hora_inicio,
              'hora_fin', rh.hora_fin,
              'monto', rh.monto
            )
            ORDER BY rh.hora_inicio
          )
          FROM reserva_horario rh
          WHERE rh.id_reserva = r.id_reserva
        ) AS horarios
      FROM adquiere_qr adq
      -- Relación con INVITADO (el cliente que consulta)
      JOIN invitado i ON adq.id_invitado = i.id_invitado
      JOIN usuario u_i ON i.id_invitado = u_i.id_persona
      -- Relación con RESERVA
      JOIN reserva r ON adq.id_reserva = r.id_reserva
      -- Relación con ANFITRIÓN (quien hizo la reserva)
      JOIN anfitrion a ON r.id_anfitrion = a.id_anfitrion
      JOIN cliente c_anfitrion ON a.id_anfitrion = c_anfitrion.id_cliente
      JOIN usuario u_a ON c_anfitrion.id_cliente = u_a.id_persona
      -- Relación con CANCHA y ESPACIO
      JOIN cancha ca ON r.id_cancha = ca.id_cancha
      JOIN espacio_deportivo esp ON ca.id_espacio = esp.id_espacio
      -- Relación con CONTROL (opcional)
      LEFT JOIN control ctrl ON adq.id_control = ctrl.id_control
      LEFT JOIN usuario ctrl_usuario ON ctrl.id_control = ctrl_usuario.id_persona
      -- FILTRO CORREGIDO: Donde el INVITADO es el cliente que consulta
      WHERE adq.id_invitado = $1
      ORDER BY 
        -- Ordenar por fecha_confirmacion DESC (más reciente primero)
        -- Si no hay confirmación, usar fecha_creacion de la reserva
        COALESCE(adq.fecha_confirmacion, r.fecha_creacion) DESC,
        adq.id_reserva DESC
      LIMIT $2 OFFSET $3
    `;

    const queryTotal = `
      SELECT COUNT(*) 
      FROM adquiere_qr adq
      WHERE adq.id_invitado = $1
    `;

    const [resultDatos, resultTotal] = await Promise.all([
      pool.query(queryDatos, [id_cliente, limite, offset]),
      pool.query(queryTotal, [id_cliente])
    ]);

    // Procesar los resultados para asegurar que horarios sea un array
    const invitacionesProcesadas = resultDatos.rows.map(invitacion => ({
      ...invitacion,
      horarios: invitacion.horarios || [], // Asegurar que siempre sea un array
      control_nombre_completo: invitacion.control_nombre_completo || null,
      control_nombre: invitacion.control_nombre || null,
      control_apellido: invitacion.control_apellido || null
    }));

    return {
      invitaciones: invitacionesProcesadas,
      total: parseInt(resultTotal.rows[0].count)
    };
  } catch (error) {
    console.error('Error en obtenerMisInvitacionesPorCliente:', error);
    throw error;
  }
};

/**
 * Obtener invitaciones QR gestionadas por un control específico
 */
const obtenerInvitacionesPorControl = async (id_control, limite = 10, offset = 0) => {
  try {
    const queryDatos = `
      SELECT 
        adq.id_invitado, adq.id_reserva, adq.fecha_confirmacion, adq.qr_invitacion,
        i.id_invitado, u_i.nombre AS invitado_nombre, u_i.apellido AS invitado_apellido,
        r.id_reserva, a.id_anfitrion, u_a.nombre AS anfitrion_nombre, u_a.apellido AS anfitrion_apellido,
        ca.id_cancha, ca.nombre AS cancha_nombre,
        ctrl.id_control
      FROM adquiere_qr adq
      JOIN invitado i ON adq.id_invitado = i.id_invitado
      JOIN usuario u_i ON i.id_invitado = u_i.id_persona
      JOIN reserva r ON adq.id_reserva = r.id_reserva
      JOIN anfitrion a ON r.id_anfitrion = a.id_anfitrion
      JOIN cliente c ON a.id_anfitrion = c.id_cliente
      JOIN usuario u_a ON c.id_cliente = u_a.id_persona
      JOIN cancha ca ON r.id_cancha = ca.id_cancha
      LEFT JOIN control ctrl ON adq.id_control = ctrl.id_control
      WHERE adq.id_control = $1
      ORDER BY adq.fecha_confirmacion DESC
      LIMIT $2 OFFSET $3
    `;
    const queryTotal = `
      SELECT COUNT(*) FROM adquiere_qr WHERE id_control = $1
    `;
    const [resultDatos, resultTotal] = await Promise.all([
      pool.query(queryDatos, [id_control, limite, offset]),
      pool.query(queryTotal, [id_control])
    ]);
    return {
      invitaciones: resultDatos.rows,
      total: parseInt(resultTotal.rows[0].count)
    };
  } catch (error) {
    console.error('Error en obtenerInvitacionesPorControl:', error);
    throw error;
  }
};

// =============================================
// CONFIRMAR ASISTENCIA - NUEVAS FUNCIONES
// =============================================

/**
 * Confirmar asistencia de un invitado
 */
const confirmarAsistencia = async (id_reserva, id_invitado, codigo_invitacion) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    console.log('🔍 Verificando invitación:', { id_reserva, id_invitado, codigo_invitacion });

    // Verificar que la relación existe y el código es correcto
    const verificacion = await client.query(
      `SELECT aq.*, r.estado as estado_reserva
       FROM adquiere_qr aq
       JOIN reserva r ON aq.id_reserva = r.id_reserva
       WHERE aq.id_reserva = $1 
         AND aq.id_invitado = $2 
         AND aq.codigo_invitacion = $3`,
      [id_reserva, id_invitado, codigo_invitacion]
    );

    if (!verificacion.rows[0]) {
      throw new Error('Código de invitación no válido para esta reserva');
    }

    const invitacion = verificacion.rows[0];

   /* // ✅ MODIFICAR ESTA PARTE: Permitir más estados además de "activa"
    const estadosPermitidos = ['activa', 'confirmada', 'pendiente', 'programada']; // Agrega los estados que necesites
    
    if (!estadosPermitidos.includes(invitacion.estado_reserva)) {
      throw new Error(`La reserva no está en un estado válido. Estado actual: ${invitacion.estado_reserva}`);
    }

    // Verificar que no esté ya confirmado*/
    if (invitacion.estado_asistencia === 'asistio') {
      throw new Error('La asistencia ya fue confirmada anteriormente');
    }

    // Actualizar estado a confirmado
    const result = await client.query(
      `UPDATE adquiere_qr 
       SET estado_asistencia = 'asistio', 
           fecha_confirmacion = NOW()
       WHERE id_reserva = $1 AND id_invitado = $2
       RETURNING *`,
      [id_reserva, id_invitado]
    );

    await client.query('COMMIT');
    
    console.log('✅ Asistencia confirmada exitosamente');
    return result.rows[0];

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error confirmando asistencia:', error.message);
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Controlador para confirmar asistencia
 */
const confirmarAsistenciaController = async (req, res) => {
  try {
    const { id_reserva, id_invitado, codigo_invitacion } = req.body;

    console.log('📨 Datos recibidos:', req.body);

    if (!id_reserva || !id_invitado || !codigo_invitacion) {
      return res.status(400).json(respuesta(false, 'Datos incompletos'));
    }

    const resultado = await confirmarAsistencia(
      parseInt(id_reserva), 
      parseInt(id_invitado), 
      codigo_invitacion
    );

    res.json(respuesta(true, 'Asistencia confirmada exitosamente', {
      adquiere_qr: resultado
    }));

  } catch (error) {
    console.error('Error en confirmarAsistenciaController:', error);
    res.status(400).json(respuesta(false, error.message));
  }
};

// CONTROLADORES

const obtenerDatosEspecificosController = async (req, res) => {
  try {
    const limite = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;
    const { adquiere_qr, total } = await obtenerDatosEspecificos(limite, offset);
    res.json(respuesta(true, 'Relaciones adquiere_qr obtenidas', { adquiere_qr, paginacion: { limite, offset, total } }));
  } catch (error) {
    res.status(500).json(respuesta(false, error.message));
  }
};

const obtenerAdquiereQrFiltradasController = async (req, res) => {
  try {
    const { tipo } = req.query;
    const limite = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;
    const tiposValidos = ['invitado', 'reserva', 'fecha', 'anfitrion'];
    if (!tipo || !tiposValidos.includes(tipo)) {
      return res.status(400).json(respuesta(false, 'Tipo de filtro inválido'));
    }
    const { adquiere_qr, total } = await obtenerAdquiereQrFiltradas(tipo, limite, offset);
    res.json(respuesta(true, `Filtrado por ${tipo}`, { adquiere_qr, filtro: tipo, paginacion: { limite, offset, total } }));
  } catch (error) {
    res.status(500).json(respuesta(false, error.message));
  }
};

const buscarAdquiereQrController = async (req, res) => {
  try {
    const { q } = req.query;
    const limite = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;
    if (!q) return res.status(400).json(respuesta(false, 'Parámetro q requerido'));
    const { adquiere_qr, total } = await buscarAdquiereQr(q, limite, offset);
    res.json(respuesta(true, 'Búsqueda completada', { adquiere_qr, paginacion: { limite, offset, total } }));
  } catch (error) {
    res.status(500).json(respuesta(false, error.message));
  }
};

const obtenerAdquiereQrPorIdController = async (req, res) => {
  try {
    const { id_invitado, id_reserva } = req.params;
    if (!id_invitado || isNaN(id_invitado) || !id_reserva || isNaN(id_reserva)) {
      return res.status(400).json(respuesta(false, 'IDs inválidos'));
    }
    const relacion = await obtenerAdquiereQrPorId(parseInt(id_invitado), parseInt(id_reserva));
    if (!relacion) return res.status(404).json(respuesta(false, 'Relación no encontrada'));
    res.json(respuesta(true, 'Relación obtenida', { adquiere_qr: relacion }));
  } catch (error) {
    res.status(500).json(respuesta(false, error.message));
  }
};

const crearAdquiereQrController = async (req, res) => {
  try {
    const datos = req.body;

    // Validar datos mínimos
    if (!datos.id_reserva || !datos.id_usuario) {
      return res.status(400).json(respuesta(false, 'Se requieren ID de reserva y usuario'));
    }

    // Crear la invitación (generará QR automáticamente)
    const nueva = await crearAdquiereQr(datos);

    res.status(201).json(respuesta(true, 'Invitación creada exitosamente', { 
      adquiere_qr: nueva 
    }));
    
    console.log("✅ QR adquirido exitosamente para reserva:", datos.id_reserva);

  } catch (error) {
    console.error('❌ Error en crearAdquiereQrController:', error.message);

    // Mensajes más limpios y amigables
    if (error.message.includes('duplicate key') || error.message.includes('ya tiene una invitación')) {
      return res.status(409).json(respuesta(false, 'Ya tienes una invitación para esta reserva'));
    }
    if (error.message.includes('no existe en la tabla cliente')) {
      return res.status(403).json(respuesta(false, 'Debes ser un cliente registrado para recibir invitaciones'));
    }
    if (error.message.includes('La reserva no existe')) {
      return res.status(404).json(respuesta(false, 'La reserva no existe o ha expirado'));
    }

    // Error genérico más limpio
    res.status(400).json(respuesta(false, 'No se pudo crear la invitación'));
  }
};

const actualizarAdquiereQrController = async (req, res) => {
  try {
    const { id_invitado, id_reserva } = req.params;
    const campos = req.body;
    if (Object.keys(campos).length === 0) return res.status(400).json(respuesta(false, 'No hay campos para actualizar'));
    const actualizada = await actualizarAdquiereQr(parseInt(id_invitado), parseInt(id_reserva), campos);
    if (!actualizada) return res.status(404).json(respuesta(false, 'Relación no encontrada'));
    res.json(respuesta(true, 'Relación actualizada', { adquiere_qr: actualizada }));
  } catch (error) {
    res.status(500).json(respuesta(false, error.message));
  }
};

const eliminarAdquiereQrController = async (req, res) => {
  try {
    const { id_invitado, id_reserva } = req.params;
    const eliminada = await eliminarAdquiereQr(parseInt(id_invitado), parseInt(id_reserva));
    if (!eliminada) return res.status(404).json(respuesta(false, 'Relación no encontrada'));
    res.json(respuesta(true, 'Relación eliminada'));
  } catch (error) {
    res.status(500).json(respuesta(false, error.message));
  }
};

const misInvitacionesClienteController = async (req, res) => {
  try {
    const { id_cliente } = req.params;
    if (!id_cliente || isNaN(id_cliente)) {
      return res.status(400).json(respuesta(false, 'ID de cliente inválido'));
    }
    const limite = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;
    const { invitaciones, total } = await obtenerMisInvitacionesPorCliente(parseInt(id_cliente), limite, offset);
    res.json(respuesta(true, 'Mis invitaciones QR obtenidas', {
      invitaciones,
      paginacion: { limite, offset, total }
    }));
  } catch (error) {
    res.status(500).json(respuesta(false, error.message));
  }
};

const invitacionesControlController = async (req, res) => {
  try {
    const { id_control } = req.params;
    if (!id_control || isNaN(id_control)) {
      return res.status(400).json(respuesta(false, 'ID de control inválido'));
    }
    const limite = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;
    const { invitaciones, total } = await obtenerInvitacionesPorControl(parseInt(id_control), limite, offset);
    res.json(respuesta(true, 'Invitaciones gestionadas por el control obtenidas', {
      invitaciones,
      paginacion: { limite, offset, total }
    }));
  } catch (error) {
    res.status(500).json(respuesta(false, error.message));
  }
};

/**
 * Controlador para obtener datos de los invitados de una reserva
 */
const obtenerDatosDeMisInvitadosController = async (req, res) => {
  try {
    const { id_reserva } = req.params;
    
    // Validar que el ID de reserva sea válido
    if (!id_reserva || isNaN(id_reserva)) {
      return res.status(400).json(respuesta(false, 'ID de reserva inválido'));
    }

    // Obtener los datos de los invitados y información adicional
    const datosCompletos = await obtenerDatosDeMisInvitados(parseInt(id_reserva));
    
    res.json(respuesta(true, 'Datos de invitados obtenidos exitosamente', {
      id_reserva: parseInt(id_reserva),
      total_invitados: datosCompletos.invitados.length,
      cupo_reserva: datosCompletos.cupo_reserva,
      capacidad_cancha: datosCompletos.capacidad_cancha,
      nombre_cancha: datosCompletos.nombre_cancha,
      invitados: datosCompletos.invitados
    }));

  } catch (error) {
    console.error('Error en obtenerDatosDeMisInvitadosController:', error);
    res.status(500).json(respuesta(false, 'Error al obtener los datos de los invitados'));
  }
};

// =============================================
// RUTAS - ESTO DEBE IR AL FINAL
// =============================================

router.get('/datos-especificos', obtenerDatosEspecificosController);
router.get('/filtro', obtenerAdquiereQrFiltradasController);
router.get('/buscar', buscarAdquiereQrController);
router.get('/dato-individual/:id_invitado/:id_reserva', obtenerAdquiereQrPorIdController);

// ✅ AGREGA ESTA LÍNEA NUEVA:
//router.patch('/confirmar-asistencia', confirmarAsistenciaController);
router.post('/confirmar-asistencia', confirmarAsistenciaController);

router.post('/', crearAdquiereQrController);
router.patch('/:id_invitado/:id_reserva', actualizarAdquiereQrController);
router.delete('/:id_invitado/:id_reserva', eliminarAdquiereQrController);

router.get('/mis-invitaciones-qr/:id_cliente', misInvitacionesClienteController);
router.get('/control-adquiere-qr/:id_control', invitacionesControlController);
router.get('/datos-mis-invitados/:id_reserva', obtenerDatosDeMisInvitadosController);

module.exports = router;