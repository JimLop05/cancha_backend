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
 * Obtener datos específicos de reseñas con información de la reserva
 */
const obtenerDatosEspecificos = async (id_cliente, limite = 10, offset = 0) => {
  try {
    const queryDatos = `
      SELECT re.id_resena, re.estrellas, re.comentario, re.fecha_creacion, re.estado, re.verificado,
             r.id_reserva, c.id_cliente, p.nombre AS cliente_nombre, p.apellido AS cliente_apellido,
             ca.id_cancha, ca.nombre AS cancha_nombre
      FROM resena re
      JOIN reserva r ON re.id_reserva = r.id_reserva
      JOIN cliente c ON r.id_cliente = c.id_cliente
      JOIN usuario p ON c.id_cliente = p.id_persona
      JOIN cancha ca ON r.id_cancha = ca.id_cancha
      WHERE r.id_cliente = $1
      ORDER BY re.id_resena
      LIMIT $2 OFFSET $3
    `;
    const queryTotal = `
      SELECT COUNT(*) 
      FROM resena re
      JOIN reserva r ON re.id_reserva = r.id_reserva
      WHERE r.id_cliente = $1
    `;
    const [resultDatos, resultTotal] = await Promise.all([
      pool.query(queryDatos, [id_cliente, limite, offset]),
      pool.query(queryTotal, [id_cliente])
    ]);
    return {
      resenas: resultDatos.rows,
      total: parseInt(resultTotal.rows[0].count)
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Obtener reseñas con filtros de ordenamiento
 */
const obtenerResenasFiltradas = async (id_cliente, tipoFiltro, limite = 10, offset = 0) => {
  try {
    let whereClause = 'WHERE r.id_cliente = $1';
    let orderClause = 're.id_resena ASC';
    let queryParams = [id_cliente];
    
    // Definir filtros
    switch(tipoFiltro) {
      case 'verificado_si':
        whereClause += ' AND re.verificado = true';
        orderClause = 're.fecha_creacion DESC';
        break;
      case 'verificado_no':
        whereClause += ' AND re.verificado = false';
        orderClause = 're.fecha_creacion DESC';
        break;
      case 'cliente_nombre':
        orderClause = 'p.nombre ASC, p.apellido ASC';
        break;
      case 'cancha_nombre':
        orderClause = 'ca.nombre ASC';
        break;
      default:
        orderClause = 're.id_resena ASC';
    }

    const queryDatos = `
      SELECT re.id_resena, re.estrellas, re.comentario, re.fecha_creacion, re.estado, re.verificado,
             r.id_reserva, c.id_cliente, p.nombre AS cliente_nombre, p.apellido AS cliente_apellido,
             ca.id_cancha, ca.nombre AS cancha_nombre
      FROM resena re
      JOIN reserva r ON re.id_reserva = r.id_reserva
      JOIN cliente c ON r.id_cliente = c.id_cliente
      JOIN usuario p ON c.id_cliente = p.id_persona
      JOIN cancha ca ON r.id_cancha = ca.id_cancha
      ${whereClause}
      ORDER BY ${orderClause}
      LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
    `;

    const queryTotal = `
      SELECT COUNT(*) 
      FROM resena re
      JOIN reserva r ON re.id_reserva = r.id_reserva
      ${whereClause}
    `;

    queryParams.push(limite, offset);

    console.log('🔍 Query ejecutada:', queryDatos);
    console.log('🎯 Filtro aplicado:', { tipoFiltro, whereClause, orderClause });

    const [resultDatos, resultTotal] = await Promise.all([
      pool.query(queryDatos, queryParams),
      pool.query(queryTotal, [id_cliente])
    ]);

    return {
      resenas: resultDatos.rows,
      total: parseInt(resultTotal.rows[0].count)
    };
  } catch (error) {
    throw new Error(`Error al obtener reseñas filtradas: ${error.message}`);
  }
};

/**
 * Buscar reseñas por texto en múltiples campos
 */
const buscarResenas = async (id_cliente, texto, limite = 10, offset = 0) => {
  try {
    const queryDatos = `
      SELECT re.id_resena, re.estrellas, re.comentario, re.fecha_creacion, re.estado, re.verificado,
             r.id_reserva, c.id_cliente, p.nombre AS cliente_nombre, p.apellido AS cliente_apellido,
             ca.id_cancha, ca.nombre AS cancha_nombre
      FROM resena re
      JOIN reserva r ON re.id_reserva = r.id_reserva
      JOIN cliente c ON r.id_cliente = c.id_cliente
      JOIN usuario p ON c.id_cliente = p.id_persona
      JOIN cancha ca ON r.id_cancha = ca.id_cancha
      WHERE r.id_cliente = $1 AND (
        p.nombre ILIKE $2 OR 
        p.apellido ILIKE $2 OR 
        ca.nombre ILIKE $2 OR 
        re.comentario ILIKE $2
      )
      ORDER BY re.fecha_creacion DESC
      LIMIT $3 OFFSET $4
    `;

    const queryTotal = `
      SELECT COUNT(*) 
      FROM resena re
      JOIN reserva r ON re.id_reserva = r.id_reserva
      JOIN cliente c ON r.id_cliente = c.id_cliente
      JOIN usuario p ON c.id_cliente = p.id_persona
      JOIN cancha ca ON r.id_cancha = ca.id_cancha
      WHERE r.id_cliente = $1 AND (
        p.nombre ILIKE $2 OR 
        p.apellido ILIKE $2 OR 
        ca.nombre ILIKE $2 OR 
        re.comentario ILIKE $2
      )
    `;
    
    const sanitizeInput = (input) => input.replace(/[%_\\]/g, '\\$&');
    const terminoBusqueda = `%${sanitizeInput(texto)}%`;
    
    const [resultDatos, resultTotal] = await Promise.all([
      pool.query(queryDatos, [id_cliente, terminoBusqueda, limite, offset]),
      pool.query(queryTotal, [id_cliente, terminoBusqueda])
    ]);

    return {
      resenas: resultDatos.rows,
      total: parseInt(resultTotal.rows[0].count)
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Obtener reseña por ID
 */
const obtenerResenaPorId = async (id, id_cliente) => {
  try {
    const query = `
      SELECT re.*, 
             r.id_reserva, c.id_cliente, p.nombre AS cliente_nombre, p.apellido AS cliente_apellido, p.correo AS cliente_correo,
             ca.id_cancha, ca.nombre AS cancha_nombre
      FROM resena re
      JOIN reserva r ON re.id_reserva = r.id_reserva
      JOIN cliente c ON r.id_cliente = c.id_cliente
      JOIN usuario p ON c.id_cliente = p.id_persona
      JOIN cancha ca ON r.id_cancha = ca.id_cancha
      WHERE re.id_resena = $1 AND r.id_cliente = $2
    `;
    const result = await pool.query(query, [id, id_cliente]);
    return result.rows[0] || null;
  } catch (error) {
    throw error;
  }
};

/**
 * Crear nueva reseña
 */
const crearResena = async (id_cliente, datosResena) => {
  try {
    // Validaciones básicas
    if (!datosResena.id_reserva || isNaN(datosResena.id_reserva)) {
      throw new Error('El ID de la reserva es obligatorio y debe ser un número');
    }
    if (!datosResena.estrellas || isNaN(datosResena.estrellas) || datosResena.estrellas < 1 || datosResena.estrellas > 5) {
      throw new Error('Las estrellas son obligatorias y deben estar entre 1 y 5');
    }

    // Validar estado si se proporciona
    if (datosResena.estado !== undefined && typeof datosResena.estado !== 'boolean') {
      throw new Error('El estado debe ser un valor booleano');
    }

    // Validar verificado
    if (datosResena.verificado !== undefined && typeof datosResena.verificado !== 'boolean') {
      throw new Error('El campo verificado debe ser un valor booleano');
    }

    // Verificar si la reserva existe y pertenece al cliente
    const reservaQuery = `
      SELECT id_reserva 
      FROM reserva 
      WHERE id_reserva = $1 AND id_cliente = $2
    `;
    const reservaResult = await pool.query(reservaQuery, [datosResena.id_reserva, id_cliente]);
    if (!reservaResult.rows[0]) {
      throw new Error('La reserva asociada no existe o no pertenece al cliente');
    }

    // Verificar si ya existe una reseña para esta reserva
    const resenaExistenteQuery = `
      SELECT id_resena 
      FROM resena 
      WHERE id_reserva = $1
    `;
    const resenaExistenteResult = await pool.query(resenaExistenteQuery, [datosResena.id_reserva]);
    if (resenaExistenteResult.rows[0]) {
      throw new Error('Ya existe una reseña asociada a esta reserva');
    }

    const query = `
      INSERT INTO resena (
        id_reserva, estrellas, comentario, estado, verificado
      ) 
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;

    const values = [
      datosResena.id_reserva,
      datosResena.estrellas,
      datosResena.comentario || null,
      datosResena.estado !== undefined ? datosResena.estado : false,
      datosResena.verificado !== undefined ? datosResena.verificado : false
    ];

    const { rows } = await pool.query(query, values);
    return rows[0];
  } catch (error) {
    console.error('Error al crear reseña:', error.message);
    throw new Error(error.message);
  }
};

/**
 * Actualizar reseña parcialmente
 */
const actualizarResena = async (id, id_cliente, camposActualizar) => {
  try {
    const camposPermitidos = ['id_reserva', 'estrellas', 'comentario', 'estado', 'verificado'];

    const campos = Object.keys(camposActualizar).filter(key => 
      camposPermitidos.includes(key)
    );

    if (campos.length === 0) {
      throw new Error('No hay campos válidos para actualizar');
    }

    // Verificar que la reseña pertenece al cliente
    const resenaQuery = `
      SELECT re.id_resena 
      FROM resena re
      JOIN reserva r ON re.id_reserva = r.id_reserva
      WHERE re.id_resena = $1 AND r.id_cliente = $2
    `;
    const resenaResult = await pool.query(resenaQuery, [id, id_cliente]);
    if (!resenaResult.rows[0]) {
      throw new Error('Reseña no encontrada o no pertenece al cliente');
    }

    // Validar estrellas
    if (camposActualizar.estrellas && (isNaN(camposActualizar.estrellas) || camposActualizar.estrellas < 1 || camposActualizar.estrellas > 5)) {
      throw new Error('Las estrellas deben estar entre 1 y 5');
    }

    // Validar estado
    if (camposActualizar.estado !== undefined && typeof camposActualizar.estado !== 'boolean') {
      throw new Error('El estado debe ser un valor booleano');
    }

    // Validar verificado
    if (camposActualizar.verificado !== undefined && typeof camposActualizar.verificado !== 'boolean') {
      throw new Error('El campo verificado debe ser un valor booleano');
    }

    // Validar reserva si se proporciona
    if (camposActualizar.id_reserva) {
      const reservaQuery = `
        SELECT id_reserva 
        FROM reserva 
        WHERE id_reserva = $1 AND id_cliente = $2
      `;
      const reservaResult = await pool.query(reservaQuery, [camposActualizar.id_reserva, id_cliente]);
      if (!reservaResult.rows[0]) {
        throw new Error('La reserva asociada no existe o no pertenece al cliente');
      }
      // Verificar unicidad de id_reserva
      const resenaExistenteQuery = `
        SELECT id_resena 
        FROM resena 
        WHERE id_reserva = $1 AND id_resena != $2
      `;
      const resenaExistenteResult = await pool.query(resenaExistenteQuery, [camposActualizar.id_reserva, id]);
      if (resenaExistenteResult.rows[0]) {
        throw new Error('Ya existe otra reseña asociada a esta reserva');
      }
    }

    const setClause = campos.map((campo, index) => `${campo} = $${index + 2}`).join(', ');
    const values = campos.map(campo => {
      const value = camposActualizar[campo];
      if (['comentario'].includes(campo)) {
        return value || null;
      }
      if (['estado', 'verificado'].includes(campo)) {
        return value;
      }
      return value !== undefined && value !== null ? value : null;
    });

    const query = `
      UPDATE resena 
      SET ${setClause}
      WHERE id_resena = $1
      RETURNING *
    `;

    const result = await pool.query(query, [id, ...values]);
    return result.rows[0] || null;
  } catch (error) {
    throw error;
  }
};

/**
 * Eliminar reseña
 */
const eliminarResena = async (id, id_cliente) => {
  try {
    const query = `
      DELETE FROM resena re
      USING reserva r
      WHERE re.id_resena = $1 AND re.id_reserva = r.id_reserva AND r.id_cliente = $2
      RETURNING re.id_resena
    `;
    const result = await pool.query(query, [id, id_cliente]);
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
    const id_cliente = parseInt(req.query.id_cliente);
    const limite = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;

    if (!id_cliente || isNaN(id_cliente)) {
      return res.status(400).json(respuesta(false, 'ID de cliente no válido o no proporcionado'));
    }

    const { resenas, total } = await obtenerDatosEspecificos(id_cliente, limite, offset);
    
    res.json(respuesta(true, 'Reseñas obtenidas correctamente', {
      resenas,
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
const obtenerResenasFiltradasController = async (req, res) => {
  try {
    const { tipo, id_cliente } = req.query;
    const limite = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;

    if (!id_cliente || isNaN(id_cliente)) {
      return res.status(400).json(respuesta(false, 'ID de cliente no válido o no proporcionado'));
    }

    const tiposValidos = ['verificado_si', 'verificado_no', 'cliente_nombre', 'cancha_nombre'];
    
    if (!tipo || !tiposValidos.includes(tipo)) {
      return res.status(400).json(respuesta(false, 
        `El parámetro "tipo" es inválido. Valores permitidos: ${tiposValidos.join(', ')}`
      ));
    }

    const { resenas, total } = await obtenerResenasFiltradas(id_cliente, tipo, limite, offset);

    res.json(respuesta(true, `Reseñas filtradas por ${tipo} obtenidas correctamente`, {
      resenas,
      filtro: tipo,
      paginacion: { limite, offset, total }
    }));
  } catch (error) {
    console.error('Error en obtenerResenasFiltradas:', error.message);
    res.status(500).json(respuesta(false, error.message));
  }
};

/**
 * Controlador para GET /buscar
 */
const buscarResenasController = async (req, res) => {
  try {
    const { q, id_cliente } = req.query;
    const limite = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;

    if (!id_cliente || isNaN(id_cliente)) {
      return res.status(400).json(respuesta(false, 'ID de cliente no válido o no proporcionado'));
    }

    if (!q) {
      return res.status(400).json(respuesta(false, 'El parámetro de búsqueda "q" es requerido'));
    }

    const { resenas, total } = await buscarResenas(id_cliente, q, limite, offset);
    
    res.json(respuesta(true, 'Reseñas obtenidas correctamente', {
      resenas,
      paginacion: { limite, offset, total }
    }));
  } catch (error) {
    console.error('Error en buscarResenas:', error.message);
    res.status(500).json(respuesta(false, error.message));
  }
};

/**
 * Controlador para GET /dato-individual/:id
 */
const obtenerResenaPorIdController = async (req, res) => {
  try {
    const { id } = req.params;
    const { id_cliente } = req.query;

    console.log('🔍 Solicitando reseña con ID:', id, 'para cliente:', id_cliente);

    if (!id || isNaN(id)) {
      return res.status(400).json(respuesta(false, 'ID de reseña no válido'));
    }
    if (!id_cliente || isNaN(id_cliente)) {
      return res.status(400).json(respuesta(false, 'ID de cliente no válido o no proporcionado'));
    }

    const resena = await obtenerResenaPorId(parseInt(id), parseInt(id_cliente));

    if (!resena) {
      return res.status(404).json(respuesta(false, 'Reseña no encontrada o no pertenece al cliente'));
    }

    res.json(respuesta(true, 'Reseña obtenida correctamente', { resena }));
  } catch (error) {
    console.error('Error en obtenerResenaPorId:', error.message);
    res.status(500).json(respuesta(false, error.message));
  }
};

/**
 * Controlador para POST - Crear reseña
 */
const crearResenaController = async (req, res) => {
  try {
    const datos = req.body;
    const id_cliente = parseInt(req.body.id_cliente || req.query.id_cliente);

    if (!id_cliente || isNaN(id_cliente)) {
      return res.status(400).json(respuesta(false, 'ID de cliente no válido o no proporcionado'));
    }

    const camposObligatorios = ['id_reserva', 'estrellas'];
    const faltantes = camposObligatorios.filter(campo => !datos[campo] || datos[campo].toString().trim() === '');

    if (faltantes.length > 0) {
      return res.status(400).json(
        respuesta(false, `Faltan campos obligatorios: ${faltantes.join(', ')}`)
      );
    }

    const nuevaResena = await crearResena(id_cliente, datos);

    res.status(201).json(respuesta(true, 'Reseña creada correctamente', { resena: nuevaResena }));
  } catch (error) {
    console.error('Error en crearResena:', error.message);
    
    if (error.code === '23505') {
      return res.status(400).json(respuesta(false, 'Ya existe una reseña asociada a esta reserva'));
    }

    res.status(500).json(respuesta(false, error.message));
  }
};

/**
 * Controlador para PATCH - Actualizar reseña
 */
const actualizarResenaController = async (req, res) => {
  try {
    const { id } = req.params;
    const id_cliente = parseInt(req.body.id_cliente || req.query.id_cliente);
    const camposActualizar = req.body;

    if (!id || isNaN(id)) {
      return res.status(400).json(respuesta(false, 'ID de reseña no válido'));
    }
    if (!id_cliente || isNaN(id_cliente)) {
      return res.status(400).json(respuesta(false, 'ID de cliente no válido o no proporcionado'));
    }

    if (Object.keys(camposActualizar).length === 0) {
      return res.status(400).json(respuesta(false, 'No se proporcionaron campos para actualizar'));
    }

    const resenaActualizada = await actualizarResena(parseInt(id), id_cliente, camposActualizar);

    if (!resenaActualizada) {
      return res.status(404).json(respuesta(false, 'Reseña no encontrada o no pertenece al cliente'));
    }

    res.json(respuesta(true, 'Reseña actualizada correctamente', { resena: resenaActualizada }));
  } catch (error) {
    console.error('Error en actualizarResena:', error.message);
    res.status(500).json(respuesta(false, error.message));
  }
};

/**
 * Controlador para DELETE - Eliminar reseña
 */
const eliminarResenaController = async (req, res) => {
  try {
    const { id } = req.params;
    const { id_cliente } = req.query;

    if (!id || isNaN(id)) {
      return res.status(400).json(respuesta(false, 'ID de reseña no válido'));
    }
    if (!id_cliente || isNaN(id_cliente)) {
      return res.status(400).json(respuesta(false, 'ID de cliente no válido o no proporcionado'));
    }

    const resenaEliminada = await eliminarResena(parseInt(id), parseInt(id_cliente));

    if (!resenaEliminada) {
      return res.status(404).json(respuesta(false, 'Reseña no encontrada o no pertenece al cliente'));
    }

    res.json(respuesta(true, 'Reseña eliminada correctamente'));
  } catch (error) {
    console.error('Error en eliminarResena:', error.message);
    res.status(500).json(respuesta(false, error.message));
  }
};

// RUTAS

// GET endpoints
router.get('/datos-especificos', obtenerDatosEspecificosController);
router.get('/filtro', obtenerResenasFiltradasController);
router.get('/buscar', buscarResenasController);
router.get('/dato-individual/:id', obtenerResenaPorIdController);

// POST, PATCH, DELETE endpoints
router.post('/', crearResenaController);
router.patch('/:id', actualizarResenaController);
router.delete('/:id', eliminarResenaController);

module.exports = router;