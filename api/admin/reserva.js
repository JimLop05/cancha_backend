//cancha_backend/api/reserva.js
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
 * Obtener datos específicos de reservas con información de anfitrión y cancha
 */
const obtenerDatosEspecificos = async (limite = 10, offset = 0) => {
  try {
    const queryDatos = `
      SELECT 
        r.id_reserva, r.fecha_reserva, r.cupo, r.estado, r.monto_total, r.monto_pagado, r.saldo,
        a.id_anfitrion, p.nombre AS anfitrion_nombre, p.apellido AS anfitrion_apellido,
        ca.id_cancha, ca.nombre AS cancha_nombre
      FROM reserva r
      JOIN anfitrion a ON r.id_anfitrion = a.id_anfitrion
      JOIN cliente c ON a.id_anfitrion = c.id_cliente
      JOIN usuario p ON c.id_cliente = p.id_persona
      JOIN cancha ca ON r.id_cancha = ca.id_cancha
      ORDER BY r.id_reserva
      LIMIT $1 OFFSET $2
    `;
    const queryTotal = `SELECT COUNT(*) FROM reserva`;
    const [resultDatos, resultTotal] = await Promise.all([
      pool.query(queryDatos, [limite, offset]),
      pool.query(queryTotal)
    ]);
    return {
      reservas: resultDatos.rows,
      total: parseInt(resultTotal.rows[0].count)
    };
  } catch (error) {
    console.error('Error en obtenerDatosEspecificos:', error);
    throw error;
  }
};

/**
 * Obtener reservas con filtros de ordenamiento
 */
const obtenerReservasFiltradas = async (tipoFiltro, limite = 10, offset = 0) => {
  try {
    const ordenesPermitidas = {
      fecha: 'r.fecha_reserva DESC',
      estado: 'r.estado ASC',
      monto: 'r.monto_total DESC',
      default: 'r.id_reserva ASC'
    };

    const orden = ordenesPermitidas[tipoFiltro] || ordenesPermitidas.default;

    const queryDatos = `
      SELECT 
        r.id_reserva, r.fecha_reserva, r.cupo, r.estado, r.monto_total, r.monto_pagado, r.saldo,
        a.id_anfitrion, p.nombre AS anfitrion_nombre, p.apellido AS anfitrion_apellido,
        ca.id_cancha, ca.nombre AS cancha_nombre
      FROM reserva r
      JOIN anfitrion a ON r.id_anfitrion = a.id_anfitrion
      JOIN cliente c ON a.id_anfitrion = c.id_cliente
      JOIN usuario p ON c.id_cliente = p.id_persona
      JOIN cancha ca ON r.id_cancha = ca.id_cancha
      ORDER BY ${orden}
      LIMIT $1 OFFSET $2
    `;
    const queryTotal = `SELECT COUNT(*) FROM reserva`;

    const [resultDatos, resultTotal] = await Promise.all([
      pool.query(queryDatos, [limite, offset]),
      pool.query(queryTotal)
    ]);

    return {
      reservas: resultDatos.rows,
      total: parseInt(resultTotal.rows[0].count)
    };
  } catch (error) {
    console.error('Error en obtenerReservasFiltradas:', error);
    throw new Error(`Error al obtener reservas filtradas: ${error.message}`);
  }
};

/**
 * Buscar reservas por texto en múltiples campos
 */
const buscarReservas = async (texto, limite = 10, offset = 0) => {
  try {
    const queryDatos = `
      SELECT 
        r.id_reserva, r.fecha_reserva, r.cupo, r.estado, r.monto_total, r.monto_pagado, r.saldo,
        a.id_anfitrion, p.nombre AS anfitrion_nombre, p.apellido AS anfitrion_apellido,
        ca.id_cancha, ca.nombre AS cancha_nombre
      FROM reserva r
      JOIN anfitrion a ON r.id_anfitrion = a.id_anfitrion
      JOIN cliente c ON a.id_anfitrion = c.id_cliente
      JOIN usuario p ON c.id_cliente = p.id_persona
      JOIN cancha ca ON r.id_cancha = ca.id_cancha
      WHERE 
        p.nombre ILIKE $1 OR 
        p.apellido ILIKE $1 OR 
        ca.nombre ILIKE $1 OR 
        r.estado::text ILIKE $1
      ORDER BY r.fecha_reserva DESC
      LIMIT $2 OFFSET $3
    `;

    const queryTotal = `
      SELECT COUNT(*) 
      FROM reserva r
      JOIN anfitrion a ON r.id_anfitrion = a.id_anfitrion
      JOIN cliente c ON a.id_anfitrion = c.id_cliente
      JOIN usuario p ON c.id_cliente = p.id_persona
      JOIN cancha ca ON r.id_cancha = ca.id_cancha
      WHERE 
        p.nombre ILIKE $1 OR 
        p.apellido ILIKE $1 OR 
        ca.nombre ILIKE $1 OR 
        r.estado::text ILIKE $1
    `;
    
    const sanitizeInput = (input) => input.replace(/[%_\\]/g, '\\$&');
    const terminoBusqueda = `%${sanitizeInput(texto)}%`;
    
    const [resultDatos, resultTotal] = await Promise.all([
      pool.query(queryDatos, [terminoBusqueda, limite, offset]),
      pool.query(queryTotal, [terminoBusqueda])
    ]);

    return {
      reservas: resultDatos.rows,
      total: parseInt(resultTotal.rows[0].count)
    };
  } catch (error) {
    console.error('Error en buscarReservas:', error);
    throw error;
  }
};

/**
 * Obtener reserva por ID con horarios y montos
 */
const obtenerReservaPorId = async (id) => {
  try {
    const queryReserva = `
      SELECT 
        r.*, 
        a.id_anfitrion, p.nombre AS anfitrion_nombre, p.apellido AS anfitrion_apellido, p.correo AS anfitrion_correo,
        ca.id_cancha, ca.nombre AS cancha_nombre, ca.monto_por_hora, ca.capacidad AS cancha_capacidad,
        ed.nombre AS espacio_deportivo_nombre, ed.latitud, ed.longitud
      FROM reserva r
      JOIN anfitrion a ON r.id_anfitrion = a.id_anfitrion
      JOIN cliente c ON a.id_anfitrion = c.id_cliente
      JOIN usuario p ON c.id_cliente = p.id_persona
      JOIN cancha ca ON r.id_cancha = ca.id_cancha
      JOIN espacio_deportivo ed ON ca.id_espacio = ed.id_espacio 
      WHERE r.id_reserva = $1
    `;

    const queryHorarios = `
      SELECT id_horario, fecha, hora_inicio, hora_fin, monto
      FROM reserva_horario
      WHERE id_reserva = $1
      ORDER BY fecha, hora_inicio
    `;

    const [reservaResult, horariosResult] = await Promise.all([
      pool.query(queryReserva, [id]),
      pool.query(queryHorarios, [id])
    ]);

    if (!reservaResult.rows[0]) return null;

    return {
      ...reservaResult.rows[0],
      horarios: horariosResult.rows
    };
  } catch (error) {
    console.error('Error en obtenerReservaPorId:', error);
    throw error;
  }
};

/**
 * Validar formato de hora (solo en punto: HH:00)
 */
const esHoraEnPunto = (hora) => {
  return /^([0-1]?[0-9]|2[0-3]):00$/.test(hora);
};

/**
 * Calcular horas entre dos tiempos (en horas decimales)
 */
const calcularHoras = (inicio, fin) => {
  const [hi, mi] = inicio.split(':').map(Number);
  const [hf, mf] = fin.split(':').map(Number);
  return (hf * 60 + mf - (hi * 60 + mi)) / 60;
};

/**
 * Crear reserva con horarios y cálculo automático de montos
 */
const crearReserva = async (datosReserva) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { fecha_reserva, id_anfitrion, id_cancha, cupo, horarios = [] } = datosReserva;

    // Validaciones
    if (!fecha_reserva || !id_anfitrion || !id_cancha || !Array.isArray(horarios) || horarios.length === 0) {
      throw new Error('Faltan datos obligatorios: fecha_reserva, id_anfitrion, id_cancha o horarios');
    }

    const fecha = new Date(fecha_reserva);
    if (isNaN(fecha.getTime())) throw new Error('Fecha de reserva inválida');


    // === CÓDIGO MODIFICADO: Validar anfitrión - si no existe, crearlo ===
    const anfitrionRes = await client.query(
      'SELECT a.id_anfitrion FROM anfitrion a JOIN cliente c ON a.id_anfitrion = c.id_cliente WHERE a.id_anfitrion = $1',
      [id_anfitrion]
    );

    if (!anfitrionRes.rows[0]) {
      // Verificar si el id_anfitrion existe en la tabla cliente
      const clienteRes = await client.query(
        'SELECT id_cliente FROM cliente WHERE id_cliente = $1',
        [id_anfitrion]
      );
      
      if (!clienteRes.rows[0]) {
        throw new Error('El ID proporcionado no existe en la tabla cliente');
      }
      
      // Si existe en cliente pero no en anfitrion, crear el anfitrión
      await client.query(
        'INSERT INTO anfitrion (id_anfitrion, fecha_registro_anfitrion, verificado) VALUES ($1, CURRENT_DATE, FALSE)',
        [id_anfitrion]
      );
      
      console.log(`Anfitrión creado automáticamente con ID: ${id_anfitrion}`);
    }
    // === FIN DEL CÓDIGO MODIFICADO ===


    // Validar cancha y obtener monto_por_hora
    const canchaRes = await client.query('SELECT id_cancha, monto_por_hora FROM cancha WHERE id_cancha = $1', [id_cancha]);
    if (!canchaRes.rows[0]) throw new Error('Cancha no existe');
    const { monto_por_hora } = canchaRes.rows[0];

    // Validar horarios
    const horariosValidos = [];
    let montoTotal = 0;

    for (const h of horarios) {
      const { hora_inicio, hora_fin } = h;

      if (!hora_inicio || !hora_fin) throw new Error('hora_inicio y hora_fin son obligatorios en cada horario');
      if (!esHoraEnPunto(hora_inicio) || !esHoraEnPunto(hora_fin)) {
        throw new Error(`Las horas deben estar en punto (ej: 08:00). Inválido: ${hora_inicio} - ${hora_fin}`);
      }

      const horas = calcularHoras(hora_inicio, hora_fin);
      if (horas <= 0) throw new Error(`hora_fin debe ser posterior a hora_inicio: ${hora_inicio} - ${hora_fin}`);

      const monto = parseFloat((monto_por_hora * horas).toFixed(2));
      montoTotal += monto;

      horariosValidos.push({
        fecha: fecha_reserva,
        hora_inicio,
        hora_fin,
        monto
      });
    }

    // Calcular fecha de expiración (1 hora desde ahora)
    const fechaExpiracion = new Date(Date.now() + 60 * 60 * 1000);

    // Insertar reserva con fecha de expiración
    const reservaQuery = `
      INSERT INTO reserva (
        fecha_reserva, cupo, id_anfitrion, id_cancha, 
        estado, monto_total, monto_pagado, fecha_creacion, fecha_expiracion
      )
      VALUES ($1, $2, $3, $4, 'pendiente', $5, 0, CURRENT_TIMESTAMP, $6)
      RETURNING id_reserva
    `;

    const reservaRes = await client.query(reservaQuery, [
      fecha_reserva, 
      cupo || null, 
      id_anfitrion, 
      id_cancha,
      parseFloat(montoTotal.toFixed(2)),
      fecha_reserva
    ]);
    
    const id_reserva = reservaRes.rows[0].id_reserva;

    // Insertar horarios
    const horarioQuery = `
      INSERT INTO reserva_horario (id_reserva, fecha, hora_inicio, hora_fin, monto)
      VALUES ($1, $2, $3, $4, $5)
    `;
    for (const h of horariosValidos) {
      await client.query(horarioQuery, [id_reserva, h.fecha, h.hora_inicio, h.hora_fin, h.monto]);
    }

    // Actualizar monto_total
    await client.query(
      `UPDATE reserva SET monto_total = $1 WHERE id_reserva = $2`,
      [parseFloat(montoTotal.toFixed(2)), id_reserva]
    );

    await client.query('COMMIT');

    return await obtenerReservaPorId(id_reserva);

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Actualizar reserva parcialmente
 */
const actualizarReserva = async (id, datosActualizar) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { fecha_reserva, cupo, id_anfitrion, id_cancha, horarios } = datosActualizar;

    // Validar que la reserva existe
    const reservaActual = await client.query(
      'SELECT id_reserva, id_cancha FROM reserva WHERE id_reserva = $1',
      [id]
    );
    if (!reservaActual.rows[0]) throw new Error('Reserva no encontrada');

    // Validar anfitrión si se cambia
    if (id_anfitrion !== undefined) {
      const anfitrionRes = await client.query(
        'SELECT a.id_anfitrion FROM anfitrion a JOIN cliente c ON a.id_anfitrion = c.id_cliente WHERE a.id_anfitrion = $1',
        [id_anfitrion]
      );
      if (!anfitrionRes.rows[0]) throw new Error('Anfitrión no existe');
    }

    // Obtener monto_por_hora
    let monto_por_hora;
    if (id_cancha) {
      const canchaRes = await client.query('SELECT monto_por_hora FROM cancha WHERE id_cancha = $1', [id_cancha]);
      if (!canchaRes.rows[0]) throw new Error('Cancha no existe');
      monto_por_hora = canchaRes.rows[0].monto_por_hora;
    } else {
      const canchaActual = await client.query(
        'SELECT monto_por_hora FROM cancha WHERE id_cancha = (SELECT id_cancha FROM reserva WHERE id_reserva = $1)',
        [id]
      );
      monto_por_hora = canchaActual.rows[0].monto_por_hora;
    }

    // Actualizar campos básicos
    const camposActualizables = [];
    const valores = [];
    let index = 1;

    if (fecha_reserva !== undefined) {
      const fecha = new Date(fecha_reserva);
      if (isNaN(fecha.getTime())) throw new Error('Fecha inválida');
      camposActualizables.push(`fecha_reserva = $${index++}`);
      valores.push(fecha_reserva);
    }
    if (cupo !== undefined) {
      camposActualizables.push(`cupo = $${index++}`);
      valores.push(cupo || null);
    }
    if (id_anfitrion !== undefined) {
      camposActualizables.push(`id_anfitrion = $${index++}`);
      valores.push(id_anfitrion);
    }
    if (id_cancha !== undefined) {
      camposActualizables.push(`id_cancha = $${index++}`);
      valores.push(id_cancha);
    }

    if (camposActualizables.length > 0) {
      const updateQuery = `
        UPDATE reserva 
        SET ${camposActualizables.join(', ')}
        WHERE id_reserva = $${index}
      `;
      valores.push(id);
      await client.query(updateQuery, valores);
    }

    let montoTotal = 0;

    // Si se envían horarios → recalcular
    if (horarios && Array.isArray(horarios)) {
      if (horarios.length === 0) throw new Error('Debe haber al menos un horario');

      await client.query('DELETE FROM reserva_horario WHERE id_reserva = $1', [id]);

      const insertQuery = `
        INSERT INTO reserva_horario (id_reserva, fecha, hora_inicio, hora_fin, monto)
        VALUES ($1, $2, $3, $4, $5)
      `;

      for (const h of horarios) {
        const { hora_inicio, hora_fin } = h;
        if (!hora_inicio || !hora_fin) throw new Error('Faltan hora_inicio o hora_fin');
        if (!esHoraEnPunto(hora_inicio) || !esHoraEnPunto(hora_fin)) {
          throw new Error(`Horas deben estar en punto: ${hora_inicio} - ${hora_fin}`);
        }

        const horas = calcularHoras(hora_inicio, hora_fin);
        if (horas <= 0) throw new Error(`hora_fin debe ser posterior: ${hora_inicio} - ${hora_fin}`);

        const monto = parseFloat((monto_por_hora * horas).toFixed(2));
        montoTotal += monto;

        await client.query(insertQuery, [
          id,
          fecha_reserva || reservaActual.rows[0].fecha_reserva,
          hora_inicio,
          hora_fin,
          monto
        ]);
      }

      await client.query(
        'UPDATE reserva SET monto_total = $1 WHERE id_reserva = $2',
        [parseFloat(montoTotal.toFixed(2)), id]
      );
    } else {
      const totalRes = await client.query(
        'SELECT COALESCE(SUM(monto), 0) as total FROM reserva_horario WHERE id_reserva = $1',
        [id]
      );
      montoTotal = parseFloat(totalRes.rows[0].total);
      await client.query(
        'UPDATE reserva SET monto_total = $1 WHERE id_reserva = $2',
        [montoTotal, id]
      );
    }

    await client.query('COMMIT');
    return await obtenerReservaPorId(id);

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Eliminar reserva
 */
const eliminarReserva = async (id) => {
  try {
    const query = 'DELETE FROM reserva WHERE id_reserva = $1 RETURNING id_reserva';
    const result = await pool.query(query, [id]);
    return result.rows[0] || null;
  } catch (error) {
    throw error;
  }
};

//===================================================

/**
 * Obtener reservas asociadas a un cliente específico (como anfitrión)
 */
const obtenerReservasPorCliente = async (id_cliente, limite = 10, offset = 0) => {
  try {
    const queryDatos = `
      SELECT
        r.id_reserva, r.fecha_reserva, r.cupo, r.estado, r.monto_total, r.monto_pagado, r.saldo,
        a.id_anfitrion, p.nombre AS anfitrion_nombre, p.apellido AS anfitrion_apellido,
        ca.id_cancha, ca.nombre AS cancha_nombre
      FROM reserva r
      JOIN anfitrion a ON r.id_anfitrion = a.id_anfitrion
      JOIN cliente c ON a.id_anfitrion = c.id_cliente
      JOIN usuario p ON c.id_cliente = p.id_persona
      JOIN cancha ca ON r.id_cancha = ca.id_cancha
      WHERE a.id_anfitrion = $1
      ORDER BY r.fecha_creacion DESC
      LIMIT $2 OFFSET $3
    `;
    const queryTotal = `
      SELECT COUNT(*)
      FROM reserva r
      WHERE r.id_anfitrion = $1
    `;
    const [resultDatos, resultTotal] = await Promise.all([
      pool.query(queryDatos, [id_cliente, limite, offset]),
      pool.query(queryTotal, [id_cliente])
    ]);
    return {
      reservas: resultDatos.rows,
      total: parseInt(resultTotal.rows[0].count)
    };
  } catch (error) {
    console.error('Error en obtenerReservasPorCliente:', error);
    throw error;
  }
};

/**
 * Obtener todas las reservas de las canchas del espacio deportivo gestionado por admin_esp_dep
 */
const obtenerReservasPorAdminEspDep = async (id_admin_esp_dep, limite = 10, offset = 0) => {
  try {
    const queryDatos = `
      SELECT
        r.id_reserva, r.fecha_reserva, r.cupo, r.estado, r.monto_total, r.monto_pagado, r.saldo,
        a.id_anfitrion, p.nombre AS anfitrion_nombre, p.apellido AS anfitrion_apellido,
        ca.id_cancha, ca.nombre AS cancha_nombre,
        ed.nombre AS espacio_nombre
      FROM reserva r
      JOIN anfitrion a ON r.id_anfitrion = a.id_anfitrion
      JOIN cliente c ON a.id_anfitrion = c.id_cliente
      JOIN usuario p ON c.id_cliente = p.id_persona
      JOIN cancha ca ON r.id_cancha = ca.id_cancha
      JOIN espacio_deportivo ed ON ca.id_espacio = ed.id_espacio
      WHERE ed.id_admin_esp_dep = $1
      ORDER BY r.fecha_reserva DESC
      LIMIT $2 OFFSET $3
    `;
    const queryTotal = `
      SELECT COUNT(*)
      FROM reserva r
      JOIN cancha ca ON r.id_cancha = ca.id_cancha
      JOIN espacio_deportivo ed ON ca.id_espacio = ed.id_espacio
      WHERE ed.id_admin_esp_dep = $1
    `;
    const [resultDatos, resultTotal] = await Promise.all([
      pool.query(queryDatos, [id_admin_esp_dep, limite, offset]),
      pool.query(queryTotal, [id_admin_esp_dep])
    ]);
    return {
      reservas: resultDatos.rows,
      total: parseInt(resultTotal.rows[0].count)
    };
  } catch (error) {
    console.error('Error en obtenerReservasPorAdminEspDep:', error);
    throw error;
  }
};

/**
 * Obtener reportes de incidencia con datos de reserva para un encargado
 */
const obtenerReportesPorEncargado = async (id_encargado, limite = 10, offset = 0) => {
  try {
    const queryDatos = `
      SELECT
        ri.id_reporte, ri.detalle, ri.sugerencia, ri.verificado,
        r.id_reserva, r.fecha_reserva, r.estado, r.monto_total,
        ca.nombre AS cancha_nombre
      FROM reporte_incidencia ri
      JOIN reserva r ON ri.id_reserva = r.id_reserva
      JOIN cancha ca ON r.id_cancha = ca.id_cancha
      WHERE ri.id_encargado = $1
      ORDER BY ri.id_reporte DESC
      LIMIT $2 OFFSET $3
    `;
    const queryTotal = `
      SELECT COUNT(*) FROM reporte_incidencia WHERE id_encargado = $1
    `;
    const [resultDatos, resultTotal] = await Promise.all([
      pool.query(queryDatos, [id_encargado, limite, offset]),
      pool.query(queryTotal, [id_encargado])
    ]);
    return {
      reportes: resultDatos.rows,
      total: parseInt(resultTotal.rows[0].count)
    };
  } catch (error) {
    console.error('Error en obtenerReportesPorEncargado:', error);
    throw error;
  }
};

/**
 * Obtener QR de pagos con datos de reserva y pago para un control
 */
const obtenerQrPagosPorControl = async (id_control, limite = 10, offset = 0) => {
  try {
    const queryDatos = `
      SELECT
        qr.id_qr_pago, qr.codigo_qr, qr.estado AS qr_estado, qr.fecha_generado, qr.fecha_expira,
        p.id_pago, p.monto, p.metodo_pago, p.fecha_pago,
        r.id_reserva, r.fecha_reserva, r.estado AS reserva_estado,
        ca.nombre AS cancha_nombre
      FROM qr_pago qr
      JOIN pago p ON qr.id_pago = p.id_pago
      JOIN reserva r ON p.id_reserva = r.id_reserva
      JOIN cancha ca ON r.id_cancha = ca.id_cancha
      WHERE qr.id_control = $1
      ORDER BY qr.fecha_generado DESC
      LIMIT $2 OFFSET $3
    `;
    const queryTotal = `
      SELECT COUNT(*) FROM qr_pago WHERE id_control = $1
    `;
    const [resultDatos, resultTotal] = await Promise.all([
      pool.query(queryDatos, [id_control, limite, offset]),
      pool.query(queryTotal, [id_control])
    ]);
    return {
      qr_pagos: resultDatos.rows,
      total: parseInt(resultTotal.rows[0].count)
    };
  } catch (error) {
    console.error('Error en obtenerQrPagosPorControl:', error);
    throw error;
  }
};

/**
 * Obtener reservas PENDIENTES o EN_CUOTAS de un cliente (como anfitrión)
 */
const obtenerReservasPendientesOEnCuotasPorCliente = async (id_cliente, limite = 10, offset = 0) => {
  try {
    const queryDatos = `
      SELECT
        r.id_reserva, 
        r.fecha_reserva, 
        r.cupo, 
        r.estado, 
        r.monto_total, 
        r.monto_pagado, 
        r.saldo,
        r.fecha_expiracion,
        a.id_anfitrion, 
        p.nombre AS anfitrion_nombre, 
        p.apellido AS anfitrion_apellido,
        ca.id_cancha, 
        ca.nombre AS cancha_nombre
      FROM reserva r
      JOIN anfitrion a ON r.id_anfitrion = a.id_anfitrion
      JOIN cliente c ON a.id_anfitrion = c.id_cliente
      JOIN usuario p ON c.id_cliente = p.id_persona
      JOIN cancha ca ON r.id_cancha = ca.id_cancha
      WHERE a.id_anfitrion = $1
        AND r.estado IN ('pendiente', 'en_cuotas')
      ORDER BY r.fecha_reserva DESC, r.id_reserva DESC
      LIMIT $2 OFFSET $3
    `;

    const queryTotal = `
      SELECT COUNT(*)
      FROM reserva r
      WHERE r.id_anfitrion = $1
        AND r.estado IN ('pendiente', 'en_cuotas')
    `;

    const [resultDatos, resultTotal] = await Promise.all([
      pool.query(queryDatos, [id_cliente, limite, offset]),
      pool.query(queryTotal, [id_cliente])
    ]);

    return {
      reservas: resultDatos.rows,
      total: parseInt(resultTotal.rows[0].count, 10)
    };
  } catch (error) {
    console.error('Error en obtenerReservasPendientesOEnCuotasPorCliente:', error);
    throw error;
  }
};





//===================================================

// CONTROLADORES (sin cambios en lógica, solo nombres)

const obtenerDatosEspecificosController = async (req, res) => {
  try {
    const limite = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;
    const { reservas, total } = await obtenerDatosEspecificos(limite, offset);
    res.json(respuesta(true, 'Reservas obtenidas correctamente', { reservas, paginacion: { limite, offset, total } }));
  } catch (error) {
    res.status(500).json(respuesta(false, error.message));
  }
};

const obtenerReservasFiltradasController = async (req, res) => {
  try {
    const { tipo } = req.query;
    const limite = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;
    const tiposValidos = ['fecha', 'estado', 'monto'];
    if (!tipo || !tiposValidos.includes(tipo)) {
      return res.status(400).json(respuesta(false, 'Parámetro "tipo" inválido'));
    }
    const { reservas, total } = await obtenerReservasFiltradas(tipo, limite, offset);
    res.json(respuesta(true, `Reservas filtradas por ${tipo}`, { reservas, filtro: tipo, paginacion: { limite, offset, total } }));
  } catch (error) {
    res.status(500).json(respuesta(false, error.message));
  }
};

const buscarReservasController = async (req, res) => {
  try {
    const { q } = req.query;
    const limite = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;
    if (!q) return res.status(400).json(respuesta(false, 'Parámetro "q" requerido'));
    const { reservas, total } = await buscarReservas(q, limite, offset);
    res.json(respuesta(true, 'Búsqueda completada', { reservas, paginacion: { limite, offset, total } }));
  } catch (error) {
    res.status(500).json(respuesta(false, error.message));
  }
};

const obtenerReservaPorIdController = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || isNaN(id)) return res.status(400).json(respuesta(false, 'ID inválido'));
    const reserva = await obtenerReservaPorId(parseInt(id));
    if (!reserva) return res.status(404).json(respuesta(false, 'Reserva no encontrada'));
    res.json(respuesta(true, 'Reserva obtenida', { reserva }));
  } catch (error) {
    res.status(500).json(respuesta(false, error.message));
  }
};

const crearReservaController = async (req, res) => {
  try {
    const datos = req.body;
    const nuevaReserva = await crearReserva(datos);

    // Mensaje adicional
    const mensajePago = "Debe pagar en 1 hora como mínimo 50 Bs.";

    res.status(201).json(
      respuesta(true, 'Reserva creada con éxito', {
        reserva: nuevaReserva,
        aviso: mensajePago
      })
    );
  } catch (error) {
    res.status(400).json(respuesta(false, error.message));
  }
};


const actualizarReservaController = async (req, res) => {
  try {
    const { id } = req.params;
    const campos = req.body;
    if (Object.keys(campos).length === 0) return res.status(400).json(respuesta(false, 'No hay campos para actualizar'));
    const actualizada = await actualizarReserva(parseInt(id), campos);
    res.json(respuesta(true, 'Reserva actualizada', { reserva: actualizada }));
  } catch (error) {
    res.status(500).json(respuesta(false, error.message));
  }
};

const eliminarReservaController = async (req, res) => {
  try {
    const { id } = req.params;
    const eliminada = await eliminarReserva(parseInt(id));
    if (!eliminada) return res.status(404).json(respuesta(false, 'Reserva no encontrada'));
    res.json(respuesta(true, 'Reserva eliminada correctamente'));
  } catch (error) {
    res.status(500).json(respuesta(false, error.message));
  }
};

const obtenerReservasPorClienteController = async (req, res) => {
  try {
    const { id_cliente } = req.params;
    if (!id_cliente || isNaN(id_cliente)) return res.status(400).json(respuesta(false, 'ID de cliente inválido'));
    const limite = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;
    const { reservas, total } = await obtenerReservasPorCliente(parseInt(id_cliente), limite, offset);
    res.json(respuesta(true, 'Reservas del cliente obtenidas correctamente', { reservas, paginacion: { limite, offset, total } }));
  } catch (error) {
    res.status(500).json(respuesta(false, error.message));
  }
};

const obtenerReservasAdminEspDepController = async (req, res) => {
  try {
    const { id_admin_esp_dep } = req.params;
    if (!id_admin_esp_dep || isNaN(id_admin_esp_dep)) {
      return res.status(400).json(respuesta(false, 'ID de administrador inválido'));
    }
    const limite = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;
    const { reservas, total } = await obtenerReservasPorAdminEspDep(parseInt(id_admin_esp_dep), limite, offset);
    res.json(respuesta(true, 'Reservas del espacio deportivo obtenidas', {
      reservas,
      paginacion: { limite, offset, total }
    }));
  } catch (error) {
    res.status(500).json(respuesta(false, error.message));
  }
};

const obtenerReportesEncargadoController = async (req, res) => {
  try {
    const { id_encargado } = req.params;
    if (!id_encargado || isNaN(id_encargado)) {
      return res.status(400).json(respuesta(false, 'ID de encargado inválido'));
    }
    const limite = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;
    const { reportes, total } = await obtenerReportesPorEncargado(parseInt(id_encargado), limite, offset);
    res.json(respuesta(true, 'Reportes de incidencia obtenidos', {
      reportes,
      paginacion: { limite, offset, total }
    }));
  } catch (error) {
    res.status(500).json(respuesta(false, error.message));
  }
};

const obtenerQrPagosControlController = async (req, res) => {
  try {
    const { id_control } = req.params;
    if (!id_control || isNaN(id_control)) {
      return res.status(400).json(respuesta(false, 'ID de control inválido'));
    }
    const limite = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;
    const { qr_pagos, total } = await obtenerQrPagosPorControl(parseInt(id_control), limite, offset);
    res.json(respuesta(true, 'QR de pagos obtenidos', {
      qr_pagos,
      paginacion: { limite, offset, total }
    }));
  } catch (error) {
    res.status(500).json(respuesta(false, error.message));
  }
};

const obtenerReservasPendientesController = async (req, res) => {
  try {
    const { id_cliente } = req.params;
    if (!id_cliente || isNaN(id_cliente)) {
      return res.status(400).json(respuesta(false, 'ID de cliente inválido'));
    }

    const limite = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;

    const { reservas, total } = await obtenerReservasPendientesOEnCuotasPorCliente(
      parseInt(id_cliente),
      limite,
      offset
    );

    res.json(
      respuesta(true, 'Reservas pendientes o en cuotas obtenidas correctamente', {
        reservas,
        paginacion: { limite, offset, total }
      })
    );
  } catch (error) {
    console.error('Error en obtenerReservasPendientesController:', error);
    res.status(500).json(respuesta(false, error.message || 'Error al obtener reservas pendientes'));
  }
};


// RUTAS
router.get('/datos-especificos', obtenerDatosEspecificosController);
router.get('/filtro', obtenerReservasFiltradasController);
router.get('/buscar', buscarReservasController);
router.get('/dato-individual/:id', obtenerReservaPorIdController);

router.post('/', crearReservaController);
router.patch('/:id', actualizarReservaController);
router.delete('/:id', eliminarReservaController);

router.get('/mis-reservas/:id_cliente', obtenerReservasPorClienteController);
router.get('/mis-reservas-pendientes/:id_cliente', obtenerReservasPendientesController);

router.get('/datos-segun-rol/:id_admin_esp_dep', obtenerReservasAdminEspDepController);

router.get('/control-reserva/:id_control', obtenerQrPagosControlController);

module.exports = router;