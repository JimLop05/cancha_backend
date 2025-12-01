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
 * Obtener datos específicos de clientes con información de la persona
 */
const obtenerDatosEspecificos = async (limite = 10, offset = 0) => {
  try {
    const queryDatos = `
      SELECT c.id_cliente, p.nombre, p.apellido, p.correo, c.fecha_registro, c.fecha_nac, c.carnet_identidad, c.ci_complemento
      FROM cliente c
      JOIN usuario p ON c.id_cliente = p.id_persona
      ORDER BY c.id_cliente
      LIMIT $1 OFFSET $2
    `;
    const queryTotal = `SELECT COUNT(*) FROM cliente`;
    const [resultDatos, resultTotal] = await Promise.all([
      pool.query(queryDatos, [limite, offset]),
      pool.query(queryTotal)
    ]);
    return {
      clientes: resultDatos.rows,
      total: parseInt(resultTotal.rows[0].count)
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Obtener clientes con filtros de ordenamiento
 */
const obtenerClientesFiltrados = async (tipoFiltro, limite = 10, offset = 0) => {
  try {
    const ordenesPermitidas = {
      nombre: 'p.nombre ASC, p.apellido ASC',
      fecha: 'c.fecha_registro DESC',
      correo: 'p.correo ASC',
      default: 'c.id_cliente ASC'
    };

    const orden = ordenesPermitidas[tipoFiltro] || ordenesPermitidas.default;

    const queryDatos = `
      SELECT c.id_cliente, p.nombre, p.apellido, p.correo, c.fecha_registro, c.fecha_nac, c.carnet_identidad, c.ci_complemento
      FROM cliente c
      JOIN usuario p ON c.id_cliente = p.id_persona
      ORDER BY ${orden}
      LIMIT $1 OFFSET $2
    `;
    const queryTotal = `SELECT COUNT(*) FROM cliente`;

    const [resultDatos, resultTotal] = await Promise.all([
      pool.query(queryDatos, [limite, offset]),
      pool.query(queryTotal)
    ]);

    return {
      clientes: resultDatos.rows,
      total: parseInt(resultTotal.rows[0].count)
    };
  } catch (error) {
    throw new Error(`Error al obtener clientes filtrados: ${error.message}`);
  }
};

/**
 * Buscar clientes por texto en múltiples campos
 */
const buscarClientes = async (texto, limite = 10, offset = 0) => {
  try {
    const queryDatos = `
      SELECT c.id_cliente, p.nombre, p.apellido, p.correo, c.fecha_registro, c.fecha_nac, c.carnet_identidad, c.ci_complemento
      FROM cliente c
      JOIN usuario p ON c.id_cliente = p.id_persona
      WHERE 
        p.nombre ILIKE $1 OR 
        p.apellido ILIKE $1 OR 
        p.correo ILIKE $1 OR 
        c.carnet_identidad ILIKE $1
      ORDER BY p.nombre, p.apellido
      LIMIT $2 OFFSET $3
    `;

    const queryTotal = `
      SELECT COUNT(*) 
      FROM cliente c
      JOIN usuario p ON c.id_cliente = p.id_persona
      WHERE 
        p.nombre ILIKE $1 OR 
        p.apellido ILIKE $1 OR 
        p.correo ILIKE $1 OR 
        c.carnet_identidad ILIKE $1
    `;
    
    const sanitizeInput = (input) => input.replace(/[%_\\]/g, '\\$&');
    const terminoBusqueda = `%${sanitizeInput(texto)}%`;
    
    const [resultDatos, resultTotal] = await Promise.all([
      pool.query(queryDatos, [terminoBusqueda, limite, offset]),
      pool.query(queryTotal, [terminoBusqueda])
    ]);

    return {
      clientes: resultDatos.rows,
      total: parseInt(resultTotal.rows[0].count)
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Obtener cliente por ID
 */
const obtenerClientePorId = async (id) => {
  try {
    const query = `
      SELECT c.id_cliente, p.nombre, p.apellido, p.correo, p.usuario, c.fecha_registro, c.fecha_nac, c.carnet_identidad, c.ci_complemento
      FROM cliente c
      JOIN usuario p ON c.id_cliente = p.id_persona
      WHERE c.id_cliente = $1
    `;
    const result = await pool.query(query, [id]);
    return result.rows[0] || null;
  } catch (error) {
    throw error;
  }
};

/**
 * Crear nuevo cliente
 */
const crearCliente = async (datosCliente) => {
  try {
    // --- AGREGAR ESTO ---
    // 1. Eliminar la contraseña del body si viene
    delete datosCliente.contrasena;
    
    // 2. Encriptar contraseña fija "123456" como en registro.js
    const contrasenaHash = await bcrypt.hash('123456', 10);

    // Generar latitud y longitud aleatorias en rango de La Paz, Bolivia
    const minLat = -16.55;
    const maxLat = -16.45;
    const minLong = -68.20;
    const maxLong = -68.10;
    const latitud = parseFloat((Math.random() * (maxLat - minLat) + minLat).toFixed(6));
    const longitud = parseFloat((Math.random() * (maxLong - minLong) + minLong).toFixed(6));

    // Validar carnet_identidad
    if (datosCliente.carnet_identidad && !/^\d{1,10}$/.test(datosCliente.carnet_identidad)) {
      throw new Error('El carnet de identidad debe ser numérico y no exceder los 10 caracteres');
    }

    // Validar ci_complemento
    if (datosCliente.ci_complemento && !/^[A-Za-z0-9]{1,3}$/.test(datosCliente.ci_complemento)) {
      throw new Error('El complemento del carnet debe tener hasta 3 caracteres alfanuméricos');
    }

    // Validar fecha_nac
    if (datosCliente.fecha_nac) {
      const fechaNac = new Date(datosCliente.fecha_nac);
      if (isNaN(fechaNac.getTime()) || fechaNac > new Date()) {
        throw new Error('La fecha de nacimiento no es válida o está en el futuro');
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
      datosCliente.nombre || null,
      datosCliente.apellido || null,
      contrasenaHash, // ← Usar la contraseña encriptada fija
      datosCliente.telefono || null,
      datosCliente.correo,
      datosCliente.sexo || null,
      datosCliente.imagen_perfil || null,
      datosCliente.usuario,
      latitud,
      longitud
    ];
    const resultUsuario = await pool.query(queryUsuario, valuesUsuario);
    const idCliente = resultUsuario.rows[0].id_persona;

    // Insertar en CLIENTE
    const queryCliente = `
      INSERT INTO cliente (
        id_cliente, fecha_registro, fecha_nac, carnet_identidad, ci_complemento
      ) 
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;
    const valuesCliente = [
      idCliente,
      datosCliente.fecha_registro || new Date().toISOString().split('T')[0],
      datosCliente.fecha_nac || null,
      datosCliente.carnet_identidad || null,
      datosCliente.ci_complemento || null
    ];
    const resultCliente = await pool.query(queryCliente, valuesCliente);

    // Obtener datos completos para retornar
    const clienteCompleto = await obtenerClientePorId(idCliente);
    return clienteCompleto;
  } catch (error) {
    console.error('Error al crear cliente:', error.message);
    throw new Error(error.message);
  }
};

/**
 * Actualizar cliente parcialmente
 */
const actualizarCliente = async (id, camposActualizar) => {
  try {
    
    if (camposActualizar.contrasena) {
      delete camposActualizar.contrasena;
    }

    // Separar campos por tabla
    const camposUser = {};
    const camposCliente = {};

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

    if (Object.keys(camposUser).length === 0 && Object.keys(camposCliente).length === 0) {
      throw new Error('No hay campos válidos para actualizar');
    }

    // Validar carnet_identidad si se proporciona
    if (camposCliente.carnet_identidad && !/^\d{1,10}$/.test(camposCliente.carnet_identidad)) {
      throw new Error('El carnet de identidad debe ser numérico y no exceder los 10 caracteres');
    }

    // Validar ci_complemento si se proporciona
    if (camposCliente.ci_complemento && !/^[A-Za-z0-9]{1,3}$/.test(camposCliente.ci_complemento)) {
      throw new Error('El complemento del carnet debe tener hasta 3 caracteres alfanuméricos');
    }

    // Validar fecha_nac si se proporciona
    if (camposCliente.fecha_nac) {
      const fechaNac = new Date(camposCliente.fecha_nac);
      if (isNaN(fechaNac.getTime()) || fechaNac > new Date()) {
        throw new Error('La fecha de nacimiento no es válida o está en el futuro');
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
    let clienteUpdated = null;
    if (Object.keys(camposCliente).length > 0) {
      const setClauseCliente = Object.keys(camposCliente).map((campo, index) => `${campo} = $${index + 2}`).join(', ');
      const valuesCliente = [id, ...Object.values(camposCliente)];
      const queryCliente = `
        UPDATE cliente 
        SET ${setClauseCliente}
        WHERE id_cliente = $1
        RETURNING *
      `;
      const resultCliente = await pool.query(queryCliente, valuesCliente);
      clienteUpdated = resultCliente.rows[0] || null;
    }

    // Retornar datos completos actualizados
    const clienteCompleto = await obtenerClientePorId(id);
    return clienteCompleto;
  } catch (error) {
    throw error;
  }
};

/**
 * Eliminar cliente
 */
const eliminarCliente = async (id) => {
  try {
    const query = 'DELETE FROM cliente WHERE id_cliente = $1 RETURNING id_cliente';
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

    const { clientes, total } = await obtenerDatosEspecificos(limite, offset);
    
    res.json(respuesta(true, 'Clientes obtenidos correctamente', {
      clientes,
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
const obtenerClientesFiltradosController = async (req, res) => {
  try {
    const { tipo } = req.query;
    const limite = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;

    const tiposValidos = ['nombre', 'fecha', 'correo'];
    if (!tipo || !tiposValidos.includes(tipo)) {
      return res.status(400).json(respuesta(false, 'El parámetro "tipo" es inválido o no proporcionado'));
    }

    const { clientes, total } = await obtenerClientesFiltrados(tipo, limite, offset);

    res.json(respuesta(true, `Clientes filtrados por ${tipo} obtenidos correctamente`, {
      clientes,
      filtro: tipo,
      paginacion: { limite, offset, total }
    }));
  } catch (error) {
    console.error('Error en obtenerClientesFiltrados:', error.message);
    res.status(500).json(respuesta(false, error.message));
  }
};

/**
 * Controlador para GET /buscar
 */
const buscarClientesController = async (req, res) => {
  try {
    const { q } = req.query;
    const limite = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;

    if (!q) {
      return res.status(400).json(respuesta(false, 'El parámetro de búsqueda "q" es requerido'));
    }

    const { clientes, total } = await buscarClientes(q, limite, offset);
    
    res.json(respuesta(true, 'Clientes obtenidos correctamente', {
      clientes,
      paginacion: { limite, offset, total }
    }));
  } catch (error) {
    console.error('Error en buscarClientes:', error.message);
    res.status(500).json(respuesta(false, error.message));
  }
};

/**
 * Controlador para GET /dato-individual/:id
 */
const obtenerClientePorIdController = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || isNaN(id)) {
      return res.status(400).json(respuesta(false, 'ID de cliente no válido'));
    }

    const cliente = await obtenerClientePorId(parseInt(id));

    if (!cliente) {
      return res.status(404).json(respuesta(false, 'Cliente no encontrado'));
    }

    res.json(respuesta(true, 'Cliente obtenido correctamente', { cliente }));
  } catch (error) {
    console.error('Error en obtenerClientePorId:', error.message);
    res.status(500).json(respuesta(false, error.message));
  }
};

/**
 * Controlador para POST - Crear cliente
 */
const crearClienteController = async (req, res) => {
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

    const nuevoCliente = await crearCliente(datos);

    res.status(201).json(respuesta(true, 'Cliente creado correctamente', { cliente: nuevoCliente }));
  } catch (error) {
    console.error('Error en crearCliente:', error.message);
    
    if (error.code === '23505') { // Violación de unique constraint
      return res.status(400).json(respuesta(false, 'El correo o usuario ya existe'));
    }
    
    res.status(500).json(respuesta(false, error.message));
  }
};

/**
 * Controlador para PATCH - Actualizar cliente
 */
const actualizarClienteController = async (req, res) => {
  try {
    const { id } = req.params;
    const camposActualizar = req.body;

    if (!id || isNaN(id)) {
      return res.status(400).json(respuesta(false, 'ID de cliente no válido'));
    }

    if (Object.keys(camposActualizar).length === 0) {
      return res.status(400).json(respuesta(false, 'No se proporcionaron campos para actualizar'));
    }

    const clienteActualizado = await actualizarCliente(parseInt(id), camposActualizar);

    if (!clienteActualizado) {
      return res.status(404).json(respuesta(false, 'Cliente no encontrado'));
    }

    res.json(respuesta(true, 'Cliente actualizado correctamente', { cliente: clienteActualizado }));
  } catch (error) {
    console.error('Error en actualizarCliente:', error.message);
    res.status(500).json(respuesta(false, error.message));
  }
};

/**
 * Controlador para DELETE - Eliminar cliente
 */
const eliminarClienteController = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || isNaN(id)) {
      return res.status(400).json(respuesta(false, 'ID de cliente no válido'));
    }

    const clienteEliminado = await eliminarCliente(parseInt(id));

    if (!clienteEliminado) {
      return res.status(404).json(respuesta(false, 'Cliente no encontrado'));
    }

    res.json(respuesta(true, 'Cliente eliminado correctamente'));
  } catch (error) {
    console.error('Error en eliminarCliente:', error.message);
    res.status(500).json(respuesta(false, error.message));
  }
};

// RUTAS

// GET endpoints
router.get('/datos-especificos', obtenerDatosEspecificosController);
router.get('/filtro', obtenerClientesFiltradosController);
router.get('/buscar', buscarClientesController);
router.get('/dato-individual/:id', obtenerClientePorIdController);

// POST, PATCH, DELETE endpoints
router.post('/', crearClienteController);
router.patch('/:id', actualizarClienteController);
router.delete('/:id', eliminarClienteController);

module.exports = router;