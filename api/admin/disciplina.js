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
 * Obtener disciplinas con atributos básicos
 */
const obtenerDatosEspecificos = async (limite = 10, offset = 0) => {
  try {
    const queryDatos = `
      SELECT id_disciplina, nombre, descripcion
      FROM disciplina 
      ORDER BY id_disciplina 
      LIMIT $1 OFFSET $2
    `;
    const queryTotal = `SELECT COUNT(*) FROM disciplina`;
    const [resultDatos, resultTotal] = await Promise.all([
      pool.query(queryDatos, [limite, offset]),
      pool.query(queryTotal)
    ]);
    return {
      disciplinas: resultDatos.rows,
      total: parseInt(resultTotal.rows[0].count)
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Obtener disciplinas con filtros de ordenamiento
 */
const obtenerDisciplinasFiltradas = async (tipoFiltro, limite = 10, offset = 0) => {
  try {
    const ordenesPermitidas = {
      nombre: 'nombre ASC',
      default: 'id_disciplina ASC'
    };

    const orden = ordenesPermitidas[tipoFiltro] || ordenesPermitidas.default;

    const queryDatos = `
      SELECT id_disciplina, nombre, descripcion
      FROM disciplina 
      ORDER BY ${orden}
      LIMIT $1 OFFSET $2
    `;
    const queryTotal = `SELECT COUNT(*) FROM disciplina`;

    const [resultDatos, resultTotal] = await Promise.all([
      pool.query(queryDatos, [limite, offset]),
      pool.query(queryTotal)
    ]);

    return {
      disciplinas: resultDatos.rows,
      total: parseInt(resultTotal.rows[0].count)
    };
  } catch (error) {
    throw new Error(`Error al obtener disciplinas filtradas: ${error.message}`);
  }
};

/**
 * Buscar disciplinas por texto en múltiples campos
 */
const buscarDisciplinas = async (texto, limite = 10, offset = 0) => {
  try {
    const queryDatos = `
      SELECT id_disciplina, nombre, descripcion
      FROM disciplina 
      WHERE 
        nombre ILIKE $1 OR 
        descripcion ILIKE $1
      ORDER BY nombre
      LIMIT $2 OFFSET $3
    `;

    const queryTotal = `
      SELECT COUNT(*) 
      FROM disciplina 
      WHERE 
        nombre ILIKE $1 OR 
        descripcion ILIKE $1
    `;
    
    const sanitizeInput = (input) => input.replace(/[%_\\]/g, '\\$&');
    const terminoBusqueda = `%${sanitizeInput(texto)}%`;
    
    const [resultDatos, resultTotal] = await Promise.all([
      pool.query(queryDatos, [terminoBusqueda, limite, offset]),
      pool.query(queryTotal, [terminoBusqueda])
    ]);

    return {
      disciplinas: resultDatos.rows,
      total: parseInt(resultTotal.rows[0].count)
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Obtener disciplina por ID
 */
const obtenerDisciplinaPorId = async (id) => {
  try {
    const query = `
      SELECT id_disciplina, nombre, descripcion
      FROM disciplina 
      WHERE id_disciplina = $1
    `;
    const result = await pool.query(query, [id]);
    return result.rows[0] || null;
  } catch (error) {
    throw error;
  }
};

/**
 * Crear nueva disciplina
 */
const crearDisciplina = async (datosDisciplina) => {
  try {
    // Validaciones básicas
    if (!datosDisciplina.nombre || datosDisciplina.nombre.trim() === '') {
      throw new Error('El nombre es obligatorio');
    }

    if (datosDisciplina.nombre.length > 100) {
      throw new Error('El nombre no debe exceder los 100 caracteres');
    }

    const query = `
      INSERT INTO disciplina (
        nombre, descripcion
      ) 
      VALUES ($1, $2)
      RETURNING id_disciplina, nombre, descripcion
    `;

    const values = [
      datosDisciplina.nombre,
      datosDisciplina.descripcion || null
    ];

    const { rows } = await pool.query(query, values);
    return rows[0];
  } catch (error) {
    console.error('Error al crear disciplina:', error.message);
    throw new Error(error.message);
  }
};

/**
 * Actualizar disciplina parcialmente
 */
const actualizarDisciplina = async (id, camposActualizar) => {
  try {
    const camposPermitidos = ['nombre', 'descripcion'];

    const campos = Object.keys(camposActualizar).filter(key => 
      camposPermitidos.includes(key)
    );

    if (campos.length === 0) {
      throw new Error('No hay campos válidos para actualizar');
    }

    if (camposActualizar.nombre && camposActualizar.nombre.length > 100) {
      throw new Error('El nombre no debe exceder los 100 caracteres');
    }

    const setClause = campos.map((campo, index) => `${campo} = $${index + 2}`).join(', ');
    const values = campos.map(campo => camposActualizar[campo] || null);
    
    const query = `
      UPDATE disciplina 
      SET ${setClause}
      WHERE id_disciplina = $1
      RETURNING id_disciplina, nombre, descripcion
    `;

    const result = await pool.query(query, [id, ...values]);
    return result.rows[0] || null;
  } catch (error) {
    throw error;
  }
};

/**
 * Eliminar disciplina
 */
const eliminarDisciplina = async (id) => {
  try {
    const query = 'DELETE FROM disciplina WHERE id_disciplina = $1 RETURNING id_disciplina';
    const result = await pool.query(query, [id]);
    return result.rows[0] || null;
  } catch (error) {
    throw error;
  }
};

/**
 * Obtener disciplinas practicadas en canchas de espacios gestionados por el admin
 */
const obtenerDisciplinasPorAdmin = async (id_admin_esp_dep, limite = 10, offset = 0) => {
  try {
    const queryDatos = `
      SELECT DISTINCT
        d.id_disciplina, d.nombre, d.descripcion
      FROM disciplina d
      JOIN se_practica sp ON d.id_disciplina = sp.id_disciplina
      JOIN cancha c ON sp.id_cancha = c.id_cancha
      JOIN espacio_deportivo e ON c.id_espacio = e.id_espacio
      WHERE e.id_admin_esp_dep = $1
      ORDER BY d.id_disciplina
      LIMIT $2 OFFSET $3
    `;
    const queryTotal = `
      SELECT COUNT(DISTINCT d.id_disciplina)
      FROM disciplina d
      JOIN se_practica sp ON d.id_disciplina = sp.id_disciplina
      JOIN cancha c ON sp.id_cancha = c.id_cancha
      JOIN espacio_deportivo e ON c.id_espacio = e.id_espacio
      WHERE e.id_admin_esp_dep = $1
    `;
    const [resultDatos, resultTotal] = await Promise.all([
      pool.query(queryDatos, [id_admin_esp_dep, limite, offset]),
      pool.query(queryTotal, [id_admin_esp_dep])
    ]);
    return {
      disciplinas: resultDatos.rows,
      total: parseInt(resultTotal.rows[0].count)
    };
  } catch (error) {
    console.error('Error en obtenerDisciplinasPorAdmin:', error);
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

    const { disciplinas, total } = await obtenerDatosEspecificos(limite, offset);
    
    res.json(respuesta(true, 'Disciplinas obtenidas correctamente', {
      disciplinas,
      paginacion: { limite, offset, total }
    }));
  } catch (error) {
    console.error('Error en obtenerDatosEspecificos:', error.message);
    res.status(500).json(respuesta(false, 'Error al obtener disciplinas'));
  }
};

/**
 * Controlador para GET /filtro
 */
const obtenerDisciplinasFiltradasController = async (req, res) => {
  try {
    const { tipo } = req.query;
    const limite = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;

    const tiposValidos = ['nombre'];
    if (!tipo || !tiposValidos.includes(tipo)) {
      return res.status(400).json(respuesta(false, 'El parámetro "tipo" es inválido o no proporcionado'));
    }

    const { disciplinas, total } = await obtenerDisciplinasFiltradas(tipo, limite, offset);

    res.json(respuesta(true, `Disciplinas filtradas por ${tipo} obtenidas correctamente`, {
      disciplinas,
      filtro: tipo,
      paginacion: { limite, offset, total }
    }));
  } catch (error) {
    console.error('Error en obtenerDisciplinasFiltradas:', error);
    res.status(500).json(respuesta(false, error.message));
  }
};

/**
 * Controlador para GET /buscar
 */
const buscarDisciplinasController = async (req, res) => {
  try {
    const { q } = req.query;
    const limite = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;

    if (!q) {
      return res.status(400).json(respuesta(false, 'El parámetro de búsqueda "q" es requerido'));
    }

    const { disciplinas, total } = await buscarDisciplinas(q, limite, offset);
    
    res.json(respuesta(true, 'Disciplinas obtenidas correctamente', {
      disciplinas,
      paginacion: { limite, offset, total }
    }));
  } catch (error) {
    console.error('Error en buscarDisciplinas:', error);
    res.status(500).json(respuesta(false, 'Error en la búsqueda'));
  }
};

/**
 * Controlador para GET /dato-individual/:id
 */
const obtenerDisciplinaPorIdController = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || isNaN(id)) {
      return res.status(400).json(respuesta(false, 'ID de disciplina no válido'));
    }

    const disciplina = await obtenerDisciplinaPorId(parseInt(id));

    if (!disciplina) {
      return res.status(404).json(respuesta(false, 'Disciplina no encontrada'));
    }

    res.json(respuesta(true, 'Disciplina obtenida correctamente', { disciplina }));
  } catch (error) {
    console.error('Error en obtenerDisciplinaPorId:', error);
    res.status(500).json(respuesta(false, 'Error al obtener la disciplina'));
  }
};

/**
 * Controlador para POST - Crear disciplina
 */
const crearDisciplinaController = async (req, res) => {
  try {
    const datos = req.body;

    // Validaciones básicas
    const camposObligatorios = ['nombre'];
    const faltantes = camposObligatorios.filter(campo => !datos[campo] || datos[campo].toString().trim() === '');

    if (faltantes.length > 0) {
      return res.status(400).json(
        respuesta(false, `Faltan campos obligatorios: ${faltantes.join(', ')}`)
      );
    }

    const nuevaDisciplina = await crearDisciplina(datos);

    res.status(201).json(respuesta(true, 'Disciplina creada correctamente', { disciplina: nuevaDisciplina }));
  } catch (error) {
    console.error('Error en crearDisciplina:', error);
    
    if (error.code === '23505') { // Violación de unique constraint
      return res.status(400).json(respuesta(false, 'El nombre de la disciplina ya existe'));
    }
    
    res.status(500).json(respuesta(false, 'Error al crear la disciplina'));
  }
};

/**
 * Controlador para PATCH - Actualizar disciplina
 */
const actualizarDisciplinaController = async (req, res) => {
  try {
    const { id } = req.params;
    const camposActualizar = req.body;

    if (!id || isNaN(id)) {
      return res.status(400).json(respuesta(false, 'ID de disciplina no válido'));
    }

    if (Object.keys(camposActualizar).length === 0) {
      return res.status(400).json(respuesta(false, 'No se proporcionaron campos para actualizar'));
    }

    const disciplinaActualizada = await actualizarDisciplina(parseInt(id), camposActualizar);

    if (!disciplinaActualizada) {
      return res.status(404).json(respuesta(false, 'Disciplina no encontrada'));
    }

    res.json(respuesta(true, 'Disciplina actualizada correctamente', { disciplina: disciplinaActualizada }));
  } catch (error) {
    console.error('Error en actualizarDisciplina:', error);
    res.status(500).json(respuesta(false, 'Error al actualizar la disciplina'));
  }
};

/**
 * Controlador para DELETE - Eliminar disciplina
 */
const eliminarDisciplinaController = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || isNaN(id)) {
      return res.status(400).json(respuesta(false, 'ID de disciplina no válido'));
    }

    const disciplinaEliminada = await eliminarDisciplina(parseInt(id));

    if (!disciplinaEliminada) {
      return res.status(404).json(respuesta(false, 'Disciplina no encontrada'));
    }

    res.json(respuesta(true, 'Disciplina eliminada correctamente'));
  } catch (error) {
    console.error('Error en eliminarDisciplina:', error);
    res.status(500).json(respuesta(false, 'Error al eliminar la disciplina'));
  }
};

const obtenerDisciplinasAdminController = async (req, res) => {
  try {
    const { id_admin_esp_dep } = req.params;
    if (!id_admin_esp_dep || isNaN(id_admin_esp_dep)) {
      return res.status(400).json(respuesta(false, 'ID de administrador inválido'));
    }
    const limite = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;
    const { disciplinas, total } = await obtenerDisciplinasPorAdmin(parseInt(id_admin_esp_dep), limite, offset);
    res.json(respuesta(true, 'Disciplinas del administrador obtenidas', {
      disciplinas,
      paginacion: { limite, offset, total }
    }));
  } catch (error) {
    res.status(500).json(respuesta(false, error.message));
  }
};


// RUTAS

// GET endpoints
router.get('/datos-especificos', obtenerDatosEspecificosController);
router.get('/filtro', obtenerDisciplinasFiltradasController);
router.get('/buscar', buscarDisciplinasController);
router.get('/dato-individual/:id', obtenerDisciplinaPorIdController);

// POST, PATCH, DELETE endpoints
router.post('/', crearDisciplinaController);
router.patch('/:id', actualizarDisciplinaController);
router.delete('/:id', eliminarDisciplinaController);

router.get('/datos-segun-rol/:id_admin_esp_dep', obtenerDisciplinasAdminController);

module.exports = router;