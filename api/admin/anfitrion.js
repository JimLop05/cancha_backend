const express = require('express');
const pool = require('../../config/database');
const bcrypt = require('bcrypt');

const router = express.Router();

/* -------------------------------------------------
   Respuesta estandarizada
   ------------------------------------------------- */
const respuesta = (exito, mensaje, datos = null) => ({
  exito,
  mensaje,
  datos,
});

/* ==================== MODELOS ==================== */

/**
 * Obtener anfitriones con datos completos (paginado)
 */
const obtenerAnfitriones = async (limite = 10, offset = 0) => {
  try {
    const queryDatos = `
      SELECT 
        a.id_anfitrion,
        a.fecha_registro_anfitrion,
        a.verificado,
        u.id_persona,
        u.nombre,
        u.apellido,
        u.correo,
        u.usuario,
        u.telefono,
        u.sexo,
        u.imagen_perfil,
        u.latitud,
        u.longitud,
        u.fecha_creacion,
        c.fecha_registro,
        c.fecha_nac,
        c.carnet_identidad,
        c.ci_complemento
      FROM anfitrion a
      JOIN cliente c ON a.id_anfitrion = c.id_cliente
      JOIN usuario u ON c.id_cliente = u.id_persona
      ORDER BY u.nombre, u.apellido
      LIMIT $1 OFFSET $2
    `;

    const queryTotal = `SELECT COUNT(*) FROM anfitrion`;

    const [resDatos, resTotal] = await Promise.all([
      pool.query(queryDatos, [limite, offset]),
      pool.query(queryTotal)
    ]);

    return {
      anfitriones: resDatos.rows,
      total: parseInt(resTotal.rows[0].count, 10)
    };
  } catch (err) {
    throw err;
  }
};

/**
 * Obtener anfitriones con filtros de ordenamiento
 */
const obtenerAnfitrionesFiltrados = async (tipoFiltro, limite = 10, offset = 0) => {
  try {
    const ordenesPermitidas = {
      nombre: 'u.nombre ASC, u.apellido ASC',
      fecha_registro: 'a.fecha_registro_anfitrion DESC',
      fecha_creacion: 'u.fecha_creacion DESC',
      correo: 'u.correo ASC',
      verificado: 'a.verificado DESC, u.nombre ASC',
      default: 'u.nombre ASC, u.apellido ASC'
    };

    const orden = ordenesPermitidas[tipoFiltro] || ordenesPermitidas.default;

    const queryDatos = `
      SELECT 
        a.id_anfitrion,
        a.fecha_registro_anfitrion,
        a.verificado,
        u.id_persona,
        u.nombre,
        u.apellido,
        u.correo,
        u.usuario,
        u.telefono,
        u.sexo,
        u.imagen_perfil,
        c.fecha_registro,
        c.fecha_nac,
        c.carnet_identidad,
        c.ci_complemento
      FROM anfitrion a
      JOIN cliente c ON a.id_anfitrion = c.id_cliente
      JOIN usuario u ON c.id_cliente = u.id_persona
      ORDER BY ${orden}
      LIMIT $1 OFFSET $2
    `;

    const queryTotal = `SELECT COUNT(*) FROM anfitrion`;

    const [resDatos, resTotal] = await Promise.all([
      pool.query(queryDatos, [limite, offset]),
      pool.query(queryTotal)
    ]);

    return {
      anfitriones: resDatos.rows,
      total: parseInt(resTotal.rows[0].count, 10)
    };
  } catch (err) {
    throw new Error(`Error al obtener anfitriones filtrados: ${err.message}`);
  }
};

/**
 * Buscar anfitriones por texto en múltiples campos
 */
const buscarAnfitriones = async (texto, limite = 10, offset = 0) => {
  try {
    const queryDatos = `
      SELECT 
        a.id_anfitrion,
        a.fecha_registro_anfitrion,
        a.verificado,
        u.id_persona,
        u.nombre,
        u.apellido,
        u.correo,
        u.usuario,
        u.telefono,
        c.fecha_registro,
        c.fecha_nac,
        c.carnet_identidad,
        c.ci_complemento
      FROM anfitrion a
      JOIN cliente c ON a.id_anfitrion = c.id_cliente
      JOIN usuario u ON c.id_cliente = u.id_persona
      WHERE 
        u.nombre ILIKE $1 OR 
        u.apellido ILIKE $1 OR 
        u.correo ILIKE $1 OR 
        u.usuario ILIKE $1 OR
        c.carnet_identidad ILIKE $1
      ORDER BY u.nombre, u.apellido
      LIMIT $2 OFFSET $3
    `;

    const queryTotal = `
      SELECT COUNT(*) 
      FROM anfitrion a
      JOIN cliente c ON a.id_anfitrion = c.id_cliente
      JOIN usuario u ON c.id_cliente = u.id_persona
      WHERE 
        u.nombre ILIKE $1 OR 
        u.apellido ILIKE $1 OR 
        u.correo ILIKE $1 OR 
        u.usuario ILIKE $1 OR
        c.carnet_identidad ILIKE $1
    `;
    
    const sanitizeInput = (input) => input.replace(/[%_\\]/g, '\\$&');
    const terminoBusqueda = `%${sanitizeInput(texto)}%`;
    
    const [resDatos, resTotal] = await Promise.all([
      pool.query(queryDatos, [terminoBusqueda, limite, offset]),
      pool.query(queryTotal, [terminoBusqueda])
    ]);

    return {
      anfitriones: resDatos.rows,
      total: parseInt(resTotal.rows[0].count, 10)
    };
  } catch (err) {
    throw err;
  }
};

/**
 * Obtener anfitrión por ID con datos completos
 */
const obtenerAnfitrionPorId = async (id) => {
  try {
    const query = `
      SELECT 
        a.id_anfitrion,
        a.fecha_registro_anfitrion,
        a.verificado,
        u.id_persona,
        u.nombre,
        u.apellido,
        u.correo,
        u.usuario,
        u.telefono,
        u.sexo,
        u.imagen_perfil,
        u.latitud,
        u.longitud,
        u.fecha_creacion,
        c.fecha_registro,
        c.fecha_nac,
        c.carnet_identidad,
        c.ci_complemento
      FROM anfitrion a
      JOIN cliente c ON a.id_anfitrion = c.id_cliente
      JOIN usuario u ON c.id_cliente = u.id_persona
      WHERE a.id_anfitrion = $1
    `;
    const { rows } = await pool.query(query, [id]);
    return rows[0] || null;
  } catch (err) {
    throw err;
  }
};

/**
 * Crear anfitrión completo (usuario + cliente + anfitrión)
 */
const crearAnfitrion = async (datosAnfitrion) => {
  try {
    // Eliminar contraseña del body si viene
    delete datosAnfitrion.contrasena;
    
    // Encriptar contraseña fija
    const contrasenaHash = await bcrypt.hash('123456', 10);

    // Generar coordenadas aleatorias en rango de La Paz
    const minLat = -16.55;
    const maxLat = -16.45;
    const minLong = -68.20;
    const maxLong = -68.10;
    const latitud = parseFloat((Math.random() * (maxLat - minLat) + minLat).toFixed(6));
    const longitud = parseFloat((Math.random() * (maxLong - minLong) + minLong).toFixed(6));

    // Validar campos obligatorios
    const camposObligatorios = ['correo', 'usuario'];
    const faltantes = camposObligatorios.filter(campo => !datosAnfitrion[campo] || datosAnfitrion[campo].toString().trim() === '');
    if (faltantes.length > 0) {
      throw new Error(`Faltan campos obligatorios: ${faltantes.join(', ')}`);
    }

    // Validaciones de cliente
    if (datosAnfitrion.carnet_identidad && !/^\d{1,10}$/.test(datosAnfitrion.carnet_identidad)) {
      throw new Error('El carnet de identidad debe ser numérico y no exceder los 10 caracteres');
    }

    if (datosAnfitrion.ci_complemento && !/^[A-Za-z0-9]{1,3}$/.test(datosAnfitrion.ci_complemento)) {
      throw new Error('El complemento del carnet debe tener hasta 3 caracteres alfanuméricos');
    }

    if (datosAnfitrion.fecha_nac) {
      const fechaNac = new Date(datosAnfitrion.fecha_nac);
      if (isNaN(fechaNac.getTime()) || fechaNac > new Date()) {
        throw new Error('La fecha de nacimiento no es válida o está en el futuro');
      }
    }

    // Insertar en USUARIO
    const queryUsuario = `
      INSERT INTO usuario (
        nombre, apellido, contrasena, telefono, correo, sexo, imagen_perfil, usuario, latitud, longitud
      ) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id_persona
    `;
    const valuesUsuario = [
      datosAnfitrion.nombre || null,
      datosAnfitrion.apellido || null,
      contrasenaHash,
      datosAnfitrion.telefono || null,
      datosAnfitrion.correo,
      datosAnfitrion.sexo || null,
      datosAnfitrion.imagen_perfil || null,
      datosAnfitrion.usuario,
      latitud,
      longitud
    ];
    const resultUsuario = await pool.query(queryUsuario, valuesUsuario);
    const idPersona = resultUsuario.rows[0].id_persona;

    // Insertar en CLIENTE
    const queryCliente = `
      INSERT INTO cliente (
        id_cliente, fecha_registro, fecha_nac, carnet_identidad, ci_complemento
      ) 
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;
    const valuesCliente = [
      idPersona,
      datosAnfitrion.fecha_registro || new Date().toISOString().split('T')[0],
      datosAnfitrion.fecha_nac || null,
      datosAnfitrion.carnet_identidad || null,
      datosAnfitrion.ci_complemento || null
    ];
    await pool.query(queryCliente, valuesCliente);

    // Insertar en ANFITRION
    const queryAnfitrion = `
      INSERT INTO anfitrion (
        id_anfitrion, fecha_registro_anfitrion, verificado
      ) 
      VALUES ($1, $2, $3)
      RETURNING *
    `;
    const valuesAnfitrion = [
      idPersona,
      datosAnfitrion.fecha_registro_anfitrion || new Date().toISOString().split('T')[0],
      datosAnfitrion.verificado !== undefined ? datosAnfitrion.verificado : false
    ];
    await pool.query(queryAnfitrion, valuesAnfitrion);

    // Obtener datos completos
    const anfitrionCompleto = await obtenerAnfitrionPorId(idPersona);
    return anfitrionCompleto;

  } catch (error) {
    console.error('Error al crear anfitrión:', error.message);
    
    if (error.code === '23505') {
      throw new Error('El correo o usuario ya existe');
    }
    
    throw new Error(error.message);
  }
};

/**
 * Actualizar anfitrión (campos de usuario, cliente y anfitrión)
 */
const actualizarAnfitrion = async (id, camposActualizar) => {
  try {
    // Eliminar contraseña del body
    delete camposActualizar.contrasena;

    // Separar campos por tabla
    const camposUser = {};
    const camposCliente = {};
    const camposAnfitrion = {};

    // Campos de USUARIO
    ['nombre', 'apellido', 'correo', 'usuario', 'telefono', 'sexo', 'imagen_perfil'].forEach(key => {
      if (key in camposActualizar) {
        camposUser[key] = camposActualizar[key] || null;
      }
    });

    // Campos de CLIENTE
    ['fecha_nac', 'carnet_identidad', 'ci_complemento'].forEach(key => {
      if (key in camposActualizar) {
        camposCliente[key] = camposActualizar[key] || null;
      }
    });

    // Campos de ANFITRION
    ['fecha_registro_anfitrion', 'verificado'].forEach(key => {
      if (key in camposActualizar) {
        camposAnfitrion[key] = camposActualizar[key];
      }
    });

    if (Object.keys(camposUser).length === 0 && 
        Object.keys(camposCliente).length === 0 && 
        Object.keys(camposAnfitrion).length === 0) {
      throw new Error('No hay campos válidos para actualizar');
    }

    // Validaciones de cliente
    if (camposCliente.carnet_identidad && !/^\d{1,10}$/.test(camposCliente.carnet_identidad)) {
      throw new Error('El carnet de identidad debe ser numérico y no exceder los 10 caracteres');
    }

    if (camposCliente.ci_complemento && !/^[A-Za-z0-9]{1,3}$/.test(camposCliente.ci_complemento)) {
      throw new Error('El complemento del carnet debe tener hasta 3 caracteres alfanuméricos');
    }

    if (camposCliente.fecha_nac) {
      const fechaNac = new Date(camposCliente.fecha_nac);
      if (isNaN(fechaNac.getTime()) || fechaNac > new Date()) {
        throw new Error('La fecha de nacimiento no es válida o está en el futuro');
      }
    }

    // Validaciones de anfitrión
    if (camposAnfitrion.fecha_registro_anfitrion) {
      const fechaRegistroAnfitrion = new Date(camposAnfitrion.fecha_registro_anfitrion);
      if (isNaN(fechaRegistroAnfitrion.getTime())) {
        throw new Error('La fecha de registro como anfitrión no es válida');
      }
    }

    if (camposAnfitrion.verificado !== undefined && typeof camposAnfitrion.verificado !== 'boolean') {
      throw new Error('El campo verificado debe ser true o false');
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

    // Actualizar CLIENTE si aplica
    if (Object.keys(camposCliente).length > 0) {
      const setClauseCliente = Object.keys(camposCliente).map((campo, index) => `${campo} = $${index + 2}`).join(', ');
      const valuesCliente = [id, ...Object.values(camposCliente)];
      const queryCliente = `
        UPDATE cliente 
        SET ${setClauseCliente}
        WHERE id_cliente = $1
      `;
      await pool.query(queryCliente, valuesCliente);
    }

    // Actualizar ANFITRION si aplica
    if (Object.keys(camposAnfitrion).length > 0) {
      const setClauseAnfitrion = Object.keys(camposAnfitrion).map((campo, index) => `${campo} = $${index + 2}`).join(', ');
      const valuesAnfitrion = [id, ...Object.values(camposAnfitrion)];
      const queryAnfitrion = `
        UPDATE anfitrion 
        SET ${setClauseAnfitrion}
        WHERE id_anfitrion = $1
      `;
      await pool.query(queryAnfitrion, valuesAnfitrion);
    }

    // Retornar datos completos actualizados
    const anfitrionCompleto = await obtenerAnfitrionPorId(id);
    return anfitrionCompleto;
  } catch (error) {
    throw error;
  }
};

/**
 * Eliminar anfitrión
 */
const eliminarAnfitrion = async (id) => {
  try {
    const query = `DELETE FROM anfitrion WHERE id_anfitrion = $1 RETURNING id_anfitrion`;
    const { rows } = await pool.query(query, [id]);
    return rows[0] || null;
  } catch (err) {
    throw err;
  }
};

/* ==================== CONTROLADORES ==================== */

/**
 * GET /datos-especificos - Lista paginada
 */
const obtenerDatosEspecificosCtrl = async (req, res) => {
  try {
    const limite = parseInt(req.query.limit, 10) || 10;
    const offset = parseInt(req.query.offset, 10) || 0;

    const { anfitriones, total } = await obtenerAnfitriones(limite, offset);

    res.json(
      respuesta(true, 'Anfitriones obtenidos correctamente', {
        anfitriones,
        paginacion: { limite, offset, total }
      })
    );
  } catch (err) {
    console.error('Error obtenerDatosEspecificos anfitrion:', err);
    res.status(500).json(respuesta(false, err.message));
  }
};

/**
 * GET /filtro - Con ordenamiento
 */
const obtenerAnfitrionesFiltradosCtrl = async (req, res) => {
  try {
    const { tipo } = req.query;
    const limite = parseInt(req.query.limit, 10) || 10;
    const offset = parseInt(req.query.offset, 10) || 0;

    const tiposValidos = ['nombre', 'fecha_registro', 'fecha_creacion', 'correo', 'verificado'];
    if (!tipo || !tiposValidos.includes(tipo)) {
      return res.status(400).json(respuesta(false, 'El parámetro "tipo" es inválido o no proporcionado'));
    }

    const { anfitriones, total } = await obtenerAnfitrionesFiltrados(tipo, limite, offset);

    res.json(respuesta(true, `Anfitriones filtrados por ${tipo} obtenidos correctamente`, {
      anfitriones,
      filtro: tipo,
      paginacion: { limite, offset, total }
    }));
  } catch (err) {
    console.error('Error en obtenerAnfitrionesFiltrados:', err.message);
    res.status(500).json(respuesta(false, err.message));
  }
};

/**
 * GET /buscar - Búsqueda por texto
 */
const buscarAnfitrionesCtrl = async (req, res) => {
  try {
    const { q } = req.query;
    const limite = parseInt(req.query.limit, 10) || 10;
    const offset = parseInt(req.query.offset, 10) || 0;

    if (!q) {
      return res.status(400).json(respuesta(false, 'El parámetro de búsqueda "q" es requerido'));
    }

    const { anfitriones, total } = await buscarAnfitriones(q, limite, offset);
    
    res.json(respuesta(true, 'Anfitriones obtenidos correctamente', {
      anfitriones,
      paginacion: { limite, offset, total }
    }));
  } catch (err) {
    console.error('Error en buscarAnfitriones:', err.message);
    res.status(500).json(respuesta(false, err.message));
  }
};

/**
 * GET /dato-individual/:id - Anfitrión específico
 */
const obtenerPorIdCtrl = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || isNaN(id)) {
      return res.status(400).json(respuesta(false, 'ID inválido'));
    }

    const anfitrion = await obtenerAnfitrionPorId(parseInt(id, 10));
    if (!anfitrion) {
      return res.status(404).json(respuesta(false, 'Anfitrión no encontrado'));
    }

    res.json(respuesta(true, 'Anfitrión obtenido correctamente', { anfitrion }));
  } catch (err) {
    console.error('Error obtenerPorId anfitrion:', err);
    res.status(500).json(respuesta(false, err.message));
  }
};

/**
 * POST / - Crear anfitrión completo
 */
const crearCtrl = async (req, res) => {
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

    const nuevoAnfitrion = await crearAnfitrion(datos);

    res.status(201).json(respuesta(true, 'Anfitrión creado correctamente', { anfitrion: nuevoAnfitrion }));
  } catch (err) {
    console.error('Error crear anfitrion:', err);
    
    if (err.code === '23505') {
      return res.status(400).json(respuesta(false, 'El correo o usuario ya existe'));
    }
    
    res.status(500).json(respuesta(false, err.message));
  }
};

/**
 * PATCH /:id - Actualizar anfitrión
 */
const actualizarCtrl = async (req, res) => {
  try {
    const { id } = req.params;
    const campos = req.body;

    if (!id || isNaN(id)) {
      return res.status(400).json(respuesta(false, 'ID inválido'));
    }
    if (Object.keys(campos).length === 0) {
      return res.status(400).json(respuesta(false, 'No se enviaron campos para actualizar'));
    }

    const actualizado = await actualizarAnfitrion(parseInt(id, 10), campos);
    if (!actualizado) {
      return res.status(404).json(respuesta(false, 'Anfitrión no encontrado'));
    }

    res.json(respuesta(true, 'Anfitrión actualizado correctamente', { anfitrion: actualizado }));
  } catch (err) {
    console.error('Error actualizar anfitrion:', err);
    res.status(500).json(respuesta(false, err.message));
  }
};

/**
 * DELETE /:id - Eliminar anfitrión
 */
const eliminarCtrl = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || isNaN(id)) {
      return res.status(400).json(respuesta(false, 'ID inválido'));
    }

    const eliminado = await eliminarAnfitrion(parseInt(id, 10));
    if (!eliminado) {
      return res.status(404).json(respuesta(false, 'Anfitrión no encontrado'));
    }

    res.json(respuesta(true, 'Anfitrión eliminado correctamente'));
  } catch (err) {
    console.error('Error eliminar anfitrion:', err);
    res.status(500).json(respuesta(false, err.message));
  }
};

/* ==================== RUTAS ==================== */

// GET endpoints (4 rutas)
router.get('/datos-especificos', obtenerDatosEspecificosCtrl);
router.get('/filtro', obtenerAnfitrionesFiltradosCtrl);
router.get('/buscar', buscarAnfitrionesCtrl);
router.get('/dato-individual/:id', obtenerPorIdCtrl);

// POST, PATCH, DELETE endpoints
router.post('/', crearCtrl);
router.patch('/:id', actualizarCtrl);
router.delete('/:id', eliminarCtrl);

module.exports = router;