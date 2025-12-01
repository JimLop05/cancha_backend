const express = require("express");
const pool = require("../config/database");
const path = require("path");
const fs = require("fs").promises;
const { unlinkFile, createUploadAndProcess } = require("../middleware/multer");

const router = express.Router();

/* ===========================
   MODELOS (DB QUERIES)
   =========================== */
async function createImage(imagen) {
  try{
      const query = (
        `INSERT INTO X_IMAGEN (imagen) 
        VALUES ($1) 
        RETURNING *`
      );
      const values = [imagen]
      const result = await pool.query(query, values);
      console.log(result.rows[0]);
      return result.rows[0];
  } catch(error) {
    throw new Error('Error al cargar la imagen' + error.message);
  }
}

// READ - todos
async function getAllImages() {
  const result = await pool.query(
    `SELECT * FROM x_imagen ORDER BY id_imagen ASC`
  );
  return result.rows;
}

// READ - por id
async function getImageById(id) {
  const result = await pool.query(
    `SELECT * FROM x_imagen WHERE id_imagen = $1`,
    [id]
  );
  return result.rows[0];
}

// UPDATE
async function updateImage(id, imagen) {
  const result = await pool.query(
    `UPDATE x_imagen SET imagen = $1 WHERE id_imagen = $2 RETURNING *`,
    [imagen, id]
  );
  return result.rows[0];
}

// DELETE
async function deleteImage(id) {
  const result = await pool.query(
    `DELETE FROM x_imagen WHERE id_imagen = $1 RETURNING *`,
    [id]
  );
  return result.rows[0];
}


/* ===========================
   CONTROLADORES
   =========================== */

// POST - Crear imagen
const crearImagen = async (req, res) => {

  let imagePath = null; // 🔹 recordar la ruta para posible unlink
  let nombre_imagen_ini = 'usuario'
  try {
    const uploadFolder = "x_prueba";
    // Subida + procesamiento
    imagePath = await createUploadAndProcess("imagen", uploadFolder, nombre_imagen_ini)(req, res);

    // Guardar en base de datos
    const nuevaImagen = await createImage(imagePath);

    res.status(201).json({
      success: true,
      data: nuevaImagen,
    });
  } catch (error) {
    console.error("❌ Error al crear imagen:", error.message);

    // 🔹 eliminar archivo si se generó
    if (imagePath) {
      await unlinkFile(imagePath);
    }

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};


// GET - Obtener todas
const obtenerImagen = async (req, res) => {
  try {
    const data = await getAllImages();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET - Obtener una por id
const obtenerImagePorId = async (req, res) => {
  try {
    const { id } = req.params;
    const data = await getImageById(id);
    if (!data) return res.status(404).json({ success: false, message: "No encontrada" });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// PATCH - Actualizar imagen
const actualizarImagen = async (req, res) => {
  const uploadFolder = "x_prueba";
  let newImagePath = null;

  try {
    const { id } = req.params;

    // 1️⃣ Subir y procesar la nueva imagen (verificación incluida)
    newImagePath = await createUploadAndProcess("imagen", uploadFolder, "img")(req, res)
      .then((path) => {
        if (!path) throw new Error("No se recibió ninguna imagen para actualizar");
        return path;
      });

    // 2️⃣ Obtener imagen antigua (si existe)
    const oldImage = await getImageById(id);

    // 3️⃣ Actualizar la BD (si el registro no existe, igual se intenta crear/actualizar según lógica del modelo)
    const updatedImage = await updateImage(id, newImagePath);

    // 4️⃣ Si existe imagen previa, eliminarla del disco
    if (oldImage && oldImage.imagen) {
      await unlinkFile(oldImage.imagen).catch(() => {
        console.warn("⚠️ No se pudo eliminar la imagen anterior (no existe en disco)");
      });
    }

    // 5️⃣ Responder éxito
    return res.status(200).json({
      success: true,
      data: updatedImage,
    });

  } catch (error) {
    console.error("❌ Error al actualizar imagen:", error.message);

    // 🔹 Limpieza: si la nueva imagen se subió pero hubo error, la eliminamos
    if (newImagePath) {
      await unlinkFile(newImagePath);
    }

    return res.status(500).json({
      success: false,
      message: "Error al actualizar la imagen: " + error.message,
    });
  }
};

// DELETE - Eliminar imagen
const borrarImagen = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await deleteImage(id);

    if (!deleted) return res.status(404).json({ success: false, message: "No encontrada" });
    await unlinkFile(deleted.imagen);   //borrar archivo fisico

    res.json({ success: true, message: "Eliminada correctamente" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/* ===========================
   RUTAS
   =========================== */
router.post("/", crearImagen);          // Crear
router.get("/", obtenerImagen);         // Listar todas
router.get("/:id", obtenerImagePorId);  // Obtener una
router.patch("/:id", actualizarImagen);    // Actualizar
router.delete("/:id", borrarImagen);   // Eliminar

module.exports = router;
