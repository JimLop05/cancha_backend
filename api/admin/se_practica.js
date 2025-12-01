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
 * Obtener datos específicos de relaciones se_practica con información de cancha y disciplina
 */
const obtenerDatosEspecificos = async (limite = 10, offset = 0) => {
  try {
    const queryDatos = `
      SELECT sp.id_cancha, sp.id_disciplina, sp.frecuencia_practica,
             c.nombre AS cancha_nombre, d.nombre AS disciplina_nombre
      FROM se_practica sp
      JOIN cancha c ON sp.id_cancha = c.id_cancha
      JOIN disciplina d ON sp.id_disciplina = d.id_disciplina
      ORDER BY sp.id_cancha, sp.id_disciplina
      LIMIT $1 OFFSET $2
    `;
    const queryTotal = `SELECT COUNT(*) FROM se_practica`;
    const [resultDatos, resultTotal] = await Promise.all([
      pool.query(queryDatos, [limite, offset]),
      pool.query(queryTotal)
    ]);
    return {
      se_practica: resultDatos.rows,
      total: parseInt(resultTotal.rows[0].count)
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Obtener relaciones se_practica con filtros de ordenamiento
 */
const obtenerSePracticaFiltradas = async (tipoFiltro, limite = 10, offset = 0) => {
  try {
    const ordenesPermitidas = {
      cancha: 'sp.id_cancha ASC',
      disciplina: 'sp.id_disciplina ASC',
      frecuencia: 'sp.frecuencia_practica ASC',
      default: 'sp.id_cancha ASC, sp.id_disciplina ASC'
    };

    const orden = ordenesPermitidas[tipoFiltro] || ordenesPermitidas.default;

    const queryDatos = `
      SELECT sp.id_cancha, sp.id_disciplina, sp.frecuencia_practica,
             c.nombre AS cancha_nombre, d.nombre AS disciplina_nombre
      FROM se_practica sp
      JOIN cancha c ON sp.id_cancha = c.id_cancha
      JOIN disciplina d ON sp.id_disciplina = d.id_disciplina
      ORDER BY ${orden}
      LIMIT $1 OFFSET $2
    `;
    const queryTotal = `SELECT COUNT(*) FROM se_practica`;

    const [resultDatos, resultTotal] = await Promise.all([
      pool.query(queryDatos, [limite, offset]),
      pool.query(queryTotal)
    ]);

    return {
      se_practica: resultDatos.rows,
      total: parseInt(resultTotal.rows[0].count)
    };
  } catch (error) {
    throw new Error(`Error al obtener relaciones se_practica filtradas: ${error.message}`);
  }
};

/**
 * Buscar relaciones se_practica por texto en múltiples campos
 */
const buscarSePractica = async (texto, limite = 10, offset = 0) => {
  try {
    const queryDatos = `
      SELECT sp.id_cancha, sp.id_disciplina, sp.frecuencia_practica,
             c.nombre AS cancha_nombre, d.nombre AS disciplina_nombre
      FROM se_practica sp
      JOIN cancha c ON sp.id_cancha = c.id_cancha
      JOIN disciplina d ON sp.id_disciplina = d.id_disciplina
      WHERE 
        c.nombre ILIKE $1 OR 
        d.nombre ILIKE $1 OR 
        sp.frecuencia_practica ILIKE $1
      ORDER BY sp.id_cancha, sp.id_disciplina
      LIMIT $2 OFFSET $3
    `;

    const queryTotal = `
      SELECT COUNT(*) 
      FROM se_practica sp
      JOIN cancha c ON sp.id_cancha = c.id_cancha
      JOIN disciplina d ON sp.id_disciplina = d.id_disciplina
      WHERE 
        c.nombre ILIKE $1 OR 
        d.nombre ILIKE $1 OR 
        sp.frecuencia_practica ILIKE $1
    `;
    
    const sanitizeInput = (input) => input.replace(/[%_\\]/g, '\\$&');
    const terminoBusqueda = `%${sanitizeInput(texto)}%`;
    
    const [resultDatos, resultTotal] = await Promise.all([
      pool.query(queryDatos, [terminoBusqueda, limite, offset]),
      pool.query(queryTotal, [terminoBusqueda])
    ]);

    return {
      se_practica: resultDatos.rows,
      total: parseInt(resultTotal.rows[0].count)
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Obtener relación se_practica por ID compuesto (id_cancha, id_disciplina)
 */
const obtenerSePracticaPorId = async (id_cancha, id_disciplina) => {
  try {
    const query = `
      SELECT sp.*, 
             c.nombre AS cancha_nombre, d.nombre AS disciplina_nombre
      FROM se_practica sp
      JOIN cancha c ON sp.id_cancha = c.id_cancha
      JOIN disciplina d ON sp.id_disciplina = d.id_disciplina
      WHERE sp.id_cancha = $1 AND sp.id_disciplina = $2
    `;
    const result = await pool.query(query, [id_cancha, id_disciplina]);
    return result.rows[0] || null;
  } catch (error) {
    throw error;
  }
};

/**
 * Crear nueva relación se_practica
 */
const crearSePractica = async (datosSePractica) => {
  try {
    // Validaciones básicas
    if (!datosSePractica.id_cancha || isNaN(datosSePractica.id_cancha)) {
      throw new Error('El ID de la cancha es obligatorio y debe ser un número');
    }
    if (!datosSePractica.id_disciplina || isNaN(datosSePractica.id_disciplina)) {
      throw new Error('El ID de la disciplina es obligatorio y debe ser un número');
    }
    if (datosSePractica.frecuencia_practica && datosSePractica.frecuencia_practica.length > 50) {
      throw new Error('La frecuencia de práctica no debe exceder los 50 caracteres');
    }

    // Verificar si la cancha existe
    const canchaQuery = `
      SELECT id_cancha FROM cancha WHERE id_cancha = $1
    `;
    const canchaResult = await pool.query(canchaQuery, [datosSePractica.id_cancha]);
    if (!canchaResult.rows[0]) {
      throw new Error('La cancha asociada no existe');
    }

    // Verificar si la disciplina existe
    const disciplinaQuery = `
      SELECT id_disciplina FROM disciplina WHERE id_disciplina = $1
    `;
    const disciplinaResult = await pool.query(disciplinaQuery, [datosSePractica.id_disciplina]);
    if (!disciplinaResult.rows[0]) {
      throw new Error('La disciplina asociada no existe');
    }

    const query = `
      INSERT INTO se_practica (
        id_cancha, id_disciplina, frecuencia_practica
      ) 
      VALUES ($1, $2, $3)
      RETURNING *
    `;

    const values = [
      datosSePractica.id_cancha,
      datosSePractica.id_disciplina,
      datosSePractica.frecuencia_practica || null
    ];

    const { rows } = await pool.query(query, values);
    return rows[0];
  } catch (error) {
    console.error('Error al crear relación se_practica:', error.message);
    throw new Error(error.message);
  }
};

/**
 * Actualizar relación se_practica parcialmente
 */
const actualizarSePractica = async (id_cancha, id_disciplina, camposActualizar) => {
  try {
    const camposPermitidos = ['frecuencia_practica'];

    const campos = Object.keys(camposActualizar).filter(key => 
      camposPermitidos.includes(key)
    );

    if (campos.length === 0) {
      throw new Error('No hay campos válidos para actualizar');
    }

    // Validar frecuencia_practica
    if (camposActualizar.frecuencia_practica && camposActualizar.frecuencia_practica.length > 50) {
      throw new Error('La frecuencia de práctica no debe exceder los 50 caracteres');
    }

    const setClause = campos.map((campo, index) => `${campo} = $${index + 3}`).join(', ');
    const values = campos.map(campo => camposActualizar[campo] || null);
    
    const query = `
      UPDATE se_practica 
      SET ${setClause}
      WHERE id_cancha = $1 AND id_disciplina = $2
      RETURNING *
    `;

    const result = await pool.query(query, [id_cancha, id_disciplina, ...values]);
    return result.rows[0] || null;
  } catch (error) {
    throw error;
  }
};

/**
 * Eliminar relación se_practica
 */
const eliminarSePractica = async (id_cancha, id_disciplina) => {
  try {
    const query = `
      DELETE FROM se_practica 
      WHERE id_cancha = $1 AND id_disciplina = $2 
      RETURNING id_cancha, id_disciplina
    `;
    const result = await pool.query(query, [id_cancha, id_disciplina]);
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

    const { se_practica, total } = await obtenerDatosEspecificos(limite, offset);
    
    res.json(respuesta(true, 'Relaciones se_practica obtenidas correctamente', {
      se_practica,
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
const obtenerSePracticaFiltradasController = async (req, res) => {
  try {
    const { tipo } = req.query;
    const limite = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;

    const tiposValidos = ['cancha', 'disciplina', 'frecuencia'];
    if (!tipo || !tiposValidos.includes(tipo)) {
      return res.status(400).json(respuesta(false, 'El parámetro "tipo" es inválido o no proporcionado'));
    }

    const { se_practica, total } = await obtenerSePracticaFiltradas(tipo, limite, offset);

    res.json(respuesta(true, `Relaciones se_practica filtradas por ${tipo} obtenidas correctamente`, {
      se_practica,
      filtro: tipo,
      paginacion: { limite, offset, total }
    }));
  } catch (error) {
    console.error('Error en obtenerSePracticaFiltradas:', error.message);
    res.status(500).json(respuesta(false, error.message));
  }
};

/**
 * Controlador para GET /buscar
 */
const buscarSePracticaController = async (req, res) => {
  try {
    const { q } = req.query;
    const limite = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;

    if (!q) {
      return res.status(400).json(respuesta(false, 'El parámetro de búsqueda "q" es requerido'));
    }

    const { se_practica, total } = await buscarSePractica(q, limite, offset);
    
    res.json(respuesta(true, 'Relaciones se_practica obtenidas correctamente', {
      se_practica,
      paginacion: { limite, offset, total }
    }));
  } catch (error) {
    console.error('Error en buscarSePractica:', error.message);
    res.status(500).json(respuesta(false, error.message));
  }
};

/**
 * Controlador para GET /dato-individual/:id_cancha/:id_disciplina
 */
const obtenerSePracticaPorIdController = async (req, res) => {
  try {
    const { id_cancha, id_disciplina } = req.params;

    if (!id_cancha || isNaN(id_cancha) || !id_disciplina || isNaN(id_disciplina)) {
      return res.status(400).json(respuesta(false, 'IDs de cancha y disciplina no válidos'));
    }

    const sePractica = await obtenerSePracticaPorId(parseInt(id_cancha), parseInt(id_disciplina));

    if (!sePractica) {
      return res.status(404).json(respuesta(false, 'Relación se_practica no encontrada'));
    }

    res.json(respuesta(true, 'Relación se_practica obtenida correctamente', { se_practica: sePractica }));
  } catch (error) {
    console.error('Error en obtenerSePracticaPorId:', error.message);
    res.status(500).json(respuesta(false, error.message));
  }
};

/**
 * Controlador para POST - Crear relación se_practica
 */
const crearSePracticaController = async (req, res) => {
  try {
    const datos = req.body;

    // Validaciones básicas
    const camposObligatorios = ['id_cancha', 'id_disciplina'];
    const faltantes = camposObligatorios.filter(campo => !datos[campo] || datos[campo].toString().trim() === '');

    if (faltantes.length > 0) {
      return res.status(400).json(
        respuesta(false, `Faltan campos obligatorios: ${faltantes.join(', ')}`)
      );
    }

    const nuevaSePractica = await crearSePractica(datos);

    res.status(201).json(respuesta(true, 'Relación se_practica creada correctamente', { se_practica: nuevaSePractica }));
  } catch (error) {
    console.error('Error en crearSePractica:', error.message);
    
    if (error.code === '23505') { // Violación de unique constraint
      return res.status(400).json(respuesta(false, 'La relación se_practica ya existe'));
    }

    res.status(500).json(respuesta(false, error.message));
  }
};

/**
 * Controlador para PATCH - Actualizar relación se_practica
 */
const actualizarSePracticaController = async (req, res) => {
  try {
    const { id_cancha, id_disciplina } = req.params;
    const camposActualizar = req.body;

    if (!id_cancha || isNaN(id_cancha) || !id_disciplina || isNaN(id_disciplina)) {
      return res.status(400).json(respuesta(false, 'IDs de cancha y disciplina no válidos'));
    }

    if (Object.keys(camposActualizar).length === 0) {
      return res.status(400).json(respuesta(false, 'No se proporcionaron campos para actualizar'));
    }

    const sePracticaActualizada = await actualizarSePractica(parseInt(id_cancha), parseInt(id_disciplina), camposActualizar);

    if (!sePracticaActualizada) {
      return res.status(404).json(respuesta(false, 'Relación se_practica no encontrada'));
    }

    res.json(respuesta(true, 'Relación se_practica actualizada correctamente', { se_practica: sePracticaActualizada }));
  } catch (error) {
    console.error('Error en actualizarSePractica:', error.message);
    res.status(500).json(respuesta(false, error.message));
  }
};

/**
 * Controlador para DELETE - Eliminar relación se_practica
 */
const eliminarSePracticaController = async (req, res) => {
  try {
    const { id_cancha, id_disciplina } = req.params;

    if (!id_cancha || isNaN(id_cancha) || !id_disciplina || isNaN(id_disciplina)) {
      return res.status(400).json(respuesta(false, 'IDs de cancha y disciplina no válidos'));
    }

    const sePracticaEliminada = await eliminarSePractica(parseInt(id_cancha), parseInt(id_disciplina));

    if (!sePracticaEliminada) {
      return res.status(404).json(respuesta(false, 'Relación se_practica no encontrada'));
    }

    res.json(respuesta(true, 'Relación se_practica eliminada correctamente'));
  } catch (error) {
    console.error('Error en eliminarSePractica:', error.message);
    res.status(500).json(respuesta(false, error.message));
  }
};

// RUTAS

// GET endpoints
router.get('/datos-especificos', obtenerDatosEspecificosController);
router.get('/filtro', obtenerSePracticaFiltradasController);
router.get('/buscar', buscarSePracticaController);
router.get('/dato-individual/:id_cancha/:id_disciplina', obtenerSePracticaPorIdController);

// POST, PATCH, DELETE endpoints
router.post('/', crearSePracticaController);
router.patch('/:id_cancha/:id_disciplina', actualizarSePracticaController);
router.delete('/:id_cancha/:id_disciplina', eliminarSePracticaController);

module.exports = router;