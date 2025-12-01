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
 * Obtener todas las reseñas de una cancha específica con promedio
 */
const obtenerResenasPorCancha = async (id_cancha, limite = 10, offset = 0) => {
  try {
    // Consulta para obtener las reseñas con información del usuario invitado
    const queryDatos = `
      SELECT
        re.id_reserva,
        re.id_invitado,
        re.estrellas,
        re.comentario,
        re.fecha_creacion,
        u.usuario AS invitado_usuario
      FROM resena re
      JOIN reserva r ON re.id_reserva = r.id_reserva
      JOIN invitado i ON re.id_invitado = i.id_invitado
      JOIN usuario u ON i.id_invitado = u.id_persona
      JOIN cancha ca ON r.id_cancha = ca.id_cancha
      JOIN espacio_deportivo esp ON ca.id_espacio = esp.id_espacio
      LEFT JOIN adquiere_qr aq ON aq.id_reserva = re.id_reserva AND aq.id_invitado = re.id_invitado
      LEFT JOIN anfitrion an ON r.id_anfitrion = an.id_anfitrion
      LEFT JOIN cliente cl_anf ON an.id_anfitrion = cl_anf.id_cliente
      LEFT JOIN usuario anf ON cl_anf.id_cliente = anf.id_persona
      WHERE ca.id_cancha = $1
      ORDER BY re.fecha_creacion DESC
      LIMIT $2 OFFSET $3
    `;

    // Consulta para el total de reseñas
    const queryTotal = `
      SELECT COUNT(*)
      FROM resena re
      JOIN reserva r ON re.id_reserva = r.id_reserva
      JOIN cancha ca ON r.id_cancha = ca.id_cancha
      WHERE ca.id_cancha = $1
    `;

    // Consulta para el promedio de calificaciones
    const queryPromedio = `
      SELECT 
        ROUND(AVG(re.estrellas)::numeric, 1) AS promedio_estrellas,
        COUNT(re.estrellas) AS total_calificaciones,
        COUNT(CASE WHEN re.estrellas = 5 THEN 1 END) AS cinco_estrellas,
        COUNT(CASE WHEN re.estrellas = 4 THEN 1 END) AS cuatro_estrellas,
        COUNT(CASE WHEN re.estrellas = 3 THEN 1 END) AS tres_estrellas,
        COUNT(CASE WHEN re.estrellas = 2 THEN 1 END) AS dos_estrellas,
        COUNT(CASE WHEN re.estrellas = 1 THEN 1 END) AS una_estrella
      FROM resena re
      JOIN reserva r ON re.id_reserva = r.id_reserva
      JOIN cancha ca ON r.id_cancha = ca.id_cancha
      WHERE ca.id_cancha = $1
    `;

    // Ejecutar todas las consultas en paralelo
    const [resultDatos, resultTotal, resultPromedio] = await Promise.all([
      pool.query(queryDatos, [id_cancha, limite, offset]),
      pool.query(queryTotal, [id_cancha]),
      pool.query(queryPromedio, [id_cancha])
    ]);

    // Procesar el promedio
    const promedioData = resultPromedio.rows[0];
    const promedio = {
      promedio_estrellas: parseFloat(promedioData.promedio_estrellas) || 0,
      total_calificaciones: parseInt(promedioData.total_calificaciones) || 0,
      distribucion_estrellas: {
        5: parseInt(promedioData.cinco_estrellas) || 0,
        4: parseInt(promedioData.cuatro_estrellas) || 0,
        3: parseInt(promedioData.tres_estrellas) || 0,
        2: parseInt(promedioData.dos_estrellas) || 0,
        1: parseInt(promedioData.una_estrella) || 0
      }
    };

    // Calcular porcentajes para cada categoría de estrellas
    if (promedio.total_calificaciones > 0) {
      promedio.distribucion_porcentaje = {
        5: Math.round((promedio.distribucion_estrellas[5] / promedio.total_calificaciones) * 100),
        4: Math.round((promedio.distribucion_estrellas[4] / promedio.total_calificaciones) * 100),
        3: Math.round((promedio.distribucion_estrellas[3] / promedio.total_calificaciones) * 100),
        2: Math.round((promedio.distribucion_estrellas[2] / promedio.total_calificaciones) * 100),
        1: Math.round((promedio.distribucion_estrellas[1] / promedio.total_calificaciones) * 100)
      };
    }

    return {
      resenas: resultDatos.rows,
      total: parseInt(resultTotal.rows[0].count),
      promedio: promedio
    };
  } catch (error) {
    console.error('Error en obtenerResenasPorCancha:', error);
    throw error;
  }
};

/**
 * Obtener datos específicos de reseñas
 */
const obtenerDatosEspecificos = async (limite = 10, offset = 0) => {
  try {
    const queryDatos = `
      SELECT
        re.id_reserva, re.id_invitado, re.estrellas, re.comentario, re.fecha_creacion,
        re.estado, re.verificado_control,
        u.nombre AS invitado_nombre, u.apellido AS invitado_apellido,
        ca.nombre AS cancha_nombre,
        esp.nombre AS espacio_nombre
      FROM resena re
      JOIN reserva r ON re.id_reserva = r.id_reserva
      JOIN invitado i ON re.id_invitado = i.id_invitado
      JOIN usuario u ON i.id_invitado = u.id_persona
      JOIN cancha ca ON r.id_cancha = ca.id_cancha
      JOIN espacio_deportivo esp ON ca.id_espacio = esp.id_espacio
      ORDER BY re.fecha_creacion DESC
      LIMIT $1 OFFSET $2
    `;
    
    const queryTotal = `SELECT COUNT(*) FROM resena`;
    
    const [resultDatos, resultTotal] = await Promise.all([
      pool.query(queryDatos, [limite, offset]),
      pool.query(queryTotal)
    ]);
    
    return {
      resenas: resultDatos.rows,
      total: parseInt(resultTotal.rows[0].count)
    };
  } catch (error) {
    console.error('Error en obtenerDatosEspecificos:', error);
    throw error;
  }
};

/**
 * Obtener reseñas con filtros
 */
const obtenerResenasFiltradas = async (tipoFiltro, limite = 10, offset = 0) => {
  try {
    let whereClause = '';
    let orderClause = 're.fecha_creacion DESC';

    switch (tipoFiltro) {
      case 'verificado_si':
        whereClause = 'WHERE re.verificado_control = true';
        break;
      case 'verificado_no':
        whereClause = 'WHERE re.verificado_control = false';
        break;
      case 'invitado_nombre':
        orderClause = 'u.nombre ASC, u.apellido ASC';
        break;
      case 'cancha_nombre':
        orderClause = 'ca.nombre ASC';
        break;
      case 'estrellas_alta':
        orderClause = 're.estrellas DESC';
        break;
      case 'estrellas_baja':
        orderClause = 're.estrellas ASC';
        break;
      default:
        orderClause = 're.fecha_creacion DESC';
    }

    const queryDatos = `
      SELECT
        re.id_reserva, re.id_invitado, re.estrellas, re.comentario, re.fecha_creacion,
        re.estado, re.verificado_control,
        u.nombre AS invitado_nombre, u.apellido AS invitado_apellido,
        ca.nombre AS cancha_nombre,
        esp.nombre AS espacio_nombre
      FROM resena re
      JOIN reserva r ON re.id_reserva = r.id_reserva
      JOIN invitado i ON re.id_invitado = i.id_invitado
      JOIN usuario u ON i.id_invitado = u.id_persona
      JOIN cancha ca ON r.id_cancha = ca.id_cancha
      JOIN espacio_deportivo esp ON ca.id_espacio = esp.id_espacio
      ${whereClause}
      ORDER BY ${orderClause}
      LIMIT $1 OFFSET $2
    `;

    const queryTotal = `
      SELECT COUNT(*) FROM resena re
      JOIN reserva r ON re.id_reserva = r.id_reserva
      JOIN invitado i ON re.id_invitado = i.id_invitado
      JOIN usuario u ON i.id_invitado = u.id_persona
      JOIN cancha ca ON r.id_cancha = ca.id_cancha
      JOIN espacio_deportivo esp ON ca.id_espacio = esp.id_espacio
      ${whereClause}
    `;

    const [resultDatos, resultTotal] = await Promise.all([
      pool.query(queryDatos, [limite, offset]),
      pool.query(queryTotal)
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
 * Buscar reseñas por texto
 */
const buscarResenas = async (texto, limite = 10, offset = 0) => {
  try {
    const queryDatos = `
      SELECT
        re.id_reserva, re.id_invitado, re.estrellas, re.comentario, re.fecha_creacion,
        re.estado, re.verificado_control,
        u.nombre AS invitado_nombre, u.apellido AS invitado_apellido,
        ca.nombre AS cancha_nombre,
        esp.nombre AS espacio_nombre
      FROM resena re
      JOIN reserva r ON re.id_reserva = r.id_reserva
      JOIN invitado i ON re.id_invitado = i.id_invitado
      JOIN usuario u ON i.id_invitado = u.id_persona
      JOIN cancha ca ON r.id_cancha = ca.id_cancha
      JOIN espacio_deportivo esp ON ca.id_espacio = esp.id_espacio
      WHERE
        u.nombre ILIKE $1 OR
        u.apellido ILIKE $1 OR
        ca.nombre ILIKE $1 OR
        esp.nombre ILIKE $1 OR
        re.comentario ILIKE $1
      ORDER BY re.fecha_creacion DESC
      LIMIT $2 OFFSET $3
    `;

    const queryTotal = `
      SELECT COUNT(*)
      FROM resena re
      JOIN reserva r ON re.id_reserva = r.id_reserva
      JOIN invitado i ON re.id_invitado = i.id_invitado
      JOIN usuario u ON i.id_invitado = u.id_persona
      JOIN cancha ca ON r.id_cancha = ca.id_cancha
      JOIN espacio_deportivo esp ON ca.id_espacio = esp.id_espacio
      WHERE
        u.nombre ILIKE $1 OR
        u.apellido ILIKE $1 OR
        ca.nombre ILIKE $1 OR
        esp.nombre ILIKE $1 OR
        re.comentario ILIKE $1
    `;

    const sanitizeInput = (input) => input.replace(/[%_\\]/g, '\\$&');
    const terminoBusqueda = `%${sanitizeInput(texto)}%`;

    const [resultDatos, resultTotal] = await Promise.all([
      pool.query(queryDatos, [terminoBusqueda, limite, offset]),
      pool.query(queryTotal, [terminoBusqueda])
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
 * Obtener reseña por clave compuesta
 */
const obtenerResenaPorId = async (id_reserva, id_invitado) => {
  try {
    const query = `
      SELECT
        re.*,
        u.nombre AS invitado_nombre, u.apellido AS invitado_apellido, u.correo AS invitado_correo,
        ca.nombre AS cancha_nombre,
        esp.nombre AS espacio_nombre,
        aq.estado_asistencia
      FROM resena re
      JOIN reserva r ON re.id_reserva = r.id_reserva
      JOIN invitado i ON re.id_invitado = i.id_invitado
      JOIN usuario u ON i.id_invitado = u.id_persona
      JOIN cancha ca ON r.id_cancha = ca.id_cancha
      JOIN espacio_deportivo esp ON ca.id_espacio = esp.id_espacio
      LEFT JOIN adquiere_qr aq ON aq.id_reserva = re.id_reserva AND aq.id_invitado = re.id_invitado
      WHERE re.id_reserva = $1 AND re.id_invitado = $2
    `;
    const result = await pool.query(query, [id_reserva, id_invitado]);
    return result.rows[0] || null;
  } catch (error) {
    throw error;
  }
};

/**
 * Crear nueva reseña
 */
const crearResena = async (datos) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { id_reserva, id_invitado, estrellas, comentario, estado, verificado_control } = datos;

    if (!id_reserva || !id_invitado) {
      throw new Error('id_reserva e id_invitado son obligatorios');
    }
    if (!estrellas || estrellas < 1 || estrellas > 5) {
      throw new Error('estrellas debe estar entre 1 y 5');
    }

    // Validar reserva
    const reservaRes = await client.query('SELECT 1 FROM reserva WHERE id_reserva = $1', [id_reserva]);
    if (!reservaRes.rows[0]) throw new Error('Reserva no encontrada');

    // Validar invitado
    const invitadoRes = await client.query('SELECT 1 FROM invitado WHERE id_invitado = $1', [id_invitado]);
    if (!invitadoRes.rows[0]) throw new Error('Invitado no encontrado');

    // Validar que el invitado asistió a la reserva
        // AND estado_asistencia = 'asistio'`
    const asistenciaRes = await client.query(
      `SELECT 1 FROM adquiere_qr 
       WHERE id_reserva = $1 AND id_invitado = $2`,
      [id_reserva, id_invitado]
    );

    if (!asistenciaRes.rows[0]) {
      throw new Error('El invitado no asistió a esta reserva o no está confirmado');
    }

    const query = `
      INSERT INTO resena (
        id_reserva, id_invitado, estrellas, comentario, estado, verificado_control
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;

    const values = [
      id_reserva,
      id_invitado,
      estrellas,
      comentario || null,
      estado !== undefined ? estado : false,
      verificado_control !== undefined ? verificado_control : false
    ];

    const result = await client.query(query, values);
    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Actualizar reseña parcialmente - VERSIÓN CORREGIDA
 */
const actualizarResena = async (id_reserva, id_invitado, campos) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Validar IDs
    const idReservaNum = parseInt(id_reserva);
    const idInvitadoNum = parseInt(id_invitado);
    
    if (isNaN(idReservaNum) || isNaN(idInvitadoNum)) {
      throw new Error('IDs de reserva o invitado no válidos');
    }

    // Solo permitir actualizar estrellas y comentario
    const camposPermitidos = ['estrellas', 'comentario'];
    const camposActualizar = {};
    
    // Filtrar y validar campos
    for (const [key, value] of Object.entries(campos)) {
      if (camposPermitidos.includes(key)) {
        if (key === 'estrellas') {
          const estrellasNum = parseInt(value);
          if (isNaN(estrellasNum) || estrellasNum < 1 || estrellasNum > 5) {
            throw new Error('Las estrellas deben ser un número entre 1 y 5');
          }
          camposActualizar[key] = estrellasNum;
        } else {
          camposActualizar[key] = value;
        }
      }
    }

    if (Object.keys(camposActualizar).length === 0) {
      throw new Error('No hay campos válidos para actualizar');
    }

    // CORRECCIÓN: Construir consulta con numeración correcta
    const setParts = [];
    const values = [];
    let paramCount = 1;

    // Agregar campos a actualizar primero
    for (const [key, value] of Object.entries(camposActualizar)) {
      setParts.push(`${key} = $${paramCount}`);
      values.push(value);
      paramCount++;
    }

    // Luego agregar los IDs (paramCount continúa desde donde quedó)
    values.push(idReservaNum);
    values.push(idInvitadoNum);

    const setClause = setParts.join(', ');
    const query = `
      UPDATE resena 
      SET ${setClause}
      WHERE id_reserva = $${paramCount} 
        AND id_invitado = $${paramCount + 1}
      RETURNING *
    `;

    const result = await client.query(query, values);
    
    if (result.rows.length === 0) {
      throw new Error('No se encontró la reseña para actualizar');
    }

    await client.query('COMMIT');
    console.log('✅ Reseña actualizada exitosamente');
    return result.rows[0];

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error en actualizarResena:', error.message);
    throw error;
  } finally {
    client.release();
  }
};


/**
 * Eliminar reseña
 */
const eliminarResena = async (id_reserva, id_invitado) => {
  try {
    const query = `
      DELETE FROM resena
      WHERE id_reserva = $1 AND id_invitado = $2
      RETURNING id_reserva, id_invitado
    `;
    const result = await pool.query(query, [id_reserva, id_invitado]);
    return result.rows[0] || null;
  } catch (error) {
    throw error;
  }
};

/**
 * Obtener todas las reseñas del invitado
 */
const obtenerResenasPorInvitado = async (id_invitado, limite = 10, offset = 0) => {
  try {
    const queryDatos = `
      SELECT
        re.id_reserva, re.id_invitado, re.estrellas, re.comentario, re.fecha_creacion,
        re.estado, re.verificado_control,
        u.nombre AS invitado_nombre, u.apellido AS invitado_apellido,
        ca.nombre AS cancha_nombre,
        esp.nombre AS espacio_nombre,
        aq.estado_asistencia
      FROM resena re
      JOIN reserva r ON re.id_reserva = r.id_reserva
      JOIN invitado i ON re.id_invitado = i.id_invitado
      JOIN usuario u ON i.id_invitado = u.id_persona
      JOIN cancha ca ON r.id_cancha = ca.id_cancha
      JOIN espacio_deportivo esp ON ca.id_espacio = esp.id_espacio
      LEFT JOIN adquiere_qr aq ON aq.id_reserva = re.id_reserva AND aq.id_invitado = re.id_invitado
      WHERE re.id_invitado = $1
      ORDER BY re.fecha_creacion DESC
      LIMIT $2 OFFSET $3
    `;
    const queryTotal = `
      SELECT COUNT(*) FROM resena WHERE id_invitado = $1
    `;
    const [resultDatos, resultTotal] = await Promise.all([
      pool.query(queryDatos, [id_invitado, limite, offset]),
      pool.query(queryTotal, [id_invitado])
    ]);
    return {
      resenas: resultDatos.rows,
      total: parseInt(resultTotal.rows[0].count)
    };
  } catch (error) {
    console.error('Error en obtenerResenasPorInvitado:', error);
    throw error;
  }
};

/**
 * Obtener reseñas de reservas con QR generado por un control específico
 */
const obtenerResenasPorControl = async (id_control, limite = 10, offset = 0) => {
  try {
    const queryDatos = `
      SELECT
        re.id_reserva, re.id_invitado, re.estrellas, re.comentario, re.fecha_creacion,
        re.estado, re.verificado_control,
        u.nombre AS invitado_nombre, u.apellido AS invitado_apellido,
        ca.nombre AS cancha_nombre,
        esp.nombre AS espacio_nombre,
        qr.codigo_qr,
        aq.estado_asistencia
      FROM resena re
      JOIN reserva r ON re.id_reserva = r.id_reserva
      JOIN pago p ON p.id_reserva = r.id_reserva
      JOIN qr_pago qr ON qr.id_pago = p.id_pago
      JOIN invitado i ON re.id_invitado = i.id_invitado
      JOIN usuario u ON i.id_invitado = u.id_persona
      JOIN cancha ca ON r.id_cancha = ca.id_cancha
      JOIN espacio_deportivo esp ON ca.id_espacio = esp.id_espacio
      LEFT JOIN adquiere_qr aq ON aq.id_reserva = re.id_reserva AND aq.id_invitado = re.id_invitado
      WHERE qr.id_control = $1
      ORDER BY re.fecha_creacion DESC
      LIMIT $2 OFFSET $3
    `;
    const queryTotal = `
      SELECT COUNT(DISTINCT re.id_reserva, re.id_invitado)
      FROM resena re
      JOIN reserva r ON re.id_reserva = r.id_reserva
      JOIN pago p ON p.id_reserva = r.id_reserva
      JOIN qr_pago qr ON qr.id_pago = p.id_pago
      WHERE qr.id_control = $1
    `;
    const [resultDatos, resultTotal] = await Promise.all([
      pool.query(queryDatos, [id_control, limite, offset]),
      pool.query(queryTotal, [id_control])
    ]);
    return {
      resenas: resultDatos.rows,
      total: parseInt(resultTotal.rows[0].count)
    };
  } catch (error) {
    console.error('Error en obtenerResenasPorControl:', error);
    throw error;
  }
};

// CONTROLADORES
const obtenerDatosEspecificosController = async (req, res) => {
  try {
    const limite = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;
    
    const resultado = await obtenerDatosEspecificos(limite, offset);
    
    if (!resultado || !resultado.resenas || resultado.total === undefined) {
      throw new Error('Estructura de respuesta inválida');
    }
    
    res.json(respuesta(true, 'Reseñas obtenidas', { 
      resenas: resultado.resenas, 
      paginacion: { limite, offset, total: resultado.total } 
    }));
  } catch (error) {
    console.error('Error en obtenerDatosEspecificosController:', error);
    res.status(500).json(respuesta(false, error.message));
  }
};

const obtenerResenasFiltradasController = async (req, res) => {
  try {
    const { tipo } = req.query;
    const limite = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;
    const tiposValidos = ['verificado_si', 'verificado_no', 'invitado_nombre', 'cancha_nombre', 'estrellas_alta', 'estrellas_baja'];
    if (!tipo || !tiposValidos.includes(tipo)) {
      return res.status(400).json(respuesta(false, `Tipo inválido. Usa: ${tiposValidos.join(', ')}`));
    }
    const { resenas, total } = await obtenerResenasFiltradas(tipo, limite, offset);
    res.json(respuesta(true, `Filtrado por ${tipo}`, { resenas, filtro: tipo, paginacion: { limite, offset, total } }));
  } catch (error) {
    res.status(500).json(respuesta(false, error.message));
  }
};

const buscarResenasController = async (req, res) => {
  try {
    const { q } = req.query;
    const limite = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;
    if (!q) return res.status(400).json(respuesta(false, 'Parámetro q requerido'));
    const { resenas, total } = await buscarResenas(q, limite, offset);
    res.json(respuesta(true, 'Búsqueda completada', { resenas, paginacion: { limite, offset, total } }));
  } catch (error) {
    res.status(500).json(respuesta(false, error.message));
  }
};

const obtenerResenaPorIdController = async (req, res) => {
  try {
    const { id_reserva, id_invitado } = req.params;
    if (!id_reserva || isNaN(id_reserva) || !id_invitado || isNaN(id_invitado)) {
      return res.status(400).json(respuesta(false, 'IDs inválidos'));
    }
    const resena = await obtenerResenaPorId(parseInt(id_reserva), parseInt(id_invitado));
    if (!resena) return res.status(404).json(respuesta(false, 'Reseña no encontrada'));
    res.json(respuesta(true, 'Reseña obtenida', { resena }));
  } catch (error) {
    res.status(500).json(respuesta(false, error.message));
  }
};

const crearResenaController = async (req, res) => {
  try {
    const datos = req.body;
    const nueva = await crearResena(datos);
    res.status(201).json(respuesta(true, 'Reseña creada', { resena: nueva }));
  } catch (error) {
    if (error.message.includes('duplicate key')) {
      return res.status(400).json(respuesta(false, 'Ya existe una reseña para esta reserva e invitado'));
    }
    res.status(400).json(respuesta(false, error.message));
  }
};

const actualizarResenaController = async (req, res) => {
  try {
    const { id_reserva, id_invitado } = req.params;
    const campos = req.body;
    

    // Validar parámetros
    if (!id_reserva || !id_invitado) {
      console.log('Error: Faltan parámetros en la URL');
      return res.status(400).json(respuesta(false, 'Se requieren id_reserva e id_invitado'));
    }

    if (isNaN(parseInt(id_reserva)) || isNaN(parseInt(id_invitado))) {
      console.log('Error: Parámetros no son números válidos');
      return res.status(400).json(respuesta(false, 'Los IDs deben ser números válidos'));
    }

    if (!campos || Object.keys(campos).length === 0) {
      console.log('Error: No hay campos para actualizar');
      return res.status(400).json(respuesta(false, 'No hay campos para actualizar'));
    }

    const actualizada = await actualizarResena(
      parseInt(id_reserva), 
      parseInt(id_invitado), 
      campos
    );
    
    if (!actualizada) {
      console.log('Error: Reseña no encontrada');
      return res.status(404).json(respuesta(false, 'Reseña no encontrada'));
    }

    console.log('=== PATCH EXITOSO ===');
    res.json(respuesta(true, 'Reseña actualizada', { resena: actualizada }));
    
  } catch (error) {
    console.error('=== ERROR EN CONTROLADOR ===');
    console.error('Mensaje:', error.message);
    console.error('Stack:', error.stack);
    
    // Manejar errores específicos
    if (error.message.includes('duplicate key')) {
      return res.status(400).json(respuesta(false, 'Ya existe una reseña para esta combinación'));
    }
    if (error.message.includes('no válidos')) {
      return res.status(400).json(respuesta(false, error.message));
    }
    if (error.message.includes('No se encontró')) {
      return res.status(404).json(respuesta(false, error.message));
    }
    
    res.status(500).json(respuesta(false, `Error del servidor: ${error.message}`));
  }
};

const eliminarResenaController = async (req, res) => {
  try {
    const { id_reserva, id_invitado } = req.params;
    const eliminada = await eliminarResena(parseInt(id_reserva), parseInt(id_invitado));
    if (!eliminada) return res.status(404).json(respuesta(false, 'Reseña no encontrada'));
    res.json(respuesta(true, 'Reseña eliminada'));
  } catch (error) {
    res.status(500).json(respuesta(false, error.message));
  }
};

const obtenerResenasInvitadoController = async (req, res) => {
  try {
    const { id_invitado } = req.params;
    if (!id_invitado || isNaN(id_invitado)) {
      return res.status(400).json(respuesta(false, 'ID de invitado inválido'));
    }
    const limite = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;
    const { resenas, total } = await obtenerResenasPorInvitado(parseInt(id_invitado), limite, offset);
    res.json(respuesta(true, 'Reseñas del invitado obtenidas', {
      resenas,
      paginacion: { limite, offset, total }
    }));
  } catch (error) {
    res.status(500).json(respuesta(false, error.message));
  }
};

const obtenerResenasControlController = async (req, res) => {
  try {
    const { id_control } = req.params;
    if (!id_control || isNaN(id_control)) {
      return res.status(400).json(respuesta(false, 'ID de control inválido'));
    }
    const limite = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;
    const { resenas, total } = await obtenerResenasPorControl(parseInt(id_control), limite, offset);
    res.json(respuesta(true, 'Reseñas verificadas por control obtenidas', {
      resenas,
      paginacion: { limite, offset, total }
    }));
  } catch (error) {
    res.status(500).json(respuesta(false, error.message));
  }
};

const obtenerResenasCanchaController = async (req, res) => {
  try {
    const { id_cancha } = req.params;
    
    if (!id_cancha || isNaN(id_cancha)) {
      return res.status(400).json(respuesta(false, 'ID de cancha inválido'));
    }

    const limite = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;

    const { resenas, total, promedio } = await obtenerResenasPorCancha(parseInt(id_cancha), limite, offset);
    
    res.json(respuesta(true, 'Reseñas de la cancha obtenidas', {
      resenas,
      promedio,
      paginacion: { limite, offset, total }
    }));
  } catch (error) {
    console.error('Error en obtenerResenasCanchaController:', error);
    res.status(500).json(respuesta(false, error.message));
  }
};

// RUTAS
router.get('/datos-especificos', obtenerDatosEspecificosController);
router.get('/filtro', obtenerResenasFiltradasController);
router.get('/buscar', buscarResenasController);
router.get('/dato-individual/:id_reserva/:id_invitado', obtenerResenaPorIdController);

router.post('/', crearResenaController);
router.patch('/:id_reserva/:id_invitado', actualizarResenaController);
router.delete('/:id_reserva/:id_invitado', eliminarResenaController);

router.get('/mis-resenas/:id_invitado', obtenerResenasInvitadoController);
router.get('/control-resena/:id_control', obtenerResenasControlController);

router.get('/resenas-cancha/:id_cancha', obtenerResenasCanchaController);

module.exports = router;