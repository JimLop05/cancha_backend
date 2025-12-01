//cancha_backend/api/roles/qr_control.js
const express = require('express');
const pool = require('../../config/database');
const QRCode = require('qrcode');
const path = require("path");
const fs = require("fs").promises;
const { unlinkFile, createUploadAndProcess } = require("../../middleware/multer");

const router = express.Router();

// Función de respuesta estandarizada
const respuesta = (exito, mensaje, datos = null) => ({
  exito,
  mensaje,
  datos,
});

// MODELOS - Funciones puras para operaciones de base de datos

/**
 * Obtener datos específicos de QR de reservas con información de la reserva
 */
const obtenerDatosEspecificos = async (id_control, limite = 10, offset = 0) => {
  try {
    const queryDatos = `
      SELECT qr.id_qr, qr.fecha_generado, qr.fecha_expira, qr.qr_url_imagen, qr.codigo_qr, qr.estado, qr.verificado,
             r.id_reserva, c.id_cliente, p.nombre AS cliente_nombre, p.apellido AS cliente_apellido,
             ca.id_cancha, ca.nombre AS cancha_nombre
      FROM qr_reserva qr
      JOIN reserva r ON qr.id_reserva = r.id_reserva
      JOIN cliente c ON r.id_cliente = c.id_cliente
      JOIN usuario p ON c.id_cliente = p.id_persona
      JOIN cancha ca ON r.id_cancha = ca.id_cancha
      WHERE qr.id_control = $1
      ORDER BY qr.id_qr
      LIMIT $2 OFFSET $3
    `;
    const queryTotal = `
      SELECT COUNT(*) 
      FROM qr_reserva 
      WHERE id_control = $1
    `;
    const [resultDatos, resultTotal] = await Promise.all([
      pool.query(queryDatos, [id_control, limite, offset]),
      pool.query(queryTotal, [id_control])
    ]);
    return {
      qrs: resultDatos.rows,
      total: parseInt(resultTotal.rows[0].count)
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Obtener QR de reservas con filtros
 */
const obtenerQRsFiltrados = async (id_control, tipoFiltro, limite = 10, offset = 0) => {
  try {
    let whereClause = 'WHERE qr.id_control = $1';
    let orderClause = 'qr.id_qr ASC';
    let queryParams = [id_control];
    
    switch(tipoFiltro) {
      case 'verificado_si':
        whereClause += ' AND qr.verificado = true';
        orderClause = 'qr.fecha_generado DESC';
        break;
      case 'verificado_no':
        whereClause += ' AND qr.verificado = false';
        orderClause = 'qr.fecha_generado DESC';
        break;
      case 'cliente_nombre':
        orderClause = 'p.nombre ASC, p.apellido ASC';
        break;
      case 'fecha_generado':
        orderClause = 'qr.fecha_generado DESC';
        break;
      default:
        orderClause = 'qr.id_qr ASC';
    }

    const queryDatos = `
      SELECT qr.id_qr, qr.fecha_generado, qr.fecha_expira, qr.qr_url_imagen, qr.codigo_qr, qr.estado, qr.verificado,
             r.id_reserva, c.id_cliente, p.nombre AS cliente_nombre, p.apellido AS cliente_apellido,
             ca.id_cancha, ca.nombre AS cancha_nombre
      FROM qr_reserva qr
      JOIN reserva r ON qr.id_reserva = r.id_reserva
      JOIN cliente c ON r.id_cliente = c.id_cliente
      JOIN usuario p ON c.id_cliente = p.id_persona
      JOIN cancha ca ON r.id_cancha = ca.id_cancha
      ${whereClause}
      ORDER BY ${orderClause}
      LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
    `;

    const queryTotal = `
      SELECT COUNT(*) 
      FROM qr_reserva qr
      ${whereClause}
    `;

    queryParams.push(limite, offset);

    const [resultDatos, resultTotal] = await Promise.all([
      pool.query(queryDatos, queryParams),
      pool.query(queryTotal, [id_control])
    ]);

    return {
      qrs: resultDatos.rows,
      total: parseInt(resultTotal.rows[0].count)
    };
  } catch (error) {
    throw new Error(`Error al obtener QRs filtrados: ${error.message}`);
  }
};

/**
 * Buscar QR de reservas por texto en múltiples campos
 */
const buscarQRs = async (id_control, texto, limite = 10, offset = 0) => {
  try {
    const queryDatos = `
      SELECT qr.id_qr, qr.fecha_generado, qr.fecha_expira, qr.qr_url_imagen, qr.codigo_qr, qr.estado, qr.verificado,
             r.id_reserva, c.id_cliente, p.nombre AS cliente_nombre, p.apellido AS cliente_apellido,
             ca.id_cancha, ca.nombre AS cancha_nombre
      FROM qr_reserva qr
      JOIN reserva r ON qr.id_reserva = r.id_reserva
      JOIN cliente c ON r.id_cliente = c.id_cliente
      JOIN usuario p ON c.id_cliente = p.id_persona
      JOIN cancha ca ON r.id_cancha = ca.id_cancha
      WHERE qr.id_control = $1 AND (
        p.nombre ILIKE $2 OR 
        p.apellido ILIKE $2 OR 
        ca.nombre ILIKE $2 OR 
        qr.codigo_qr ILIKE $2
      )
      ORDER BY qr.fecha_generado DESC
      LIMIT $3 OFFSET $4
    `;

    const queryTotal = `
      SELECT COUNT(*) 
      FROM qr_reserva qr
      JOIN reserva r ON qr.id_reserva = r.id_reserva
      JOIN cliente c ON r.id_cliente = c.id_cliente
      JOIN usuario p ON c.id_cliente = p.id_persona
      JOIN cancha ca ON r.id_cancha = ca.id_cancha
      WHERE qr.id_control = $1 AND (
        p.nombre ILIKE $2 OR 
        p.apellido ILIKE $2 OR 
        ca.nombre ILIKE $2 OR 
        qr.codigo_qr ILIKE $2
      )
    `;
    
    const sanitizeInput = (input) => input.replace(/[%_\\]/g, '\\$&');
    const terminoBusqueda = `%${sanitizeInput(texto)}%`;
    
    const [resultDatos, resultTotal] = await Promise.all([
      pool.query(queryDatos, [id_control, terminoBusqueda, limite, offset]),
      pool.query(queryTotal, [id_control, terminoBusqueda])
    ]);

    return {
      qrs: resultDatos.rows,
      total: parseInt(resultTotal.rows[0].count)
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Obtener QR de reserva por ID
 */
const obtenerQRPorId = async (id, id_control) => {
  try {
    const query = `
      SELECT qr.*, 
             r.id_reserva, c.id_cliente, p.nombre AS cliente_nombre, p.apellido AS cliente_apellido, p.correo AS cliente_correo,
             ca.id_cancha, ca.nombre AS cancha_nombre
      FROM qr_reserva qr
      JOIN reserva r ON qr.id_reserva = r.id_reserva
      JOIN cliente c ON r.id_cliente = c.id_cliente
      JOIN usuario p ON c.id_cliente = p.id_persona
      JOIN cancha ca ON r.id_cancha = ca.id_cancha
      WHERE qr.id_qr = $1 AND qr.id_control = $2
    `;
    const result = await pool.query(query, [id, id_control]);
    return result.rows[0] || null;
  } catch (error) {
    throw error;
  }
};

/**
 * Crear nuevo QR de reserva
 */
const crearQR = async (id_control, datosQR) => {
  try {
    // Validaciones básicas
    if (!datosQR.id_reserva || isNaN(datosQR.id_reserva)) {
      throw new Error('El ID de la reserva es obligatorio y debe ser un número');
    }

    // Validar fecha de generación
    if (!datosQR.fecha_generado) {
      throw new Error('La fecha de generación es obligatoria');
    }

    const fechaGenerado = new Date(datosQR.fecha_generado);
    if (isNaN(fechaGenerado.getTime())) {
      throw new Error('La fecha de generación no es válida');
    }

    // Validar fecha de expiración si se proporciona
    if (datosQR.fecha_expira) {
      const fechaExpira = new Date(datosQR.fecha_expira);
      if (isNaN(fechaExpira.getTime())) {
        throw new Error('La fecha de expiración no es válida');
      }
      if (fechaExpira <= fechaGenerado) {
        throw new Error('La fecha de expiración debe ser posterior a la fecha de generación');
      }
    }

    // Verificar si la reserva existe
    const reservaResult = await pool.query(
      'SELECT id_reserva FROM reserva WHERE id_reserva = $1', 
      [datosQR.id_reserva]
    );
    
    if (!reservaResult.rows[0]) {
      throw new Error('La reserva asociada no existe');
    }

    // Verificar si ya existe un QR para esta reserva
    const qrExistenteResult = await pool.query(
      'SELECT id_qr FROM qr_reserva WHERE id_reserva = $1', 
      [datosQR.id_reserva]
    );
    
    if (qrExistenteResult.rows[0]) {
      throw new Error('Ya existe un QR asociado a esta reserva');
    }

    // Validar control
    const controlResult = await pool.query(
      'SELECT id_control FROM control WHERE id_control = $1', 
      [id_control]
    );
    
    if (!controlResult.rows[0]) {
      throw new Error('El control asociado no existe');
    }

    const query = `
      INSERT INTO qr_reserva (
        fecha_generado, 
        fecha_expira, 
        qr_url_imagen, 
        codigo_qr, 
        estado, 
        id_reserva, 
        id_control, 
        verificado
      ) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;

    const values = [
      datosQR.fecha_generado,
      datosQR.fecha_expira || null,
      datosQR.qr_url_imagen || null,
      datosQR.codigo_qr || null,
      datosQR.estado || 'activo',
      datosQR.id_reserva,
      id_control,
      datosQR.verificado !== undefined ? datosQR.verificado : false
    ];

    const result = await pool.query(query, values);
    return result.rows[0];
    
  } catch (error) {
    console.error('❌ Error al crear QR de reserva:', error.message);
    throw new Error(error.message);
  }
};

/**
 * Actualizar QR de reserva parcialmente
 */
const actualizarQR = async (id, id_control, camposActualizar) => {
  try {
    const camposPermitidos = ['fecha_generado', 'fecha_expira', 'qr_url_imagen', 'codigo_qr', 'estado', 'id_reserva', 'id_control', 'verificado'];

    const campos = Object.keys(camposActualizar).filter(key => 
      camposPermitidos.includes(key)
    );

    if (campos.length === 0) {
      throw new Error('No hay campos válidos para actualizar');
    }

    // Verificar que el QR pertenece al control
    const qrQuery = `
      SELECT id_qr 
      FROM qr_reserva 
      WHERE id_qr = $1 AND id_control = $2
    `;
    const qrResult = await pool.query(qrQuery, [id, id_control]);
    if (!qrResult.rows[0]) {
      throw new Error('QR no encontrado o no pertenece al control');
    }

    // Validar fechas
    if (camposActualizar.fecha_generado) {
      const fechaGenerado = new Date(camposActualizar.fecha_generado);
      if (isNaN(fechaGenerado.getTime())) {
        throw new Error('La fecha de generación no es válida');
      }
      if (camposActualizar.fecha_expira) {
        const fechaExpira = new Date(camposActualizar.fecha_expira);
        if (isNaN(fechaExpira.getTime())) {
          throw new Error('La fecha de expiración no es válida');
        }
        if (fechaExpira <= fechaGenerado) {
          throw new Error('La fecha de expiración debe ser posterior a la fecha de generación');
        }
      }
    }

    // Validar longitud de campos
    if (camposActualizar.qr_url_imagen && camposActualizar.qr_url_imagen.length > 255) {
      throw new Error('La URL de la imagen del QR no debe exceder los 255 caracteres');
    }
    if (camposActualizar.codigo_qr && camposActualizar.codigo_qr.length > 255) {
      throw new Error('El código QR no debe exceder los 255 caracteres');
    }

    // Validar estado
    const estadosValidos = ['activo', 'expirado', 'usado'];
    if (camposActualizar.estado && !estadosValidos.includes(camposActualizar.estado)) {
      throw new Error(`El estado debe ser uno de: ${estadosValidos.join(', ')}`);
    }
    // Validar verificado
    if (camposActualizar.verificado !== undefined && typeof camposActualizar.verificado !== 'boolean') {
      throw new Error('El campo verificado debe ser un valor booleano');
    }
    // Validar reserva si se proporciona
    if (camposActualizar.id_reserva) {
      const reservaQuery = `
        SELECT id_reserva FROM reserva WHERE id_reserva = $1
      `;
      const reservaResult = await pool.query(reservaQuery, [camposActualizar.id_reserva]);
      if (!reservaResult.rows[0]) {
        throw new Error('La reserva asociada no existe');
      }
      // Verificar unicidad de id_reserva
      const qrExistenteQuery = `
        SELECT id_qr FROM qr_reserva WHERE id_reserva = $1 AND id_qr != $2
      `;
      const qrExistenteResult = await pool.query(qrExistenteQuery, [camposActualizar.id_reserva, id]);
      if (qrExistenteResult.rows[0]) {
        throw new Error('Ya existe otro QR asociado a esta reserva');
      }
    }

    // Validar control si se proporciona
    if (camposActualizar.id_control) {
      const controlQuery = `
        SELECT id_control FROM control WHERE id_control = $1
      `;
      const controlResult = await pool.query(controlQuery, [camposActualizar.id_control]);
      if (!controlResult.rows[0]) {
        throw new Error('El control asociado no existe');
      }
    }

    const setClause = campos.map((campo, index) => `${campo} = $${index + 2}`).join(', ');
    const values = campos.map(campo => {
      const value = camposActualizar[campo];
      if (campo === 'verificado') {
        return value;
      }
      if (['qr_url_imagen', 'codigo_qr'].includes(campo)) {
        return value || null;
      }
      return value !== undefined && value !== null ? value : null;
    });

    console.log('🔧 Actualizando QR:', { id, campos, values });

    const query = `
      UPDATE qr_reserva 
      SET ${setClause}
      WHERE id_qr = $1
      RETURNING *
    `;

    const result = await pool.query(query, [id, ...values]);
    return result.rows[0] || null;
  } catch (error) {
    throw error;
  }
};

/**
 * Eliminar QR de reserva
 */
const eliminarQR = async (id, id_control) => {
  try {
    const query = `
      DELETE FROM qr_reserva 
      WHERE id_qr = $1 AND id_control = $2 
      RETURNING id_qr
    `;
    const result = await pool.query(query, [id, id_control]);
    return result.rows[0] || null;
  } catch (error) {
    throw error;
  }
};

// CONTROLADORES - Manejan las request y response

/**
 * Controlador para GET /datos-especificos
 */
const obtenerDatosEspecificosController = async (req, res) => {
  try {
    const id_control = parseInt(req.query.id_control);
    const limite = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;

    if (!id_control || isNaN(id_control)) {
      return res.status(400).json(respuesta(false, 'ID de control no válido o no proporcionado'));
    }

    const { qrs, total } = await obtenerDatosEspecificos(id_control, limite, offset);
    
    res.json(respuesta(true, 'QRs de reserva obtenidos correctamente', {
      qrs,
      paginacion: { limite, offset, total }
    }));
  } catch (error) {
    console.error('Error en obtenerDatosEspecificos:', error.message);
    res.status(500).json(respuesta(false, error.message));
  }
};

/**
 * Controlador para GET /filtro
 */
const obtenerQRsFiltradosController = async (req, res) => {
  try {
    const { tipo, id_control } = req.query;
    const limite = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;

    if (!id_control || isNaN(id_control)) {
      return res.status(400).json(respuesta(false, 'ID de control no válido o no proporcionado'));
    }

    const tiposValidos = ['verificado_si', 'verificado_no', 'cliente_nombre', 'fecha_generado'];
    
    if (!tipo || !tiposValidos.includes(tipo)) {
      return res.status(400).json(respuesta(false, 
        `El parámetro "tipo" es inválido. Valores permitidos: ${tiposValidos.join(', ')}`
      ));
    }

    const { qrs, total } = await obtenerQRsFiltrados(id_control, tipo, limite, offset);

    res.json(respuesta(true, `QRs de reserva filtrados por ${tipo} obtenidos correctamente`, {
      qrs,
      filtro: tipo,
      paginacion: { limite, offset, total }
    }));
  } catch (error) {
    console.error('Error en obtenerQRsFiltrados:', error.message);
    res.status(500).json(respuesta(false, error.message));
  }
};

/**
 * Controlador para GET /buscar
 */
const buscarQRsController = async (req, res) => {
  try {
    const { q, id_control } = req.query;
    const limite = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;

    if (!id_control || isNaN(id_control)) {
      return res.status(400).json(respuesta(false, 'ID de control no válido o no proporcionado'));
    }

    if (!q) {
      return res.status(400).json(respuesta(false, 'El parámetro de búsqueda "q" es requerido'));
    }

    const { qrs, total } = await buscarQRs(id_control, q, limite, offset);
    
    res.json(respuesta(true, 'QRs de reserva obtenidos correctamente', {
      qrs,
      paginacion: { limite, offset, total }
    }));
  } catch (error) {
    console.error('Error en buscarQRs:', error.message);
    res.status(500).json(respuesta(false, error.message));
  }
};

/**
 * Controlador para GET /dato-individual/:id
 */
const obtenerQRPorIdController = async (req, res) => {
  try {
    const { id } = req.params;
    const { id_control } = req.query;

    if (!id || isNaN(id)) {
      return res.status(400).json(respuesta(false, 'ID de QR no válido'));
    }
    if (!id_control || isNaN(id_control)) {
      return res.status(400).json(respuesta(false, 'ID de control no válido o no proporcionado'));
    }

    const qr = await obtenerQRPorId(parseInt(id), parseInt(id_control));

    if (!qr) {
      return res.status(404).json(respuesta(false, 'QR de reserva no encontrado o no pertenece al control'));
    }

    res.json(respuesta(true, 'QR de reserva obtenido correctamente', { qr }));
  } catch (error) {
    console.error('Error en obtenerQRPorId:', error.message);
    res.status(500).json(respuesta(false, error.message));
  }
};

/**
 * Controlador para POST - Crear QR de reserva
 */
const crearQRController = async (req, res) => {
  let qrPath = null;
  try {
    const datos = { ...req.body };
    const id_control = parseInt(req.body.id_control || req.query.id_control);

    console.log('📥 Datos recibidos para crear QR:', datos);

    if (!id_control || isNaN(id_control)) {
      return res.status(400).json(respuesta(false, 'ID de control no válido o no proporcionado'));
    }

    const camposObligatorios = ['id_reserva', 'fecha_generado', 'estado'];
    const faltantes = camposObligatorios.filter(campo => !datos[campo] || datos[campo].toString().trim() === '');

    if (faltantes.length > 0) {
      return res.status(400).json(
        respuesta(false, `Faltan campos obligatorios: ${faltantes.join(', ')}`)
      );
    }

    const estadosValidos = ['activo', 'expirado', 'usado'];
    if (!estadosValidos.includes(datos.estado)) {
      return res.status(400).json(
        respuesta(false, `Estado inválido. Debe ser uno de: ${estadosValidos.join(', ')}`)
      );
    }

    const isValidTimestamp = (ts) => !isNaN(Date.parse(ts));
    if (!isValidTimestamp(datos.fecha_generado)) {
      return res.status(400).json(
        respuesta(false, 'La fecha de generación no es válida')
      );
    }
    if (datos.fecha_expira && !isValidTimestamp(datos.fecha_expira)) {
      return res.status(400).json(
        respuesta(false, 'La fecha de expiración no es válida')
      );
    }

    const qrData = `http://localhost:3000/reserva/dato-individual/${datos.id_reserva}`;
    const uploadPath = path.join(__dirname, '../Uploads', 'qr');
    await fs.mkdir(uploadPath, { recursive: true });

    const now = new Date().toISOString().replace(/T/, '_').replace(/:/g, '-').split('.')[0];
    const random = Math.floor(Math.random() * 90000 + 10000);
    const qrFileName = `qr_reserva_${datos.id_reserva}_${now}_${random}.png`;
    qrPath = path.join(uploadPath, qrFileName);

    await QRCode.toFile(qrPath, qrData, {
      errorCorrectionLevel: 'H',
      type: 'png',
      width: 300,
      margin: 1
    });

    datos.qr_url_imagen = `/Uploads/qr/${qrFileName}`;
    datos.codigo_qr = qrData;
    datos.verificado = datos.verificado || false;

    const nuevoQR = await crearQR(id_control, datos);

    console.log('✅ QR creado exitosamente:', nuevoQR);

    res.status(201).json(
      respuesta(true, 'QR de reserva creado correctamente', { qr: nuevoQR })
    );
  } catch (error) {
    console.error('❌ Error en crearQRController:', error.message);

    if (qrPath) {
      await unlinkFile(qrPath).catch(err => {
        console.warn('⚠️ No se pudo eliminar el archivo QR:', err.message);
      });
    }

    if (error.code === '23505') {
      return res.status(400).json(
        respuesta(false, 'Ya existe un QR asociado a esta reserva')
      );
    }

    if (error.code === '23503') {
      return res.status(400).json(
        respuesta(false, 'La reserva o control asociado no existe')
      );
    }

    res.status(500).json(
      respuesta(false, error.message)
    );
  }
};

/**
 * Controlador para PATCH - Actualizar QR de reserva
 */
const actualizarQRController = async (req, res) => {
  try {
    const { id } = req.params;
    const id_control = parseInt(req.body.id_control || req.query.id_control);
    const camposActualizar = { ...req.body };

    console.log('📥 Datos recibidos para actualizar QR:', { id, camposActualizar });

    if (!id || isNaN(id)) {
      return res.status(400).json(respuesta(false, 'ID de QR no válido'));
    }
    if (!id_control || isNaN(id_control)) {
      return res.status(400).json(respuesta(false, 'ID de control no válido o no proporcionado'));
    }

    if (Object.keys(camposActualizar).length === 0) {
      return res.status(400).json(respuesta(false, 'No se proporcionaron campos para actualizar'));
    }

    const qrActual = await obtenerQRPorId(parseInt(id), id_control);
    if (!qrActual) {
      return res.status(404).json(respuesta(false, 'QR de reserva no encontrado o no pertenece al control'));
    }

    const isValidTimestamp = (ts) => !isNaN(Date.parse(ts));
    if (camposActualizar.estado) {
      const estadosValidos = ['activo', 'expirado', 'usado'];
      if (!estadosValidos.includes(camposActualizar.estado)) {
        return res.status(400).json(
          respuesta(false, `Estado inválido. Debe ser uno de: ${estadosValidos.join(', ')}`)
        );
      }
    }

    if (camposActualizar.fecha_generado && !isValidTimestamp(camposActualizar.fecha_generado)) {
      return res.status(400).json(
        respuesta(false, 'La fecha de generación no es válida')
      );
    }
    if (camposActualizar.fecha_expira && !isValidTimestamp(camposActualizar.fecha_expira)) {
      return res.status(400).json(
        respuesta(false, 'La fecha de expiración no es válida')
      );
    }

    if (camposActualizar.regenerar_qr || camposActualizar.id_reserva) {
      const qrData = `http://localhost:3000/reserva/dato-individual/${camposActualizar.id_reserva || qrActual.id_reserva}`;
      const uploadPath = path.join(__dirname, '../Uploads', 'qr');
      await fs.mkdir(uploadPath, { recursive: true });

      const now = new Date().toISOString().replace(/T/, '_').replace(/:/g, '-').split('.')[0];
      const random = Math.floor(Math.random() * 90000 + 10000);
      const qrFileName = `qr_reserva_${camposActualizar.id_reserva || qrActual.id_reserva}_${now}_${random}.png`;
      const qrPath = path.join(uploadPath, qrFileName);

      await QRCode.toFile(qrPath, qrData, {
        errorCorrectionLevel: 'H',
        type: 'png',
        width: 300,
        margin: 1
      });

      camposActualizar.qr_url_imagen = `/Uploads/qr/${qrFileName}`;
      camposActualizar.codigo_qr = qrData;

      delete camposActualizar.regenerar_qr;
    }

    const qrActualizado = await actualizarQR(parseInt(id), id_control, camposActualizar);

    if (!qrActualizado) {
      return res.status(404).json(respuesta(false, 'QR de reserva no encontrado'));
    }

    console.log('✅ QR actualizado exitosamente:', qrActualizado);

    res.json(respuesta(true, 'QR de reserva actualizado correctamente', { qr: qrActualizado }));
  } catch (error) {
    console.error('❌ Error en actualizarQRController:', error.message);

    if (error.code === '23505') {
      return res.status(400).json(
        respuesta(false, 'Ya existe un QR asociado a esta reserva')
      );
    }

    if (error.code === '23503') {
      return res.status(400).json(
        respuesta(false, 'La reserva o control asociado no existe')
      );
    }

    res.status(500).json(respuesta(false, error.message));
  }
};

/**
 * Controlador para DELETE - Eliminar QR de reserva
 */
const eliminarQRController = async (req, res) => {
  try {
    const { id } = req.params;
    const { id_control } = req.query;

    if (!id || isNaN(id)) {
      return res.status(400).json(respuesta(false, 'ID de QR no válido'));
    }
    if (!id_control || isNaN(id_control)) {
      return res.status(400).json(respuesta(false, 'ID de control no válido o no proporcionado'));
    }

    const qrEliminado = await eliminarQR(parseInt(id), parseInt(id_control));

    if (!qrEliminado) {
      return res.status(404).json(respuesta(false, 'QR de reserva no encontrado o no pertenece al control'));
    }

    res.json(respuesta(true, 'QR de reserva eliminado correctamente'));
  } catch (error) {
    console.error('Error en eliminarQR:', error.message);
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

module.exports = router;