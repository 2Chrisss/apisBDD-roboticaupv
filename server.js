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

async function obtenerPermisosRobot(connection, idRobot) {
    const cacheKey = `robot_${idRobot}`;
    const cached = cachePermisos.get(cacheKey);
    
    if (cached) {
        return cached;
    }
    
    const sqlPermisos = `
        SELECT c.nombreCaracteristica, c.idCaracteristica
        FROM Robot r
        JOIN TipoRobotCaracteristica trc ON r.idTipoRobot = trc.idTipoRobot
        JOIN Caracteristica c ON trc.idCaracteristica = c.idCaracteristica
        WHERE r.idRobot = ?
    `;
    
    const [reglas] = await connection.execute(sqlPermisos, [idRobot]);
    
    cachePermisos.set(cacheKey, reglas);
    
    return reglas;
}

async function precargarPermisos() {
    let connection;
    try {
        connection = await pool.getConnection();
        const ids = [1, 2, 3, 4]; 
        
        for (const id of ids) {
            await obtenerPermisosRobot(connection, id);
        }
        
        console.log('Permisos precargados en caché');
    } catch (error) {
        console.error('Error precargando permisos:', error);
    } finally {
        if (connection) connection.release();
    }
}
app.post('/api/registrarDatos', async (req, res) => {
    let connection;
    try {
        const datos = req.body;


        if (!datos.robots?.data?.id | !datos.robots?.data?.id){
            return res.status(400).json({ error: 'No hay id de robots' });
        } 

        connection = await pool.getConnection();

        const filasParaInsertar = [];
        const ahora = new Date();

        // Procesa robots ids 1 y 2
        if (datos.robots?.data) {
            for (const robotKey in datos.robots.data) {
                const robotData = datos.robots.data[robotKey];
                
                if (!robotData.id) continue;

                const idRobot = robotData.id;
                const reglas = await obtenerPermisosRobot(connection, idRobot);

                if (reglas.length === 0) continue;

                const mapaPermitido = {};
                reglas.forEach(fila => {
                    mapaPermitido[fila.nombreCaracteristica] = fila.idCaracteristica;
                });

                for (const key in robotData) {
                    if (key === 'id') continue;
                    if (mapaPermitido[key]) {
                        const idCaracteristica = mapaPermitido[key];
                        const valor = String(robotData[key]);
                        filasParaInsertar.push([idRobot, idCaracteristica, valor, ahora]);
                    }
                }
            }
        }

        // Procesar stations (ids 3 y 4)
        if (datos.stations?.data) {
            for (const stationKey in datos.stations.data) {
                const stationData = datos.stations.data[stationKey];
                
                if (!stationData.id) continue;

                const idStation = stationData.id;
                const reglas = await obtenerPermisosRobot(connection, idStation);

                if (reglas.length === 0) continue;

                const mapaPermitido = {};
                reglas.forEach(fila => {
                    mapaPermitido[fila.nombreCaracteristica] = fila.idCaracteristica;
                });

                for (const key in stationData) {
                    if (key === 'id') continue;
                    if (mapaPermitido[key]) {
                        const idCaracteristica = mapaPermitido[key];
                        const valor = String(stationData[key]);
                        filasParaInsertar.push([idStation, idCaracteristica, valor, ahora]);
                    }
                }
            }
        }

        if (filasParaInsertar.length === 0) {
            return res.status(400).json({ error: 'Ningún dato enviado coincide con las configuraciones' });
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

app.listen(PORT, '0.0.0.0', async () => {
    console.log('Servidor iniciado');
    await precargarPermisos();


})