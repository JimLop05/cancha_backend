//cancha_backend/api/invitado.js
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
 * Obtener invitados con datos completos (paginado)
 */
const obtenerInvitados = async (limite = 10, offset = 0) => {
  try {
    const queryDatos = `
      SELECT 
        i.id_invitado,
        i.fecha_ultima_invitacion,
        i.estado_activo,
        i.estado_preferencia,
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
      FROM invitado i
      JOIN cliente c ON i.id_invitado = c.id_cliente
      JOIN usuario u ON c.id_cliente = u.id_persona
      ORDER BY u.nombre, u.apellido
      LIMIT $1 OFFSET $2
    `;

    const queryTotal = `SELECT COUNT(*) FROM invitado`;

    const [resDatos, resTotal] = await Promise.all([
      pool.query(queryDatos, [limite, offset]),
      pool.query(queryTotal)
    ]);

    return {
      invitados: resDatos.rows,
      total: parseInt(resTotal.rows[0].count, 10)
    };
  } catch (err) {
    throw err;
  }
};

/**
 * Obtener invitados con filtros de ordenamiento
 */
const obtenerInvitadosFiltrados = async (tipoFiltro, limite = 10, offset = 0) => {
  try {
    const ordenesPermitidas = {
      nombre: 'u.nombre ASC, u.apellido ASC',
      fecha_invitacion: 'i.fecha_ultima_invitacion DESC NULLS LAST',
      fecha_creacion: 'u.fecha_creacion DESC',
      correo: 'u.correo ASC',
      estado: 'i.estado_activo DESC, i.estado_preferencia ASC',
      default: 'u.nombre ASC, u.apellido ASC'
    };

    const orden = ordenesPermitidas[tipoFiltro] || ordenesPermitidas.default;

    const queryDatos = `
      SELECT 
        i.id_invitado,
        i.fecha_ultima_invitacion,
        i.estado_activo,
        i.estado_preferencia,
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
      FROM invitado i
      JOIN cliente c ON i.id_invitado = c.id_cliente
      JOIN usuario u ON c.id_cliente = u.id_persona
      ORDER BY ${orden}
      LIMIT $1 OFFSET $2
    `;

    const queryTotal = `SELECT COUNT(*) FROM invitado`;

    const [resDatos, resTotal] = await Promise.all([
      pool.query(queryDatos, [limite, offset]),
      pool.query(queryTotal)
    ]);

    return {
      invitados: resDatos.rows,
      total: parseInt(resTotal.rows[0].count, 10)
    };
  } catch (err) {
    throw new Error(`Error al obtener invitados filtrados: ${err.message}`);
  }
};

/**
 * Buscar invitados por texto en múltiples campos
 */
const buscarInvitados = async (texto, limite = 10, offset = 0) => {
  try {
    const queryDatos = `
      SELECT 
        i.id_invitado,
        i.fecha_ultima_invitacion,
        i.estado_activo,
        i.estado_preferencia,
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
      FROM invitado i
      JOIN cliente c ON i.id_invitado = c.id_cliente
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
      FROM invitado i
      JOIN cliente c ON i.id_invitado = c.id_cliente
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
      invitados: resDatos.rows,
      total: parseInt(resTotal.rows[0].count, 10)
    };
  } catch (err) {
    throw err;
  }
};

/**
 * Obtener invitado por ID con datos completos
 */
const obtenerInvitadoPorId = async (id) => {
  try {
    const query = `
      SELECT 
        i.id_invitado,
        i.fecha_ultima_invitacion,
        i.estado_activo,
        i.estado_preferencia,
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
      FROM invitado i
      JOIN cliente c ON i.id_invitado = c.id_cliente
      JOIN usuario u ON c.id_cliente = u.id_persona
      WHERE i.id_invitado = $1
    `;
    const { rows } = await pool.query(query, [id]);
    return rows[0] || null;
  } catch (err) {
    throw err;
  }
};

/**
 * Crear invitado completo (usuario + cliente + invitado)
 */
const crearInvitado = async (datosInvitado) => {
  try {
    // Eliminar contraseña del body si viene
    delete datosInvitado.contrasena;
    
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
    const faltantes = camposObligatorios.filter(campo => !datosInvitado[campo] || datosInvitado[campo].toString().trim() === '');
    if (faltantes.length > 0) {
      throw new Error(`Faltan campos obligatorios: ${faltantes.join(', ')}`);
    }

    // Validaciones de cliente
    if (datosInvitado.carnet_identidad && !/^\d{1,10}$/.test(datosInvitado.carnet_identidad)) {
      throw new Error('El carnet de identidad debe ser numérico y no exceder los 10 caracteres');
    }

    if (datosInvitado.ci_complemento && !/^[A-Za-z0-9]{1,3}$/.test(datosInvitado.ci_complemento)) {
      throw new Error('El complemento del carnet debe tener hasta 3 caracteres alfanuméricos');
    }

    if (datosInvitado.fecha_nac) {
      const fechaNac = new Date(datosInvitado.fecha_nac);
      if (isNaN(fechaNac.getTime()) || fechaNac > new Date()) {
        throw new Error('La fecha de nacimiento no es válida o está en el futuro');
      }
    }

    // Validaciones de invitado
    const estadosValidos = ['activo', 'inactivo', 'bloqueado'];
    const estadoPreferencia = datosInvitado.estado_preferencia;
    if (estadoPreferencia && !estadosValidos.includes(estadoPreferencia)) {
      throw new Error('estado_preferencia debe ser: activo, inactivo o bloqueado');
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
      datosInvitado.nombre || null,
      datosInvitado.apellido || null,
      contrasenaHash,
      datosInvitado.telefono || null,
      datosInvitado.correo,
      datosInvitado.sexo || null,
      datosInvitado.imagen_perfil || null,
      datosInvitado.usuario,
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
      datosInvitado.fecha_registro || new Date().toISOString().split('T')[0],
      datosInvitado.fecha_nac || null,
      datosInvitado.carnet_identidad || null,
      datosInvitado.ci_complemento || null
    ];
    await pool.query(queryCliente, valuesCliente);

    // Insertar en INVITADO
    const queryInvitado = `
      INSERT INTO invitado (
        id_invitado, 
        fecha_ultima_invitacion, 
        estado_activo, 
        estado_preferencia
      ) 
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
    const valuesInvitado = [
      idPersona,
      datosInvitado.fecha_ultima_invitacion || null,
      datosInvitado.estado_activo !== undefined ? datosInvitado.estado_activo : true,
      estadoPreferencia || 'activo'
    ];
    await pool.query(queryInvitado, valuesInvitado);

    // Obtener datos completos
    const invitadoCompleto = await obtenerInvitadoPorId(idPersona);
    return invitadoCompleto;

  } catch (error) {
    console.error('Error al crear invitado:', error.message);
    
    if (error.code === '23505') {
      throw new Error('El correo o usuario ya existe');
    }
    
    throw new Error(error.message);
  }
};

/**
 * Actualizar invitado (campos de usuario, cliente e invitado)
 */
const actualizarInvitado = async (id, camposActualizar) => {
  try {
    // Eliminar contraseña del body
    delete camposActualizar.contrasena;

    // Separar campos por tabla
    const camposUser = {};
    const camposCliente = {};
    const camposInvitado = {};

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

    // Campos de INVITADO
    ['fecha_ultima_invitacion', 'estado_activo', 'estado_preferencia'].forEach(key => {
      if (key in camposActualizar) {
        camposInvitado[key] = camposActualizar[key];
      }
    });

    if (Object.keys(camposUser).length === 0 && 
        Object.keys(camposCliente).length === 0 && 
        Object.keys(camposInvitado).length === 0) {
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

    // Validaciones de invitado
    if (camposInvitado.fecha_ultima_invitacion) {
      const fechaUltimaInvitacion = new Date(camposInvitado.fecha_ultima_invitacion);
      if (isNaN(fechaUltimaInvitacion.getTime())) {
        throw new Error('La fecha de última invitación no es válida');
      }
    }

    if (camposInvitado.estado_activo !== undefined && typeof camposInvitado.estado_activo !== 'boolean') {
      throw new Error('El campo estado_activo debe ser true o false');
    }

    if (camposInvitado.estado_preferencia) {
      const estadosValidos = ['activo', 'inactivo', 'bloqueado'];
      if (!estadosValidos.includes(camposInvitado.estado_preferencia)) {
        throw new Error('estado_preferencia debe ser: activo, inactivo o bloqueado');
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

    // Actualizar INVITADO si aplica
    if (Object.keys(camposInvitado).length > 0) {
      const setClauseInvitado = Object.keys(camposInvitado).map((campo, index) => `${campo} = $${index + 2}`).join(', ');
      const valuesInvitado = [id, ...Object.values(camposInvitado)];
      const queryInvitado = `
        UPDATE invitado 
        SET ${setClauseInvitado}
        WHERE id_invitado = $1
      `;
      await pool.query(queryInvitado, valuesInvitado);
    }

    // Retornar datos completos actualizados
    const invitadoCompleto = await obtenerInvitadoPorId(id);
    return invitadoCompleto;
  } catch (error) {
    throw error;
  }
};

/**
 * Eliminar invitado
 */
const eliminarInvitado = async (id) => {
  try {
    const query = `DELETE FROM invitado WHERE id_invitado = $1 RETURNING id_invitado`;
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

    const { invitados, total } = await obtenerInvitados(limite, offset);

    res.json(
      respuesta(true, 'Invitados obtenidos correctamente', {
        invitados,
        paginacion: { limite, offset, total }
      })
    );
  } catch (err) {
    console.error('Error obtenerDatosEspecificos invitado:', err);
    res.status(500).json(respuesta(false, err.message));
  }
};

/**
 * GET /filtro - Con ordenamiento
 */
const obtenerInvitadosFiltradosCtrl = async (req, res) => {
  try {
    const { tipo } = req.query;
    const limite = parseInt(req.query.limit, 10) || 10;
    const offset = parseInt(req.query.offset, 10) || 0;

    const tiposValidos = ['nombre', 'fecha_invitacion', 'fecha_creacion', 'correo', 'estado'];
    if (!tipo || !tiposValidos.includes(tipo)) {
      return res.status(400).json(respuesta(false, 'El parámetro "tipo" es inválido o no proporcionado'));
    }

    const { invitados, total } = await obtenerInvitadosFiltrados(tipo, limite, offset);

    res.json(respuesta(true, `Invitados filtrados por ${tipo} obtenidos correctamente`, {
      invitados,
      filtro: tipo,
      paginacion: { limite, offset, total }
    }));
  } catch (err) {
    console.error('Error en obtenerInvitadosFiltrados:', err.message);
    res.status(500).json(respuesta(false, err.message));
  }
};

/**
 * GET /buscar - Búsqueda por texto
 */
const buscarInvitadosCtrl = async (req, res) => {
  try {
    const { q } = req.query;
    const limite = parseInt(req.query.limit, 10) || 10;
    const offset = parseInt(req.query.offset, 10) || 0;

    if (!q) {
      return res.status(400).json(respuesta(false, 'El parámetro de búsqueda "q" es requerido'));
    }

    const { invitados, total } = await buscarInvitados(q, limite, offset);
    
    res.json(respuesta(true, 'Invitados obtenidos correctamente', {
      invitados,
      paginacion: { limite, offset, total }
    }));
  } catch (err) {
    console.error('Error en buscarInvitados:', err.message);
    res.status(500).json(respuesta(false, err.message));
  }
};

/**
 * GET /dato-individual/:id - Invitado específico
 */
const obtenerPorIdCtrl = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || isNaN(id)) {
      return res.status(400).json(respuesta(false, 'ID inválido'));
    }

    const invitado = await obtenerInvitadoPorId(parseInt(id, 10));
    if (!invitado) {
      return res.status(404).json(respuesta(false, 'Invitado no encontrado'));
    }

    res.json(respuesta(true, 'Invitado obtenido correctamente', { invitado }));
  } catch (err) {
    console.error('Error obtenerPorId invitado:', err);
    res.status(500).json(respuesta(false, err.message));
  }
};

/**
 * POST / - Crear invitado completo
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

    const nuevoInvitado = await crearInvitado(datos);

    res.status(201).json(respuesta(true, 'Invitado creado correctamente', { invitado: nuevoInvitado }));
  } catch (err) {
    console.error('Error crear invitado:', err);
    
    if (err.code === '23505') {
      return res.status(400).json(respuesta(false, 'El correo o usuario ya existe'));
    }
    
    res.status(500).json(respuesta(false, err.message));
  }
};

/**
 * PATCH /:id - Actualizar invitado
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

    const actualizado = await actualizarInvitado(parseInt(id, 10), campos);
    if (!actualizado) {
      return res.status(404).json(respuesta(false, 'Invitado no encontrado'));
    }

    res.json(respuesta(true, 'Invitado actualizado correctamente', { invitado: actualizado }));
  } catch (err) {
    console.error('Error actualizar invitado:', err);
    res.status(500).json(respuesta(false, err.message));
  }
};

/**
 * DELETE /:id - Eliminar invitado
 */
const eliminarCtrl = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || isNaN(id)) {
      return res.status(400).json(respuesta(false, 'ID inválido'));
    }

    const eliminado = await eliminarInvitado(parseInt(id, 10));
    if (!eliminado) {
      return res.status(404).json(respuesta(false, 'Invitado no encontrado'));
    }

    res.json(respuesta(true, 'Invitado eliminado correctamente'));
  } catch (err) {
    console.error('Error eliminar invitado:', err);
    res.status(500).json(respuesta(false, err.message));
  }
};

/* ==================== RUTAS ==================== */

// GET endpoints (4 rutas)
router.get('/datos-especificos', obtenerDatosEspecificosCtrl);
router.get('/filtro', obtenerInvitadosFiltradosCtrl);
router.get('/buscar', buscarInvitadosCtrl);
router.get('/dato-individual/:id', obtenerPorIdCtrl);

// POST, PATCH, DELETE endpoints
router.post('/', crearCtrl);
router.patch('/:id', actualizarCtrl);
router.delete('/:id', eliminarCtrl);

module.exports = router;