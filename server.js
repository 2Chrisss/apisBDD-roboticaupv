const express = require('express');
const mysql = require('mysql2/promise');
const app = express();
const cors = require('cors');


const PORT = 3000; 

app.use(cors());
app.use(express.json());

const pool = mysql.createPool({
    host: 'localhost',      
    user: 'chris',          
    password: '1234#AbC_!', 
    database: 'MonitorRobots',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

const cachePermisos = new Map();
const CACHE_TTL = 5 * 60 * 1000; 

async function obtenerPermisosRobot(connection, idRobot) {
    const cacheKey = `robot_${idRobot}`;
    const cached = cachePermisos.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.data;
    }
    
    const sqlPermisos = `
        SELECT c.nombreCaracteristica, c.idCaracteristica
        FROM Robot r
        JOIN TipoRobotCaracteristica trc ON r.idTipoRobot = trc.idTipoRobot
        JOIN Caracteristica c ON trc.idCaracteristica = c.idCaracteristica
        WHERE r.idRobot = ?
    `;
    
    const [reglas] = await connection.execute(sqlPermisos, [idRobot]);
    
    cachePermisos.set(cacheKey, {
        data: reglas,
        timestamp: Date.now()
    });
    
    return reglas;
}
app.post('/api/registrarDatos', async (req, res) => {
    let connection;
    try {
        const datos = req.body;
        const idRobot = datos.id;

        if (!idRobot) return res.status(400).json({ error: 'Falta id del robot' });

        connection = await pool.getConnection();

        
        const reglas = await obtenerPermisosRobot(connection,idRobot);

        if (reglas.length === 0) {
            return res.status(403).json({ error: 'Este robot no tiene características configuradas o no existe' });
        }


        const mapaPermitido = {};
        reglas.forEach(fila => {
            mapaPermitido[fila.nombreCaracteristica] = fila.idCaracteristica;
        });

        const filasParaInsertar = [];
        const ahora = new Date();
        for (const key in datos) {
            if (key === 'id') continue;
            if (mapaPermitido[key]) { 
                const idCaracteristica = mapaPermitido[key];
                const valor = String(datos[key]);
                filasParaInsertar.push([idRobot, idCaracteristica, valor, ahora]);
            }
        }

        if (filasParaInsertar.length === 0) {
            return res.status(400).json({ error: 'Ningún dato enviado coincide con la configuración del robot' });
        }

        const sqlInsert = `INSERT INTO RegistroRobot (idRobot, idCaracteristica, valorCaracteristica, timestamp) VALUES ?`;
        const [result] = await connection.query(sqlInsert, [filasParaInsertar]);

        res.json({ 
            success: true, 
            message: `Guardados ${result.affectedRows} registros validados.` 
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error interno' });
    } finally {
        if (connection) connection.release();
    }
});

app.get('/api/obtenerTodo', async (req, res) => {
    let connection;
    try {
        connection = await pool.getConnection();
        
        const [rows] = await connection.execute('SELECT * FROM RegistroRobot');
        
        res.json({ 
            success: true, 
            cantidad: rows.length,
            datos: rows 
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al obtener registros' });
    } finally {
        if (connection) connection.release();
    }
});

app.listen(PORT, '0.0.0.0',() => {
    console.log('Servidor iniciado');


})