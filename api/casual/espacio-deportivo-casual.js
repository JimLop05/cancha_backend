const express = require('express');
const pool = require('../../config/database');

const path = require("path");
const fs = require("fs").promises;

const router = express.Router();

// Función de respuesta estandarizada
const respuesta = (exito, mensaje, datos = null) => ({
  exito,
  mensaje,
  datos,
});

// MODELOS - Funciones puras para operaciones de base de datos

/**
 * Obtener datos específicos de espacios deportivos ordenados por proximidad al cliente
 */
const obtenerDatosEspecificosCliente = async (id_cliente, limite = 12, offset = 0) => {
  try {
    // Primero obtener las coordenadas del cliente
    const queryCliente = `
      SELECT latitud, longitud 
      FROM usuario 
      WHERE id_persona = $1
    `;
    
    const resultCliente = await pool.query(queryCliente, [id_cliente]);
    
    if (resultCliente.rows.length === 0) {
      throw new Error('Cliente no encontrado');
    }
    
    const cliente = resultCliente.rows[0];
    
    // Si el cliente no tiene coordenadas, usar orden por defecto
    if (!cliente.latitud || !cliente.longitud) {
      const { espacios, total } = await obtenerDatosEspecificos(limite, offset);
      return { espacios, total, ordenado_por: 'default' };
    }

    const queryDatos = `
      WITH promedio_resenas AS (
        SELECT 
          e.id_espacio,
          COALESCE(AVG(r.estrellas)::numeric(3,2), 0) AS promedio_estrellas
        FROM ESPACIO_DEPORTIVO e
        LEFT JOIN CANCHA c ON e.id_espacio = c.id_espacio
        LEFT JOIN RESERVA res ON c.id_cancha = res.id_cancha
        LEFT JOIN RESENA r ON res.id_reserva = r.id_reserva
        GROUP BY e.id_espacio
      )
      SELECT 
        e.id_espacio, 
        e.nombre, 
        e.direccion, 
        e.latitud, 
        e.longitud, 
        e.horario_apertura, 
        e.horario_cierre, 
        e.imagen_principal AS imagen_principal,
        a.id_admin_esp_dep, 
        COALESCE(p.nombre, 'No asignado') AS admin_nombre, 
        COALESCE(p.apellido, '') AS admin_apellido,
        pr.promedio_estrellas,
        -- Cálculo de distancia usando la fórmula Haversine (en kilómetros)
        (6371 * acos(
          cos(radians($1)) * cos(radians(e.latitud)) * 
          cos(radians(e.longitud) - radians($2)) + 
          sin(radians($1)) * sin(radians(e.latitud))
        )) AS distancia_km
      FROM ESPACIO_DEPORTIVO e
      LEFT JOIN ADMIN_ESP_DEP a ON e.id_admin_esp_dep = a.id_admin_esp_dep
      LEFT JOIN USUARIO p ON a.id_admin_esp_dep = p.id_persona
      LEFT JOIN promedio_resenas pr ON e.id_espacio = pr.id_espacio
      WHERE e.latitud IS NOT NULL AND e.longitud IS NOT NULL
      ORDER BY distancia_km ASC
      LIMIT $3 OFFSET $4
    `;
    
    const queryTotal = `SELECT COUNT(*) FROM ESPACIO_DEPORTIVO WHERE latitud IS NOT NULL AND longitud IS NOT NULL`;

    const [resultDatos, resultTotal] = await Promise.all([
      pool.query(queryDatos, [cliente.latitud, cliente.longitud, limite, offset]),
      pool.query(queryTotal)
    ]);

    return {
      espacios: resultDatos.rows,
      total: parseInt(resultTotal.rows[0].count),
      ordenado_por: 'proximidad',
      coordenadas_cliente: {
        latitud: cliente.latitud,
        longitud: cliente.longitud
      }
    };
  } catch (error) {
    throw error;
  }
};





/**
 * Obtener datos específicos de espacios deportivos con información del administrador
 */
const obtenerDatosEspecificos = async (limite = 12, offset = 0) => {
  try {
    const queryDatos = `
      WITH promedio_resenas AS (
        SELECT 
          e.id_espacio,
          COALESCE(AVG(r.estrellas)::numeric(3,2), 0) AS promedio_estrellas
        FROM ESPACIO_DEPORTIVO e
        LEFT JOIN CANCHA c ON e.id_espacio = c.id_espacio
        LEFT JOIN RESERVA res ON c.id_cancha = res.id_cancha
        LEFT JOIN RESENA r ON res.id_reserva = r.id_reserva
        GROUP BY e.id_espacio
      )
      SELECT 
        e.id_espacio, 
        e.nombre, 
        e.direccion, 
        e.latitud, 
        e.longitud, 
        e.horario_apertura, 
        e.horario_cierre, 
        e.imagen_principal AS imagen_principal,
        a.id_admin_esp_dep, 
        COALESCE(p.nombre, 'No asignado') AS admin_nombre, 
        COALESCE(p.apellido, '') AS admin_apellido,
        pr.promedio_estrellas
      FROM ESPACIO_DEPORTIVO e
      LEFT JOIN ADMIN_ESP_DEP a ON e.id_admin_esp_dep = a.id_admin_esp_dep  -- ← LEFT JOIN
      LEFT JOIN USUARIO p ON a.id_admin_esp_dep = p.id_persona
      LEFT JOIN promedio_resenas pr ON e.id_espacio = pr.id_espacio
      ORDER BY pr.promedio_estrellas DESC, e.id_espacio
      LIMIT $1 OFFSET $2
    `;
    
    const queryTotal = `SELECT COUNT(*) FROM ESPACIO_DEPORTIVO`; // ← Simple COUNT

    const [resultDatos, resultTotal] = await Promise.all([
      pool.query(queryDatos, [limite, offset]),
      pool.query(queryTotal)
    ]);

    return {
      espacios: resultDatos.rows,
      total: parseInt(resultTotal.rows[0].count)
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Obtener espacios deportivos con filtros de ordenamiento
 */
const obtenerEspaciosFiltrados = async (tipoFiltro, limite = 12, offset = 0) => {
  try {
    const mapeoOrden = {
      nombre: 'e.nombre ASC',
      direccion: 'e.direccion ASC',
      latitud: 'e.latitud ASC',
      default: 'e.id_espacio ASC'
    };

    const orden = mapeoOrden[tipoFiltro] || mapeoOrden.default;

    const queryDatos = `
      SELECT e.id_espacio, e.nombre, e.direccion, e.horario_apertura, e.horario_cierre, e.imagen_principal
      FROM espacio_deportivo e
      ORDER BY ${orden}
      LIMIT $1 OFFSET $2
    `;

    const queryTotal = `SELECT COUNT(*) FROM espacio_deportivo`;

    // Ejecutar ambas consultas en paralelo
    const [resultDatos, resultTotal] = await Promise.all([
      pool.query(queryDatos, [limite, offset]),
      pool.query(queryTotal)
    ]);

    // Retornar en el formato esperado por el controlador
    return {
      espacios: resultDatos.rows,
      total: parseInt(resultTotal.rows[0].count)
    };
  } catch (error) {
    console.error('Error in obtenerEspaciosFiltrados:', error);
    throw new Error(`Error al obtener espacios filtrados: ${error.message}`);
  }
};


/**
 * Buscar espacios deportivos por texto en múltiples campos
 */
const buscarEspacios = async (texto, limite = 12, offset = 0) => {
  try {
    const queryDatos = `
      SELECT e.id_espacio, e.nombre, e.direccion, e.horario_apertura, e.horario_cierre, e.imagen_principal
      FROM espacio_deportivo e
      WHERE 
        e.nombre ILIKE $1 OR 
        e.direccion ILIKE $1 OR 
        e.descripcion ILIKE $1
      ORDER BY e.nombre
      LIMIT $2 OFFSET $3
    `;

    const queryTotal = `
      SELECT COUNT(*) 
      FROM espacio_deportivo e
      WHERE 
        e.nombre ILIKE $1 OR 
        e.direccion ILIKE $1 OR 
        e.descripcion ILIKE $1
    `;
    
    // ✅ CORRECTO: Escapar caracteres especiales para LIKE
    const sanitizeInput = (input) => input.replace(/[%_]/g, '\\$&');
    const terminoBusqueda = `%${sanitizeInput(texto)}%`;
    
    const [resultDatos, resultTotal] = await Promise.all([
      pool.query(queryDatos, [terminoBusqueda, limite, offset]),
      pool.query(queryTotal, [terminoBusqueda])
    ]);

    return {
      espacios: resultDatos.rows,
      total: parseInt(resultTotal.rows[0].count)
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Obtener espacio deportivo por ID
 */
const obtenerEspacioPorId = async (id) => {
  try {
    const query = `
      SELECT 
        e.*,
        a.id_admin_esp_dep,
        COALESCE(p.nombre, 'No asignado') AS admin_nombre,
        COALESCE(p.apellido, '') AS admin_apellido,
        p.correo AS admin_correo
      FROM espacio_deportivo e
      LEFT JOIN admin_esp_dep a ON e.id_admin_esp_dep = a.id_admin_esp_dep
      LEFT JOIN usuario p ON a.id_admin_esp_dep = p.id_persona
      WHERE e.id_espacio = $1
    `;
    const result = await pool.query(query, [id]);

    if (!result.rows[0]) {
      throw new Error('Espacio no encontrado');
    }

    return result.rows[0];
  } catch (error) {
    console.error('Error en obtenerEspacioPorId:', error);
    throw error; // Dejar que el controlador maneje el error
  }
};

// CONTROLADORES - Manejan las request y response

/**
 * Controlador para GET /datos-especificos
 */
const obtenerDatosEspecificosController = async (req, res) => {
  try {
    const limite = parseInt(req.query.limit) || 12;
    const offset = parseInt(req.query.offset) || 0;

    const { espacios, total } = await obtenerDatosEspecificos(limite, offset);
    
    res.json(respuesta(true, 'Espacios deportivos obtenidos correctamente', {
      espacios,
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
const obtenerEspaciosFiltradosController = async (req, res) => {
  try {
    const { tipo } = req.query;
    const limite = parseInt(req.query.limit) || 12;
    const offset = parseInt(req.query.offset) || 0;

    const tiposValidos = ['nombre', 'direccion', 'latitud'];
    if (!tipo || !tiposValidos.includes(tipo)) {
      return res.status(400).json(respuesta(false, 'El parámetro "tipo" es inválido o no proporcionado'));
    }

    const { espacios, total } = await obtenerEspaciosFiltrados(tipo, limite, offset);

    res.json(respuesta(true, `Espacios deportivos filtrados por ${tipo} obtenidos correctamente`, {
      espacios,
      filtro: tipo,
      paginacion: { limite, offset, total }
    }));
  } catch (error) {
    console.error('Error in obtenerEspaciosFiltradosController:', error);
    res.status(500).json(respuesta(false, error.message));
  }
};

/**
 * Controlador para GET /buscar
 */
const buscarEspaciosController = async (req, res) => {
  try {
    const { q } = req.query;
    const limite = parseInt(req.query.limit) || 12;
    const offset = parseInt(req.query.offset) || 0;

    if (!q) {
      return res.status(400).json(respuesta(false, 'El parámetro de búsqueda "q" es requerido'));
    }

    const { espacios, total } = await buscarEspacios(q, limite, offset);
    
    res.json(respuesta(true, 'Espacios deportivos obtenidos correctamente', {
      espacios,
      paginacion: { limite, offset, total }
    }));
  } catch (error) {
    console.error('Error en buscarEspacios:', error.message);
    res.status(500).json(respuesta(false, error.message));
  }
};

/**
 * Controlador para GET /dato-individual/:id
 */
const obtenerEspacioPorIdController = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || isNaN(id)) {
      return res.status(400).json(respuesta(false, 'ID de espacio deportivo no válido'));
    }

    const espacio = await obtenerEspacioPorId(parseInt(id));

    if (!espacio) {
      return res.status(404).json(respuesta(false, 'Espacio deportivo no encontrado'));
    }

    res.json(respuesta(true, 'Espacio deportivo obtenido correctamente', { espacio }));
  } catch (error) {
    console.error('Error en obtenerEspacioPorId:', error.message);
    res.status(500).json(respuesta(false, error.message));
  }
};

/**
 * Controlador para GET /datos-especificos-cliente/:id_cliente
 */
const obtenerDatosEspecificosClienteController = async (req, res) => {
  try {
    const { id_cliente } = req.params;
    const limite = parseInt(req.query.limit) || 12;
    const offset = parseInt(req.query.offset) || 0;

    if (!id_cliente || isNaN(id_cliente)) {
      return res.status(400).json(respuesta(false, 'ID de cliente no válido'));
    }

    const { espacios, total, ordenado_por, coordenadas_cliente } = await obtenerDatosEspecificosCliente(
      parseInt(id_cliente), 
      limite, 
      offset
    );
    
    const datosRespuesta = {
      espacios,
      paginacion: { limite, offset, total },
      ordenado_por
    };

    // Solo incluir coordenadas del cliente si están disponibles
    if (coordenadas_cliente) {
      datosRespuesta.coordenadas_cliente = coordenadas_cliente;
    }

    res.json(respuesta(true, 'Espacios deportivos obtenidos correctamente', datosRespuesta));
  } catch (error) {
    console.error('Error en obtenerDatosEspecificosCliente:', error.message);
    
    if (error.message === 'Cliente no encontrado') {
      return res.status(404).json(respuesta(false, error.message));
    }
    
    res.status(500).json(respuesta(false, error.message));
  }
};


// GET endpoints
router.get('/datos-especificos', obtenerDatosEspecificosController);
router.get('/filtro', obtenerEspaciosFiltradosController);
router.get('/buscar', buscarEspaciosController);
router.get('/dato-individual/:id', obtenerEspacioPorIdController);

router.get('/datos-especificos-cliente/:id_cliente', obtenerDatosEspecificosClienteController);

module.exports = router;