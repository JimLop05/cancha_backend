const express = require('express');
const pool = require('../../config/database');
const bcrypt = require('bcrypt'); // Asegúrate de importar bcrypt al inicio

const router = express.Router();

// Función de respuesta estandarizada
const respuesta = (exito, mensaje, datos = null) => ({
  exito,
  mensaje,
  datos,
});

// MODELOS - Funciones puras para operaciones de base de datos

/**
 * Obtener datos específicos de controles con información de la persona
 */
const obtenerDatosEspecificos = async (limite = 10, offset = 0) => {
  try {
    const queryDatos = `
      SELECT c.id_control, p.nombre, p.apellido, p.correo, c.fecha_asignacion, c.estado
      FROM control c
      JOIN usuario p ON c.id_control = p.id_persona
      ORDER BY c.id_control
      LIMIT $1 OFFSET $2
    `;
    const queryTotal = `SELECT COUNT(*) FROM control`;
    const [resultDatos, resultTotal] = await Promise.all([
      pool.query(queryDatos, [limite, offset]),
      pool.query(queryTotal)
    ]);
    return {
      controles: resultDatos.rows,
      total: parseInt(resultTotal.rows[0].count)
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Obtener controles con filtros de ordenamiento
 */
const obtenerControlesFiltrados = async (tipoFiltro, limite = 10, offset = 0) => {
  try {
    const ordenesPermitidas = {
      nombre: 'p.nombre ASC, p.apellido ASC',
      fecha: 'c.fecha_asignacion DESC',
      correo: 'p.correo ASC',
      default: 'c.id_control ASC'
    };

    const orden = ordenesPermitidas[tipoFiltro] || ordenesPermitidas.default;

    const queryDatos = `
      SELECT c.id_control, p.nombre, p.apellido, p.correo, c.fecha_asignacion, c.estado
      FROM control c
      JOIN usuario p ON c.id_control = p.id_persona
      ORDER BY ${orden}
      LIMIT $1 OFFSET $2
    `;
    const queryTotal = `SELECT COUNT(*) FROM control`;

    const [resultDatos, resultTotal] = await Promise.all([
      pool.query(queryDatos, [limite, offset]),
      pool.query(queryTotal)
    ]);

    return {
      controles: resultDatos.rows,
      total: parseInt(resultTotal.rows[0].count)
    };
  } catch (error) {
    throw new Error(`Error al obtener controles filtrados: ${error.message}`);
  }
};

/**
 * Buscar controles por texto en múltiples campos
 */
const buscarControles = async (texto, limite = 10, offset = 0) => {
  try {
    const queryDatos = `
      SELECT c.id_control, p.nombre, p.apellido, p.correo, c.fecha_asignacion, c.estado
      FROM control c
      JOIN usuario p ON c.id_control = p.id_persona
      WHERE 
        p.nombre ILIKE $1 OR 
        p.apellido ILIKE $1 OR 
        p.correo ILIKE $1
      ORDER BY p.nombre, p.apellido
      LIMIT $2 OFFSET $3
    `;

    const queryTotal = `
      SELECT COUNT(*) 
      FROM control c
      JOIN usuario p ON c.id_control = p.id_persona
      WHERE 
        p.nombre ILIKE $1 OR 
        p.apellido ILIKE $1 OR 
        p.correo ILIKE $1
    `;
    
    const sanitizeInput = (input) => input.replace(/[%_\\]/g, '\\$&');
    const terminoBusqueda = `%${sanitizeInput(texto)}%`;
    
    const [resultDatos, resultTotal] = await Promise.all([
      pool.query(queryDatos, [terminoBusqueda, limite, offset]),
      pool.query(queryTotal, [terminoBusqueda])
    ]);

    return {
      controles: resultDatos.rows,
      total: parseInt(resultTotal.rows[0].count)
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Obtener control por ID
 */
const obtenerControlPorId = async (id) => {
  try {
    const query = `
      SELECT c.id_control, p.nombre, p.apellido, p.correo, p.usuario, c.fecha_asignacion, c.estado
      FROM control c
      JOIN usuario p ON c.id_control = p.id_persona
      WHERE c.id_control = $1
    `;
    const result = await pool.query(query, [id]);
    return result.rows[0] || null;
  } catch (error) {
    throw error;
  }
};

/**
 * Crear nuevo control
 */
const crearControl = async (datosControl) => {
  try {
    // --- AGREGAR ESTO ---
    // 1. Eliminar la contraseña del body si viene
    delete datosControl.contrasena;
    
    // 2. Encriptar contraseña fija "123456" como en registro.js
    const contrasenaHash = await bcrypt.hash('123456', 10);

    // Generar latitud y longitud aleatorias en rango de La Paz, Bolivia
    const minLat = -16.55;
    const maxLat = -16.45;    const minLong = -68.20;
    const maxLong = -68.10;
    const latitud = parseFloat((Math.random() * (maxLat - minLat) + minLat).toFixed(6));
    const longitud = parseFloat((Math.random() * (maxLong - minLong) + minLong).toFixed(6));

    // Validar fecha_asignacion si se proporciona
    if (datosControl.fecha_asignacion) {
      const fechaAsignacion = new Date(datosControl.fecha_asignacion);
      if (isNaN(fechaAsignacion.getTime()) ) {
        throw new Error('Esta fecha de asignación no es válida');
      }
    }

    // Insertar en USUARIO primero
    const queryUsuario = `
      INSERT INTO usuario (
        nombre, apellido, contrasena, telefono, correo, sexo, imagen_perfil, usuario, latitud, longitud
      ) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id_persona
    `;
    const valuesUsuario = [
      datosControl.nombre || null,
      datosControl.apellido || null,
      contrasenaHash, // ← Usar la contraseña encriptada fija
      datosControl.telefono || null,
      datosControl.correo,
      datosControl.sexo || null,
      datosControl.imagen_perfil || null,
      datosControl.usuario,
      latitud,
      longitud
    ];
    const resultUsuario = await pool.query(queryUsuario, valuesUsuario);
    const idControl = resultUsuario.rows[0].id_persona;

    // Insertar en CONTROL
    const queryControl = `
      INSERT INTO control (
        id_control, fecha_asignacion, estado
      ) 
      VALUES ($1, $2, $3)
      RETURNING *
    `;
    const valuesControl = [
      idControl,
      datosControl.fecha_asignacion || new Date().toISOString().split('T')[0],
      datosControl.estado !== undefined ? datosControl.estado : true
    ];
    const resultControl = await pool.query(queryControl, valuesControl);

    // Obtener datos completos para retornar
    const controlCompleto = await obtenerControlPorId(idControl);
    return controlCompleto;
  } catch (error) {
    console.error('Error al crear control:', error.message);
    throw new Error(error.message);
  }
};

/**
 * Actualizar control parcialmente
 */
const actualizarControl = async (id, camposActualizar) => {
  try {
    
    if (camposActualizar.contrasena) {
      delete camposActualizar.contrasena;
    }

    // Separar campos por tabla
    const camposUser = {};
    const camposControl = {};

    // Campos de USUARIO
    ['nombre', 'apellido', 'correo', 'telefono', 'sexo', 'imagen_perfil'].forEach(key => {
      if (key in camposActualizar) {
        camposUser[key] = camposActualizar[key] || null;
      }
    });

    // Campos de CONTROL
    ['fecha_asignacion', 'estado'].forEach(key => {
      if (key in camposActualizar) {
        camposControl[key] = camposActualizar[key] || null;
      }
    });

    if (Object.keys(camposUser).length === 0 && Object.keys(camposControl).length === 0) {
      throw new Error('No hay campos válidos para actualizar');
    }

    // Validar fecha_asignacion si se proporciona
    if (camposControl.fecha_asignacion) {
      const fechaAsignacion = new Date(camposControl.fecha_asignacion);
      if (isNaN(fechaAsignacion.getTime()) ) {
        throw new Error('X fecha de asignación no es válida o está en el futuro');
      }
    }

    // Actualizar USUARIO si aplica
    if (Object.keys(camposUser).length > 0) {
      const setClauseUser = Object.keys(camposUser).map((campo, index) => `${campo} = $${index + 1}`).join(', ');
      const valuesUser = [...Object.values(camposUser), id];
      const queryUser = `
        UPDATE usuario 
        SET ${setClauseUser}
        WHERE id_persona = $${Object.keys(camposUser).length + 1}
      `;
      await pool.query(queryUser, valuesUser);
    }

    // Actualizar CONTROL si aplica
    let controlUpdated = null;
    if (Object.keys(camposControl).length > 0) {
      const setClauseControl = Object.keys(camposControl).map((campo, index) => `${campo} = $${index + 2}`).join(', ');
      const valuesControl = [id, ...Object.values(camposControl)];
      const queryControl = `
        UPDATE control 
        SET ${setClauseControl}
        WHERE id_control = $1
        RETURNING *
      `;
      const resultControl = await pool.query(queryControl, valuesControl);
      controlUpdated = resultControl.rows[0] || null;
    }

    // Retornar datos completos actualizados
    const controlCompleto = await obtenerControlPorId(id);
    return controlCompleto;
  } catch (error) {
    throw error;
  }
};

/**
 * Eliminar control
 */
const eliminarControl = async (id) => {
  try {
    const query = 'DELETE FROM control WHERE id_control = $1 RETURNING id_control';
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

    const { controles, total } = await obtenerDatosEspecificos(limite, offset);
    
    res.json(respuesta(true, 'Controles obtenidos correctamente', {
      controles,
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
const obtenerControlesFiltradosController = async (req, res) => {
  try {
    const { tipo } = req.query;
    const limite = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;

    const tiposValidos = ['nombre', 'fecha', 'correo'];
    if (!tipo || !tiposValidos.includes(tipo)) {
      return res.status(400).json(respuesta(false, 'El parámetro "tipo" es inválido o no proporcionado'));
    }

    const { controles, total } = await obtenerControlesFiltrados(tipo, limite, offset);

    res.json(respuesta(true, `Controles filtrados por ${tipo} obtenidos correctamente`, {
      controles,
      filtro: tipo,
      paginacion: { limite, offset, total }
    }));
  } catch (error) {
    console.error('Error en obtenerControlesFiltrados:', error.message);
    res.status(500).json(respuesta(false, error.message));
  }
};

/**
 * Controlador para GET /buscar
 */
const buscarControlesController = async (req, res) => {
  try {
    const { q } = req.query;
    const limite = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;

    if (!q) {
      return res.status(400).json(respuesta(false, 'El parámetro de búsqueda "q" es requerido'));
    }

    const { controles, total } = await buscarControles(q, limite, offset);
    
    res.json(respuesta(true, 'Controles obtenidos correctamente', {
      controles,
      paginacion: { limite, offset, total }
    }));
  } catch (error) {
    console.error('Error en buscarControles:', error.message);
    res.status(500).json(respuesta(false, error.message));
  }
};

/**
 * Controlador para GET /dato-individual/:id
 */
const obtenerControlPorIdController = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || isNaN(id)) {
      return res.status(400).json(respuesta(false, 'ID de control no válido'));
    }

    const control = await obtenerControlPorId(parseInt(id));

    if (!control) {
      return res.status(404).json(respuesta(false, 'Control no encontrado'));
    }

    res.json(respuesta(true, 'Control obtenido correctamente', { control }));
  } catch (error) {
    console.error('Error en obtenerControlPorId:', error.message);
    res.status(500).json(respuesta(false, error.message));
  }
};

/**
 * Controlador para POST - Crear control
 */
const crearControlController = async (req, res) => {
  try {
    const datos = req.body;

    // Validaciones básicas
    const camposObligatorios = ['correo', 'usuario'];
    const faltantes = camposObligatorios.filter(campo => !datos[campo] || datos[campo].toString().trim() === '');

    if (faltantes.length > 0) {
      return res.status(400).json(
        respuesta(false, `Faltan campos obligatorios: ${faltantes.join(', ')}`)
      );
    }

    const nuevoControl = await crearControl(datos);

    res.status(201).json(respuesta(true, 'Control creado correctamente', { control: nuevoControl }));
  } catch (error) {
    console.error('Error en crearControl:', error.message);
    
    if (error.code === '23505') { // Violación de unique constraint
      return res.status(400).json(respuesta(false, 'El correo o usuario ya existe'));
    }
    
    res.status(500).json(respuesta(false, error.message));
  }
};

/**
 * Controlador para PATCH - Actualizar control
 */
const actualizarControlController = async (req, res) => {
  try {
    const { id } = req.params;
    const camposActualizar = req.body;

    if (!id || isNaN(id)) {
      return res.status(400).json(respuesta(false, 'ID de control no válido'));
    }

    if (Object.keys(camposActualizar).length === 0) {
      return res.status(400).json(respuesta(false, 'No se proporcionaron campos para actualizar'));
    }

    const controlActualizado = await actualizarControl(parseInt(id), camposActualizar);

    if (!controlActualizado) {
      return res.status(404).json(respuesta(false, 'Control no encontrado'));
    }

    res.json(respuesta(true, 'Control actualizado correctamente', { control: controlActualizado }));
  } catch (error) {
    console.error('Error en actualizarControl:', error.message);
    res.status(500).json(respuesta(false, error.message));
  }
};

/**
 * Controlador para DELETE - Eliminar control
 */
const eliminarControlController = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || isNaN(id)) {
      return res.status(400).json(respuesta(false, 'ID de control no válido'));
    }

    const controlEliminado = await eliminarControl(parseInt(id));

    if (!controlEliminado) {
      return res.status(404).json(respuesta(false, 'Control no encontrado'));
    }

    res.json(respuesta(true, 'Control eliminado correctamente'));
  } catch (error) {
    console.error('Error en eliminarControl:', error.message);
    res.status(500).json(respuesta(false, error.message));
  }
};

// RUTAS

// GET endpoints
router.get('/datos-especificos', obtenerDatosEspecificosController);
router.get('/filtro', obtenerControlesFiltradosController);
router.get('/buscar', buscarControlesController);
router.get('/dato-individual/:id', obtenerControlPorIdController);

// POST, PATCH, DELETE endpoints
router.post('/', crearControlController);
router.patch('/:id', actualizarControlController);
router.delete('/:id', eliminarControlController);

module.exports = router;