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
 * Obtener datos específicos de administradores especiales con información de la persona
 */
const obtenerDatosEspecificos = async (limite = 10, offset = 0) => {
  try {
    const queryDatos = `
      SELECT a.id_admin_esp_dep, p.nombre, p.apellido, p.correo, a.fecha_ingreso, a.direccion, a.estado
      FROM admin_esp_dep a
      JOIN usuario p ON a.id_admin_esp_dep = p.id_persona
      ORDER BY a.id_admin_esp_dep
      LIMIT $1 OFFSET $2
    `;
    const queryTotal = `SELECT COUNT(*) FROM admin_esp_dep`;
    const [resultDatos, resultTotal] = await Promise.all([
      pool.query(queryDatos, [limite, offset]),
      pool.query(queryTotal)
    ]);
    return {
      administradores: resultDatos.rows,
      total: parseInt(resultTotal.rows[0].count)
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Obtener administradores especiales con filtros de ordenamiento
 */
const obtenerAdministradoresFiltrados = async (tipoFiltro, limite = 10, offset = 0) => {
  try {
    const ordenesPermitidas = {
      nombre: 'p.nombre ASC, p.apellido ASC',
      fecha: 'a.fecha_ingreso DESC',
      correo: 'p.correo ASC',
      default: 'a.id_admin_esp_dep ASC'
    };

    const orden = ordenesPermitidas[tipoFiltro] || ordenesPermitidas.default;

    const queryDatos = `
      SELECT a.id_admin_esp_dep, p.nombre, p.apellido, p.correo, a.fecha_ingreso, a.direccion, a.estado
      FROM admin_esp_dep a
      JOIN usuario p ON a.id_admin_esp_dep = p.id_persona
      ORDER BY ${orden}
      LIMIT $1 OFFSET $2
    `;
    const queryTotal = `SELECT COUNT(*) FROM admin_esp_dep`;

    const [resultDatos, resultTotal] = await Promise.all([
      pool.query(queryDatos, [limite, offset]),
      pool.query(queryTotal)
    ]);

    return {
      administradores: resultDatos.rows,
      total: parseInt(resultTotal.rows[0].count)
    };
  } catch (error) {
    throw new Error(`Error al obtener administradores filtrados: ${error.message}`);
  }
};

/**
 * Buscar administradores especiales por texto en múltiples campos
 */
const buscarAdministradores = async (texto, limite = 10, offset = 0) => {
  try {
    const queryDatos = `
      SELECT a.id_admin_esp_dep, p.nombre, p.apellido, p.correo, a.fecha_ingreso, a.direccion, a.estado
      FROM admin_esp_dep a
      JOIN usuario p ON a.id_admin_esp_dep = p.id_persona
      WHERE 
        p.nombre ILIKE $1 OR 
        p.apellido ILIKE $1 OR 
        p.correo ILIKE $1 OR 
        a.direccion ILIKE $1
      ORDER BY p.nombre, p.apellido
      LIMIT $2 OFFSET $3
    `;

    const queryTotal = `
      SELECT COUNT(*) 
      FROM admin_esp_dep a
      JOIN usuario p ON a.id_admin_esp_dep = p.id_persona
      WHERE 
        p.nombre ILIKE $1 OR 
        p.apellido ILIKE $1 OR 
        p.correo ILIKE $1 OR 
        a.direccion ILIKE $1
    `;
    
    const sanitizeInput = (input) => input.replace(/[%_\\]/g, '\\$&');
    const terminoBusqueda = `%${sanitizeInput(texto)}%`;
    
    const [resultDatos, resultTotal] = await Promise.all([
      pool.query(queryDatos, [terminoBusqueda, limite, offset]),
      pool.query(queryTotal, [terminoBusqueda])
    ]);

    return {
      administradores: resultDatos.rows,
      total: parseInt(resultTotal.rows[0].count)
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Obtener administrador especial por ID
 */
const obtenerAdministradorPorId = async (id) => {
  try {
    const query = `
      SELECT a.id_admin_esp_dep, p.nombre, p.apellido, p.correo, p.usuario, a.fecha_ingreso, a.direccion, a.estado
      FROM admin_esp_dep a
      JOIN usuario p ON a.id_admin_esp_dep = p.id_persona
      WHERE a.id_admin_esp_dep = $1
    `;
    const result = await pool.query(query, [id]);
    return result.rows[0] || null;
  } catch (error) {
    throw error;
  }
};

/**
 * Crear nuevo administrador especial
 */
const crearAdministrador = async (datosAdministrador) => {
  try {
    // 1. Eliminar la contraseña del body si viene
    delete datosAdministrador.contrasena;

    const contrasenaHash = await bcrypt.hash('123456', 10);

    // Generar latitud y longitud aleatorias en rango de La Paz, Bolivia
    const minLat = -16.55;
    const maxLat = -16.45;
    const minLong = -68.20;
    const maxLong = -68.10;
    const latitud = parseFloat((Math.random() * (maxLat - minLat) + minLat).toFixed(6));
    const longitud = parseFloat((Math.random() * (maxLong - minLong) + minLong).toFixed(6));

    // Validar fecha_ingreso
    if (!datosAdministrador.fecha_ingreso) {
      throw new Error('La fecha de ingreso es obligatoria');
    }
    const fechaIngreso = new Date(datosAdministrador.fecha_ingreso);
    if (isNaN(fechaIngreso.getTime())) {
      throw new Error('La fecha de ingreso no es válida o está en el futuro');
    }

    // Validar direccion
    if (datosAdministrador.direccion && datosAdministrador.direccion.length > 255) {
      throw new Error('La dirección no debe exceder los 255 caracteres');
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
      datosAdministrador.nombre || null,
      datosAdministrador.apellido || null,
      contrasenaHash, // ← Usar la contraseña encriptada fija
      datosAdministrador.telefono || null,
      datosAdministrador.correo,
      datosAdministrador.sexo || null,
      datosAdministrador.imagen_perfil || null,
      datosAdministrador.usuario,
      latitud,
      longitud
    ];
    const resultUsuario = await pool.query(queryUsuario, valuesUsuario);
    const idAdminEspDep = resultUsuario.rows[0].id_persona;

    // Insertar en ADMIN_ESP_DEP
    const queryAdmin = `
      INSERT INTO admin_esp_dep (
        id_admin_esp_dep, fecha_ingreso, direccion, estado
      ) 
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
    const valuesAdmin = [
      idAdminEspDep,
      datosAdministrador.fecha_ingreso,
      datosAdministrador.direccion || null,
      datosAdministrador.estado !== undefined ? datosAdministrador.estado : true
    ];
    const resultAdmin = await pool.query(queryAdmin, valuesAdmin);

    // Obtener datos completos para retornar
    const administradorCompleto = await obtenerAdministradorPorId(idAdminEspDep);
    return administradorCompleto;
  } catch (error) {
    console.error('Error al crear administrador especial:', error.message);
    throw new Error(error.message);
  }
};

/**
 * Actualizar administrador especial parcialmente
 */
const actualizarAdministrador = async (id, camposActualizar) => {
  try {
    if (camposActualizar.contrasena) {
      delete camposActualizar.contrasena;
    }

    // Separar campos por tabla
    const camposUser = {};
    const camposAdmin = {};

    // Campos de USUARIO
    ['nombre', 'apellido', 'correo', 'usuario', 'telefono', 'sexo', 'imagen_perfil'].forEach(key => {
      if (key in camposActualizar) {
        camposUser[key] = camposActualizar[key] || null;
      }
    });

    // Campos de ADMIN_ESP_DEP
    ['fecha_ingreso', 'direccion', 'estado'].forEach(key => {
      if (key in camposActualizar) {
        camposAdmin[key] = camposActualizar[key] !== undefined ? camposActualizar[key] : null;
      }
    });

    if (Object.keys(camposUser).length === 0 && Object.keys(camposAdmin).length === 0) {
      throw new Error('No hay campos válidos para actualizar');
    }

    // Validar fecha_ingreso si se proporciona (solo formato, permitir futuras)
    if (camposAdmin.fecha_ingreso) {
      const fechaIngreso = new Date(camposAdmin.fecha_ingreso);
      if (isNaN(fechaIngreso.getTime())) {
        throw new Error('La fecha de ingreso no es válida');
      }
      // Eliminar la validación de fecha futura: || fechaIngreso > new Date()
    }

    // Validar direccion si se proporciona
    if (camposAdmin.direccion && camposAdmin.direccion.length > 255) {
      throw new Error('La dirección no debe exceder los 255 caracteres');
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

    // Actualizar ADMIN_ESP_DEP si aplica
    let adminUpdated = null;
    if (Object.keys(camposAdmin).length > 0) {
      const setClauseAdmin = Object.keys(camposAdmin).map((campo, index) => `${campo} = $${index + 2}`).join(', ');
      const valuesAdmin = [id, ...Object.values(camposAdmin)];
      const queryAdmin = `
        UPDATE admin_esp_dep 
        SET ${setClauseAdmin}
        WHERE id_admin_esp_dep = $1
        RETURNING *
      `;
      const resultAdmin = await pool.query(queryAdmin, valuesAdmin);
      adminUpdated = resultAdmin.rows[0] || null;
    }

    // Retornar datos completos actualizados
    const administradorCompleto = await obtenerAdministradorPorId(id);
    return administradorCompleto;
  } catch (error) {
    throw error;
  }
};

/**
 * Eliminar administrador especial
 */
const eliminarAdministrador = async (id) => {
  try {
    const query = 'DELETE FROM admin_esp_dep WHERE id_admin_esp_dep = $1 RETURNING id_admin_esp_dep';
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

    const { administradores, total } = await obtenerDatosEspecificos(limite, offset);
    
    res.json(respuesta(true, 'Administradores especiales obtenidos correctamente', {
      administradores,
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
const obtenerAdministradoresFiltradosController = async (req, res) => {
  try {
    const { tipo } = req.query;
    const limite = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;

    const tiposValidos = ['nombre', 'fecha', 'correo'];
    if (!tipo || !tiposValidos.includes(tipo)) {
      return res.status(400).json(respuesta(false, 'El parámetro "tipo" es inválido o no proporcionado'));
    }

    const { administradores, total } = await obtenerAdministradoresFiltrados(tipo, limite, offset);

    res.json(respuesta(true, `Administradores especiales filtrados por ${tipo} obtenidos correctamente`, {
      administradores,
      filtro: tipo,
      paginacion: { limite, offset, total }
    }));
  } catch (error) {
    console.error('Error en obtenerAdministradoresFiltrados:', error.message);
    res.status(500).json(respuesta(false, error.message));
  }
};

/**
 * Controlador para GET /buscar
 */
const buscarAdministradoresController = async (req, res) => {
  try {
    const { q } = req.query;
    const limite = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;

    if (!q) {
      return res.status(400).json(respuesta(false, 'El parámetro de búsqueda "q" es requerido'));
    }

    const { administradores, total } = await buscarAdministradores(q, limite, offset);
    
    res.json(respuesta(true, 'Administradores especiales obtenidos correctamente', {
      administradores,
      paginacion: { limite, offset, total }
    }));
  } catch (error) {
    console.error('Error en buscarAdministradores:', error.message);
    res.status(500).json(respuesta(false, error.message));
  }
};

/**
 * Controlador para GET /dato-individual/:id
 */
const obtenerAdministradorPorIdController = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || isNaN(id)) {
      return res.status(400).json(respuesta(false, 'ID de administrador especial no válido'));
    }

    const administrador = await obtenerAdministradorPorId(parseInt(id));

    if (!administrador) {
      return res.status(404).json(respuesta(false, 'Administrador especial no encontrado'));
    }

    res.json(respuesta(true, 'Administrador especial obtenido correctamente', { administrador }));
  } catch (error) {
    console.error('Error en obtenerAdministradorPorId:', error.message);
    res.status(500).json(respuesta(false, error.message));
  }
};

/**
 * Controlador para POST - Crear administrador especial
 */
const crearAdministradorController = async (req, res) => {
  try {
    const datos = req.body;

    // Validaciones básicas
    const camposObligatorios = ['correo', 'usuario', 'fecha_ingreso'];
    const faltantes = camposObligatorios.filter(campo => !datos[campo] || datos[campo].toString().trim() === '');

    if (faltantes.length > 0) {
      return res.status(400).json(
        respuesta(false, `Faltan campos obligatorios: ${faltantes.join(', ')}`)
      );
    }

    const nuevoAdministrador = await crearAdministrador(datos);

    res.status(201).json(respuesta(true, 'Administrador especial creado correctamente', { administrador: nuevoAdministrador }));
  } catch (error) {
    console.error('Error en crearAdministrador:', error.message);
    
    if (error.code === '23505') { // Violación de unique constraint
      return res.status(400).json(respuesta(false, 'El correo o usuario ya existe'));
    }
    
    res.status(500).json(respuesta(false, error.message));
  }
};

/**
 * Controlador para PATCH - Actualizar administrador especial
 */
const actualizarAdministradorController = async (req, res) => {
  try {
    const { id } = req.params;
    const camposActualizar = req.body;

    if (!id || isNaN(id)) {
      return res.status(400).json(respuesta(false, 'ID de administrador especial no válido'));
    }

    if (Object.keys(camposActualizar).length === 0) {
      return res.status(400).json(respuesta(false, 'No se proporcionaron campos para actualizar'));
    }

    const administradorActualizado = await actualizarAdministrador(parseInt(id), camposActualizar);

    if (!administradorActualizado) {
      return res.status(404).json(respuesta(false, 'Administrador especial no encontrado'));
    }

    res.json(respuesta(true, 'Administrador especial actualizado correctamente', { administrador: administradorActualizado }));
  } catch (error) {
    console.error('Error en actualizarAdministrador:', error.message);
    res.status(500).json(respuesta(false, error.message));
  }
};

/**
 * Controlador para DELETE - Eliminar administrador especial
 */
const eliminarAdministradorController = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || isNaN(id)) {
      return res.status(400).json(respuesta(false, 'ID de administrador especial no válido'));
    }

    const administradorEliminado = await eliminarAdministrador(parseInt(id));

    if (!administradorEliminado) {
      return res.status(404).json(respuesta(false, 'Administrador especial no encontrado'));
    }

    res.json(respuesta(true, 'Administrador especial eliminado correctamente'));
  } catch (error) {
    console.error('Error en eliminarAdministrador:', error.message);
    res.status(500).json(respuesta(false, error.message));
  }
};

// RUTAS

// GET endpoints
router.get('/datos-especificos', obtenerDatosEspecificosController);
router.get('/filtro', obtenerAdministradoresFiltradosController);
router.get('/buscar', buscarAdministradoresController);
router.get('/dato-individual/:id', obtenerAdministradorPorIdController);

// POST, PATCH, DELETE endpoints
router.post('/', crearAdministradorController);
router.patch('/:id', actualizarAdministradorController);
router.delete('/:id', eliminarAdministradorController);

module.exports = router;