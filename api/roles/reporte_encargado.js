const express = require('express');
const pool = require('../../config/database');

const router = express.Router();

// Función de respuesta estandarizada
const respuesta = (exito, mensaje, datos = null) => ({
  exito,
  mensaje,
  datos,
});

// MODELOS - Funciones puras para operaciones de base de datos

/**
 * Obtener datos específicos de reportes de incidencia con información del encargado y reserva
 */
const obtenerDatosEspecificos = async (id_encargado, limite = 10, offset = 0) => {
  try {
    const queryDatos = `
      SELECT ri.id_reporte, ri.detalle, ri.sugerencia, ri.verificado,
             e.id_encargado, p_e.nombre AS encargado_nombre, p_e.apellido AS encargado_apellido,
             r.id_reserva, c.id_cliente, p_c.nombre AS cliente_nombre, p_c.apellido AS cliente_apellido,
             ca.id_cancha, ca.nombre AS cancha_nombre
      FROM reporte_incidencia ri
      JOIN encargado e ON ri.id_encargado = e.id_encargado
      JOIN usuario p_e ON e.id_encargado = p_e.id_persona
      JOIN reserva r ON ri.id_reserva = r.id_reserva
      JOIN cliente c ON r.id_cliente = c.id_cliente
      JOIN usuario p_c ON c.id_cliente = p_c.id_persona
      JOIN cancha ca ON r.id_cancha = ca.id_cancha
      WHERE ri.id_encargado = $1
      ORDER BY ri.id_reporte
      LIMIT $2 OFFSET $3
    `;
    const queryTotal = `
      SELECT COUNT(*) 
      FROM reporte_incidencia 
      WHERE id_encargado = $1
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
    throw error;
  }
};

/**
 * Obtener reportes de incidencia con filtros de ordenamiento
 */
const obtenerReportesFiltrados = async (id_encargado, tipoFiltro, limite = 10, offset = 0) => {
  try {
    let whereClause = 'WHERE ri.id_encargado = $1';
    let orderClause = 'ri.id_reporte ASC';
    let queryParams = [id_encargado];
    
    switch(tipoFiltro) {
      case 'verificado_si':
        whereClause += ' AND ri.verificado = true';
        orderClause = 'ri.id_reporte ASC';
        break;
      case 'verificado_no':
        whereClause += ' AND ri.verificado = false';
        orderClause = 'ri.id_reporte ASC';
        break;
      case 'cliente_nombre':
        orderClause = 'p_c.nombre ASC, p_c.apellido ASC';
        break;
      case 'cancha_nombre':
        orderClause = 'ca.nombre ASC';
        break;
      case 'encargado_nombre':
        orderClause = 'p_e.nombre ASC, p_e.apellido ASC';
        break;
      default:
        orderClause = 'ri.id_reporte ASC';
    }

    const queryDatos = `
      SELECT ri.id_reporte, ri.detalle, ri.sugerencia, ri.verificado,
             e.id_encargado, p_e.nombre AS encargado_nombre, p_e.apellido AS encargado_apellido,
             r.id_reserva, c.id_cliente, p_c.nombre AS cliente_nombre, p_c.apellido AS cliente_apellido,
             ca.id_cancha, ca.nombre AS cancha_nombre
      FROM reporte_incidencia ri
      JOIN encargado e ON ri.id_encargado = e.id_encargado
      JOIN usuario p_e ON e.id_encargado = p_e.id_persona
      JOIN reserva r ON ri.id_reserva = r.id_reserva
      JOIN cliente c ON r.id_cliente = c.id_cliente
      JOIN usuario p_c ON c.id_cliente = p_c.id_persona
      JOIN cancha ca ON r.id_cancha = ca.id_cancha
      ${whereClause}
      ORDER BY ${orderClause}
      LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
    `;

    const queryTotal = `
      SELECT COUNT(*) 
      FROM reporte_incidencia ri
      ${whereClause}
    `;

    queryParams.push(limite, offset);

    console.log('🔍 Query ejecutada:', queryDatos);
    console.log('🎯 Filtro aplicado:', { tipoFiltro, whereClause, orderClause });

    const [resultDatos, resultTotal] = await Promise.all([
      pool.query(queryDatos, queryParams),
      pool.query(queryTotal, [id_encargado])
    ]);

    return {
      reportes: resultDatos.rows,
      total: parseInt(resultTotal.rows[0].count)
    };
  } catch (error) {
    throw new Error(`Error al obtener reportes filtrados: ${error.message}`);
  }
};

/**
 * Buscar reportes de incidencia por texto en múltiples campos
 */
const buscarReportes = async (id_encargado, texto, limite = 10, offset = 0) => {
  try {
    const queryDatos = `
      SELECT ri.id_reporte, ri.detalle, ri.sugerencia, ri.verificado,
             e.id_encargado, p_e.nombre AS encargado_nombre, p_e.apellido AS encargado_apellido,
             r.id_reserva, c.id_cliente, p_c.nombre AS cliente_nombre, p_c.apellido AS cliente_apellido,
             ca.id_cancha, ca.nombre AS cancha_nombre
      FROM reporte_incidencia ri
      JOIN encargado e ON ri.id_encargado = e.id_encargado
      JOIN usuario p_e ON e.id_encargado = p_e.id_persona
      JOIN reserva r ON ri.id_reserva = r.id_reserva
      JOIN cliente c ON r.id_cliente = c.id_cliente
      JOIN usuario p_c ON c.id_cliente = p_c.id_persona
      JOIN cancha ca ON r.id_cancha = ca.id_cancha
      WHERE ri.id_encargado = $1 AND (
        p_e.nombre ILIKE $2 OR 
        p_e.apellido ILIKE $2 OR 
        p_c.nombre ILIKE $2 OR 
        p_c.apellido ILIKE $2 OR 
        ca.nombre ILIKE $2 OR 
        ri.detalle ILIKE $2 OR 
        ri.sugerencia ILIKE $2
      )
      ORDER BY ri.id_reporte
      LIMIT $3 OFFSET $4
    `;

    const queryTotal = `
      SELECT COUNT(*) 
      FROM reporte_incidencia ri
      JOIN encargado e ON ri.id_encargado = e.id_encargado
      JOIN usuario p_e ON e.id_encargado = p_e.id_persona
      JOIN reserva r ON ri.id_reserva = r.id_reserva
      JOIN cliente c ON r.id_cliente = c.id_cliente
      JOIN usuario p_c ON c.id_cliente = p_c.id_persona
      JOIN cancha ca ON r.id_cancha = ca.id_cancha
      WHERE ri.id_encargado = $1 AND (
        p_e.nombre ILIKE $2 OR 
        p_e.apellido ILIKE $2 OR 
        p_c.nombre ILIKE $2 OR 
        p_c.apellido ILIKE $2 OR 
        ca.nombre ILIKE $2 OR 
        ri.detalle ILIKE $2 OR 
        ri.sugerencia ILIKE $2
      )
    `;
    
    const sanitizeInput = (input) => input.replace(/[%_\\]/g, '\\$&');
    const terminoBusqueda = `%${sanitizeInput(texto)}%`;
    
    const [resultDatos, resultTotal] = await Promise.all([
      pool.query(queryDatos, [id_encargado, terminoBusqueda, limite, offset]),
      pool.query(queryTotal, [id_encargado, terminoBusqueda])
    ]);

    return {
      reportes: resultDatos.rows,
      total: parseInt(resultTotal.rows[0].count)
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Obtener reporte de incidencia por ID
 */
const obtenerReportePorId = async (id, id_encargado) => {
  try {
    const query = `
      SELECT ri.*, 
             e.id_encargado, p_e.nombre AS encargado_nombre, p_e.apellido AS encargado_apellido, p_e.correo AS encargado_correo,
             r.id_reserva, c.id_cliente, p_c.nombre AS cliente_nombre, p_c.apellido AS cliente_apellido,
             ca.id_cancha, ca.nombre AS cancha_nombre
      FROM reporte_incidencia ri
      JOIN encargado e ON ri.id_encargado = e.id_encargado
      JOIN usuario p_e ON e.id_encargado = p_e.id_persona
      JOIN reserva r ON ri.id_reserva = r.id_reserva
      JOIN cliente c ON r.id_cliente = c.id_cliente
      JOIN usuario p_c ON c.id_cliente = p_c.id_persona
      JOIN cancha ca ON r.id_cancha = ca.id_cancha
      WHERE ri.id_reporte = $1 AND ri.id_encargado = $2
    `;
    const result = await pool.query(query, [id, id_encargado]);
    return result.rows[0] || null;
  } catch (error) {
    throw error;
  }
};

/**
 * Crear nuevo reporte de incidencia
 */
const crearReporte = async (id_encargado, datosReporte) => {
  try {
    // Validaciones básicas
    if (!datosReporte.id_encargado || isNaN(datosReporte.id_encargado)) {
      throw new Error('El ID del encargado es obligatorio y debe ser un número');
    }
    if (datosReporte.id_encargado !== id_encargado) {
      throw new Error('El ID del encargado proporcionado no coincide con el autorizado');
    }
    if (!datosReporte.id_reserva || isNaN(datosReporte.id_reserva)) {
      throw new Error('El ID de la reserva es obligatorio y debe ser un número');
    }

    // Validar verificado
    if (datosReporte.verificado !== undefined && typeof datosReporte.verificado !== 'boolean') {
      throw new Error('El campo verificado debe ser un valor booleano');
    }

    // Verificar si el encargado existe
    const encargadoQuery = `
      SELECT id_encargado FROM encargado WHERE id_encargado = $1
    `;
    const encargadoResult = await pool.query(encargadoQuery, [id_encargado]);
    if (!encargadoResult.rows[0]) {
      throw new Error('El encargado asociado no existe');
    }

    // Verificar si la reserva existe
    const reservaQuery = `
      SELECT id_reserva FROM reserva WHERE id_reserva = $1
    `;
    const reservaResult = await pool.query(reservaQuery, [datosReporte.id_reserva]);
    if (!reservaResult.rows[0]) {
      throw new Error('La reserva asociada no existe');
    }

    const query = `
      INSERT INTO reporte_incidencia (
        detalle, sugerencia, id_encargado, id_reserva, verificado
      ) 
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;

    const values = [
      datosReporte.detalle || null,
      datosReporte.sugerencia || null,
      id_encargado,
      datosReporte.id_reserva,
      datosReporte.verificado !== undefined ? datosReporte.verificado : false
    ];

    const { rows } = await pool.query(query, values);
    return rows[0];
  } catch (error) {
    console.error('Error al crear reporte de incidencia:', error.message);
    throw new Error(error.message);
  }
};

/**
 * Actualizar reporte de incidencia parcialmente
 */
const actualizarReporte = async (id, id_encargado, camposActualizar) => {
  try {
    const camposPermitidos = ['detalle', 'sugerencia', 'id_encargado', 'id_reserva', 'verificado'];

    const campos = Object.keys(camposActualizar).filter(key => 
      camposPermitidos.includes(key)
    );

    if (campos.length === 0) {
      throw new Error('No hay campos válidos para actualizar');
    }

    // Verificar que el reporte pertenece al encargado
    const reporteQuery = `
      SELECT id_reporte 
      FROM reporte_incidencia 
      WHERE id_reporte = $1 AND id_encargado = $2
    `;
    const reporteResult = await pool.query(reporteQuery, [id, id_encargado]);
    if (!reporteResult.rows[0]) {
      throw new Error('Reporte no encontrado o no pertenece al encargado');
    }

    // Validar verificado
    if (camposActualizar.verificado !== undefined && typeof camposActualizar.verificado !== 'boolean') {
      throw new Error('El campo verificado debe ser un valor booleano');
    }

    // Validar encargado si se proporciona
    if (camposActualizar.id_encargado) {
      if (camposActualizar.id_encargado !== id_encargado) {
        throw new Error('No se puede cambiar el ID del encargado a un valor diferente');
      }
      const encargadoQuery = `
        SELECT id_encargado FROM encargado WHERE id_encargado = $1
      `;
      const encargadoResult = await pool.query(encargadoQuery, [camposActualizar.id_encargado]);
      if (!encargadoResult.rows[0]) {
        throw new Error('El encargado asociado no existe');
      }
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
    }

    const setClause = campos.map((campo, index) => `${campo} = $${index + 2}`).join(', ');
    const values = campos.map(campo => {
      const value = camposActualizar[campo];
      if (['verificado'].includes(campo)) {
        return value;
      }
      if (['detalle', 'sugerencia'].includes(campo)) {
        return value || null;
      }
      return value !== undefined && value !== null ? value : null;
    });

    console.log('🔧 Actualizando reporte:', { id, campos, values });

    const query = `
      UPDATE reporte_incidencia 
      SET ${setClause}
      WHERE id_reporte = $1
      RETURNING *
    `;

    const result = await pool.query(query, [id, ...values]);
    return result.rows[0] || null;
  } catch (error) {
    console.error('❌ Error en actualizarReporte:', error.message);
    throw error;
  }
};

/**
 * Eliminar reporte de incidencia
 */
const eliminarReporte = async (id, id_encargado) => {
  try {
    const query = `
      DELETE FROM reporte_incidencia 
      WHERE id_reporte = $1 AND id_encargado = $2 
      RETURNING id_reporte
    `;
    const result = await pool.query(query, [id, id_encargado]);
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
    const id_encargado = parseInt(req.query.id_encargado);
    const limite = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;

    if (!id_encargado || isNaN(id_encargado)) {
      return res.status(400).json(respuesta(false, 'ID de encargado no válido o no proporcionado'));
    }

    const { reportes, total } = await obtenerDatosEspecificos(id_encargado, limite, offset);
    
    res.json(respuesta(true, 'Reportes de incidencia obtenidos correctamente', {
      reportes,
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
const obtenerReportesFiltradosController = async (req, res) => {
  try {
    const { tipo, id_encargado } = req.query;
    const limite = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;

    if (!id_encargado || isNaN(id_encargado)) {
      return res.status(400).json(respuesta(false, 'ID de encargado no válido o no proporcionado'));
    }

    const tiposValidos = ['verificado_si', 'verificado_no', 'cliente_nombre', 'cancha_nombre', 'encargado_nombre'];
    
    if (!tipo || !tiposValidos.includes(tipo)) {
      return res.status(400).json(respuesta(false, 
        `El parámetro "tipo" es inválido. Valores permitidos: ${tiposValidos.join(', ')}`
      ));
    }

    const { reportes, total } = await obtenerReportesFiltrados(id_encargado, tipo, limite, offset);

    res.json(respuesta(true, `Reportes de incidencia filtrados por ${tipo} obtenidos correctamente`, {
      reportes,
      filtro: tipo,
      paginacion: { limite, offset, total }
    }));
  } catch (error) {
    console.error('Error en obtenerReportesFiltrados:', error.message);
    res.status(500).json(respuesta(false, error.message));
  }
};

/**
 * Controlador para GET /buscar
 */
const buscarReportesController = async (req, res) => {
  try {
    const { q, id_encargado } = req.query;
    const limite = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;

    if (!id_encargado || isNaN(id_encargado)) {
      return res.status(400).json(respuesta(false, 'ID de encargado no válido o no proporcionado'));
    }

    if (!q) {
      return res.status(400).json(respuesta(false, 'El parámetro de búsqueda "q" es requerido'));
    }

    const { reportes, total } = await buscarReportes(id_encargado, q, limite, offset);
    
    res.json(respuesta(true, 'Reportes de incidencia obtenidos correctamente', {
      reportes,
      paginacion: { limite, offset, total }
    }));
  } catch (error) {
    console.error('Error en buscarReportes:', error.message);
    res.status(500).json(respuesta(false, error.message));
  }
};

/**
 * Controlador para GET /dato-individual/:id
 */
const obtenerReportePorIdController = async (req, res) => {
  try {
    const { id } = req.params;
    const { id_encargado } = req.query;

    if (!id || isNaN(id)) {
      return res.status(400).json(respuesta(false, 'ID de reporte no válido'));
    }
    if (!id_encargado || isNaN(id_encargado)) {
      return res.status(400).json(respuesta(false, 'ID de encargado no válido o no proporcionado'));
    }

    const reporte = await obtenerReportePorId(parseInt(id), parseInt(id_encargado));

    if (!reporte) {
      return res.status(404).json(respuesta(false, 'Reporte de incidencia no encontrado o no pertenece al encargado'));
    }

    res.json(respuesta(true, 'Reporte de incidencia obtenido correctamente', { reporte }));
  } catch (error) {
    console.error('Error en obtenerReportePorId:', error.message);
    res.status(500).json(respuesta(false, error.message));
  }
};

/**
 * Controlador para POST - Crear reporte de incidencia
 */
const crearReporteController = async (req, res) => {
  try {
    const datos = req.body;
    const id_encargado = parseInt(req.body.id_encargado || req.query.id_encargado);

    if (!id_encargado || isNaN(id_encargado)) {
      return res.status(400).json(respuesta(false, 'ID de encargado no válido o no proporcionado'));
    }

    const camposObligatorios = ['id_encargado', 'id_reserva'];
    const faltantes = camposObligatorios.filter(campo => !datos[campo] || datos[campo].toString().trim() === '');

    if (faltantes.length > 0) {
      return res.status(400).json(
        respuesta(false, `Faltan campos obligatorios: ${faltantes.join(', ')}`)
      );
    }

    const nuevoReporte = await crearReporte(id_encargado, datos);

    res.status(201).json(respuesta(true, 'Reporte de incidencia creado correctamente', { reporte: nuevoReporte }));
  } catch (error) {
    console.error('Error en crearReporte:', error.message);
    
    if (error.code === '23505') {
      return res.status(400).json(respuesta(false, 'El reporte de incidencia ya existe'));
    }

    res.status(500).json(respuesta(false, error.message));
  }
};

/**
 * Controlador para PATCH - Actualizar reporte de incidencia
 */
const actualizarReporteController = async (req, res) => {
  try {
    const { id } = req.params;
    const id_encargado = parseInt(req.body.id_encargado || req.query.id_encargado);
    const camposActualizar = req.body;

    if (!id || isNaN(id)) {
      return res.status(400).json(respuesta(false, 'ID de reporte no válido'));
    }
    if (!id_encargado || isNaN(id_encargado)) {
      return res.status(400).json(respuesta(false, 'ID de encargado no válido o no proporcionado'));
    }

    if (Object.keys(camposActualizar).length === 0) {
      return res.status(400).json(respuesta(false, 'No se proporcionaron campos para actualizar'));
    }

    const reporteActualizado = await actualizarReporte(parseInt(id), id_encargado, camposActualizar);

    if (!reporteActualizado) {
      return res.status(404).json(respuesta(false, 'Reporte de incidencia no encontrado o no pertenece al encargado'));
    }

    res.json(respuesta(true, 'Reporte de incidencia actualizado correctamente', { reporte: reporteActualizado }));
  } catch (error) {
    console.error('Error en actualizarReporte:', error.message);
    res.status(500).json(respuesta(false, error.message));
  }
};

/**
 * Controlador para DELETE - Eliminar reporte de incidencia
 */
const eliminarReporteController = async (req, res) => {
  try {
    const { id } = req.params;
    const { id_encargado } = req.query;

    if (!id || isNaN(id)) {
      return res.status(400).json(respuesta(false, 'ID de reporte no válido'));
    }
    if (!id_encargado || isNaN(id_encargado)) {
      return res.status(400).json(respuesta(false, 'ID de encargado no válido o no proporcionado'));
    }

    const reporteEliminado = await eliminarReporte(parseInt(id), parseInt(id_encargado));

    if (!reporteEliminado) {
      return res.status(404).json(respuesta(false, 'Reporte de incidencia no encontrado o no pertenece al encargado'));
    }

    res.json(respuesta(true, 'Reporte de incidencia eliminado correctamente'));
  } catch (error) {
    console.error('Error en eliminarReporte:', error.message);
    res.status(500).json(respuesta(false, error.message));
  }
};

// RUTAS
router.get('/datos-especificos', obtenerDatosEspecificosController);
router.get('/filtro', obtenerReportesFiltradosController);
router.get('/buscar', buscarReportesController);
router.get('/dato-individual/:id', obtenerReportePorIdController);
router.post('/', crearReporteController);
router.patch('/:id', actualizarReporteController);
router.delete('/:id', eliminarReporteController);

module.exports = router;