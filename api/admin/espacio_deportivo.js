const express = require('express');
const pool = require('../../config/database');

const path = require("path");
const fs = require("fs").promises;
const { unlinkFile, createUploadAndProcess } = require("../../middleware/multer");

const router = express.Router();

// Función de respuesta estandarizada
const respuesta = (exito, mensaje, datos = null) => ({
  exito,
  mensaje,
  datos,
});

// MODELOS - Funciones puras para operaciones de base de datos

/**
 * Obtener datos específicos de espacios deportivos con información del administrador
 */
const obtenerDatosEspecificos = async (limite = 10, offset = 0) => {
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
        p.nombre AS admin_nombre, 
        p.apellido AS admin_apellido,
        pr.promedio_estrellas
      FROM ESPACIO_DEPORTIVO e
      LEFT JOIN ADMIN_ESP_DEP a ON e.id_admin_esp_dep = a.id_admin_esp_dep
      LEFT JOIN USUARIO p ON a.id_admin_esp_dep = p.id_persona
      LEFT JOIN promedio_resenas pr ON e.id_espacio = pr.id_espacio
      ORDER BY pr.promedio_estrellas DESC, e.id_espacio
      LIMIT $1 OFFSET $2
    `;
    const queryTotal = `SELECT COUNT(*) FROM ESPACIO_DEPORTIVO`;

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
const obtenerEspaciosFiltrados = async (tipoFiltro, limite = 10, offset = 0) => {
  try {
    // Definir los tipos de orden permitidos
    const ordenesPermitidas = {
      nombre: { clause: 'e.nombre ASC', params: [] },
      direccion: { clause: 'e.direccion ASC', params: [] },
      admin_nombre: { clause: 'COALESCE(p.nombre, $3) ASC, COALESCE(p.apellido, $4) ASC', params: ['', ''] },
      default: { clause: 'e.id_espacio ASC', params: [] }
    };

    // Seleccionar la cláusula de orden según tipoFiltro, o usar default
    const { clause: orden, params: ordenParams } = ordenesPermitidas[tipoFiltro] || ordenesPermitidas.default;

    const queryDatos = `
      SELECT 
        e.id_espacio, 
        e.nombre, 
        e.direccion, 
        e.latitud, 
        e.longitud, 
        e.horario_apertura, 
        e.horario_cierre, 
        a.id_admin_esp_dep, 
        p.nombre AS admin_nombre, 
        p.apellido AS admin_apellido
      FROM espacio_deportivo e
      LEFT JOIN admin_esp_dep a ON e.id_admin_esp_dep = a.id_admin_esp_dep
      LEFT JOIN usuario p ON a.id_admin_esp_dep = p.id_persona
      ORDER BY ${orden}
      LIMIT $1 OFFSET $2
    `;
    const queryTotal = `SELECT COUNT(*) FROM espacio_deportivo`;

    // Combinar parámetros: límite, offset y parámetros adicionales para orden
    const queryParams = [limite, offset, ...ordenParams];

    const [resultDatos, resultTotal] = await Promise.all([
      pool.query(queryDatos, queryParams),
      pool.query(queryTotal)
    ]);

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
const buscarEspacios = async (texto, limite = 10, offset = 0) => {
  try {
    const queryDatos = `
      SELECT e.id_espacio, e.nombre, e.direccion, e.latitud, e.longitud, e.horario_apertura, e.horario_cierre, 
             a.id_admin_esp_dep, p.nombre AS admin_nombre, p.apellido AS admin_apellido
      FROM espacio_deportivo e
      LEFT JOIN admin_esp_dep a ON e.id_admin_esp_dep = a.id_admin_esp_dep
      LEFT JOIN usuario p ON a.id_admin_esp_dep = p.id_persona
      WHERE 
        e.nombre ILIKE $1 OR 
        e.direccion ILIKE $1 OR 
        e.descripcion ILIKE $1 OR 
        COALESCE(p.nombre, '') ILIKE $1 OR 
        COALESCE(p.apellido, '') ILIKE $1
      ORDER BY e.nombre
      LIMIT $2 OFFSET $3
    `;

    const queryTotal = `
      SELECT COUNT(*) 
      FROM espacio_deportivo e
      LEFT JOIN admin_esp_dep a ON e.id_admin_esp_dep = a.id_admin_esp_dep
      LEFT JOIN usuario p ON a.id_admin_esp_dep = p.id_persona
      WHERE 
        e.nombre ILIKE $1 OR 
        e.direccion ILIKE $1 OR 
        e.descripcion ILIKE $1 OR 
        COALESCE(p.nombre, '') ILIKE $1 OR 
        COALESCE(p.apellido, '') ILIKE $1
    `;
    
    const sanitizeInput = (input) => input.replace(/[%_\\]/g, '\\$&');
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
      SELECT e.*, a.id_admin_esp_dep, p.nombre AS admin_nombre, p.apellido AS admin_apellido, p.correo AS admin_correo
      FROM espacio_deportivo e
      LEFT JOIN admin_esp_dep a ON e.id_admin_esp_dep = a.id_admin_esp_dep
      LEFT JOIN usuario p ON a.id_admin_esp_dep = p.id_persona
      WHERE e.id_espacio = $1
    `;
    const result = await pool.query(query, [id]);
    return result.rows[0] || null;
  } catch (error) {
    throw error;
  }
};

/**
 * Crear nuevo espacio deportivo
 */
const crearEspacio = async (datosEspacio) => {
  try {
    // Validaciones básicas
    if (!datosEspacio.nombre || datosEspacio.nombre.trim() === '') {
      throw new Error('El nombre es obligatorio');
    }

    // Validar coordenadas
    if (datosEspacio.latitud && (datosEspacio.latitud < -90 || datosEspacio.latitud > 90)) {
      throw new Error('La latitud debe estar entre -90 y 90');
    }
    if (datosEspacio.longitud && (datosEspacio.longitud < -180 || datosEspacio.longitud > 180)) {
      throw new Error('La longitud debe estar entre -180 y 180');
    }

    // Validar horarios
    const validarHora = (hora) => /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/.test(hora);
    if (datosEspacio.horario_apertura && !validarHora(datosEspacio.horario_apertura)) {
      throw new Error('La hora de apertura no es válida (formato HH:MM:SS)');
    }
    if (datosEspacio.horario_cierre && !validarHora(datosEspacio.horario_cierre)) {
      throw new Error('La hora de cierre no es válida (formato HH:MM:SS)');
    }

    // Validar administrador solo si se proporciona
    if (datosEspacio.id_admin_esp_dep) {
      const adminQuery = `
        SELECT id_admin_esp_dep FROM admin_esp_dep WHERE id_admin_esp_dep = $1
      `;
      const adminResult = await pool.query(adminQuery, [datosEspacio.id_admin_esp_dep]);
      if (!adminResult.rows[0]) {
        throw new Error('El administrador asociado no existe');
      }
    }

    const query = `
      INSERT INTO espacio_deportivo (
        nombre, direccion, descripcion, latitud, longitud, horario_apertura, horario_cierre,
        imagen_principal, imagen_sec_1, imagen_sec_2, imagen_sec_3, imagen_sec_4, id_admin_esp_dep
      ) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `;

    const values = [
      datosEspacio.nombre,
      datosEspacio.direccion || null,
      datosEspacio.descripcion || null,
      datosEspacio.latitud || null,
      datosEspacio.longitud || null,
      datosEspacio.horario_apertura || null,
      datosEspacio.horario_cierre || null,
      datosEspacio.imagen_principal || null,
      datosEspacio.imagen_sec_1 || null,
      datosEspacio.imagen_sec_2 || null,
      datosEspacio.imagen_sec_3 || null,
      datosEspacio.imagen_sec_4 || null,
      datosEspacio.id_admin_esp_dep || null, // Permitir NULL
    ];

    const { rows } = await pool.query(query, values);
    return rows[0];
  } catch (error) {
    console.error('Error al crear espacio deportivo:', error.message);
    throw new Error(error.message);
  }
};

/**
 * Actualizar espacio deportivo parcialmente
 */
const actualizarEspacio = async (id, camposActualizar) => {
  try {
    const camposPermitidos = [
      'nombre', 'direccion', 'descripcion', 'latitud', 'longitud', 'horario_apertura', 'horario_cierre',
      'imagen_principal', 'imagen_sec_1', 'imagen_sec_2', 'imagen_sec_3', 'imagen_sec_4', 'id_admin_esp_dep'
    ];

    const campos = Object.keys(camposActualizar).filter(key => 
      camposPermitidos.includes(key)
    );

    if (campos.length === 0) {
      throw new Error('No hay campos válidos para actualizar');
    }

    // Validar longitud de campos
    if (camposActualizar.nombre && camposActualizar.nombre.length > 100) {
      throw new Error('El nombre no debe exceder los 100 caracteres');
    }
    if (camposActualizar.direccion && camposActualizar.direccion.length > 255) {
      throw new Error('La dirección no debe exceder los 255 caracteres');
    }
    if (camposActualizar.imagen_principal && camposActualizar.imagen_principal.length > 255) {
      throw new Error('La URL de la imagen principal no debe exceder los 255 caracteres');
    }
    if (camposActualizar.imagen_sec_1 && camposActualizar.imagen_sec_1.length > 255) {
      throw new Error('La URL de la imagen secundaria 1 no debe exceder los 255 caracteres');
    }
    if (camposActualizar.imagen_sec_2 && camposActualizar.imagen_sec_2.length > 255) {
      throw new Error('La URL de la imagen secundaria 2 no debe exceder los 255 caracteres');
    }
    if (camposActualizar.imagen_sec_3 && camposActualizar.imagen_sec_3.length > 255) {
      throw new Error('La URL de la imagen secundaria 3 no debe exceder los 255 caracteres');
    }
    if (camposActualizar.imagen_sec_4 && camposActualizar.imagen_sec_4.length > 255) {
      throw new Error('La URL de la imagen secundaria 4 no debe exceder los 255 caracteres');
    }

    // Validar coordenadas
    if (camposActualizar.latitud && (camposActualizar.latitud < -90 || camposActualizar.latitud > 90)) {
      throw new Error('La latitud debe estar entre -90 y 90');
    }
    if (camposActualizar.longitud && (camposActualizar.longitud < -180 || camposActualizar.longitud > 180)) {
      throw new Error('La longitud debe estar entre -180 y 180');
    }

    // Validar horarios
    const validarHora = (hora) => /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/.test(hora);
    if (camposActualizar.horario_apertura && !validarHora(camposActualizar.horario_apertura)) {
      throw new Error('La hora de apertura no es válida (formato HH:MM:SS)');
    }
    if (camposActualizar.horario_cierre && !validarHora(camposActualizar.horario_cierre)) {
      throw new Error('La hora de cierre no es válida (formato HH:MM:SS)');
    }

    // Validar administrador si se proporciona y no es 'null'
    if (camposActualizar.id_admin_esp_dep && camposActualizar.id_admin_esp_dep !== 'null') {
      const adminQuery = `
        SELECT id_admin_esp_dep FROM admin_esp_dep WHERE id_admin_esp_dep = $1
      `;
      const adminResult = await pool.query(adminQuery, [parseInt(camposActualizar.id_admin_esp_dep)]);
      if (!adminResult.rows[0]) {
        throw new Error('El administrador asociado no existe');
      }
    }

    const setClause = campos.map((campo, index) => `${campo} = $${index + 2}`).join(', ');
    const values = campos.map(campo => 
      campo === 'id_admin_esp_dep' && camposActualizar[campo] === 'null' 
        ? null 
        : campo === 'id_admin_esp_dep' 
        ? parseInt(camposActualizar[campo]) // Asegurar que id_admin_esp_dep sea un entero
        : camposActualizar[campo] || null
    );

    console.log('Campos a actualizar:'); // Depuración

    const query = `
      UPDATE espacio_deportivo 
      SET ${setClause}
      WHERE id_espacio = $1
      RETURNING *
    `;

    const result = await pool.query(query, [id, ...values]);
    return result.rows[0] || null;
  } catch (error) {
    console.error('Error en actualizarEspacio:', error.message);
    throw error;
  }
};

/**
 * Eliminar espacio deportivo
 */
const eliminarEspacio = async (id) => {
  try {
    const query = 'DELETE FROM espacio_deportivo WHERE id_espacio = $1 RETURNING id_espacio';
    const result = await pool.query(query, [id]);
    return result.rows[0] || null;
  } catch (error) {
    throw error;
  }
};

/**
 * Obtener espacios deportivos gestionados por un admin específico (mismos datos que /datos-especificos)
 */
const obtenerEspaciosPorAdmin = async (id_admin_esp_dep, limite = 10, offset = 0) => {
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
        p.nombre AS admin_nombre, 
        p.apellido AS admin_apellido,
        pr.promedio_estrellas
      FROM ESPACIO_DEPORTIVO e
      LEFT JOIN ADMIN_ESP_DEP a ON e.id_admin_esp_dep = a.id_admin_esp_dep
      LEFT JOIN USUARIO p ON a.id_admin_esp_dep = p.id_persona
      LEFT JOIN promedio_resenas pr ON e.id_espacio = pr.id_espacio
      WHERE e.id_admin_esp_dep = $1
      ORDER BY pr.promedio_estrellas DESC, e.id_espacio
      LIMIT $2 OFFSET $3
    `;
    const queryTotal = `
      SELECT COUNT(*) FROM ESPACIO_DEPORTIVO WHERE id_admin_esp_dep = $1
    `;
    const [resultDatos, resultTotal] = await Promise.all([
      pool.query(queryDatos, [id_admin_esp_dep, limite, offset]),
      pool.query(queryTotal, [id_admin_esp_dep])
    ]);
    return {
      espacios: resultDatos.rows,
      total: parseInt(resultTotal.rows[0].count)
    };
  } catch (error) {
    console.error('Error en obtenerEspaciosPorAdmin:', error);
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
    const limite = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;

    const tiposValidos = ['nombre', 'direccion', 'admin_nombre'];
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
    const limite = parseInt(req.query.limit) || 10;
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
 * Controlador para POST - Crear espacio deportivo
 */
const crearEspacioController = async (req, res) => {
  let uploadedFiles = [];
  const nombreFolder = "espacio";
  const imageFields = ["imagen_principal", "imagen_sec_1", "imagen_sec_2", "imagen_sec_3", "imagen_sec_4"];

  try {
    // Procesar archivos subidos con Multer
    const processedFiles = await createUploadAndProcess(imageFields, nombreFolder, nombreFolder)(req, res);

    const datos = { ...req.body };

    // Validaciones básicas
    const camposObligatorios = ['nombre']; // Eliminamos id_admin_esp_dep de los obligatorios
    const faltantes = camposObligatorios.filter(campo => !datos[campo] || datos[campo].toString().trim() === '');

    if (faltantes.length > 0) {
      const cleanupPromises = Object.values(processedFiles).map(file => unlinkFile(file));
      await Promise.all(cleanupPromises);
      return res.status(400).json(
        respuesta(false, `Faltan campos obligatorios: ${faltantes.join(', ')}`)
      );
    }

    // Agregar rutas de archivos subidos al objeto datos
    imageFields.forEach(field => {
      if (processedFiles[field]) {
        datos[field] = processedFiles[field];
        uploadedFiles.push(datos[field]);
      }
    });

    // Convertir id_admin_esp_dep a null si es una cadena vacía
    if (datos.id_admin_esp_dep === '' || datos.id_admin_esp_dep === undefined) {
      datos.id_admin_esp_dep = null;
    }

    const nuevoEspacio = await crearEspacio(datos);

    let mensaje = 'Espacio deportivo creado correctamente';
    imageFields.forEach(field => {
      if (processedFiles[field]) {
        mensaje += `. ${field.replace('_', ' ')} subida`;
      }
    });

    res.status(201).json(respuesta(true, mensaje, { espacio: nuevoEspacio }));
  } catch (error) {
    console.error('Error en crearEspacio:', error.message);

    if (uploadedFiles.length > 0) {
      const cleanupPromises = uploadedFiles.map(file => unlinkFile(file));
      await Promise.all(cleanupPromises);
    }

    if (error.code === '23505') {
      return res.status(400).json(respuesta(false, 'El espacio deportivo ya existe'));
    }

    res.status(500).json(respuesta(false, error.message));
  }
};

/**
 * Controlador para PATCH - Actualizar espacio deportivo
 */
const actualizarEspacioController = async (req, res) => {
  let uploadedFiles = [];
  let oldFilesToDelete = [];
  const nombreFolder = "espacio";
  const imageFields = ["imagen_principal", "imagen_sec_1", "imagen_sec_2", "imagen_sec_3", "imagen_sec_4"];

  try {
    const { id } = req.params;
    const espacioActual = await obtenerEspacioPorId(parseInt(id));

    if (!id || isNaN(id)) {
      return res.status(400).json(respuesta(false, 'ID de espacio deportivo no válido'));
    }

    if (!espacioActual) {
      return res.status(404).json(respuesta(false, 'Espacio deportivo no encontrado'));
    }

    const processedFiles = await createUploadAndProcess(imageFields, nombreFolder, espacioActual.nombre)(req, res);

    const camposActualizar = { ...req.body };

    // Manejar id_admin_esp_dep explícitamente
    if (camposActualizar.id_admin_esp_dep === '' || camposActualizar.id_admin_esp_dep === 'null' || camposActualizar.id_admin_esp_dep === undefined) {
      camposActualizar.id_admin_esp_dep = 'null'; // Enviar como cadena 'null' para el modelo
    } else if (camposActualizar.id_admin_esp_dep) {
      // Convertir a número entero si se proporciona un valor
      camposActualizar.id_admin_esp_dep = parseInt(camposActualizar.id_admin_esp_dep);
    }

    // Agregar imágenes procesadas
    imageFields.forEach(field => {
      if (processedFiles[field]) {
        camposActualizar[field] = processedFiles[field];
        uploadedFiles.push(camposActualizar[field]);
        if (espacioActual[field]) {
          oldFilesToDelete.push(espacioActual[field]);
        }
      }
    });

    if (Object.keys(camposActualizar).length === 0 && Object.keys(processedFiles).length === 0) {
      if (uploadedFiles.length > 0) {
        const cleanupPromises = uploadedFiles.map(file => unlinkFile(file));
        await Promise.all(cleanupPromises);
      }
      return res.status(400).json(respuesta(false, 'No se proporcionaron campos para actualizar'));
    }

    const espacioActualizado = await actualizarEspacio(parseInt(id), camposActualizar);

    if (!espacioActualizado) {
      if (uploadedFiles.length > 0) {
        const cleanupPromises = uploadedFiles.map(file => unlinkFile(file));
        await Promise.all(cleanupPromises);
      }
      return res.status(404).json(respuesta(false, 'Espacio deportivo no encontrado'));
    }

    if (oldFilesToDelete.length > 0) {
      const cleanupPromises = oldFilesToDelete.map(file =>
        unlinkFile(file).catch(err => {
          console.warn('⚠️ No se pudo eliminar el archivo anterior:', err.message);
        })
      );
      await Promise.all(cleanupPromises);
    }

    let mensaje = 'Espacio deportivo actualizado correctamente';
    imageFields.forEach(field => {
      if (processedFiles[field]) {
        mensaje += `. ${field.replace('_', ' ')} actualizada`;
      }
    });

    res.json(respuesta(true, mensaje, { espacio: espacioActualizado }));
  } catch (error) {
    console.error('Error en actualizarEspacio:', error.message);
    console.error('Datos recibidos:', req.body); // Añadir depuración
    console.error('Archivos procesados:', processedFiles);

    if (uploadedFiles.length > 0) {
      const cleanupPromises = uploadedFiles.map(file => unlinkFile(file));
      await Promise.all(cleanupPromises);
    }

    res.status(500).json(respuesta(false, error.message));
  }
};

/**
 * Controlador para DELETE - Eliminar espacio deportivo
 */
const eliminarEspacioController = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || isNaN(id)) {
      return res.status(400).json(respuesta(false, 'ID de espacio deportivo no válido'));
    }

    const espacioEliminado = await eliminarEspacio(parseInt(id));

    if (!espacioEliminado) {
      return res.status(404).json(respuesta(false, 'Espacio deportivo no encontrado'));
    }

    res.json(respuesta(true, 'Espacio deportivo eliminado correctamente'));
  } catch (error) {
    console.error('Error en eliminarEspacio:', error.message);
    res.status(500).json(respuesta(false, error.message));
  }
};

const obtenerEspaciosAdminController = async (req, res) => {
  try {
    const { id_admin_esp_dep } = req.params;
    if (!id_admin_esp_dep || isNaN(id_admin_esp_dep)) {
      return res.status(400).json(respuesta(false, 'ID de administrador inválido'));
    }
    const limite = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;
    const { espacios, total } = await obtenerEspaciosPorAdmin(parseInt(id_admin_esp_dep), limite, offset);
    res.json(respuesta(true, 'Espacios del administrador obtenidos', {
      espacios,
      paginacion: { limite, offset, total }
    }));
  } catch (error) {
    res.status(500).json(respuesta(false, error.message));
  }
};






// RUTAS

// GET endpoints
router.get('/datos-especificos', obtenerDatosEspecificosController);
router.get('/filtro', obtenerEspaciosFiltradosController);
router.get('/buscar', buscarEspaciosController);
router.get('/dato-individual/:id', obtenerEspacioPorIdController);

// POST, PATCH, DELETE endpoints
router.post('/', crearEspacioController);
router.patch('/:id', actualizarEspacioController);
router.delete('/:id', eliminarEspacioController);

router.get('/datos-segun-rol/:id_admin_esp_dep', obtenerEspaciosAdminController);

module.exports = router;