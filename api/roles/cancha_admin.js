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
 * Obtener datos específicos de canchas con información del espacio deportivo
 */
const obtenerDatosEspecificos = async (id_admin_esp_dep, limite = 10, offset = 0) => {
  try {
    const queryDatos = `
      SELECT c.id_cancha, c.nombre, c.ubicacion, c.capacidad, c.estado, c.monto_por_hora, 
             e.id_espacio, e.nombre AS espacio_nombre
      FROM cancha c
      JOIN espacio_deportivo e ON c.id_espacio = e.id_espacio
      WHERE e.id_admin_esp_dep = $1
      ORDER BY c.id_cancha
      LIMIT $2 OFFSET $3
    `;
    const queryTotal = `
      SELECT COUNT(*) 
      FROM cancha c
      JOIN espacio_deportivo e ON c.id_espacio = e.id_espacio
      WHERE e.id_admin_esp_dep = $1
    `;
    const [resultDatos, resultTotal] = await Promise.all([
      pool.query(queryDatos, [id_admin_esp_dep, limite, offset]),
      pool.query(queryTotal, [id_admin_esp_dep])
    ]);
    return {
      canchas: resultDatos.rows,
      total: parseInt(resultTotal.rows[0].count)
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Obtener canchas con filtros de ordenamiento
 */
const obtenerCanchasFiltradas = async (id_admin_esp_dep, tipoFiltro, limite = 10, offset = 0) => {
  try {
    const ordenesPermitidas = {
      nombre: 'c.nombre ASC',
      estado: 'c.estado ASC',
      monto: 'c.monto_por_hora ASC',
      default: 'c.id_cancha ASC'
    };

    const orden = ordenesPermitidas[tipoFiltro] || ordenesPermitidas.default;

    const queryDatos = `
      SELECT c.id_cancha, c.nombre, c.ubicacion, c.capacidad, c.estado, c.monto_por_hora, 
             e.id_espacio, e.nombre AS espacio_nombre
      FROM cancha c
      JOIN espacio_deportivo e ON c.id_espacio = e.id_espacio
      WHERE e.id_admin_esp_dep = $1
      ORDER BY ${orden}
      LIMIT $2 OFFSET $3
    `;
    const queryTotal = `
      SELECT COUNT(*) 
      FROM cancha c
      JOIN espacio_deportivo e ON c.id_espacio = e.id_espacio
      WHERE e.id_admin_esp_dep = $1
    `;

    const [resultDatos, resultTotal] = await Promise.all([
      pool.query(queryDatos, [id_admin_esp_dep, limite, offset]),
      pool.query(queryTotal, [id_admin_esp_dep])
    ]);

    return {
      canchas: resultDatos.rows,
      total: parseInt(resultTotal.rows[0].count)
    };
  } catch (error) {
    throw new Error(`Error al obtener canchas filtradas: ${error.message}`);
  }
};

/**
 * Buscar canchas por texto en múltiples campos
 */
const buscarCanchas = async (id_admin_esp_dep, texto, limite = 10, offset = 0) => {
  try {
    const queryDatos = `
      SELECT c.id_cancha, c.nombre, c.ubicacion, c.capacidad, c.estado, c.monto_por_hora, 
             e.id_espacio, e.nombre AS espacio_nombre
      FROM cancha c
      JOIN espacio_deportivo e ON c.id_espacio = e.id_espacio
      WHERE e.id_admin_esp_dep = $1 AND (
        c.nombre ILIKE $2 OR 
        c.ubicacion ILIKE $2 OR 
        e.nombre ILIKE $2
      )
      ORDER BY c.nombre
      LIMIT $3 OFFSET $4
    `;

    const queryTotal = `
      SELECT COUNT(*) 
      FROM cancha c
      JOIN espacio_deportivo e ON c.id_espacio = e.id_espacio
      WHERE e.id_admin_esp_dep = $1 AND (
        c.nombre ILIKE $2 OR 
        c.ubicacion ILIKE $2 OR 
        e.nombre ILIKE $2
      )
    `;
    
    const sanitizeInput = (input) => input.replace(/[%_\\]/g, '\\$&');
    const terminoBusqueda = `%${sanitizeInput(texto)}%`;
    
    const [resultDatos, resultTotal] = await Promise.all([
      pool.query(queryDatos, [id_admin_esp_dep, terminoBusqueda, limite, offset]),
      pool.query(queryTotal, [id_admin_esp_dep, terminoBusqueda])
    ]);

    return {
      canchas: resultDatos.rows,
      total: parseInt(resultTotal.rows[0].count)
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Obtener cancha por ID
 */
const obtenerCanchaPorId = async (id, id_admin_esp_dep) => {
  try {
    const query = `
      SELECT c.*, e.id_espacio, e.nombre AS espacio_nombre, e.direccion AS espacio_direccion
      FROM cancha c
      JOIN espacio_deportivo e ON c.id_espacio = e.id_espacio
      WHERE c.id_cancha = $1 AND e.id_admin_esp_dep = $2
    `;
    const result = await pool.query(query, [id, id_admin_esp_dep]);
    return result.rows[0] || null;
  } catch (error) {
    throw error;
  }
};

/**
 * Crear nueva cancha
 */
const crearCancha = async (datosCancha) => {
  try {
    // Validaciones básicas
    if (!datosCancha.nombre || datosCancha.nombre.trim() === '') {
      throw new Error('El nombre es obligatorio');
    }
    if (!datosCancha.id_espacio || isNaN(datosCancha.id_espacio)) {
      throw new Error('El ID del espacio deportivo es obligatorio y debe ser un número');
    }

    // Validar longitud de campos
    if (datosCancha.nombre.length > 100) {
      throw new Error('El nombre no debe exceder los 100 caracteres');
    }
    if (datosCancha.ubicacion && datosCancha.ubicacion.length > 255) {
      throw new Error('La ubicación no debe exceder los 255 caracteres');
    }
    if (datosCancha.imagen_cancha && datosCancha.imagen_cancha.length > 255) {
      throw new Error('La URL de la imagen no debe exceder los 255 caracteres');
    }

    // Validar capacidad
    if (datosCancha.capacidad && (isNaN(datosCancha.capacidad) || datosCancha.capacidad < 0)) {
      throw new Error('La capacidad debe ser un número positivo');
    }

    // Validar estado
    const estadosValidos = ['disponible', 'ocupada', 'mantenimiento'];
    if (datosCancha.estado && !estadosValidos.includes(datosCancha.estado)) {
      throw new Error(`El estado debe ser uno de: ${estadosValidos.join(', ')}`);
    }

    // Validar monto_por_hora
    if (datosCancha.monto_por_hora && (isNaN(datosCancha.monto_por_hora) || datosCancha.monto_por_hora < 0)) {
      throw new Error('El monto por hora debe ser un número positivo');
    }

    // Verificar si el espacio deportivo existe
    const espacioQuery = `
      SELECT id_espacio FROM espacio_deportivo WHERE id_espacio = $1
    `;
    const espacioResult = await pool.query(espacioQuery, [datosCancha.id_espacio]);
    if (!espacioResult.rows[0]) {
      throw new Error('El espacio deportivo asociado no existe');
    }

    const query = `
      INSERT INTO cancha (
        nombre, ubicacion, capacidad, estado, monto_por_hora, imagen_cancha, id_espacio
      ) 
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;

    const values = [
      datosCancha.nombre,
      datosCancha.ubicacion || null,
      datosCancha.capacidad || null,
      datosCancha.estado || null,
      datosCancha.monto_por_hora || null,
      datosCancha.imagen_cancha || null,
      datosCancha.id_espacio
    ];

    const { rows } = await pool.query(query, values);
    return rows[0];
  } catch (error) {
    console.error('Error al crear cancha:', error.message);
    throw new Error(error.message);
  }
};

/**
 * Actualizar cancha parcialmente
 */
const actualizarCancha = async (id, camposActualizar) => {
  try {
    const camposPermitidos = [
      'nombre', 'ubicacion', 'capacidad', 'estado', 'monto_por_hora', 'imagen_cancha', 'id_espacio'
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
    if (camposActualizar.ubicacion && camposActualizar.ubicacion.length > 255) {
      throw new Error('La ubicación no debe exceder los 255 caracteres');
    }
    if (camposActualizar.imagen_cancha && camposActualizar.imagen_cancha.length > 255) {
      throw new Error('La URL de la imagen no debe exceder los 255 caracteres');
    }

    // Validar capacidad
    if (camposActualizar.capacidad && (isNaN(camposActualizar.capacidad) || camposActualizar.capacidad < 0)) {
      throw new Error('La capacidad debe ser un número positivo');
    }

    // Validar estado
    const estadosValidos = ['disponible', 'ocupada', 'mantenimiento'];
    if (camposActualizar.estado && !estadosValidos.includes(camposActualizar.estado)) {
      throw new Error(`El estado debe ser uno de: ${estadosValidos.join(', ')}`);
    }

    // Validar monto_por_hora
    if (camposActualizar.monto_por_hora && (isNaN(camposActualizar.monto_por_hora) || camposActualizar.monto_por_hora < 0)) {
      throw new Error('El monto por hora debe ser un número positivo');
    }

    // Validar espacio deportivo si se proporciona
    if (camposActualizar.id_espacio) {
      const espacioQuery = `
        SELECT id_espacio FROM espacio_deportivo WHERE id_espacio = $1
      `;
      const espacioResult = await pool.query(espacioQuery, [camposActualizar.id_espacio]);
      if (!espacioResult.rows[0]) {
        throw new Error('El espacio deportivo asociado no existe');
      }
    }

    const setClause = campos.map((campo, index) => `${campo} = $${index + 2}`).join(', ');
    const values = campos.map(campo => camposActualizar[campo] || null);
    
    const query = `
      UPDATE cancha 
      SET ${setClause}
      WHERE id_cancha = $1
      RETURNING *
    `;

    const result = await pool.query(query, [id, ...values]);
    return result.rows[0] || null;
  } catch (error) {
    throw error;
  }
};

/**
 * Eliminar cancha
 */
const eliminarCancha = async (id, id_admin_esp_dep) => {
  try {
    const query = `
      DELETE FROM cancha c
      USING espacio_deportivo e
      WHERE c.id_cancha = $1 AND c.id_espacio = e.id_espacio AND e.id_admin_esp_dep = $2
      RETURNING c.id_cancha
    `;
    const result = await pool.query(query, [id, id_admin_esp_dep]);
    return result.rows[0] || null;
  } catch (error) {
    throw error;
  }
};

/**
 * Obtener disciplinas de una cancha específica
 */
const obtenerDisciplinasCancha = async (id_cancha, id_admin_esp_dep) => {
  try {
    const query = `
      SELECT d.id_disciplina, d.nombre, d.descripcion, sp.frecuencia_practica
      FROM se_practica sp
      JOIN disciplina d ON sp.id_disciplina = d.id_disciplina
      JOIN cancha c ON sp.id_cancha = c.id_cancha
      JOIN espacio_deportivo e ON c.id_espacio = e.id_espacio
      WHERE sp.id_cancha = $1 AND e.id_admin_esp_dep = $2
    `;
    const result = await pool.query(query, [id_cancha, id_admin_esp_dep]);
    return result.rows;
  } catch (error) {
    throw error;
  }
};

/**
 * Obtener todas las disciplinas disponibles
 */
const obtenerTodasDisciplinas = async () => {
  try {
    const query = `SELECT id_disciplina, nombre, descripcion FROM disciplina ORDER BY nombre`;
    const result = await pool.query(query);
    return result.rows;
  } catch (error) {
    throw error;
  }
};

/**
 * Asignar disciplinas a una cancha
 */
const asignarDisciplinasCancha = async (id_cancha, id_admin_esp_dep, disciplinas) => {
  try {
    // Verificar que la cancha pertenece al administrador
    const canchaQuery = `
      SELECT c.id_cancha 
      FROM cancha c
      JOIN espacio_deportivo e ON c.id_espacio = e.id_espacio
      WHERE c.id_cancha = $1 AND e.id_admin_esp_dep = $2
    `;
    const canchaResult = await pool.query(canchaQuery, [id_cancha, id_admin_esp_dep]);
    if (!canchaResult.rows[0]) {
      throw new Error('Cancha no encontrada o no pertenece al administrador');
    }

    // Eliminar disciplinas existentes
    await pool.query('DELETE FROM se_practica WHERE id_cancha = $1', [id_cancha]);
    
    // Insertar nuevas disciplinas
    if (disciplinas && disciplinas.length > 0) {
      const values = disciplinas.map((disciplina, index) => 
        `($1, $${index * 2 + 2}, $${index * 2 + 3})`
      ).join(', ');
      
      const queryParams = [id_cancha];
      const valueParams = [];
      
      disciplinas.forEach(disciplina => {
        queryParams.push(disciplina.id_disciplina);
        queryParams.push(disciplina.frecuencia_practica || 'Regular');
      });
      
      const query = `
        INSERT INTO se_practica (id_cancha, id_disciplina, frecuencia_practica) 
        VALUES ${values}
      `;
      
      await pool.query(query, queryParams);
    }
    
    return await obtenerDisciplinasCancha(id_cancha, id_admin_esp_dep);
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
    const id_admin_esp_dep = parseInt(req.query.id_admin_esp_dep);
    const limite = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;

    if (!id_admin_esp_dep || isNaN(id_admin_esp_dep)) {
      return res.status(400).json(respuesta(false, 'ID de administrador no válido o no proporcionado'));
    }

    const { canchas, total } = await obtenerDatosEspecificos(id_admin_esp_dep, limite, offset);
    
    res.json(respuesta(true, 'Canchas obtenidas correctamente', {
      canchas,
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
const obtenerCanchasFiltradasController = async (req, res) => {
  try {
    const { tipo, id_admin_esp_dep } = req.query;
    const limite = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;

    if (!id_admin_esp_dep || isNaN(id_admin_esp_dep)) {
      return res.status(400).json(respuesta(false, 'ID de administrador no válido o no proporcionado'));
    }

    const tiposValidos = ['nombre', 'estado', 'monto'];
    if (!tipo || !tiposValidos.includes(tipo)) {
      return res.status(400).json(respuesta(false, 'El parámetro "tipo" es inválido o no proporcionado'));
    }

    const { canchas, total } = await obtenerCanchasFiltradas(id_admin_esp_dep, tipo, limite, offset);

    res.json(respuesta(true, `Canchas filtradas por ${tipo} obtenidas correctamente`, {
      canchas,
      filtro: tipo,
      paginacion: { limite, offset, total }
    }));
  } catch (error) {
    console.error('Error en obtenerCanchasFiltradas:', error.message);
    res.status(500).json(respuesta(false, error.message));
  }
};

/**
 * Controlador para GET /buscar
 */
const buscarCanchasController = async (req, res) => {
  try {
    const { q, id_admin_esp_dep } = req.query;
    const limite = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;

    if (!id_admin_esp_dep || isNaN(id_admin_esp_dep)) {
      return res.status(400).json(respuesta(false, 'ID de administrador no válido o no proporcionado'));
    }

    if (!q) {
      return res.status(400).json(respuesta(false, 'El parámetro de búsqueda "q" es requerido'));
    }

    const { canchas, total } = await buscarCanchas(id_admin_esp_dep, q, limite, offset);
    
    res.json(respuesta(true, 'Canchas obtenidas correctamente', {
      canchas,
      paginacion: { limite, offset, total }
    }));
  } catch (error) {
    console.error('Error en buscarCanchas:', error.message);
    res.status(500).json(respuesta(false, error.message));
  }
};

/**
 * Controlador para GET /dato-individual/:id
 */
const obtenerCanchaPorIdController = async (req, res) => {
  try {
    const { id } = req.params;
    const { id_admin_esp_dep } = req.query;

    if (!id || isNaN(id)) {
      return res.status(400).json(respuesta(false, 'ID de cancha no válido'));
    }
    if (!id_admin_esp_dep || isNaN(id_admin_esp_dep)) {
      return res.status(400).json(respuesta(false, 'ID de administrador no válido o no proporcionado'));
    }

    const cancha = await obtenerCanchaPorId(parseInt(id), parseInt(id_admin_esp_dep));
    if (!cancha) {
      return res.status(404).json(respuesta(false, 'Cancha no encontrada o no pertenece al administrador'));
    }

    // Obtener disciplinas de la cancha
    const disciplinas = await obtenerDisciplinasCancha(parseInt(id), parseInt(id_admin_esp_dep));

    res.json(respuesta(true, 'Cancha obtenida correctamente', { 
      cancha: { ...cancha, disciplinas } 
    }));
  } catch (error) {
    console.error('Error en obtenerCanchaPorId:', error.message);
    res.status(500).json(respuesta(false, error.message));
  }
};

/**
 * Controlador para POST - Crear cancha
 */
const crearCanchaController = async (req, res) => {
  let uploadedFile = null;
  const nombreFolder = "cancha";

  try {
    const id_admin_esp_dep = parseInt(req.body.id_admin_esp_dep || req.query.id_admin_esp_dep);
    if (!id_admin_esp_dep || isNaN(id_admin_esp_dep)) {
      return res.status(400).json(respuesta(false, 'ID de administrador no válido o no proporcionado'));
    }

    // Verificar que el espacio pertenece al administrador
    const espacioQuery = `
      SELECT id_espacio 
      FROM espacio_deportivo 
      WHERE id_espacio = $1 AND id_admin_esp_dep = $2
    `;
    const espacioResult = await pool.query(espacioQuery, [req.body.id_espacio, id_admin_esp_dep]);
    if (!espacioResult.rows[0]) {
      return res.status(400).json(respuesta(false, 'El espacio deportivo no pertenece al administrador'));
    }

    // Procesar archivo subido con Multer (imagen_cancha, opcional)
    const processedFiles = await createUploadAndProcess(["imagen_cancha"], nombreFolder, nombreFolder)(req, res);

    const datos = { ...req.body };

    // Validaciones básicas
    const camposObligatorios = ['nombre', 'id_espacio'];
    const faltantes = camposObligatorios.filter(campo => !datos[campo] || datos[campo].toString().trim() === '');

    if (faltantes.length > 0) {
      // Limpiar archivo subido si faltan campos obligatorios
      if (processedFiles.imagen_cancha) {
        await unlinkFile(processedFiles.imagen_cancha);
      }
      return res.status(400).json(
        respuesta(false, `Faltan campos obligatorios: ${faltantes.join(', ')}`)
      );
    }

    // Agregar ruta de archivo subido al objeto datos, si existe
    if (processedFiles.imagen_cancha) {
      datos.imagen_cancha = processedFiles.imagen_cancha;
      uploadedFile = datos.imagen_cancha;
    }

    const nuevaCancha = await crearCancha(datos);

    let mensaje = 'Cancha creada correctamente';
    if (processedFiles.imagen_cancha) {
      mensaje += '. Imagen de cancha subida';
    }

    res.status(201).json(respuesta(true, mensaje, { cancha: nuevaCancha }));
  } catch (error) {
    console.error('Error en crearCancha:', error.message);

    // Limpiar archivo subido en caso de error
    if (uploadedFile) {
      await unlinkFile(uploadedFile);
    }

    if (error.code === '23505') {
      return res.status(400).json(respuesta(false, 'La cancha ya existe'));
    }

    res.status(500).json(respuesta(false, error.message));
  }
};

/**
 * Controlador para PATCH - Actualizar cancha
 */
const actualizarCanchaController = async (req, res) => {
  let uploadedFile = null;
  let oldFileToDelete = null;
  const nombreFolder = "cancha";

  try {
    const { id } = req.params;
    const id_admin_esp_dep = parseInt(req.body.id_admin_esp_dep || req.query.id_admin_esp_dep);

    if (!id || isNaN(id)) {
      return res.status(400).json(respuesta(false, 'ID de cancha no válido'));
    }
    if (!id_admin_esp_dep || isNaN(id_admin_esp_dep)) {
      return res.status(400).json(respuesta(false, 'ID de administrador no válido o no proporcionado'));
    }

    const canchaActual = await obtenerCanchaPorId(parseInt(id), id_admin_esp_dep);
    if (!canchaActual) {
      return res.status(404).json(respuesta(false, 'Cancha no encontrada o no pertenece al administrador'));
    }

    // Procesar archivo subido con Multer (imagen_cancha, opcional)
    const processedFiles = await createUploadAndProcess(["imagen_cancha"], nombreFolder, canchaActual.nombre)(req, res);

    // Preparar campos para actualizar
    const camposActualizar = { ...req.body };

    // Si se subió nueva imagen, agregarla a los campos a actualizar
    if (processedFiles.imagen_cancha) {
      camposActualizar.imagen_cancha = processedFiles.imagen_cancha;
      uploadedFile = camposActualizar.imagen_cancha;
      if (canchaActual && canchaActual.imagen_cancha) {
        oldFileToDelete = canchaActual.imagen_cancha;
      }
    }

    if (Object.keys(camposActualizar).length === 0 && !processedFiles.imagen_cancha) {
      // Limpiar archivo nuevo si no hay campos para actualizar
      if (uploadedFile) {
        await unlinkFile(uploadedFile);
      }
      return res.status(400).json(respuesta(false, 'No se proporcionaron campos para actualizar'));
    }

    // Validar que el nuevo id_espacio pertenece al administrador, si se proporciona
    if (camposActualizar.id_espacio) {
      const espacioQuery = `
        SELECT id_espacio 
        FROM espacio_deportivo 
        WHERE id_espacio = $1 AND id_admin_esp_dep = $2
      `;
      const espacioResult = await pool.query(espacioQuery, [camposActualizar.id_espacio, id_admin_esp_dep]);
      if (!espacioResult.rows[0]) {
        if (uploadedFile) {
          await unlinkFile(uploadedFile);
        }
        return res.status(400).json(respuesta(false, 'El espacio deportivo no pertenece al administrador'));
      }
    }

    const canchaActualizada = await actualizarCancha(parseInt(id), camposActualizar);

    if (!canchaActualizada) {
      // Limpiar archivo nuevo si la cancha no existe
      if (uploadedFile) {
        await unlinkFile(uploadedFile);
      }
      return res.status(404).json(respuesta(false, 'Cancha no encontrada'));
    }

    // Eliminar archivo anterior después de una actualización exitosa
    if (oldFileToDelete) {
      await unlinkFile(oldFileToDelete).catch(err => {
        console.warn('⚠️ No se pudo eliminar el archivo anterior:', err.message);
      });
    }

    let mensaje = 'Cancha actualizada correctamente';
    if (processedFiles.imagen_cancha) {
      mensaje += '. Imagen de cancha actualizada';
    }

    res.json(respuesta(true, mensaje, { cancha: canchaActualizada }));
  } catch (error) {
    console.error('Error en actualizarCancha:', error.message);

    // Limpiar archivo subido en caso de error
    if (uploadedFile) {
      await unlinkFile(uploadedFile);
    }

    res.status(500).json(respuesta(false, error.message));
  }
};

/**
 * Controlador para DELETE - Eliminar cancha
 */
const eliminarCanchaController = async (req, res) => {
  try {
    const { id } = req.params;
    const { id_admin_esp_dep } = req.query;

    if (!id || isNaN(id)) {
      return res.status(400).json(respuesta(false, 'ID de cancha no válido'));
    }
    if (!id_admin_esp_dep || isNaN(id_admin_esp_dep)) {
      return res.status(400).json(respuesta(false, 'ID de administrador no válido o no proporcionado'));
    }

    const canchaEliminada = await eliminarCancha(parseInt(id), parseInt(id_admin_esp_dep));

    if (!canchaEliminada) {
      return res.status(404).json(respuesta(false, 'Cancha no encontrada o no pertenece al administrador'));
    }

    res.json(respuesta(true, 'Cancha eliminada correctamente'));
  } catch (error) {
    console.error('Error en eliminarCancha:', error.message);
    res.status(500).json(respuesta(false, error.message));
  }
};

/**
 * Controlador para GET /disciplinas
 */
const obtenerDisciplinasController = async (req, res) => {
  try {
    const disciplinas = await obtenerTodasDisciplinas();
    res.json(respuesta(true, 'Disciplinas obtenidas correctamente', { disciplinas }));
  } catch (error) {
    console.error('Error en obtenerDisciplinas:', error.message);
    res.status(500).json(respuesta(false, error.message));
  }
};

/**
 * Controlador para POST /:id/disciplinas
 */
const asignarDisciplinasController = async (req, res) => {
  try {
    const { id } = req.params;
    const { id_admin_esp_dep, disciplinas } = req.body;

    if (!id || isNaN(id)) {
      return res.status(400).json(respuesta(false, 'ID de cancha no válido'));
    }
    if (!id_admin_esp_dep || isNaN(id_admin_esp_dep)) {
      return res.status(400).json(respuesta(false, 'ID de administrador no válido o no proporcionado'));
    }

    const disciplinasActualizadas = await asignarDisciplinasCancha(parseInt(id), parseInt(id_admin_esp_dep), disciplinas);
    
    res.json(respuesta(true, 'Disciplinas asignadas correctamente', { 
      disciplinas: disciplinasActualizadas 
    }));
  } catch (error) {
    console.error('Error en asignarDisciplinas:', error.message);
    res.status(500).json(respuesta(false, error.message));
  }
};

// RUTAS

// GET endpoints
router.get('/datos-especificos', obtenerDatosEspecificosController);
router.get('/filtro', obtenerCanchasFiltradasController);
router.get('/buscar', buscarCanchasController);
router.get('/dato-individual/:id', obtenerCanchaPorIdController);

// POST, PATCH, DELETE endpoints
router.post('/', crearCanchaController);
router.patch('/:id', actualizarCanchaController);
router.delete('/:id', eliminarCanchaController);

// Disciplinas endpoints
router.get('/disciplinas', obtenerDisciplinasController);
router.post('/:id/disciplinas', asignarDisciplinasController);

module.exports = router;