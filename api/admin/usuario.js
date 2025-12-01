const express = require('express');
const pool = require('../../config/database');
const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs').promises;
const { unlinkFile, createUploadAndProcess } = require('../../middleware/multer');
require('dotenv').config();

const router = express.Router();

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,        // smtp-mail.outlook.com
  port: parseInt(process.env.EMAIL_PORT), // 587
  secure: false,                       // true solo para puerto 465
  auth: {
    user: process.env.EMAIL_USER,      // grupoCancha@hotmail.com
    pass: process.env.EMAIL_PASS,      // ingenieria_sistemas
  },
  tls: {
    ciphers: 'SSLv3'
  }
});

// Función de respuesta estandarizada
const respuesta = (exito, mensaje, datos = null) => ({
  exito,
  mensaje,
  datos,
});

// Función para enviar correo
const enviarCorreo = async (to, subject, html) => {
  try {
    await transporter.sendMail({
      from: `"Sistema de Gestión" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
    });
    console.log('Correo enviado a:', to);
  } catch (error) {
    console.error('Error al enviar correo:', error);
    throw new Error('No se pudo enviar el correo de notificación');
  }
};

// Lista de roles disponibles (estática)
const obtenerRolesDisponibles = () => {
  return [
    { valor: 'cliente', etiqueta: 'Cliente' },
    { valor: 'administrador', etiqueta: 'Administrador' },
    { valor: 'admin_esp_dep', etiqueta: 'Administrado Espacio Deportivo' },
    { valor: 'deportista', etiqueta: 'Deportista' },
    { valor: 'control', etiqueta: 'Control' },
    { valor: 'encargado', etiqueta: 'Encargado' },
  ];
};

// --- Modelos y funciones existentes ---
const obtenerValoresEnum = async (tipoEnum) => {
  try {
    const query = `
      SELECT unnest(enum_range(NULL::${tipoEnum})) as valor;
    `;
    const result = await pool.query(query);
    return result.rows.map(row => row.valor);
  } catch (error) {
    console.error('Error al obtener valores del enum:', error.message);
    throw error;
  }
};

const obtenerDatosEspecificos = async (limite = 10, offset = 0) => {
  try {
    const queryDatos = `
      SELECT id_persona, nombre, apellido, correo, usuario, solicitud
      FROM usuario 
      ORDER BY 
        CASE 
          WHEN solicitud IS NOT NULL AND array_length(solicitud, 1) > 0 THEN 0
          ELSE 1
        END,
        id_persona DESC
      LIMIT $1 OFFSET $2
    `;
    const queryTotal = `SELECT COUNT(*) FROM usuario`;
    const [resultDatos, resultTotal] = await Promise.all([
      pool.query(queryDatos, [limite, offset]),
      pool.query(queryTotal),
    ]);
    return {
      usuarios: resultDatos.rows,
      total: parseInt(resultTotal.rows[0].count),
    };
  } catch (error) {
    console.error('Error in obtenerDatosEspecificos:', error);
    throw error;
  }
};

const obtenerUsuariosFiltrados = async (tipoFiltro, limite = 10, offset = 0) => {
  try {
    const ordenesPermitidas = {
      nombre: 'nombre ASC, apellido ASC',
      fecha: 'fecha_creacion DESC',
      correo: 'correo ASC',
      default: 'id_persona ASC',
    };
    const orden = ordenesPermitidas[tipoFiltro] || ordenesPermitidas.default;
    const queryDatos = `
      SELECT id_persona, nombre, apellido, correo, usuario
      FROM usuario 
      ORDER BY ${orden}
      LIMIT $1 OFFSET $2
    `;
    const queryTotal = `SELECT COUNT(*) FROM usuario`;
    const [resultDatos, resultTotal] = await Promise.all([
      pool.query(queryDatos, [limite, offset]),
      pool.query(queryTotal),
    ]);
    return {
      usuarios: resultDatos.rows,
      total: parseInt(resultTotal.rows[0].count),
    };
  } catch (error) {
    console.error('Error in obtenerUsuariosFiltrados:', error);
    throw new Error(`Error al obtener usuarios filtrados: ${error.message}`);
  }
};

const buscarUsuarios = async (texto, limite = 10, offset = 0) => {
  try {
    const queryDatos = `
      SELECT id_persona, nombre, apellido, correo, usuario
      FROM usuario 
      WHERE 
        nombre ILIKE $1 OR 
        apellido ILIKE $1 OR 
        correo ILIKE $1 OR 
        usuario ILIKE $1 OR
        telefono ILIKE $1
      ORDER BY nombre, apellido
      LIMIT $2 OFFSET $3
    `;
    const queryTotal = `
      SELECT COUNT(*) 
      FROM usuario 
      WHERE 
        nombre ILIKE $1 OR 
        apellido ILIKE $1 OR 
        correo ILIKE $1 OR 
        usuario ILIKE $1 OR
        telefono ILIKE $1
    `;
    const sanitizeInput = (input) => input.replace(/[%_\\]/g, '\\$&');
    const terminoBusqueda = `%${sanitizeInput(texto)}%`;
    const [resultDatos, resultTotal] = await Promise.all([
      pool.query(queryDatos, [terminoBusqueda, limite, offset]),
      pool.query(queryTotal, [terminoBusqueda]),
    ]);
    return {
      usuarios: resultDatos.rows,
      total: parseInt(resultTotal.rows[0].count),
    };
  } catch (error) {
    console.error('Error in buscarUsuarios:', error);
    throw error;
  }
};

const obtenerUsuarioPorId = async (id) => {
  try {
    const query = `
      SELECT id_persona, nombre, apellido, correo, usuario, telefono, 
             sexo, imagen_perfil, latitud, longitud, fecha_creacion, solicitud
      FROM usuario 
      WHERE id_persona = $1
    `;
    const result = await pool.query(query, [id]);
    if (!result.rows[0]) return null;
    const rolesUsuario = await obtenerRolesUsuario(id);
    const rolesDisponibles = obtenerRolesDisponibles();
    return {
      ...result.rows[0],
      roles: rolesUsuario,
      roles_disponibles: rolesDisponibles,
    };
  } catch (error) {
    console.error('Error in obtenerUsuarioPorId:', error);
    throw error;
  }
};

const obtenerRolesUsuario = async (idUsuario) => {
  try {
    const tablasRoles = [
      { tabla: 'cliente', rol: 'cliente' },
      { tabla: 'administrador', rol: 'administrador' },
      { tabla: 'admin_esp_dep', rol: 'admin_esp_dep' },
      { tabla: 'invitado', rol: 'invitado' },
      { tabla: 'control', rol: 'control' }
    ];
    const roles = [];
    for (const { tabla, rol } of tablasRoles) {
      const query = `SELECT * FROM ${tabla} WHERE id_${tabla} = $1`;
      const result = await pool.query(query, [idUsuario]);
      if (result.rows.length > 0) {
        roles.push({
          rol,
          datos: result.rows[0],
          tabla: tabla,
        });
      }
    }
    return roles;
  } catch (error) {
    console.error('Error in obtenerRolesUsuario:', error);
    throw error;
  }
};

const crearUsuario = async (datosUsuario) => {
  try {
    const LAT_MIN = -16.65;
    const LAT_MAX = -16.45;
    const LON_MIN = -68.25;
    const LON_MAX = -68.05;
    let { latitud, longitud } = datosUsuario;
    if (latitud !== undefined && longitud !== undefined) {
      const dentroDeLaPaz =
        latitud >= LAT_MIN && latitud <= LAT_MAX &&
        longitud >= LON_MIN && longitud <= LON_MAX;
      if (!dentroDeLaPaz) {
        throw new Error('Las coordenadas deben estar dentro del área de La Paz, Bolivia');
      }
    } else {
      const randomInRange = (min, max) => Math.random() * (max - min) + min;
      latitud = parseFloat(randomInRange(LAT_MIN, LAT_MAX).toFixed(6));
      longitud = parseFloat(randomInRange(LON_MIN, LON_MAX).toFixed(6));
    }
    const validarCorreo = (correo) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo);
    const validarTelefono = (telefono) => /^\+?\d{8,15}$/.test(telefono);
    if (!validarCorreo(datosUsuario.correo)) {
      throw new Error('El correo electrónico no es válido');
    }
    if (datosUsuario.telefono && !validarTelefono(datosUsuario.telefono)) {
      throw new Error('El número de teléfono no es válido');
    }
    if (datosUsuario.sexo) {
      const sexosPermitidos = await obtenerValoresEnum('sexo_enum');
      if (!sexosPermitidos.includes(datosUsuario.sexo)) {
        throw new Error(`El valor para sexo no es válido. Valores permitidos: ${sexosPermitidos.join(', ')}`);
      }
    }
    let rolAAgregar = datosUsuario.rol || datosUsuario.rol_agregar;
    let rolAsignado = null;
    if (rolAAgregar) {
      const rolesDisponibles = obtenerRolesDisponibles().map(r => r.valor);
      if (!rolesDisponibles.includes(rolAAgregar)) {
        throw new Error(`El rol ${rolAAgregar} no es válido`);
      }
    }
    const contrasenaHash = await bcrypt.hash(datosUsuario.contrasena || '123456', 10);
    const queryUsuario = `
      INSERT INTO usuario (
        nombre, apellido, contrasena, telefono, correo, 
        sexo, imagen_perfil, usuario, latitud, longitud
      ) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id_persona
    `;
    const valuesUsuario = [
      datosUsuario.nombre || null,
      datosUsuario.apellido || null,
      contrasenaHash,
      datosUsuario.telefono || null,
      datosUsuario.correo,
      datosUsuario.sexo || null,
      datosUsuario.imagen_perfil || null,
      datosUsuario.usuario,
      latitud,
      longitud,
    ];
    const resultUsuario = await pool.query(queryUsuario, valuesUsuario);
    const idUsuario = resultUsuario.rows[0].id_persona;
    if (rolAAgregar) {
      rolAsignado = await asignarRolUsuario(idUsuario, rolAAgregar, datosUsuario.datos_especificos || {});
    }
    const usuarioCompleto = await obtenerUsuarioPorId(idUsuario);
    return { ...usuarioCompleto, rol_asignado: rolAsignado };
  } catch (error) {
    console.error('Error in crearUsuario:', error);
    throw new Error(error.message);
  }
};

const actualizarUsuario = async (id, camposActualizar) => {
  try {
    const camposPermitidosUsuario = [
      'nombre', 'apellido', 'telefono', 'sexo', 'correo',
      'imagen_perfil', 'latitud', 'longitud',
    ];
    const camposUsuario = {};
    const datosEspecificos = camposActualizar.datos_especificos || {};
    let rolAAgregar = camposActualizar.rol_agregar;
    let rolAEliminar = camposActualizar.rol_eliminar;
    camposPermitidosUsuario.forEach((key) => {
      if (key in camposActualizar) {
        camposUsuario[key] = camposActualizar[key] || null;
      }
    });
    if (camposUsuario.sexo) {
      const sexosPermitidos = await obtenerValoresEnum('sexo_enum');
      if (!sexosPermitidos.includes(camposUsuario.sexo)) {
        throw new Error(`El valor para sexo no es válido. Valores permitidos: ${sexosPermitidos.join(', ')}`);
      }
    }
    if (camposUsuario.correo) {
      const validarCorreo = (correo) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo);
      if (!validarCorreo(camposUsuario.correo)) {
        throw new Error('El correo electrónico no es válido');
      }
    }
    if (camposUsuario.telefono) {
      const validarTelefono = (telefono) => /^\+?\d{8,15}$/.test(telefono);
      if (!validarTelefono(camposUsuario.telefono)) {
        throw new Error('El número de teléfono no es válido');
      }
    }
    if (camposUsuario.latitud !== undefined && camposUsuario.longitud !== undefined) {
      const LAT_MIN = -16.65;
      const LAT_MAX = -16.45;
      const LON_MIN = -68.25;
      const LON_MAX = -68.05;
      const dentroDeLaPaz =
        camposUsuario.latitud >= LAT_MIN && camposUsuario.latitud <= LAT_MAX &&
        camposUsuario.longitud >= LON_MIN && camposUsuario.longitud <= LON_MAX;
      if (!dentroDeLaPaz) {
        throw new Error('Las coordenadas deben estar dentro del área de La Paz, Bolivia');
      }
    }
    let usuarioActualizado = null;
    if (Object.keys(camposUsuario).length > 0) {
      const setClause = Object.keys(camposUsuario).map((campo, index) => `${campo} = $${index + 2}`).join(', ');
      const values = [id, ...Object.values(camposUsuario)];
      const query = `
        UPDATE usuario 
        SET ${setClause}
        WHERE id_persona = $1
        RETURNING id_persona, nombre, apellido, correo, usuario, telefono, sexo, fecha_creacion, imagen_perfil, latitud, longitud
      `;
      const result = await pool.query(query, values);
      usuarioActualizado = result.rows[0] || null;
    }
    let rolAgregado = null;
    let rolEliminado = null;
    if (rolAAgregar) {
      const rolesDisponibles = obtenerRolesDisponibles().map(r => r.valor);
      if (!rolesDisponibles.includes(rolAAgregar)) {
        throw new Error(`El rol ${rolAAgregar} no es válido`);
      }
      rolAgregado = await agregarRolUsuario(id, rolAAgregar, datosEspecificos);
    }
    if (rolAEliminar) {
      rolEliminado = await removerRolUsuario(id, rolAEliminar);
    }
    const usuarioCompleto = await obtenerUsuarioPorId(id);
    return {
      ...usuarioCompleto,
      rol_agregado: rolAgregado,
      rol_eliminado: rolEliminado,
    };
  } catch (error) {
    console.error('Error in actualizarUsuario:', error);
    throw error;
  }
};

const eliminarUsuario = async (id) => {
  try {
    const query = 'DELETE FROM usuario WHERE id_persona = $1 RETURNING id_persona';
    const result = await pool.query(query, [id]);
    return result.rows[0] || null;
  } catch (error) {
    console.error('Error in eliminarUsuario:', error);
    throw error;
  }
};

const agregarRolUsuario = async (idUsuario, rol, datosEspecificos = {}) => {
  try {
    const rolesExistentes = await obtenerRolesUsuario(idUsuario);
    const yaTieneRol = rolesExistentes.some(r => r.rol === rol);
    if (yaTieneRol) {
      throw new Error(`El usuario ya tiene el rol: ${rol}`);
    }
    return await asignarRolUsuario(idUsuario, rol, datosEspecificos);
  } catch (error) {
    console.error('Error in agregarRolUsuario:', error);
    throw error;
  }
};

const removerRolUsuario = async (idUsuario, rol) => {
  try {
    const tablasMap = {
      'cliente': 'cliente',
      'administrador': 'administrador',
      'admin_esp_dep': 'admin_esp_dep',
      'deportista': 'deportista',
      'control': 'control',
      'encargado': 'encargado',
    };
    const tabla = tablasMap[rol];
    if (!tabla) {
      throw new Error(`Rol no válido: ${rol}`);
    }
    const query = `DELETE FROM ${tabla} WHERE id_${tabla} = $1 RETURNING *`;
    const result = await pool.query(query, [idUsuario]);
    return result.rows[0] || null;
  } catch (error) {
    console.error('Error in removerRolUsuario:', error);
    throw error;
  }
};

const asignarRolUsuario = async (idUsuario, rol, datosEspecificos = {}) => {
  try {
    switch (rol) {
      case 'cliente':
        return await asignarRolCliente(idUsuario, datosEspecificos);
      case 'administrador':
        return await asignarRolAdministrador(idUsuario, datosEspecificos);
      case 'admin_esp_dep':
        return await asignarRolAdminEspDep(idUsuario, datosEspecificos);
      case 'deportista':
        return await asignarRolDeportista(idUsuario, datosEspecificos);
      case 'control':
        return await asignarRolControl(idUsuario, datosEspecificos);
      case 'encargado':
        return await asignarRolEncargado(idUsuario, datosEspecificos);
      default:
        throw new Error('Rol no válido');
    }
  } catch (error) {
    console.error('Error in asignarRolUsuario:', error);
    throw error;
  }
};

const removerRolesUsuario = async (idUsuario) => {
  try {
    const tablasRoles = [
      'cliente', 'administrador', 'admin_esp_dep',
      'deportista', 'control', 'encargado',
    ];
    for (const tabla of tablasRoles) {
      await pool.query(`DELETE FROM ${tabla} WHERE id_${tabla} = $1`, [idUsuario]);
    }
  } catch (error) {
    console.error('Error in removerRolesUsuario:', error);
    throw error;
  }
};

const asignarRolCliente = async (idUsuario, datos) => {
  const query = `
    INSERT INTO cliente (id_cliente, fecha_registro, fecha_nac, carnet_identidad, ci_complemento)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *
  `;
  const values = [
    idUsuario,
    datos.fecha_registro || new Date(),
    datos.fecha_nac || null,
    datos.carnet_identidad || null,
    datos.ci_complemento || null,
  ];
  const result = await pool.query(query, values);
  return result.rows[0];
};

const asignarRolAdministrador = async (idUsuario, datos) => {
  const query = `
    INSERT INTO administrador (id_administrador, direccion, estado, ultimo_login)
    VALUES ($1, $2, $3, $4)
    RETURNING *
  `;
  const values = [
    idUsuario,
    datos.direccion || null,
    datos.estado !== undefined ? datos.estado : true,
    datos.ultimo_login || null,
  ];
  const result = await pool.query(query, values);
  return result.rows[0];
};

const asignarRolAdminEspDep = async (idUsuario, datos) => {
  const query = `
    INSERT INTO admin_esp_dep (id_admin_esp_dep, fecha_ingreso, direccion, estado)
    VALUES ($1, $2, $3, $4)
    RETURNING *
  `;
  const values = [
    idUsuario,
    datos.fecha_ingreso || new Date(),
    datos.direccion || null,
    datos.estado !== undefined ? datos.estado : true,
  ];
  const result = await pool.query(query, values);
  return result.rows[0];
};

const asignarRolDeportista = async (idUsuario, datos) => {
  const query = `
    INSERT INTO deportista (id_deportista, disciplina_principal)
    VALUES ($1, $2)
    RETURNING *
  `;
  const values = [
    idUsuario,
    datos.disciplina_principal || null,
  ];
  const result = await pool.query(query, values);
  return result.rows[0];
};

const asignarRolControl = async (idUsuario, datos) => {
  const query = `
    INSERT INTO control (id_control, fecha_asignacion, estado)
    VALUES ($1, $2, $3)
    RETURNING *
  `;
  const values = [
    idUsuario,
    datos.fecha_asignacion || new Date(),
    datos.estado !== undefined ? datos.estado : true,
  ];
  const result = await pool.query(query, values);
  return result.rows[0];
};

const asignarRolEncargado = async (idUsuario, datos) => {
  const query = `
    INSERT INTO encargado (id_encargado, responsabilidad, fecha_inicio, hora_ingreso, hora_salida, estado)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *
  `;
  const values = [
    idUsuario,
    datos.responsabilidad || null,
    datos.fecha_inicio || new Date(),
    datos.hora_ingreso || null,
    datos.hora_salida || null,
    datos.estado !== undefined ? datos.estado : true,
  ];
  const result = await pool.query(query, values);
  return result.rows[0];
};

// --- Nuevos Controladores ---

/**
 * Controlador para DELETE /cancelarSolicitud/:id
 */
const cancelarSolicitudController = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || isNaN(id)) {
      return res.status(400).json(respuesta(false, 'ID de usuario no válido'));
    }
    const usuario = await obtenerUsuarioPorId(parseInt(id));
    if (!usuario) {
      return res.status(404).json(respuesta(false, 'Usuario no encontrado'));
    }
    if (!usuario.solicitud || usuario.solicitud.length === 0) {
      return res.status(400).json(respuesta(false, 'No hay solicitud pendiente para este usuario'));
    }
    const rolSolicitado = usuario.solicitud[0];
    const rolEtiqueta = obtenerRolesDisponibles().find(r => r.valor === rolSolicitado)?.etiqueta || rolSolicitado;
    const htmlContent = `
      <h2>Solicitud de Rol Denegada</h2>
      <p>Estimado/a ${usuario.nombre} ${usuario.apellido},</p>
      <p>Lamentamos informarle que su solicitud para el rol <strong>${rolEtiqueta}</strong> ha sido denegada.</p>
      <p>Si tiene alguna duda, por favor contáctenos.</p>
      <p>Atentamente,<br>Equipo de Gestión</p>
    `;
    await enviarCorreo(usuario.correo, 'Solicitud de Rol Denegada', htmlContent);
    const query = `
      UPDATE usuario 
      SET solicitud = NULL
      WHERE id_persona = $1
      RETURNING *
    `;
    const result = await pool.query(query, [id]);
    if (!result.rows[0]) {
      return res.status(500).json(respuesta(false, 'Error al actualizar la solicitud'));
    }
    res.json(respuesta(true, 'Solicitud cancelada y correo enviado correctamente'));
  } catch (error) {
    console.error('Error in cancelarSolicitudController:', error);
    // ✅ CORREGIDO: Manejar error de correo sin fallar
    const query = `
      UPDATE usuario 
      SET solicitud = NULL
      WHERE id_persona = $1
      RETURNING *
    `;
    await pool.query(query, [req.params.id]); // Limpiar solicitud aunque falle correo
    
    res.json(respuesta(true, 'Solicitud cancelada correctamente (correo falló)'));
  }
};

/**
 * Controlador para PATCH /aceptarSolicitud/:id
 */
// En tu archivo de rutas (usuario.js)
const aceptarSolicitudController = async (req, res) => {
  try {
    const { id } = req.params;
    const { espaciosSeleccionados = [] } = req.body; // <-- NUEVO: recibir del frontend

    if (!id || isNaN(id)) {
      return res.status(400).json(respuesta(false, 'ID de usuario no válido'));
    }

    const usuario = await obtenerUsuarioPorId(parseInt(id));
    if (!usuario) {
      return res.status(404).json(respuesta(false, 'Usuario no encontrado'));
    }

    if (!usuario.solicitud || usuario.solicitud.length === 0) {
      return res.status(400).json(respuesta(false, 'No hay solicitud pendiente para este usuario'));
    }

    const rolSolicitado = usuario.solicitud[0];
    const rolesDisponibles = obtenerRolesDisponibles().map(r => r.valor);
    if (!rolesDisponibles.includes(rolSolicitado)) {
      return res.status(400).json(respuesta(false, `El rol solicitado ${rolSolicitado} no es válido`));
    }

    // Si no se enviaron espacios seleccionados, usar todos los de la solicitud
    let espacios = [];
    if (espaciosSeleccionados.length > 0) {
      espacios = espaciosSeleccionados;
    } else {
      // Fallback: usar los de la solicitud original
      espacios = usuario.solicitud.slice(1).map(item => {
        try {
          return JSON.parse(item);
        } catch {
          return null;
        }
      }).filter(Boolean);
    }

    await pool.query('BEGIN');
    try {
      // Asignar rol
      await agregarRolUsuario(id, rolSolicitado, {});

      const nombresEspacios = [];

      if (rolSolicitado === 'admin_esp_dep' && espacios.length > 0) {
        for (const espacio of espacios) {
          const { id: idEspacio, nombre } = espacio;
          const queryEspacio = `
            UPDATE espacio_deportivo 
            SET id_admin_esp_dep = $1
            WHERE id_espacio = $2
            RETURNING nombre
          `;
          const resultEspacio = await pool.query(queryEspacio, [id, idEspacio]);
          if (resultEspacio.rows[0]) {
            nombresEspacios.push(resultEspacio.rows[0].nombre);
          } else {
            throw new Error(`Espacio deportivo con ID ${idEspacio} no encontrado`);
          }
        }
      }

      // Limpiar solicitud
      const query = `
        UPDATE usuario 
        SET solicitud = NULL
        WHERE id_persona = $1
        RETURNING *
      `;
      await pool.query(query, [id]);

      // Enviar correo
      const rolEtiqueta = obtenerRolesDisponibles().find(r => r.valor === rolSolicitado)?.etiqueta || rolSolicitado;
      const espaciosList = nombresEspacios.length > 0
        ? `<ul>${nombresEspacios.map(nombre => `<li>${nombre}</li>`).join('')}</ul>`
        : '<p>No se asignaron espacios deportivos.</p>';

      const htmlContent = `
        <h2>Solicitud de Rol Aprobada</h2>
        <p>Estimado/a ${usuario.nombre} ${usuario.apellido},</p>
        <p>Nos complace informarle que su solicitud para el rol <strong>${rolEtiqueta}</strong> ha sido aprobada.</p>
        ${rolSolicitado === 'admin_esp_dep' ? `<p>Espacios deportivos asignados:</p>${espaciosList}` : ''}
        <p>Atentamente,<br>Equipo de Gestión</p>
      `;
      await enviarCorreo(usuario.correo, 'Solicitud de Rol Aprobada', htmlContent);

      await pool.query('COMMIT');
      const usuarioActualizado = await obtenerUsuarioPorId(id);
      res.json(respuesta(true, 'Solicitud aceptada, rol asignado y correo enviado correctamente', { usuario: usuarioActualizado }));
    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    console.error('Error in aceptarSolicitudController:', error);
    res.status(500).json(respuesta(false, error.message));
  }
};

// --- Controladores existentes ---
const obtenerDatosEspecificosController = async (req, res) => {
  try {
    const limite = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;
    const { usuarios, total } = await obtenerDatosEspecificos(limite, offset);
    res.json(respuesta(true, 'Datos específicos obtenidos correctamente', {
      usuarios,
      paginacion: { limite, offset, total },
    }));
  } catch (error) {
    console.error('Error in obtenerDatosEspecificosController:', error);
    res.status(500).json(respuesta(false, error.message));
  }
};

const obtenerUsuariosFiltradosController = async (req, res) => {
  try {
    const { tipo } = req.query;
    const limite = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;
    const tiposValidos = ['nombre', 'fecha', 'correo'];
    if (!tipo || !tiposValidos.includes(tipo)) {
      return res.status(400).json(respuesta(false, 'El parámetro "tipo" es inválido o no proporcionado'));
    }
    const { usuarios, total } = await obtenerUsuariosFiltrados(tipo, limite, offset);
    res.json(respuesta(true, `Usuarios filtrados por ${tipo} obtenidos correctamente`, {
      usuarios,
      filtro: tipo,
      paginacion: { limite, offset, total },
    }));
  } catch (error) {
    console.error('Error in obtenerUsuariosFiltradosController:', error);
    res.status(500).json(respuesta(false, error.message));
  }
};

const buscarUsuariosController = async (req, res) => {
  try {
    const { q } = req.query;
    const limite = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;
    if (!q) {
      return res.status(400).json(respuesta(false, 'El parámetro de búsqueda "q" es requerido'));
    }
    const { usuarios, total } = await buscarUsuarios(q, limite, offset);
    res.json(respuesta(true, 'Usuarios obtenidos correctamente', {
      usuarios,
      paginacion: { limite, offset, total },
    }));
  } catch (error) {
    console.error('Error in buscarUsuariosController:', error);
    res.status(500).json(respuesta(false, error.message));
  }
};

const obtenerUsuarioPorIdController = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || isNaN(id)) {
      return res.status(400).json(respuesta(false, 'ID de usuario no válido'));
    }
    const usuario = await obtenerUsuarioPorId(parseInt(id));
    if (!usuario) {
      return res.status(404).json(respuesta(false, 'Usuario no encontrado'));
    }
    res.json(respuesta(true, 'Usuario obtenido correctamente', { usuario }));
  } catch (error) {
    console.error('Error in obtenerUsuarioPorIdController:', error);
    res.status(500).json(respuesta(false, error.message));
  }
};

const crearUsuarioController = async (req, res) => {
  let uploadedFile = null;
  const nombreFolder = 'usuario';
  try {
    const processedFiles = await createUploadAndProcess(['imagen_perfil'], nombreFolder, nombreFolder)(req, res);
    const datos = { ...req.body };
    const camposObligatorios = ['nombre', 'correo', 'usuario', 'contrasena'];
    const faltantes = camposObligatorios.filter(campo => !datos[campo] || datos[campo].toString().trim() === '');
    if (faltantes.length > 0) {
      if (processedFiles.imagen_perfil) {
        await unlinkFile(processedFiles.imagen_perfil);
      }
      return res.status(400).json(
        respuesta(false, `Faltan campos obligatorios: ${faltantes.join(', ')}`)
      );
    }
    if (processedFiles.imagen_perfil) {
      datos.imagen_perfil = processedFiles.imagen_perfil;
      uploadedFile = datos.imagen_perfil;
    }
    const nuevoUsuario = await crearUsuario(datos);
    let mensaje = 'Usuario creado correctamente';
    if (processedFiles.imagen_perfil) {
      mensaje += '. Imagen de perfil subida';
    }
    res.status(201).json(respuesta(true, mensaje, { usuario: nuevoUsuario }));
  } catch (error) {
    console.error('Error in crearUsuarioController:', error);
    if (uploadedFile) {
      await unlinkFile(uploadedFile);
    }
    if (error.code === '23505') {
      return res.status(400).json(respuesta(false, 'El correo o usuario ya existe'));
    }
    res.status(500).json(respuesta(false, error.message));
  }
};

const actualizarUsuarioController = async (req, res) => {
  let uploadedFile = null;
  let oldFileToDelete = null;
  const nombreFolder = 'usuario';
  try {
    const { id } = req.params;
    const usuarioActual = await obtenerUsuarioPorId(parseInt(id));
    if (!id || isNaN(id)) {
      return res.status(400).json(respuesta(false, 'ID de usuario no válido'));
    }
    const processedFiles = await createUploadAndProcess(['imagen_perfil'], nombreFolder, usuarioActual.nombre)(req, res);
    const camposActualizar = { ...req.body };
    if (processedFiles.imagen_perfil) {
      camposActualizar.imagen_perfil = processedFiles.imagen_perfil;
      uploadedFile = camposActualizar.imagen_perfil;
      if (usuarioActual && usuarioActual.imagen_perfil) {
        oldFileToDelete = usuarioActual.imagen_perfil;
      }
    }
    if (Object.keys(camposActualizar).length === 0 && !processedFiles.imagen_perfil) {
      if (uploadedFile) {
        await unlinkFile(uploadedFile);
      }
      return res.status(400).json(respuesta(false, 'No se proporcionaron campos para actualizar'));
    }
    const usuarioActualizado = await actualizarUsuario(parseInt(id), camposActualizar);
    if (!usuarioActualizado) {
      if (uploadedFile) {
        await unlinkFile(uploadedFile);
      }
      return res.status(404).json(respuesta(false, 'Usuario no encontrado'));
    }
    if (oldFileToDelete) {
      await unlinkFile(oldFileToDelete).catch(err => {
        console.warn('⚠️ No se pudo eliminar el archivo anterior:', err.message);
      });
    }
    let mensaje = 'Usuario actualizado correctamente';
    if (usuarioActualizado.rol_agregado) {
      mensaje += `. Rol agregado: ${camposActualizar.rol_agregar}`;
    }
    if (usuarioActualizado.rol_eliminado) {
      mensaje += `. Rol eliminado: ${camposActualizar.rol_eliminar}`;
    }
    if (processedFiles.imagen_perfil) {
      mensaje += '. Imagen de perfil actualizada';
    }
    res.json(respuesta(true, mensaje, { usuario: usuarioActualizado }));
  } catch (error) {
    console.error('Error in actualizarUsuarioController:', error);
    if (uploadedFile) {
      await unlinkFile(uploadedFile);
    }
    res.status(500).json(respuesta(false, error.message));
  }
};

const eliminarUsuarioController = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || isNaN(id)) {
      return res.status(400).json(respuesta(false, 'ID de usuario no válido'));
    }
    const usuarioEliminado = await eliminarUsuario(parseInt(id));
    if (!usuarioEliminado) {
      return res.status(404).json(respuesta(false, 'Usuario no encontrado'));
    }
    res.json(respuesta(true, 'Usuario eliminado correctamente'));
  } catch (error) {
    console.error('Error in eliminarUsuarioController:', error);
    res.status(500).json(respuesta(false, error.message));
  }
};

// Rutas
router.get('/datos-especificos', obtenerDatosEspecificosController);
router.get('/filtro', obtenerUsuariosFiltradosController);
router.get('/buscar', buscarUsuariosController);
router.get('/dato-individual/:id', obtenerUsuarioPorIdController);

router.post('/', crearUsuarioController);
router.patch('/:id', actualizarUsuarioController);
router.delete('/:id', eliminarUsuarioController);

router.patch('/cancelarSolicitud/:id', cancelarSolicitudController);
router.patch('/aceptarSolicitud/:id', aceptarSolicitudController);

module.exports = router;