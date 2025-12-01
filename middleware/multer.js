const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const sharp = require('sharp');

// Configura multer para manejar la subida de múltiples archivos
const createUpload = (fieldNames = ['imagen']) => {
  const storage = multer.memoryStorage(); // Guardar archivo en memoria

  const fileFilter = (req, file, cb) => {
    const allowedExtensions = ['.jpeg', '.jpg', '.png', '.webp', '.gif'];
    const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];

    const fileExt = path.extname(file.originalname).toLowerCase();
    const fileMime = file.mimetype;

    if (!allowedExtensions.includes(fileExt)) {
      return cb(new Error(`Extensión no permitida: ${fileExt}`));
    }

    if (!allowedMimes.includes(fileMime)) {
      return cb(new Error(`Tipo MIME no permitido: ${fileMime}`));
    }

    cb(null, true);
  };

  const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  }).fields(fieldNames.map(field => ({ name: field, maxCount: 1 })));

  // Envolvemos en Promesa
  return (req, res) =>
    new Promise((resolve, reject) => {
      upload(req, res, (err) => {
        if (err) return reject(err);
        resolve(req.files || {}); // Devolvemos req.files (puede estar vacío)
      });
    });
};

// =========================
// processImage separado
// =========================
const processImage = (folder = 'sin_ruta') => {
  return async (file, baseName) => {
    if (!file) return null;

    try {
      const uploadPath = path.join(__dirname, '../Uploads', folder);
      await fs.mkdir(uploadPath, { recursive: true });

      // Usar baseName proporcionado, con sanitización
      const sanitizedBaseName = (baseName || 'user').replace(/[^a-zA-Z0-9]/g, '_');
      
      const now = new Date().toISOString().replace(/T/, '_').replace(/:/g, '-').split('.')[0];
      const random = Math.floor(Math.random() * 90000 + 10000);
      const ext = '.jpg';
      const filename = `${sanitizedBaseName}-${now}-${random}${ext}`;
      const filePath = path.join(uploadPath, filename);

      // Redimensionar imagen a máximo 800x800 con Sharp
      await sharp(file.buffer)
        .resize(800, 800, { fit: 'inside' }) // Redimensiona manteniendo proporción
        .jpeg({ quality: 80 }) // Convierte a JPEG con calidad 80%
        .toFile(filePath); // Guardar con extensión .jpg

      // Devolver solo la ruta pública
      return `/Uploads/${folder}/${filename}`;
    } catch (error) {
      throw new Error(`Error al procesar la imagen: ${error.message}`);
    }
  };
};

// =========================
// unlinkFile: eliminar archivo de disco
// =========================
const unlinkFile = async (filePath) => {
  if (!filePath) return;
  try {
    const absolutePath = path.resolve(__dirname, "..", "." + filePath);
    await fs.unlink(absolutePath);
    console.log("🧹 Archivo eliminado:", absolutePath);
  } catch (err) {
    console.warn("⚠️ No se pudo eliminar el archivo:", err.message);
  }
};

// =========================
// Función combinada: Subida + Procesamiento
// =========================
const createUploadAndProcess = (fieldNames = ['imagen'], folder = 'sin_ruta', baseName = 'user') => {
  const process = processImage(folder);
  return async (req, res) => {
    // Subir archivos
    const files = await createUpload(fieldNames)(req, res);

    // Procesar cada archivo y devolver un objeto con las rutas
    const processedFiles = {};
    for (const fieldName of fieldNames) {
      if (files[fieldName] && files[fieldName][0]) {
        processedFiles[fieldName] = await process(files[fieldName][0], baseName);
      }
    }
    return processedFiles;
  };
};

module.exports = { createUpload, processImage, createUploadAndProcess, unlinkFile };