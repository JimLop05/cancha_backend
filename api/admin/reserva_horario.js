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
 * Obtener datos específicos de horarios de reserva con información de la reserva
 */
const obtenerDatosEspecificos = async (limite = 10, offset = 0) => {
  try {
    const queryDatos = `
      SELECT rh.id_horario, rh.fecha, rh.hora_inicio, rh.hora_fin, rh.monto,
             r.id_reserva, a.id_anfitrion, p.nombre AS cliente_nombre, p.apellido AS cliente_apellido,
             ca.id_cancha, ca.nombre AS cancha_nombre
      FROM reserva_horario rh
      JOIN reserva r ON rh.id_reserva = r.id_reserva
      JOIN anfitrion a ON r.id_anfitrion = a.id_anfitrion
      JOIN cliente c ON a.id_anfitrion = c.id_cliente
      JOIN usuario p ON c.id_cliente = p.id_persona
      JOIN cancha ca ON r.id_cancha = ca.id_cancha
      ORDER BY rh.id_horario
      LIMIT $1 OFFSET $2
    `;
    const queryTotal = `SELECT COUNT(*) FROM reserva_horario`;
    const [resultDatos, resultTotal] = await Promise.all([
      pool.query(queryDatos, [limite, offset]),
      pool.query(queryTotal)
    ]);
    return {
      horarios: resultDatos.rows,
      total: parseInt(resultTotal.rows[0].count)
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Obtener horarios de reserva con filtros de ordenamiento
 */
const obtenerHorariosFiltrados = async (tipoFiltro, limite = 10, offset = 0) => {
  try {
    const ordenesPermitidas = {
      fecha: 'rh.fecha DESC, rh.hora_inicio ASC',
      hora: 'rh.hora_inicio ASC',
      monto: 'rh.monto ASC',
      default: 'rh.id_horario ASC'
    };

    const orden = ordenesPermitidas[tipoFiltro] || ordenesPermitidas.default;

    const queryDatos = `
      SELECT rh.id_horario, rh.fecha, rh.hora_inicio, rh.hora_fin, rh.monto,
             r.id_reserva, a.id_anfitrion, p.nombre AS cliente_nombre, p.apellido AS cliente_apellido,
             ca.id_cancha, ca.nombre AS cancha_nombre
      FROM reserva_horario rh
      JOIN reserva r ON rh.id_reserva = r.id_reserva
      JOIN anfitrion a ON r.id_anfitrion = a.id_anfitrion
      JOIN cliente c ON a.id_anfitrion = c.id_cliente
      JOIN usuario p ON c.id_cliente = p.id_persona
      JOIN cancha ca ON r.id_cancha = ca.id_cancha
      ORDER BY ${orden}
      LIMIT $1 OFFSET $2
    `;
    const queryTotal = `SELECT COUNT(*) FROM reserva_horario`;

    const [resultDatos, resultTotal] = await Promise.all([
      pool.query(queryDatos, [limite, offset]),
      pool.query(queryTotal)
    ]);

    return {
      horarios: resultDatos.rows,
      total: parseInt(resultTotal.rows[0].count)
    };
  } catch (error) {
    throw new Error(`Error al obtener horarios filtrados: ${error.message}`);
  }
};

/**
 * Buscar horarios de reserva por texto en múltiples campos
 */
const buscarHorarios = async (texto, limite = 10, offset = 0) => {
  try {

    const queryDatos = `
      SELECT rh.id_horario, rh.fecha, rh.hora_inicio, rh.hora_fin, rh.monto,
             r.id_reserva, a.id_anfitrion, p.nombre AS cliente_nombre, p.apellido AS cliente_apellido,
             ca.id_cancha, ca.nombre AS cancha_nombre
      FROM reserva_horario rh
      JOIN reserva r ON rh.id_reserva = r.id_reserva
      JOIN anfitrion a ON r.id_anfitrion = a.id_anfitrion
      JOIN cliente c ON a.id_anfitrion = c.id_cliente
      JOIN usuario p ON c.id_cliente = p.id_persona
      JOIN cancha ca ON r.id_cancha = ca.id_cancha
      WHERE 
        p.nombre ILIKE $1 OR 
        p.apellido ILIKE $1 OR 
        ca.nombre ILIKE $1
      ORDER BY rh.fecha DESC, rh.hora_inicio ASC
      LIMIT $2 OFFSET $3
    `;

    const queryTotal = `
      SELECT COUNT(*) 
      FROM reserva_horario rh
      JOIN reserva r ON rh.id_reserva = r.id_reserva
      JOIN anfitrion a ON r.id_anfitrion = a.id_anfitrion
      JOIN cliente c ON a.id_anfitrion = c.id_cliente
      JOIN usuario p ON c.id_cliente = p.id_persona
      JOIN cancha ca ON r.id_cancha = ca.id_cancha
      WHERE 
        p.nombre ILIKE $1 OR 
        p.apellido ILIKE $1 OR 
        ca.nombre ILIKE $1
    `;
    
    const sanitizeInput = (input) => input.replace(/[%_\\]/g, '\\$&');
    const terminoBusqueda = `%${sanitizeInput(texto)}%`;
    
    const [resultDatos, resultTotal] = await Promise.all([
      pool.query(queryDatos, [terminoBusqueda, limite, offset]),
      pool.query(queryTotal, [terminoBusqueda])
    ]);

    return {
      horarios: resultDatos.rows,
      total: parseInt(resultTotal.rows[0].count)
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Obtener horario de reserva por ID
 */
const obtenerHorarioPorId = async (id) => {
  try {
    const query = `
      SELECT rh.*, 
             r.id_reserva, a.id_anfitrion, p.nombre AS cliente_nombre, p.apellido AS cliente_apellido, p.correo AS cliente_correo,
             ca.id_cancha, ca.nombre AS cancha_nombre
      FROM reserva_horario rh
      JOIN reserva r ON rh.id_reserva = r.id_reserva
      JOIN anfitrion a ON r.id_anfitrion = a.id_anfitrion
      JOIN cliente c ON a.id_anfitrion = c.id_cliente
      JOIN usuario p ON c.id_cliente = p.id_persona
      JOIN cancha ca ON r.id_cancha = ca.id_cancha
      WHERE rh.id_horario = $1
    `;
    const result = await pool.query(query, [id]);
    return result.rows[0] || null;
  } catch (error) {
    throw error;
  }
};

/**
 * Crear nuevo horario de reserva
 */
const crearHorario = async (datosHorario) => {
  try {
    // Validaciones básicas
    if (!datosHorario.id_reserva || isNaN(datosHorario.id_reserva)) {
      throw new Error('El ID de la reserva es obligatorio y debe ser un número');
    }
    if (!datosHorario.fecha) {
      throw new Error('La fecha es obligatoria');
    }
    if (!datosHorario.hora_inicio) {
      throw new Error('La hora de inicio es obligatoria');
    }
    if (!datosHorario.hora_fin) {
      throw new Error('La hora de fin es obligatoria');
    }

    // Validar fecha
    const fecha = new Date(datosHorario.fecha);
    if (isNaN(fecha.getTime())) {
      throw new Error('La fecha no es válida');
    }

    // Validar horas
    const validarHora = (hora) => /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/.test(hora);
    if (!validarHora(datosHorario.hora_inicio)) {
      throw new Error('La hora de inicio no es válida (formato HH:MM:SS)');
    }
    if (!validarHora(datosHorario.hora_fin)) {
      throw new Error('La hora de fin no es válida (formato HH:MM:SS)');
    }

    // Validar que hora_inicio sea menor que hora_fin
    const horaInicio = new Date(`1970-01-01T${datosHorario.hora_inicio}Z`);
    const horaFin = new Date(`1970-01-01T${datosHorario.hora_fin}Z`);
    if (horaInicio >= horaFin) {
      throw new Error('La hora de inicio debe ser anterior a la hora de fin');
    }

    // Validar monto
    if (datosHorario.monto && (isNaN(datosHorario.monto) || datosHorario.monto < 0)) {
      throw new Error('El monto debe ser un número positivo');
    }

    // Verificar si la reserva existe
    const reservaQuery = `
      SELECT id_reserva FROM reserva WHERE id_reserva = $1
    `;
    const reservaResult = await pool.query(reservaQuery, [datosHorario.id_reserva]);
    if (!reservaResult.rows[0]) {
      throw new Error('La reserva asociada no existe');
    }

    const query = `
      INSERT INTO reserva_horario (
        id_reserva, fecha, hora_inicio, hora_fin, monto
      ) 
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;

    const values = [
      datosHorario.id_reserva,
      datosHorario.fecha,
      datosHorario.hora_inicio,
      datosHorario.hora_fin,
      datosHorario.monto || null
    ];

    const { rows } = await pool.query(query, values);
    return rows[0];
  } catch (error) {
    console.error('Error al crear horario de reserva:', error.message);
    throw new Error(error.message);
  }
};

/**
 * Actualizar horario de reserva parcialmente
 */
const actualizarHorario = async (id, camposActualizar) => {
  try {
    const camposPermitidos = ['id_reserva', 'fecha', 'hora_inicio', 'hora_fin', 'monto'];

    const campos = Object.keys(camposActualizar).filter(key => 
      camposPermitidos.includes(key)
    );

    if (campos.length === 0) {
      throw new Error('No hay campos válidos para actualizar');
    }

    // Validar fecha
    if (camposActualizar.fecha) {
      const fecha = new Date(camposActualizar.fecha);
      if (isNaN(fecha.getTime())) {
        throw new Error('La fecha no es válida');
      }
    }

    // Validar horas
    const validarHora = (hora) => /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/.test(hora);
    if (camposActualizar.hora_inicio && !validarHora(camposActualizar.hora_inicio)) {
      throw new Error('La hora de inicio no es válida (formato HH:MM:SS)');
    }
    if (camposActualizar.hora_fin && !validarHora(camposActualizar.hora_fin)) {
      throw new Error('La hora de fin no es válida (formato HH:MM:SS)');
    }

    // Validar que hora_inicio sea menor que hora_fin si ambos se proporcionan
    if (camposActualizar.hora_inicio && camposActualizar.hora_fin) {
      const horaInicio = new Date(`1970-01-01T${camposActualizar.hora_inicio}Z`);
      const horaFin = new Date(`1970-01-01T${camposActualizar.hora_fin}Z`);
      if (horaInicio >= horaFin) {
        throw new Error('La hora de inicio debe ser anterior a la hora de fin');
      }
    }

    // Validar monto
    if (camposActualizar.monto && (isNaN(camposActualizar.monto) || camposActualizar.monto < 0)) {
      throw new Error('El monto debe ser un número positivo');
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
    const values = campos.map(campo => camposActualizar[campo] || null);
    
    const query = `
      UPDATE reserva_horario 
      SET ${setClause}
      WHERE id_horario = $1
      RETURNING *
    `;

    const result = await pool.query(query, [id, ...values]);
    return result.rows[0] || null;
  } catch (error) {
    throw error;
  }
};

/**
 * Eliminar horario de reserva
 */
const eliminarHorario = async (id) => {
  try {
    const query = 'DELETE FROM reserva_horario WHERE id_horario = $1 RETURNING id_horario';
    const result = await pool.query(query, [id]);
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
    const limite = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;

    const { horarios, total } = await obtenerDatosEspecificos(limite, offset);
    
    res.json(respuesta(true, 'Horarios de reserva obtenidos correctamente', {
      horarios,
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
const obtenerHorariosFiltradosController = async (req, res) => {
  try {
    const { tipo } = req.query;
    const limite = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;

    const tiposValidos = ['fecha', 'hora', 'monto'];
    if (!tipo || !tiposValidos.includes(tipo)) {
      return res.status(400).json(respuesta(false, 'El parámetro "tipo" es inválido o no proporcionado'));
    }

    const { horarios, total } = await obtenerHorariosFiltrados(tipo, limite, offset);

    res.json(respuesta(true, `Horarios de reserva filtrados por ${tipo} obtenidos correctamente`, {
      horarios,
      filtro: tipo,
      paginacion: { limite, offset, total }
    }));
  } catch (error) {
    console.error('Error en obtenerHorariosFiltrados:', error.message);
    res.status(500).json(respuesta(false, error.message));
  }
};

/**
 * Controlador para GET /buscar
 */
const buscarHorariosController = async (req, res) => {
  try {
    const { q } = req.query;
    const limite = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;

    if (!q) {
      return res.status(400).json(respuesta(false, 'El parámetro de búsqueda "q" es requerido'));
    }

    const { horarios, total } = await buscarHorarios(q, limite, offset);
    
    res.json(respuesta(true, 'Horarios de reserva obtenidos correctamente', {
      horarios,
      paginacion: { limite, offset, total }
    }));
  } catch (error) {
    console.error('Error en buscarHorarios:', error.message);
    res.status(500).json(respuesta(false, error.message));
  }
};

/**
 * Controlador para GET /dato-individual/:id
 */
const obtenerHorarioPorIdController = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || isNaN(id)) {
      return res.status(400).json(respuesta(false, 'ID de horario no válido'));
    }

    const horario = await obtenerHorarioPorId(parseInt(id));

    if (!horario) {
      return res.status(404).json(respuesta(false, 'Horario de reserva no encontrado'));
    }

    res.json(respuesta(true, 'Horario de reserva obtenido correctamente', { horario }));
  } catch (error) {
    console.error('Error en obtenerHorarioPorId:', error.message);
    res.status(500).json(respuesta(false, error.message));
  }
};

/**
 * Controlador para POST - Crear horario de reserva
 */
const crearHorarioController = async (req, res) => {
  try {
    const datos = req.body;

    // Validaciones básicas
    const camposObligatorios = ['id_reserva', 'fecha', 'hora_inicio', 'hora_fin'];
    const faltantes = camposObligatorios.filter(campo => !datos[campo] || datos[campo].toString().trim() === '');

    if (faltantes.length > 0) {
      return res.status(400).json(
        respuesta(false, `Faltan campos obligatorios: ${faltantes.join(', ')}`)
      );
    }

    const nuevoHorario = await crearHorario(datos);

    res.status(201).json(respuesta(true, 'Horario de reserva creado correctamente', { horario: nuevoHorario }));
  } catch (error) {
    console.error('Error en crearHorario:', error.message);
    
    if (error.code === '23505') { // Violación de unique constraint
      return res.status(400).json(respuesta(false, 'El horario de reserva ya existe'));
    }

    res.status(500).json(respuesta(false, error.message));
  }
};

/**
 * Controlador para PATCH - Actualizar horario de reserva
 */
const actualizarHorarioController = async (req, res) => {
  try {
    const { id } = req.params;
    const camposActualizar = req.body;

    if (!id || isNaN(id)) {
      return res.status(400).json(respuesta(false, 'ID de horario no válido'));
    }

    if (Object.keys(camposActualizar).length === 0) {
      return res.status(400).json(respuesta(false, 'No se proporcionaron campos para actualizar'));
    }

    const horarioActualizado = await actualizarHorario(parseInt(id), camposActualizar);

    if (!horarioActualizado) {
      return res.status(404).json(respuesta(false, 'Horario de reserva no encontrado'));
    }

    res.json(respuesta(true, 'Horario de reserva actualizado correctamente', { horario: horarioActualizado }));
  } catch (error) {
    console.error('Error en actualizarHorario:', error.message);
    res.status(500).json(respuesta(false, error.message));
  }
};

/**
 * Controlador para DELETE - Eliminar horario de reserva
 */
const eliminarHorarioController = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || isNaN(id)) {
      return res.status(400).json(respuesta(false, 'ID de horario no válido'));
    }

    const horarioEliminado = await eliminarHorario(parseInt(id));

    if (!horarioEliminado) {
      return res.status(404).json(respuesta(false, 'Horario de reserva no encontrado'));
    }

    res.json(respuesta(true, 'Horario de reserva eliminado correctamente'));
  } catch (error) {
    console.error('Error en eliminarHorario:', error.message);
    res.status(500).json(respuesta(false, error.message));
  }
};

// RUTAS

// GET endpoints
router.get('/datos-especificos', obtenerDatosEspecificosController);
router.get('/filtro', obtenerHorariosFiltradosController);
router.get('/buscar', buscarHorariosController);
router.get('/dato-individual/:id', obtenerHorarioPorIdController);

// POST, PATCH, DELETE endpoints
router.post('/', crearHorarioController);
router.patch('/:id', actualizarHorarioController);
router.delete('/:id', eliminarHorarioController);

module.exports = router;