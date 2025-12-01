const express = require('express');
const pool = require('../../config/database');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { verifyToken, checkRole } = require('../../middleware/auth');
const { validateUsuarioFields } = require('../../middleware/validate');
const path = require('path');
const fs = require('fs').promises;
const { unlinkFile, createUploadAndProcess } = require("../../middleware/multer");

// Clave secreta para JWT (en producción, usar variable de entorno)
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key';

// --- Modelos ---

// Función de respuesta estandarizada
const respuesta = (exito, mensaje, datos = null) => ({
  exito,
  mensaje,
  datos,
});

const obtenerEspaciosDeportivosSinAdmin = async () => {
  try {
    const query = `
      SELECT id_espacio, nombre 
      FROM ESPACIO_DEPORTIVO 
      WHERE id_admin_esp_dep IS NULL
      ORDER BY nombre
    `;
    const result = await pool.query(query);
    return result.rows;
  } catch (error) {
    console.error('Error en obtenerEspaciosDeportivosSinAdmin:', error);
    throw error;
  }
};

// Lista de roles disponibles excluyendo Administrador
const obtenerRolesSinAdministrador = () => {
  return [
    { valor: 'cliente', etiqueta: 'Cliente' },
    { valor: 'admin_esp_dep', etiqueta: 'Administrador Espacio Deportivo' },
    { valor: 'control', etiqueta: 'Control' }
  ];
};

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


/**
 * Crear nuevo usuario
 * - Acepta usuario, correo y contraseña
 * - Si solicitud viene vacía: asigna automáticamente rol 'cliente'
 * - Si solicitud NO viene vacía: solo llena el campo solicitud en la tabla USUARIO
 */
const crearUsuario = async (datosUsuario) => {
  try {
    // --- Rango aproximado de La Paz ---
    const LAT_MIN = -16.65;
    const LAT_MAX = -16.45;
    const LON_MIN = -68.25;
    const LON_MAX = -68.05;

    // --- Validación y asignación de coordenadas ---
    const randomInRange = (min, max) => Math.random() * (max - min) + min;
    let latitud = parseFloat(randomInRange(LAT_MIN, LAT_MAX).toFixed(6));
    let longitud = parseFloat(randomInRange(LON_MIN, LON_MAX).toFixed(6));

    // --- Validaciones adicionales ---
    const validarCorreo = (correo) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo);

    if (!validarCorreo(datosUsuario.correo)) {
      throw new Error('El correo electrónico no es válido');
    }

    // --- Hash de la contraseña ---
    const contrasenaHash = await bcrypt.hash(datosUsuario.contrasena || '123456', 10);

    // --- Procesar campo solicitud ---
    let solicitudArray = [];
    if (datosUsuario.solicitud) {
      // Si viene como string, convertir a array
      if (typeof datosUsuario.solicitud === 'string') {
        try {
          solicitudArray = JSON.parse(datosUsuario.solicitud);
        } catch (error) {
          solicitudArray = [datosUsuario.solicitud];
        }
      } else if (Array.isArray(datosUsuario.solicitud)) {
        solicitudArray = datosUsuario.solicitud;
      }
      
      // Validar que cada elemento no exceda 150 caracteres
      solicitudArray.forEach((solicitud, index) => {
        if (solicitud.length > 150) {
          throw new Error(`La solicitud en posición ${index} excede los 150 caracteres`);
        }
      });
    }

    // --- Inserción SQL en usuario ---
    const queryUsuario = `
      INSERT INTO usuario (
        usuario, contrasena, correo, latitud, longitud, solicitud,
        nombre, apellido
      ) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id_persona
    `;
    const valuesUsuario = [
      datosUsuario.usuario,
      contrasenaHash,
      datosUsuario.correo,
      latitud,
      longitud,
      solicitudArray,
      datosUsuario.nombre || null,
      datosUsuario.apellido || null
    ];
    const resultUsuario = await pool.query(queryUsuario, valuesUsuario);
    const idUsuario = resultUsuario.rows[0].id_persona;

    let rolAsignado = null;
    let mensajeRol = '';

    rolAsignado = await asignarRolCliente(idUsuario, {});
    
    // --- Lógica para asignar roles ---
    if (solicitudArray.length === 0) {
      // Si NO hay solicitudes, asignar automáticamente rol 'cliente'
      mensajeRol = 'Usuario creado como Cliente';
    } else {
      // Si HAY solicitudes, NO asignar rol automáticamente
      // Solo se guardan las solicitudes en el campo solicitud
      mensajeRol = 'Usuario creado con solicitudes pendientes';
    }

    // Obtener datos completos para retornar
    const usuarioCompleto = await obtenerUsuarioPorId(idUsuario);
    
    return { 
      ...usuarioCompleto, 
      rol_asignado: rolAsignado,
      mensaje: mensajeRol,
      solicitudes: solicitudArray
    };
  } catch (error) {
    console.error('Error in crearUsuario:', error);
    throw new Error(error.message);
  }
};

/**
 * Funciones específicas para cada rol
 */
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
    datos.ci_complemento || null
  ];
  const result = await pool.query(query, values);
  return result.rows[0];
};


const obtenerUsuarioPorId = async (id) => {
  try {
    const query = `
      SELECT id_persona, nombre, apellido, correo, usuario, telefono, 
             sexo, imagen_perfil, latitud, longitud, fecha_creacion
      FROM usuario 
      WHERE id_persona = $1
    `;
    const result = await pool.query(query, [id]);

    if (!result.rows[0]) return null;
    
    // Obtener TODOS los roles del usuario
    const rolesUsuario = await obtenerRolesUsuario(id);
    
    console.log(rolesUsuario)
    
    return {
      ...result.rows[0],
      roles: rolesUsuario
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
          tabla: tabla
        });
      }
    }
    
    return roles;
  } catch (error) {
    console.error('Error in obtenerRolesUsuario:', error);
    throw error;
  }
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
    datos.ultimo_login || null
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
    datos.estado !== undefined ? datos.estado : true
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
    datos.disciplina_principal || null
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
    datos.estado !== undefined ? datos.estado : true
  ];
  const result = await pool.query(query, values);
  return result.rows[0];
};


















async function loginUsuario(correo, contrasena) { 
  const query = 'SELECT * FROM USUARIO WHERE correo = $1'; 
  const result = await pool.query(query, [correo]); 
  const usuario = result.rows[0]; 
    
  if (!usuario) throw new Error('Correo no encontrado'); 

  const isMatch = await bcrypt.compare(contrasena, usuario.contrasena); 
  if (!isMatch) throw new Error('contrasena incorrecta'); 

  // Determinar los roles según las tablas relacionadas
  let role = 'X'; // rol principal (comportamiento existente)
  let role2 = null; // segundo rol (nuevo)

  // Array para almacenar todos los roles encontrados
  const rolesEncontrados = [];

  // Verificar cada rol y guardar en el array
  const resAdmin = await pool.query('SELECT 1 FROM ADMINISTRADOR WHERE id_administrador=$1', [usuario.id_persona]);
  if (resAdmin.rowCount > 0) rolesEncontrados.push('ADMINISTRADOR');
  
  const resCliente = await pool.query('SELECT 1 FROM CLIENTE WHERE id_cliente=$1', [usuario.id_persona]);
  if (resCliente.rowCount > 0) rolesEncontrados.push('CLIENTE');

  const resAdminEsp = await pool.query('SELECT 1 FROM ADMIN_ESP_DEP WHERE id_admin_esp_dep=$1', [usuario.id_persona]);
  if (resAdminEsp.rowCount > 0) rolesEncontrados.push('ADMIN_ESP_DEP');
  
  const resControl = await pool.query('SELECT 1 FROM CONTROL WHERE id_control=$1', [usuario.id_persona]);
  if (resControl.rowCount > 0) rolesEncontrados.push('CONTROL');
  
  // Mantener el comportamiento original para 'role'
  if (rolesEncontrados.length > 0) {
    role = rolesEncontrados[0]; // Primer rol encontrado (comportamiento actual)
  }

  // Asignar role2 si hay más de un rol
  if (rolesEncontrados.length > 1) {
    role2 = rolesEncontrados[1]; // Segundo rol
  }

  console.log('Role principal:', role);
  console.log('Role secundario:', role2);
  console.log('Todos los roles encontrados:', rolesEncontrados);

  return { 
    id_persona: usuario.id_persona,
    nombre: usuario.nombre,
    usuario: usuario.usuario,
    apellido: usuario.apellido,
    correo: usuario.correo,
    sexo: usuario.sexo,
    imagen_perfil: usuario.imagen_perfil,
    role, // ← Rol principal (comportamiento existente)
    role2 // ← Nuevo rol secundario
  };
}


const actualizarUsuario = async (id, camposActualizar) => {
  try {
    const camposPermitidosUsuario = [
      'nombre', 'apellido', 'telefono', 'sexo', 'correo',
      'imagen_perfil', 'contrasena'
    ];

    // Separar campos
    const camposUsuario = {};

    camposPermitidosUsuario.forEach(key => {
      if (key in camposActualizar) {
        camposUsuario[key] = camposActualizar[key] || null;
      }
    });

    // Validar sexo si se proporciona
    if (camposUsuario.sexo) {
      const sexosPermitidos = await obtenerValoresEnum('sexo_enum');
      if (!sexosPermitidos.includes(camposUsuario.sexo)) {
        throw new Error(`El valor para sexo no es válido. Valores permitidos: ${sexosPermitidos.join(', ')}`);
      }
    }

    // Validar correo si se proporciona
    if (camposUsuario.correo) {
      const validarCorreo = (correo) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo);
      if (!validarCorreo(camposUsuario.correo)) {
        throw new Error('El correo electrónico no es válido');
      }
    }

    // Validar teléfono si se proporciona
    if (camposUsuario.telefono) {
      const validarTelefono = (telefono) => /^\+?\d{8,15}$/.test(telefono);
      if (!validarTelefono(camposUsuario.telefono)) {
        throw new Error('El número de teléfono no es válido');
      }
    }

    // Encriptar contraseña si se incluye
    if (camposUsuario.contrasena) {
      const salt = await bcrypt.genSalt(10);
      camposUsuario.contrasena = await bcrypt.hash(camposUsuario.contrasena, salt);
    }

    // Si no hay nada que actualizar
    if (Object.keys(camposUsuario).length === 0) {
      throw new Error('No se proporcionaron campos válidos para actualizar');
    }

    // Construir consulta dinámica
    const setClause = Object.keys(camposUsuario)
      .map((campo, index) => `${campo} = $${index + 2}`)
      .join(', ');
    const values = [id, ...Object.values(camposUsuario)];

    const query = `
      UPDATE usuario
      SET ${setClause}
      WHERE id_persona = $1
      RETURNING id_persona, nombre, apellido, correo, usuario, telefono, sexo, imagen_perfil
    `;

    const result = await pool.query(query, values);
    const usuarioActualizado = result.rows[0];

    if (!usuarioActualizado) {
      throw new Error('Usuario no encontrado');
    }

    // Obtener datos completos después de actualizar
    const usuarioCompleto = await obtenerUsuarioPorId(id);
    return usuarioCompleto;

  } catch (error) {
    console.error('❌ Error en actualizarUsuario:', error.message);
    throw error;
  }
};

// --- Controladores ---


/**
 * Controlador para GET /dato-individual/:id
 */
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

const login = async (req, res) => {
  const { correo, contrasena } = req.body;

  if (!correo || !contrasena) {
    return res.status(400).json(respuesta(false, 'Correo y contraseña son obligatorios'));
  }

  try {
    const usuario = await loginUsuario(correo, contrasena);
    console.log(usuario.nombre, "logueado")
    const token = jwt.sign(
      { id_persona: usuario.id_persona, role: usuario.role }, 
      JWT_SECRET, 
      { expiresIn: '5h' }
    );
    console.log(`✅ [${req.method}] ejecutada con éxito.`, "url solicitada:", req.originalUrl);
    res.status(200).json(respuesta(true, 'Login exitoso', { token, usuario }));
  } catch (error) {
    console.error('Error en login:', error.message);
    
    if (error.message.includes('Correo no encontrado') || error.message.includes('contraseña incorrecta')) {
      return res.status(401).json(respuesta(false, 'Credenciales inválidas'));
    }
    res.status(500).json(respuesta(false, 'Error interno del servidor'));
  }
};

const actualizarUsuarioController = async (req, res) => {
  let uploadedFile = null;
  let oldFileToDelete = null;
  const nombreFolder = "usuario";

  try {
    const { id } = req.params;
    const usuarioActual = await obtenerUsuarioPorId(parseInt(id));

    if (!id || isNaN(id)) {
      return res.status(400).json(respuesta(false, 'ID de usuario no válido'));
    }

    if (!usuarioActual) {
      return res.status(404).json(respuesta(false, 'Usuario no encontrado'));
    }

    // Procesar archivo subido con Multer (imagen_perfil, opcional)
    const processedFiles = await createUploadAndProcess(["imagen_perfil"], nombreFolder, usuarioActual.nombre)(req, res);

    // Preparar campos para actualizar
    const camposActualizar = { ...req.body };

    // Si se subió nueva imagen, agregarla a los campos a actualizar
    if (processedFiles.imagen_perfil) {
      camposActualizar.imagen_perfil = processedFiles.imagen_perfil;
      uploadedFile = camposActualizar.imagen_perfil;
      if (usuarioActual && usuarioActual.imagen_perfil) {
        oldFileToDelete = usuarioActual.imagen_perfil;
      }
    }

    // Validar si no hay nada que actualizar
    if (Object.keys(camposActualizar).length === 0 && !processedFiles.imagen_perfil) {
      // Limpiar archivo nuevo si no hay campos para actualizar
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

    // Eliminar archivo anterior después de una actualización exitosa
    if (oldFileToDelete) {
      await unlinkFile(oldFileToDelete).catch(err => {
        console.warn('⚠️ No se pudo eliminar el archivo anterior:', err.message);
      });
    }

    let mensaje = 'Usuario actualizado correctamente';
    if (processedFiles.imagen_perfil) {
      mensaje += '. Imagen de perfil actualizada';
    }

    res.json(respuesta(true, mensaje, { usuario: usuarioActualizado }));
    console.log("Usuario actualizado en registro", usuarioActualizado.nombre);
  } catch (error) {
    console.error('Error in actualizarUsuarioController:', error);

    // Limpiar archivo subido en caso de error
    if (uploadedFile) {
      await unlinkFile(uploadedFile);
    }

    res.status(500).json(respuesta(false, error.message));
  }
};


/**
 * Controlador para POST - Crear usuario
 * Acepta: usuario, correo, contrasena, solicitud (opcional)
 */
const crearUsuarioController = async (req, res) => {
  try {
    const datos = { ...req.body }; // Ahora es JSON

    // --- Validar campos obligatorios ---
    const camposObligatorios = ['usuario', 'correo', 'contrasena'];
    const faltantes = camposObligatorios.filter(campo => 
      !datos[campo] || datos[campo].toString().trim() === ''
    );

    if (faltantes.length > 0) {
      return res.status(400).json(
        respuesta(false, `Faltan campos obligatorios: ${faltantes.join(', ')}`)
      );
    }

    // --- Parsear solicitud si es string ---
    if (datos.solicitud) {
      if (typeof datos.solicitud === 'string') {
        try {
          datos.solicitud = JSON.parse(datos.solicitud);
        } catch (e) {
          datos.solicitud = [datos.solicitud];
        }
      } else if (!Array.isArray(datos.solicitud)) {
        datos.solicitud = [datos.solicitud];
      }
    } else {
      datos.solicitud = [];
    }

    const nuevoUsuario = await crearUsuario(datos);

    res.status(201).json(
      respuesta(true, nuevoUsuario.mensaje || 'Usuario creado correctamente', { usuario: nuevoUsuario })
    );
  } catch (error) {
    console.error('Error in crearUsuarioController:', error);
    if (error.code === '23505') {
      return res.status(400).json(respuesta(false, 'El correo o usuario ya existe'));
    }
    res.status(500).json(respuesta(false, error.message));
  }
};

const listaEspaciosDeportivos = async (req, res) => {
  try {
    const espacios = await obtenerEspaciosDeportivosSinAdmin();
    
    res.json(respuesta(
      true, 
      'Espacios deportivos sin administrador obtenidos correctamente', 
      { espacios }
    ));
    
    console.log(`✅ [${req.method}] ${req.originalUrl} ejecutada con éxito. ${espacios.length} espacios encontrados`);
  } catch (error) {
    console.error('Error en listaEspaciosDeportivos:', error);
    res.status(500).json(respuesta(false, 'Error al obtener los espacios deportivos'));
  }
};

/**
 * Controlador para GET /roles-sin-administrador
 * Devuelve todos los roles disponibles excepto Administrador
 */
const obtenerRolesController = async (req, res) => {
  try {
    const roles = obtenerRolesSinAdministrador();
    
    res.json(respuesta(
      true, 
      'Roles obtenidos correctamente (excluyendo Administrador)', 
      { roles }
    ));
    
    console.log(`✅ [${req.method}] ${req.originalUrl} ejecutada con éxito. ${roles.length} roles encontrados`);
  } catch (error) {
    console.error('Error en obtenerRolesSinAdministradorController:', error);
    res.status(500).json(respuesta(false, 'Error al obtener los roles'));
  }
};

// --- Rutas ---
const router = express.Router();


router.get('/dato-individual/:id', obtenerUsuarioPorIdController);
router.get('/espacios-deportivos-sin-admin', listaEspaciosDeportivos);
router.get('/roles', obtenerRolesController); // Nueva ruta

router.post('/sign-in', login);
router.post('/nuevo-usuario', crearUsuarioController);
router.patch('/:id', actualizarUsuarioController);

module.exports = router;