const response = (success, message, data = null) => ({
  success,
  message,
  data,
});

const validateUsuarioFields = (req, res, next) => {
  if (!req.body) {
    return res.status(400).json(response(false, 'El cuerpo de la solicitud está vacío'));
  }

  // Los campos están en req.body después de que multer procesa multipart/form-data
  const { contrasena, correo } = req.body;

  if (!contrasena || !correo) {
    return res.status(400).json(response(false, 'Contraseña y correo son obligatorios'));
  }

  if (correo && !correo.trim()) {
    return res.status(400).json(response(false, 'Correo no puede estar vacío'));
  }

  next();
};

module.exports = { validateUsuarioFields };