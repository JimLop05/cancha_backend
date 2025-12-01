const pool = require("../config/database");

async function borrarDatosTabla(nombreTabla){
    try{
        const query = `
            TRUNCATE TABLE ${nombreTabla} 
            RESTART IDENTITY CASCADE
        `;
        await pool.query(query);
        console.log(`Todos los datos de la tabla ${nombreTabla} han sido borrados`);

    }catch (error){
        console.error('Error al borrar los datos', error.message);
    }
}

async function agregarColumna(nombreTabla, nombreColumna, tipoDato){
    try{
        const query = `
            ALTER TABLE ${nombreTabla} 
            ADD COLUMN ${nombreColumna} ${tipoDato}
        `;
        await pool.query(query);
        console.log(`Columna '${nombreColumna}' agregada con éxito `);
    }catch(error){
        console.error("Error al agregar columna ", error.message);
    }
}

async function renombrarColumna(nombreTabla, nombreActual, nombreModificado){
    try{
        const query = `
            ALTER TABLE ${nombreTabla}
            RENAME COLUMN ${nombreActual} TO ${nombreModificado}
        `;
        await pool.query(query);
        console.log(`Se logro cambiar ${nombreActual} a ${nombreModificado}`)
    }catch(error){
        console.error('Error al renombrar la columna', error.message)
    }
}

async function borrarAtributo(nombreTabla, nombreColumna) {
    try{
        const query = `
            ALTER TABLE ${nombreTabla}
            DROP COLUMN ${nombreColumna}
        `;
        await pool.query(query);
        console.log("Columna borrada con éxito");
    }catch (error){
        console.error(`Columna ${nombreColumna} borrada con éxito.`);
    }
}

let nombreTabla = 'x_imagen';
// await borrarDatosTabla(nombreTabla)
// await agregarColumna(nombreTabla, 'nombre_columna', 'TIMESTAMP DEFAULT NOW()')
// await renombrarColumna(nombreTabla, 'atributo_antiguo', 'atributo_nuevo');
// await borrarAtributo(nombreTabla, 'nombre_columna');

