const express = require('express');
const pool = require('../../config/database');
const QRCode = require('qrcode');
const fs = require('fs').promises;
const path = require('path');
const { createCanvas, loadImage } = require('canvas'); // Agregar loadImage aquí

const router = express.Router();

// Función de respuesta estandarizada
const respuesta = (exito, mensaje, datos = null) => ({
  exito,
  mensaje,
  datos,
});

// MODELOS - Funciones puras para operaciones de base de datos

// VERSIÓN MÁS SIMPLIFICADA: Horarios como strings
const construirDatosQrInvitacion = async (client, id_reserva, codigo_invitacion) => {
  try {
    const query = `
      SELECT 
        r.id_reserva,
        c.nombre AS cancha_nombre,
        ed.nombre AS espacio_nombre,
        ed.latitud,
        ed.longitud,
        u.nombre || ' ' || u.apellido AS anfitrion,
        -- Horarios como array de strings
        array_agg(
          to_char(rh.hora_inicio, 'HH24:MI') || ' - ' || to_char(rh.hora_fin, 'HH24:MI')
          ORDER BY rh.hora_inicio
        ) AS horarios,
        MIN(rh.fecha) as fecha
      FROM reserva r
      JOIN cancha c ON r.id_cancha = c.id_cancha
      JOIN espacio_deportivo ed ON c.id_espacio = ed.id_espacio
      JOIN reserva_horario rh ON r.id_reserva = rh.id_reserva
      JOIN anfitrion a ON r.id_anfitrion = a.id_anfitrion
      JOIN cliente cl ON a.id_anfitrion = cl.id_cliente
      JOIN usuario u ON cl.id_cliente = u.id_persona
      WHERE r.id_reserva = $1
      GROUP BY r.id_reserva, c.nombre, ed.nombre, ed.latitud, ed.longitud, u.nombre, u.apellido
    `;

    const res = await client.query(query, [id_reserva]);
    if (!res.rows[0]) throw new Error('Reserva no encontrada para generar QR');

    const datos = res.rows[0];

    const jsonQr = {
      tipo: "invitacion_reserva",
      codigo_qr: codigo_invitacion,
      id_reserva: datos.id_reserva,
      datos_reserva: {
        cancha_nombre: datos.cancha_nombre,
        espacio_nombre: datos.espacio_nombre,
        anfitrion: datos.anfitrion,
        fecha: datos.fecha,
        horario: datos.horarios  // Ej: ["14:00 - 15:30", "16:00 - 17:30"]
      }
    };

    return JSON.stringify(jsonQr);
  } catch (error) {
    throw new Error(`Error construyendo datos QR: ${error.message}`);
  }
};

// Función para generar QR con título, fecha y nombre de cancha - MODIFICADA
const generarQRConTitulo = async (textoQR, titulo, filePath, fechaExpira = null, canchaNombre = null) => {
  const qrSize = 300;
  const padding = 40;
  const fontSize = 24;
  const fechaFontSize = 16;
  const canchaFontSize = 18; // ⭐ NUEVO
  
  // ⭐ MODIFICAR: Calcular altura dinámicamente
  let extraHeight = 0;
  if (fechaExpira) extraHeight += fechaFontSize + 10;
  if (canchaNombre) extraHeight += canchaFontSize + 10;

  const canvasWidth = qrSize + padding * 2;
  const canvasHeight = qrSize + padding * 3 + fontSize + extraHeight;

  const canvas = createCanvas(canvasWidth, canvasHeight);
  const ctx = canvas.getContext('2d');

  // Fondo blanco
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // Título
  ctx.fillStyle = 'black';
  ctx.font = `bold ${fontSize}px Arial`;
  ctx.textAlign = 'center';
  ctx.fillText(titulo, canvasWidth / 2, padding + fontSize / 2);

  // Fecha de expiración (si se proporciona)
  let yOffset = 0;
  if (fechaExpira) {
    ctx.fillStyle = '#666666';
    ctx.font = `${fechaFontSize}px Arial`;
    
    const fechaFormateada = new Date(fechaExpira).toLocaleDateString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    
    ctx.fillText(`Válido hasta: ${fechaFormateada}`, canvasWidth / 2, padding + fontSize + fechaFontSize);
    yOffset = fechaFontSize + 10;
  }

  // ⭐⭐ NUEVA SECCIÓN: Nombre de la cancha
  if (canchaNombre) {
    ctx.fillStyle = '#2E86AB'; // Color azul profesional
    ctx.font = `bold ${canchaFontSize}px Arial`;
    ctx.fillText(canchaNombre, canvasWidth / 2, padding + fontSize + yOffset + canchaFontSize);
    yOffset += canchaFontSize + 10;
  }

  // Generar QR en memoria y cargarlo directamente con loadImage
  const qrDataUrl = await QRCode.toDataURL(textoQR, { 
    width: qrSize,
    margin: 1,
    color: {
      dark: '#000000',
      light: '#FFFFFF'
    }
  });
  
  const qrImage = await loadImage(qrDataUrl);

  // Dibujar QR debajo de todo el texto
  ctx.drawImage(qrImage, padding, padding + fontSize + 10 + yOffset, qrSize, qrSize);

  // Guardar en archivo
  const buffer = canvas.toBuffer('image/png');
  await fs.writeFile(filePath, buffer);
  
  console.log(`✅ QR con título, fecha y cancha generado: ${titulo} -> ${filePath}`);
};


const generarQRParaPago = async (client, id_pago, id_reserva) => {
  try {
    // 1. Obtener control aleatorio
    const id_control = await obtenerControlAleatorio(client);

    // 2. Obtener fecha de expiración (fin del horario)
    const fechaExpira = await obtenerFechaReserva(client, id_reserva);

    // 3. Obtener nombre de la cancha
    const canchaInfo = await obtenerInfoCancha(client, id_reserva);

    // 3. Generar código único
    const codigo_qr = `RES_${id_reserva}_P${id_pago}_${Date.now()}`;
    const codigo_invitacion = generarCodigoInvitacion();

    // 4. URLs
    const urlReserva = `http://canchaQR.com:5173/verificar/qr/${codigo_qr}`;
    
    const datosJsonInvitacion = await construirDatosQrInvitacion(client, id_reserva, codigo_invitacion);
    
    const urlInvitacion = `http://canchaQR.com:5173/invitado/reserva/${encodeURIComponent(btoa(datosJsonInvitacion))}`;

    // 5. Rutas de archivos
    const uploadPath = path.join(__dirname, '../../Uploads', 'qr_pagos');
    await fs.mkdir(uploadPath, { recursive: true });

    const filenameReserva = `qr_reserva_${id_pago}.png`;
    const filenameInvitacion = `qr_invitacion_${id_pago}.png`;
    const pathReserva = path.join(uploadPath, filenameReserva);
    const pathInvitacion = path.join(uploadPath, filenameInvitacion);

    // 6. Generar QRs CON TÍTULOS Y FECHA DE EXPIRACIÓN
    await generarQRConTitulo(
      datosJsonInvitacion, 
      'QR RESERVA', 
      pathReserva, 
      fechaExpira,
      canchaInfo.nombre // ⭐ Pasar el nombre de la cancha
    );

    // 7. Insertar en qr_pago
    const qrRes = await client.query(
      `INSERT INTO qr_pago (
        fecha_generado, fecha_expira, codigo_qr, estado, id_control, verificado,
        link_invitacion, qr_reserva, qr_invitacion, id_pago
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id_qr_pago, codigo_qr, link_invitacion, qr_reserva, qr_invitacion`,
      [
        new Date().toISOString(),
        fechaExpira.toISOString(),
        codigo_qr,
        'activo',
        id_control,
        false,
        urlInvitacion,
        `/Uploads/qr_pagos/${filenameReserva}`,
        `/Uploads/qr_pagos/${filenameInvitacion}`,
        id_pago
      ]
    );

    return {
      ...qrRes.rows[0],
      codigo_invitacion,
      fecha_expira: fechaExpira,
      cancha_nombre: canchaInfo.nombre
    };

  } catch (error) {
    throw new Error(`Error al generar QR: ${error.message}`);
  }
};

// ⭐ NUEVA FUNCIÓN: Obtener información de la cancha
const obtenerInfoCancha = async (client, id_reserva) => {
  try {
    const query = `
      SELECT 
        c.nombre AS nombre,
        ed.nombre AS espacio_nombre
      FROM reserva r
      JOIN cancha c ON r.id_cancha = c.id_cancha
      JOIN espacio_deportivo ed ON c.id_espacio = ed.id_espacio
      WHERE r.id_reserva = $1
    `;
    
    const res = await client.query(query, [id_reserva]);
    if (!res.rows[0]) throw new Error('No se pudo obtener información de la cancha');
    
    return {
      nombre: res.rows[0].nombre,
      espacio_nombre: res.rows[0].espacio_nombre
    };
  } catch (error) {
    throw new Error(`Error obteniendo info cancha: ${error.message}`);
  }
};

const obtenerControlAleatorio = async (client) => {
  const res = await client.query(`
    SELECT id_control 
    FROM control 
    WHERE estado = TRUE 
    ORDER BY RANDOM() 
    LIMIT 1
  `);
  if (!res.rows[0]) throw new Error('No hay controles activos disponibles');
  return res.rows[0].id_control;
};

const obtenerFechaReserva = async (client, id_reserva) => {
  const res = await client.query(`
    SELECT rh.fecha, rh.hora_fin
    FROM reserva_horario rh
    WHERE rh.id_reserva = $1
    ORDER BY rh.fecha DESC, rh.hora_fin DESC
    LIMIT 1
  `, [id_reserva]);

  if (!res.rows[0]) throw new Error('No se encontró ningún horario para la reserva');

  const { fecha, hora_fin } = res.rows[0];
  const [h, m] = hora_fin.split(':').map(Number);

  const fechaExpira = new Date(fecha);
  fechaExpira.setHours(h, m, 0, 0);

  return fechaExpira;
};

const generarCodigoInvitacion = () => {
  return 'INV' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5).toUpperCase();
};

/**
 * Obtener reservas pendientes o en cuotas para pagos
 */
const obtenerReservasPendientes = async (limite = 50, offset = 0) => {
  try {
    const query = `
      SELECT 
        r.id_reserva, 
        u.nombre AS anfitrion_nombre, 
        u.apellido AS anfitrion_apellido,
        ca.nombre AS cancha_nombre,
        r.saldo
      FROM reserva r
      JOIN anfitrion a ON r.id_anfitrion = a.id_anfitrion
      JOIN cliente c ON a.id_anfitrion = c.id_cliente
      JOIN usuario u ON c.id_cliente = u.id_persona
      JOIN cancha ca ON r.id_cancha = ca.id_cancha
      WHERE r.estado IN ('pendiente', 'en_cuotas')
        AND r.saldo > 0
      ORDER BY r.fecha_reserva DESC
      LIMIT $1 OFFSET $2
    `;

    const result = await pool.query(query, [limite, offset]);
    return result.rows;
  } catch (error) {
    throw error;
  }
};

/**
 * Obtener datos específicos de pagos
 */
const obtenerDatosEspecificos = async (limite = 10, offset = 0) => {
  try {
    const queryDatos = `
      SELECT 
        p.id_pago, p.monto, p.metodo_pago, p.fecha_pago,
        r.id_reserva, a.id_anfitrion, u.nombre AS anfitrion_nombre, u.apellido AS anfitrion_apellido,
        ca.id_cancha, ca.nombre AS cancha_nombre
      FROM pago p
      JOIN reserva r ON p.id_reserva = r.id_reserva
      JOIN anfitrion a ON r.id_anfitrion = a.id_anfitrion
      JOIN cliente c ON a.id_anfitrion = c.id_cliente
      JOIN usuario u ON c.id_cliente = u.id_persona
      JOIN cancha ca ON r.id_cancha = ca.id_cancha
      ORDER BY p.id_pago DESC
      LIMIT $1 OFFSET $2
    `;
    const queryTotal = `SELECT COUNT(*) FROM pago`;
    const [resultDatos, resultTotal] = await Promise.all([
      pool.query(queryDatos, [limite, offset]),
      pool.query(queryTotal)
    ]);
    return {
      pagos: resultDatos.rows,
      total: parseInt(resultTotal.rows[0].count)
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Obtener pagos con filtros de ordenamiento
 */
const obtenerPagosFiltrados = async (tipoFiltro, limite = 10, offset = 0) => {
  try {
    const ordenesPermitidas = {
      fecha: 'p.fecha_pago DESC',
      monto: 'p.monto DESC',
      metodo: 'p.metodo_pago ASC',
      anfitrion: 'u.nombre ASC, u.apellido ASC',
      default: 'p.id_pago DESC'
    };

    const orden = ordenesPermitidas[tipoFiltro] || ordenesPermitidas.default;

    const queryDatos = `
      SELECT 
        p.id_pago, p.monto, p.metodo_pago, p.fecha_pago,
        r.id_reserva, a.id_anfitrion, u.nombre AS anfitrion_nombre, u.apellido AS anfitrion_apellido,
        ca.id_cancha, ca.nombre AS cancha_nombre
      FROM pago p
      JOIN reserva r ON p.id_reserva = r.id_reserva
      JOIN anfitrion a ON r.id_anfitrion = a.id_anfitrion
      JOIN cliente c ON a.id_anfitrion = c.id_cliente
      JOIN usuario u ON c.id_cliente = u.id_persona
      JOIN cancha ca ON r.id_cancha = ca.id_cancha
      ORDER BY ${orden}
      LIMIT $1 OFFSET $2
    `;
    const queryTotal = `SELECT COUNT(*) FROM pago`;

    const [resultDatos, resultTotal] = await Promise.all([
      pool.query(queryDatos, [limite, offset]),
      pool.query(queryTotal)
    ]);

    return {
      pagos: resultDatos.rows,
      total: parseInt(resultTotal.rows[0].count)
    };
  } catch (error) {
    throw new Error(`Error al obtener pagos filtrados: ${error.message}`);
  }
};

/**
 * Buscar pagos por texto
 */
const buscarPagos = async (texto, limite = 10, offset = 0) => {
  try {
    const queryDatos = `
      SELECT 
        p.id_pago, p.monto, p.metodo_pago, p.fecha_pago,
        r.id_reserva, u.nombre AS anfitrion_nombre, u.apellido AS anfitrion_apellido,
        ca.id_cancha, ca.nombre AS cancha_nombre
      FROM pago p
      JOIN reserva r ON p.id_reserva = r.id_reserva
      JOIN anfitrion a ON r.id_anfitrion = a.id_anfitrion
      JOIN cliente c ON a.id_anfitrion = c.id_cliente
      JOIN usuario u ON c.id_cliente = u.id_persona
      JOIN cancha ca ON r.id_cancha = ca.id_cancha
      WHERE 
        u.nombre ILIKE $1 OR 
        u.apellido ILIKE $1 OR 
        ca.nombre ILIKE $1 OR 
        p.metodo_pago::text ILIKE $1
      ORDER BY p.fecha_pago DESC
      LIMIT $2 OFFSET $3
    `;

    const queryTotal = `
      SELECT COUNT(*) 
      FROM pago p
      JOIN reserva r ON p.id_reserva = r.id_reserva
      JOIN anfitrion a ON r.id_anfitrion = a.id_anfitrion
      JOIN cliente c ON a.id_anfitrion = c.id_cliente
      JOIN usuario u ON c.id_cliente = u.id_persona
      JOIN cancha ca ON r.id_cancha = ca.id_cancha
      WHERE 
        u.nombre ILIKE $1 OR 
        u.apellido ILIKE $1 OR 
        ca.nombre ILIKE $1 OR 
        p.metodo_pago::text ILIKE $1
    `;
    
    const sanitizeInput = (input) => input.replace(/[%_\\]/g, '\\$&');
    const terminoBusqueda = `%${sanitizeInput(texto)}%`;
    
    const [resultDatos, resultTotal] = await Promise.all([
      pool.query(queryDatos, [terminoBusqueda, limite, offset]),
      pool.query(queryTotal, [terminoBusqueda])
    ]);

    return {
      pagos: resultDatos.rows,
      total: parseInt(resultTotal.rows[0].count)
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Obtener pago por ID
 */
const obtenerPagoPorId = async (id) => {
  try {
    const query = `
      SELECT 
        p.*, 
        r.id_reserva, a.id_anfitrion, u.nombre AS anfitrion_nombre, u.apellido AS anfitrion_apellido, u.correo AS anfitrion_correo,
        ca.id_cancha, ca.nombre AS cancha_nombre
      FROM pago p
      JOIN reserva r ON p.id_reserva = r.id_reserva
      JOIN anfitrion a ON r.id_anfitrion = a.id_anfitrion
      JOIN cliente c ON a.id_anfitrion = c.id_cliente
      JOIN usuario u ON c.id_cliente = u.id_persona
      JOIN cancha ca ON r.id_cancha = ca.id_cancha
      WHERE p.id_pago = $1
    `;
    const result = await pool.query(query, [id]);
    return result.rows[0] || null;
  } catch (error) {
    throw error;
  }
};

/**
 * Crear nuevo pago
 */
const crearPago = async (datosPago) => {
  const client = await pool.connect();
  let qrGenerado = null;
  let mensajeExito = '';
  let saldoRestante = 0;

  try {
    await client.query('BEGIN');

    const { monto, metodo_pago, id_reserva, fecha_pago } = datosPago;

    if (!id_reserva || !monto || !metodo_pago) {
      throw new Error('Faltan campos obligatorios: monto, metodo_pago, id_reserva');
    }
    if (monto <= 0) throw new Error('El monto debe ser mayor a 0');
    
    const metodosValidos = ['tarjeta', 'efectivo', 'transferencia', 'QR'];
    if (!metodosValidos.includes(metodo_pago)) {
      throw new Error(`Método de pago inválido. Usa: ${metodosValidos.join(', ')}`);
    }

    // Validar reserva y bloquear
    const reservaRes = await client.query(
      `SELECT monto_total, monto_pagado, estado 
       FROM reserva 
       WHERE id_reserva = $1 FOR UPDATE`,
      [id_reserva]
    );

    if (!reservaRes.rows[0]) throw new Error('Reserva no encontrada');

    const reserva = reservaRes.rows[0];
    const saldoActual = parseFloat(reserva.monto_total) - parseFloat(reserva.monto_pagado || 0);
    
    if (monto > saldoActual) {
      throw new Error(`El monto (${monto}) excede el saldo pendiente (${saldoActual})`);
    }

    // Insertar pago
    const pagoRes = await client.query(
      `INSERT INTO pago (monto, metodo_pago, fecha_pago, id_reserva)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [monto, metodo_pago, fecha_pago || new Date(), id_reserva]
    );

    const nuevoPago = pagoRes.rows[0];
    const nuevoMontoPagado = parseFloat(reserva.monto_pagado || 0) + parseFloat(monto);
    
    saldoRestante = parseFloat(reserva.monto_total) - nuevoMontoPagado;

    // ✅ LÓGICA CORREGIDA PARA ESTADOS
    let nuevoEstado = reserva.estado;
    const pagoCompleto = saldoRestante <= 0;
    
    if (pagoCompleto) {
      nuevoEstado = 'pagada';
    } else if (nuevoMontoPagado > 0 && nuevoMontoPagado < parseFloat(reserva.monto_total)) {
      // Si hay pago pero no es el total → en_cuotas
      nuevoEstado = 'en_cuotas';
    }

    // Actualizar reserva
    await client.query(
      `UPDATE reserva 
       SET monto_pagado = $1, 
           estado = $2
       WHERE id_reserva = $3`,
      [nuevoMontoPagado, nuevoEstado, id_reserva]
    );

    // ✅ NUEVA LÓGICA: Generar QR si se pagó 50 o más
    const umbralMinimoQR = 50; // Define el umbral mínimo para generar QR

    // Verificar si el monto pagado alcanza el umbral mínimo
    const montoPagadoAlcanzaUmbral = nuevoMontoPagado >= umbralMinimoQR;

    // Verificar si ya existe un QR para esta reserva
    const qrExistente = await client.query(
      'SELECT id_qr_pago FROM qr_pago WHERE id_pago IN (SELECT id_pago FROM pago WHERE id_reserva = $1)',
      [id_reserva]
    );

    if (montoPagadoAlcanzaUmbral && !qrExistente.rows[0]) {
      // Generar QR si se alcanza el umbral y no existe uno previo
      qrGenerado = await generarQRParaPago(client, nuevoPago.id_pago, id_reserva);
      
      if (pagoCompleto) {
        mensajeExito = '✅ Pago completo realizado. Se generó el QR de reserva y el enlace para invitar jugadores.';
      } else {
        mensajeExito = `✅ Pago de $${monto.toFixed(2)} realizado. Se generó el QR de reserva (se pagó $${nuevoMontoPagado.toFixed(2)} de $${reserva.monto_total}). Saldo pendiente: $${saldoRestante.toFixed(2)}`;
      }
    } else if (qrExistente.rows[0]) {
      // Ya existe un QR para esta reserva
      if (pagoCompleto) {
        mensajeExito = '✅ Pago completo realizado. El QR de reserva ya estaba generado.';
      } else {
        mensajeExito = `✅ Pago adicional de $${monto.toFixed(2)} realizado. El QR de reserva ya estaba disponible. Saldo pendiente: $${saldoRestante.toFixed(2)}`;
      }
    } else {
      // No se alcanzó el umbral mínimo
      const faltaParaQR = umbralMinimoQR - nuevoMontoPagado;
      if (faltaParaQR > 0) {
        mensajeExito = `📋 Pago parcial de $${monto.toFixed(2)} realizado. Para generar el QR se necesita un pago mínimo de $${umbralMinimoQR} (faltan $${faltaParaQR.toFixed(2)}).`;
      } else {
        mensajeExito = `📋 Pago parcial de $${monto.toFixed(2)} realizado. Saldo pendiente: $${saldoRestante.toFixed(2)}`;
      }
    }

    await client.query('COMMIT');

    return {
      pago: nuevoPago,
      reserva_actualizada: { 
        id_reserva, 
        monto_pagado: nuevoMontoPagado, 
        estado: nuevoEstado, 
        saldo: saldoRestante 
      },
      qr: qrGenerado,
      mensaje: mensajeExito
    };

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Actualizar pago parcialmente
 */
const actualizarPago = async (id, campos) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const pagoActual = await client.query('SELECT * FROM pago WHERE id_pago = $1 FOR UPDATE', [id]);
    if (!pagoActual.rows[0]) throw new Error('Pago no encontrado');
    const pagoViejo = pagoActual.rows[0];

    const reservaRes = await client.query(
      'SELECT * FROM reserva WHERE id_reserva = $1 FOR UPDATE',
      [campos.id_reserva || pagoViejo.id_reserva]
    );
    if (!reservaRes.rows[0]) throw new Error('Reserva no encontrada');
    const reserva = reservaRes.rows[0];

    const nuevoMonto = campos.monto || pagoViejo.monto;
    const diferencia = parseFloat(nuevoMonto) - parseFloat(pagoViejo.monto);
    const saldoActual = parseFloat(reserva.monto_total) - parseFloat(reserva.monto_pagado || 0);

    if (diferencia > 0 && diferencia > saldoActual) {
      throw new Error('El aumento excede el saldo disponible');
    }

    // Actualizar pago
    const setClause = Object.keys(campos)
      .map((k, i) => `${k} = $${i + 1}`)
      .join(', ');
    const values = Object.values(campos);
    values.push(id);

    await client.query(`UPDATE pago SET ${setClause} WHERE id_pago = $${values.length}`, values);

    // ✅ LÓGICA CORREGIDA PARA ACTUALIZACIÓN
    const nuevoMontoPagado = parseFloat(reserva.monto_pagado || 0) + diferencia;
    const saldoRestante = parseFloat(reserva.monto_total) - nuevoMontoPagado;
    
    let nuevoEstado = reserva.estado;
    if (saldoRestante <= 0) {
      nuevoEstado = 'pagada';
    } else if (nuevoMontoPagado > 0 && nuevoMontoPagado < parseFloat(reserva.monto_total)) {
      nuevoEstado = 'en_cuotas';
    } else if (nuevoMontoPagado === 0) {
      nuevoEstado = 'pendiente';
    }


    
    await client.query(
      `UPDATE reserva SET monto_pagado = $1, estado = $2 WHERE id_reserva = $3`,
      [nuevoMontoPagado, nuevoEstado, reserva.id_reserva]
    );

    await client.query('COMMIT');
    return await obtenerPagoPorId(id);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Eliminar pago y recalcular reserva
 */
const eliminarPago = async (id) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    // 1. Obtener el pago a eliminar con bloqueo
    const pagoRes = await client.query(
      `SELECT * FROM pago WHERE id_pago = $1 FOR UPDATE`,
      [id]
    );
    
    if (!pagoRes.rows[0]) {
      throw new Error('Pago no encontrado');
    }

    const pago = pagoRes.rows[0];
    const montoEliminado = parseFloat(pago.monto);

    // 2. Obtener la reserva asociada con bloqueo
    const reservaRes = await client.query(
      `SELECT * FROM reserva WHERE id_reserva = $1 FOR UPDATE`,
      [pago.id_reserva]
    );
    
    if (!reservaRes.rows[0]) {
      throw new Error('Reserva no encontrada');
    }

    const reserva = reservaRes.rows[0];
    const montoTotal = parseFloat(reserva.monto_total);
    const montoPagadoActual = parseFloat(reserva.monto_pagado || 0);

    // 3. Calcular nuevo monto pagado
    const nuevoMontoPagado = montoPagadoActual - montoEliminado;
    
    // Validar que no sea negativo
    if (nuevoMontoPagado < 0) {
      throw new Error('Error en cálculo: el monto pagado no puede ser negativo');
    }

    // 4. Determinar nuevo estado de la reserva
    let nuevoEstado = reserva.estado;
    const saldoRestante = montoTotal - nuevoMontoPagado;

    // Si después de eliminar el pago, el saldo restante es mayor a 0
    // y el estado actual es 'pagada', cambiar a 'pendiente' o 'en_cuotas'
    if (saldoRestante > 0) {
      if (reserva.estado === 'pagada') {
        // Decidir si es 'pendiente' o 'en_cuotas' basado en si había pagos anteriores
        nuevoEstado = nuevoMontoPagado > 0 ? 'en_cuotas' : 'pendiente';
      }
      // Si ya estaba en 'pendiente' o 'en_cuotas', mantener ese estado
    } else {
      // Si después de eliminar sigue estando pagada completamente (caso raro pero posible)
      nuevoEstado = 'pagada';
    }

    // 5. Eliminar QR asociado si existe
    await client.query(
      `DELETE FROM qr_pago WHERE id_pago = $1`,
      [id]
    );

    // 6. Eliminar el pago
    await client.query(
      `DELETE FROM pago WHERE id_pago = $1`,
      [id]
    );

    // 7. Actualizar la reserva con nuevos cálculos
    await client.query(
      `UPDATE reserva 
       SET monto_pagado = $1, 
           estado = $2
       WHERE id_reserva = $3`,
      [nuevoMontoPagado, nuevoEstado, reserva.id_reserva]
    );

    await client.query('COMMIT');

    return {
      id_pago_eliminado: id,
      reserva_actualizada: {
        id_reserva: reserva.id_reserva,
        monto_pagado: nuevoMontoPagado,
        estado: nuevoEstado,
        saldo: saldoRestante
      },
      monto_eliminado: montoEliminado
    };

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Obtener todos los pagos asociados a las reservas del cliente (como anfitrión)
 */
const obtenerPagosPorCliente = async (id_cliente, limite = 10, offset = 0) => {
  try {
    const queryDatos = `
      SELECT 
        p.id_pago, p.monto, p.metodo_pago, p.fecha_pago,
        r.id_reserva, r.fecha_reserva, r.estado AS reserva_estado, r.monto_total, r.saldo,
        ca.id_cancha, ca.nombre AS cancha_nombre,
        a.id_anfitrion, u.nombre AS anfitrion_nombre, u.apellido AS anfitrion_apellido
      FROM pago p
      JOIN reserva r ON p.id_reserva = r.id_reserva
      JOIN anfitrion a ON r.id_anfitrion = a.id_anfitrion
      JOIN cliente c ON a.id_anfitrion = c.id_cliente
      JOIN usuario u ON c.id_cliente = u.id_persona
      JOIN cancha ca ON r.id_cancha = ca.id_cancha
      WHERE c.id_cliente = $1
      ORDER BY p.fecha_pago DESC
      LIMIT $2 OFFSET $3
    `;
    const queryTotal = `
      SELECT COUNT(*) 
      FROM pago p
      JOIN reserva r ON p.id_reserva = r.id_reserva
      JOIN anfitrion a ON r.id_anfitrion = a.id_anfitrion
      WHERE a.id_anfitrion = $1
    `;
    const [resultDatos, resultTotal] = await Promise.all([
      pool.query(queryDatos, [id_cliente, limite, offset]),
      pool.query(queryTotal, [id_cliente])
    ]);
    return {
      pagos: resultDatos.rows,
      total: parseInt(resultTotal.rows[0].count)
    };
  } catch (error) {
    console.error('Error en obtenerPagosPorCliente:', error);
    throw error;
  }
};

/**
 * Obtener todos los QR de pago generados por un control específico
 */
const obtenerQrPagosPorControl = async (id_control, limite = 10, offset = 0) => {
  try {
    const queryDatos = `
      SELECT 
        qr.id_qr_pago, qr.codigo_qr, qr.estado AS qr_estado, qr.fecha_generado, qr.fecha_expira,
        qr.qr_reserva, qr.qr_invitacion, qr.link_invitacion,
        p.id_pago, p.monto, p.metodo_pago, p.fecha_pago,
        r.id_reserva, r.fecha_reserva, r.estado AS reserva_estado,
        ca.id_cancha, ca.nombre AS cancha_nombre
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









// =======================================

// CONTROLADORES

const obtenerDatosEspecificosController = async (req, res) => {
  try {
    const limite = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;
    const { pagos, total } = await obtenerDatosEspecificos(limite, offset);
    res.json(respuesta(true, 'Pagos obtenidos correctamente', { pagos, paginacion: { limite, offset, total } }));
  } catch (error) {
    res.status(500).json(respuesta(false, error.message));
  }
};

const obtenerPagosFiltradosController = async (req, res) => {
  try {
    const { tipo } = req.query;
    const limite = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;
    const tiposValidos = ['fecha', 'monto', 'metodo', 'anfitrion'];
    if (!tipo || !tiposValidos.includes(tipo)) {
      return res.status(400).json(respuesta(false, 'El parámetro "tipo" es inválido'));
    }
    const { pagos, total } = await obtenerPagosFiltrados(tipo, limite, offset);
    res.json(respuesta(true, `Pagos filtrados por ${tipo}`, { pagos, filtro: tipo, paginacion: { limite, offset, total } }));
  } catch (error) {
    res.status(500).json(respuesta(false, error.message));
  }
};

const buscarPagosController = async (req, res) => {
  try {
    const { q } = req.query;
    const limite = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;
    if (!q) return res.status(400).json(respuesta(false, 'Parámetro "q" requerido'));
    const { pagos, total } = await buscarPagos(q, limite, offset);
    res.json(respuesta(true, 'Búsqueda completada', { pagos, paginacion: { limite, offset, total } }));
  } catch (error) {
    res.status(500).json(respuesta(false, error.message));
  }
};

const obtenerPagoPorIdController = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || isNaN(id)) return res.status(400).json(respuesta(false, 'ID inválido'));
    const pago = await obtenerPagoPorId(parseInt(id));
    if (!pago) return res.status(404).json(respuesta(false, 'Pago no encontrado'));
    res.json(respuesta(true, 'Pago obtenido', { pago }));
  } catch (error) {
    res.status(500).json(respuesta(false, error.message));
  }
};

const crearPagoController = async (req, res) => {
  try {
    const datos = req.body;
    const resultado = await crearPago(datos);

    const { pago, qr, mensaje } = resultado;

    if (qr) {
      res.status(201).json(respuesta(
        true,
        mensaje,
        { pago, qr }
      ));
    } else {
      res.status(201).json(respuesta(
        true,
        mensaje,
        { pago }
      ));
    }
  } catch (error) {
    res.status(400).json(respuesta(false, error.message));
  }
};

const actualizarPagoController = async (req, res) => {
  try {
    const { id } = req.params;
    const campos = req.body;
    if (Object.keys(campos).length === 0) return res.status(400).json(respuesta(false, 'No hay campos'));
    const actualizado = await actualizarPago(parseInt(id), campos);
    res.json(respuesta(true, 'Pago actualizado', { pago: actualizado }));
  } catch (error) {
    res.status(500).json(respuesta(false, error.message));
  }
};

/**
 * Controlador para eliminar pago
 */
const eliminarPagoController = async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { id } = req.params;
    
    if (!id || isNaN(id)) {
      return res.status(400).json(respuesta(false, 'ID de pago inválido'));
    }

    const resultado = await eliminarPago(parseInt(id));
    
    if (!resultado) {
      return res.status(404).json(respuesta(false, 'Pago no encontrado'));
    }

    res.json(respuesta(
      true, 
      'Pago eliminado y reserva recalculada correctamente', 
      resultado
    ));

  } catch (error) {
    console.error('Error al eliminar pago:', error);
    res.status(500).json(respuesta(false, error.message));
  } finally {
    client.release();
  }
};

const obtenerReservasPendientesController = async (req, res) => {
  try {
    const limite = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    const reservas = await obtenerReservasPendientes(limite, offset);
    res.json(respuesta(true, 'Reservas pendientes obtenidas', { reservas }));
  } catch (error) {
    res.status(500).json(respuesta(false, error.message));
  }
};

const obtenerPagosClienteController = async (req, res) => {
  try {
    const { id_cliente } = req.params;
    if (!id_cliente || isNaN(id_cliente)) {
      return res.status(400).json(respuesta(false, 'ID de cliente inválido'));
    }
    const limite = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;
    const { pagos, total } = await obtenerPagosPorCliente(parseInt(id_cliente), limite, offset);
    res.json(respuesta(true, 'Pagos del cliente obtenidos correctamente', {
      pagos,
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
    res.json(respuesta(true, 'QR de pagos del control obtenidos', {
      qr_pagos,
      paginacion: { limite, offset, total }
    }));
  } catch (error) {
    res.status(500).json(respuesta(false, error.message));
  }
};






// RUTAS
router.get('/datos-especificos', obtenerDatosEspecificosController);
router.get('/filtro', obtenerPagosFiltradosController);
router.get('/buscar', buscarPagosController);
router.get('/dato-individual/:id', obtenerPagoPorIdController);
router.get('/reservas-pendientes', obtenerReservasPendientesController);

router.post('/', crearPagoController);
router.patch('/:id', actualizarPagoController);
router.delete('/:id', eliminarPagoController);

router.get('/datos-segun-rol/:id_cliente', obtenerPagosClienteController);
router.get('/control-pago/:id_control', obtenerQrPagosControlController);

module.exports = router;