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
 * Obtener datos específicos de canchas con información del espacio deportivo, 
 * promedio de calificación y total de usuarios
 */
const obtenerDatosEspecificos = async (limite = 10, offset = 0) => {
  try {
    const queryDatos = `
      SELECT 
        c.id_cancha, 
        c.nombre, 
        c.ubicacion, 
        c.capacidad, 
        c.estado, 
        c.monto_por_hora, 
        c.imagen_cancha,
        e.id_espacio, 
        e.nombre AS espacio_nombre,
        e.direccion AS espacio_direccion,
        e.horario_apertura,
        e.horario_cierre,
        e.descripcion AS espacio_descripcion,
        -- Promedio de calificación (estrellas) de las reseñas
        COALESCE(AVG(r.estrellas), 0) AS promedio_calificacion,
        -- Total de usuarios que usaron la cancha (desde adquiere_qr)
        COUNT(DISTINCT aqr.id_invitado) AS total_usuarios
      FROM cancha c
      JOIN espacio_deportivo e ON c.id_espacio = e.id_espacio
      LEFT JOIN reserva res ON c.id_cancha = res.id_cancha
      LEFT JOIN adquiere_qr aqr ON res.id_reserva = aqr.id_reserva
      LEFT JOIN resena r ON res.id_reserva = r.id_reserva
      GROUP BY 
        c.id_cancha, 
        c.nombre, 
        c.ubicacion, 
        c.capacidad, 
        c.estado, 
        c.monto_por_hora, 
        c.imagen_cancha,
        e.id_espacio, 
        e.nombre,
        e.direccion,
        e.horario_apertura,
        e.horario_cierre,
        e.descripcion
      ORDER BY c.id_cancha
      LIMIT $1 OFFSET $2
    `;
    
    const queryTotal = `SELECT COUNT(*) FROM cancha`;
    
    const [resultDatos, resultTotal] = await Promise.all([
      pool.query(queryDatos, [limite, offset]),
      pool.query(queryTotal)
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
const obtenerCanchasFiltradas = async (tipoFiltro, limite = 10, offset = 0) => {
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
      ORDER BY ${orden}
      LIMIT $1 OFFSET $2
    `;
    const queryTotal = `SELECT COUNT(*) FROM cancha`;

    const [resultDatos, resultTotal] = await Promise.all([
      pool.query(queryDatos, [limite, offset]),
      pool.query(queryTotal)
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
const buscarCanchas = async (texto, limite = 10, offset = 0) => {
  try {
    const queryDatos = `
      SELECT c.id_cancha, c.nombre, c.ubicacion, c.capacidad, c.estado, c.monto_por_hora, 
             e.id_espacio, e.nombre AS espacio_nombre
      FROM cancha c
      JOIN espacio_deportivo e ON c.id_espacio = e.id_espacio
      WHERE 
        c.nombre ILIKE $1 OR 
        c.ubicacion ILIKE $1 OR 
        e.nombre ILIKE $1
      ORDER BY c.nombre
      LIMIT $2 OFFSET $3
    `;

    const queryTotal = `
      SELECT COUNT(*) 
      FROM cancha c
      JOIN espacio_deportivo e ON c.id_espacio = e.id_espacio
      WHERE 
        c.nombre ILIKE $1 OR 
        c.ubicacion ILIKE $1 OR 
        e.nombre ILIKE $1
    `;
    
    const sanitizeInput = (input) => input.replace(/[%_\\]/g, '\\$&');
    const terminoBusqueda = `%${sanitizeInput(texto)}%`;
    
    const [resultDatos, resultTotal] = await Promise.all([
      pool.query(queryDatos, [terminoBusqueda, limite, offset]),
      pool.query(queryTotal, [terminoBusqueda])
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
const obtenerCanchaPorId = async (id) => {
  try {
    const query = `
      SELECT 
        c.*, 
        e.id_espacio, 
        e.nombre AS espacio_nombre, 
        e.direccion AS espacio_direccion,
        e.horario_apertura,
        e.horario_cierre,
        e.latitud AS espacio_latitud,
        e.longitud AS espacio_longitud
      FROM cancha c
      JOIN espacio_deportivo e ON c.id_espacio = e.id_espacio
      WHERE c.id_cancha = $1
    `;
    const result = await pool.query(query, [id]);
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
const eliminarCancha = async (id) => {
  try {
    const query = 'DELETE FROM cancha WHERE id_cancha = $1 RETURNING id_cancha';
    const result = await pool.query(query, [id]);
    return result.rows[0] || null;
  } catch (error) {
    throw error;
  }
};





// Agregar estas funciones al backend de cancha (cancha.js)

/**
 * Obtener disciplinas de una cancha específica
 */
const obtenerDisciplinasCancha = async (id_cancha) => {
  try {
    const query = `
      SELECT d.id_disciplina, d.nombre, d.descripcion, sp.frecuencia_practica
      FROM se_practica sp
      JOIN disciplina d ON sp.id_disciplina = d.id_disciplina
      WHERE sp.id_cancha = $1
    `;
    const result = await pool.query(query, [id_cancha]);
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
const asignarDisciplinasCancha = async (id_cancha, disciplinas) => {
  try {
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
    
    return await obtenerDisciplinasCancha(id_cancha);
  } catch (error) {
    throw error;
  }
};



/**
 * Obtener horarios disponibles de una cancha para una fecha específica
 */
const obtenerHorariosDisponiblesPorFecha = async (id_cancha, fecha) => {
  try {
    // Primero obtener los horarios de apertura y cierre de la cancha
    const queryCancha = `
      SELECT 
        c.id_cancha,
        c.nombre AS cancha_nombre,
        e.horario_apertura,
        e.horario_cierre
      FROM cancha c
      JOIN espacio_deportivo e ON c.id_espacio = e.id_espacio
      WHERE c.id_cancha = $1
    `;
    
    const canchaResult = await pool.query(queryCancha, [id_cancha]);
    
    if (!canchaResult.rows[0]) {
      throw new Error('Cancha no encontrada');
    }
    
    const { horario_apertura, horario_cierre, cancha_nombre } = canchaResult.rows[0];
    
    if (!horario_apertura || !horario_cierre) {
      throw new Error('La cancha no tiene horarios de apertura y cierre definidos');
    }

    // Obtener horarios ya reservados para esta cancha en la fecha especificada
    const queryHorariosReservados = `
      SELECT 
        rh.hora_inicio,
        rh.hora_fin
      FROM reserva_horario rh
      JOIN reserva r ON rh.id_reserva = r.id_reserva
      WHERE r.id_cancha = $1 AND rh.fecha = $2
      ORDER BY rh.hora_inicio
    `;
    
    const horariosReservadosResult = await pool.query(queryHorariosReservados, [id_cancha, fecha]);
    const horariosReservados = horariosReservadosResult.rows;

    // Generar todos los horarios posibles basados en el horario de apertura/cierre
    const generarHorariosDisponibles = (apertura, cierre) => {
      const formatTime = (timeStr) => {
        if (!timeStr) return '';
        const time = timeStr.toString().trim();
        
        if (/^\d{1,2}:\d{2}$/.test(time)) {
          const [hours, minutes] = time.split(':');
          return `${hours.padStart(2, '0')}:${minutes}`;
        }
        
        if (/^\d{1,2}:\d{2}:\d{2}$/.test(time)) {
          return time.substring(0, 5);
        }
        
        return time;
      };
      
      const aperturaFormateada = formatTime(apertura);
      const cierreFormateada = formatTime(cierre);
      
      const [horaApertura, minutoApertura] = aperturaFormateada.split(':').map(Number);
      const [horaCierre, minutoCierre] = cierreFormateada.split(':').map(Number);
      
      if (isNaN(horaApertura) || isNaN(horaCierre)) {
        return [];
      }
      
      const horarios = [];
      
      // Generar horarios de 1 hora desde apertura hasta cierre-1
      for (let hora = horaApertura; hora < horaCierre; hora++) {
        const horaInicio = `${hora.toString().padStart(2, '0')}:00`;
        const horaFin = `${(hora + 1).toString().padStart(2, '0')}:00`;
        
        horarios.push({
          hora_inicio: horaInicio,
          hora_fin: horaFin,
          label: `${horaInicio} - ${horaFin}`
        });
      }
      
      return horarios;
    };

    // Generar todos los horarios posibles
    const todosHorarios = generarHorariosDisponibles(horario_apertura, horario_cierre);
    
    // Filtrar horarios que no están reservados - LÓGICA CORREGIDA
    const horariosDisponibles = todosHorarios.filter(horario => {
      // Verificar si este horario se solapa con algún horario reservado
      const estaReservado = horariosReservados.some(horarioReservado => {
        const inicioDisponible = horario.hora_inicio;
        const finDisponible = horario.hora_fin;
        const inicioReservado = horarioReservado.hora_inicio.substring(0, 5); // Formatear a HH:MM
        const finReservado = horarioReservado.hora_fin.substring(0, 5); // Formatear a HH:MM
                
        // LÓGICA CORREGIDA: Un horario está ocupado si:
        // - El inicio disponible está DENTRO del horario reservado (>= inicioReservado y < finReservado)
        // - O el fin disponible está DENTRO del horario reservado (> inicioReservado y <= finReservado)
        // - O el horario disponible contiene completamente al horario reservado
        const solapamiento = (
          (inicioDisponible >= inicioReservado && inicioDisponible < finReservado) ||
          (finDisponible > inicioReservado && finDisponible <= finReservado) ||
          (inicioDisponible <= inicioReservado && finDisponible >= finReservado)
        );
        

        return solapamiento;
      });
      
      return !estaReservado;
    });

    return {
      cancha: {
        id_cancha,
        nombre: cancha_nombre,
        horario_apertura,
        horario_cierre
      },
      fecha,
      horarios_disponibles: horariosDisponibles,
      horarios_reservados: horariosReservados,
      total_disponibles: horariosDisponibles.length,
      total_reservados: horariosReservados.length
    };
    
  } catch (error) {
    console.error('Error en obtenerHorariosDisponiblesPorFecha:', error);
    throw error;
  }
};

/**
 * Obtener canchas de espacios gestionados por un admin (mismos datos que /datos-especificos de cancha)
 */
const obtenerCanchasPorAdmin = async (id_admin_esp_dep, limite = 10, offset = 0) => {
  try {
    const queryDatos = `
      SELECT 
        c.id_cancha, 
        c.nombre, 
        c.ubicacion, 
        c.capacidad, 
        c.estado, 
        c.monto_por_hora, 
        c.imagen_cancha,
        e.id_espacio, 
        e.nombre AS espacio_nombre,
        e.direccion AS espacio_direccion,
        e.horario_apertura,
        e.horario_cierre,
        e.descripcion AS espacio_descripcion
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
    console.error('Error en obtenerCanchasPorAdmin:', error);
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

    const { canchas, total } = await obtenerDatosEspecificos(limite, offset);
    
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
    const { tipo } = req.query;
    const limite = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;

    const tiposValidos = ['nombre', 'estado', 'monto'];
    if (!tipo || !tiposValidos.includes(tipo)) {
      return res.status(400).json(respuesta(false, 'El parámetro "tipo" es inválido o no proporcionado'));
    }

    const { canchas, total } = await obtenerCanchasFiltradas(tipo, limite, offset);

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
    const { q } = req.query;
    const limite = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;

    if (!q) {
      return res.status(400).json(respuesta(false, 'El parámetro de búsqueda "q" es requerido'));
    }

    const { canchas, total } = await buscarCanchas(q, limite, offset);
    
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

    if (!id || isNaN(id)) {
      return res.status(400).json(respuesta(false, 'ID de cancha no válido'));
    }

    const cancha = await obtenerCanchaPorId(parseInt(id));
    if (!cancha) {
      return res.status(404).json(respuesta(false, 'Cancha no encontrada'));
    }

    // Obtener disciplinas de la cancha
    const disciplinas = await obtenerDisciplinasCancha(parseInt(id));

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
    const canchaActual = await obtenerCanchaPorId(parseInt(id));

    if (!id || isNaN(id)) {
      return res.status(400).json(respuesta(false, 'ID de cancha no válido'));
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

    if (!id || isNaN(id)) {
      return res.status(400).json(respuesta(false, 'ID de cancha no válido'));
    }

    const canchaEliminada = await eliminarCancha(parseInt(id));

    if (!canchaEliminada) {
      return res.status(404).json(respuesta(false, 'Cancha no encontrada'));
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
    const { disciplinas } = req.body;

    if (!id || isNaN(id)) {
      return res.status(400).json(respuesta(false, 'ID de cancha no válido'));
    }

    const disciplinasActualizadas = await asignarDisciplinasCancha(parseInt(id), disciplinas);
    
    res.json(respuesta(true, 'Disciplinas asignadas correctamente', { 
      disciplinas: disciplinasActualizadas 
    }));
  } catch (error) {
    console.error('Error en asignarDisciplinas:', error.message);
    res.status(500).json(respuesta(false, error.message));
  }
};

/**
 * Controlador para obtener horarios disponibles por fecha
 */
const obtenerHorariosDisponiblesController = async (req, res) => {
  try {
    const { id } = req.params;
    const { fecha } = req.query;
    
    if (!id || isNaN(id)) {
      return res.status(400).json(respuesta(false, 'ID de cancha no válido'));
    }
    
    if (!fecha) {
      return res.status(400).json(respuesta(false, 'Parámetro "fecha" es requerido (formato: YYYY-MM-DD)'));
    }

    // Validar formato de fecha
    const fechaRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!fechaRegex.test(fecha)) {
      return res.status(400).json(respuesta(false, 'Formato de fecha inválido. Use YYYY-MM-DD'));
    }

    // Validar que la fecha sea válida
    const fechaObj = new Date(fecha);
    if (isNaN(fechaObj.getTime())) {
      return res.status(400).json(respuesta(false, 'Fecha inválida'));
    }

    const resultado = await obtenerHorariosDisponiblesPorFecha(parseInt(id), fecha);
    
    res.json(respuesta(true, 'Horarios disponibles obtenidos correctamente', resultado));
    
  } catch (error) {
    console.error('Error en obtenerHorariosDisponiblesController:', error.message);
    res.status(500).json(respuesta(false, error.message));
  }
};

const obtenerCanchasAdminController = async (req, res) => {
  try {
    const { id_admin_esp_dep } = req.params;
    if (!id_admin_esp_dep || isNaN(id_admin_esp_dep)) {
      return res.status(400).json(respuesta(false, 'ID de administrador inválido'));
    }
    const limite = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;
    const { canchas, total } = await obtenerCanchasPorAdmin(parseInt(id_admin_esp_dep), limite, offset);
    res.json(respuesta(true, 'Canchas del administrador obtenidas', {
      canchas,
      paginacion: { limite, offset, total }
    }));
  } catch (error) {
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


router.get('/disciplinas', obtenerDisciplinasController);
router.get('/dato-individual/:id', obtenerCanchaPorIdController); // Ya existe, pero modificada
router.post('/:id/disciplinas', asignarDisciplinasController);
router.get('/horarios-disponibles/:id', obtenerHorariosDisponiblesController);

router.get('/datos-segun-rol/:id_admin_esp_dep', obtenerCanchasAdminController);

module.exports = router;