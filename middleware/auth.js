const jwt = require('jsonwebtoken');
const pool = require('../config/database');

// Clave secreta para JWT (usa variable de entorno en producción)
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key';

// Middleware para verificar el token JWT
const verifyToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader?.split(' ')[1]; // Authorization: Bearer <token>

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Token no proporcionado',
    });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    console.log(decoded);
    req.user = { id_persona: decoded.id_persona };
    console.log(req.user);

    // Consulta para obtener el rol del usuario
    const query = `
      SELECT 'ADMINISTRADOR' AS rol FROM ADMINISTRADOR WHERE id_administrador = $1
      UNION
      SELECT 'ADMIN_ESP_DEP' AS rol FROM ADMIN_ESP_DEP WHERE id_admin_esp_dep = $1
      UNION
      SELECT 'CLIENTE' AS rol FROM CLIENTE WHERE id_cliente = $1
      UNION
      SELECT 'DEPORTISTA' AS rol FROM DEPORTISTA WHERE id_deportista = $1
      UNION
      SELECT 'CONTROL' AS rol FROM CONTROL WHERE id_control = $1
    `;
    const result = await pool.query(query, [decoded.id_persona]);

    req.user.roles = result.rows.map(r => r.rol.toUpperCase());
    console.log(`Usuario ${req.user.id_persona} autenticado con roles: ${req.user.roles.join(', ')}`);

    console.log(req.user.roles);

    if (!req.user.roles || req.user.roles.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'Rol no encontrado para este usuario',
      });
    }

    next();
  } catch (error) {
    // Captura tipos de error específicos
    if (error.name === 'TokenExpiredError') {
      console.warn('Intento con token expirado');
      return res.status(401).json({
        success: false,
        message: 'Token expirado, por favor inicie sesión nuevamente',
      });
    }

    if (error.name === 'JsonWebTokenError') {
      console.warn('Intento con token inválido');
      return res.status(401).json({
        success: false,
        message: 'Token inválido',
      });
    }

    console.error('Error inesperado al verificar token:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Error interno al verificar token',
    });
  }
};

// Middleware para verificar roles
const checkRole = (roles) => {
  return (req, res, next) => {
    const tieneAcceso = req.user.roles.some(rol => roles.includes(rol));
    if (!tieneAcceso) {
      return res.status(403).json({
        success: false,
        message: `Acceso denegado. Se requiere uno de los siguientes roles: ${roles.join(', ')}`,
      });
    }
    next();
  };
};

module.exports = { verifyToken, checkRole };
