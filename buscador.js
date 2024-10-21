const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');
const readline = require('readline');

// URL de la página web que contiene los documentos
const url = 'https://www.sunat.gob.pe/legislacion/superin/2015/indices/indcor.htm';
const baseUrl = 'https://www.sunat.gob.pe/legislacion/superin/2015/indices/';
const enlacesPDF = [];
const resoluciones = []; // Array para almacenar los nombres y descripciones

// Función para descargar el PDF
const descargarPDF = async (url, nombreArchivo) => {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    fs.writeFileSync(path.join(__dirname, 'documentos_pdfs', nombreArchivo), response.data);
};

// Función para extraer texto de un PDF
const extraerTextoPDF = async (rutaArchivo) => {
    const dataBuffer = fs.readFileSync(rutaArchivo);
    const data = await pdf(dataBuffer);
    return data.text;
};

// Crear carpeta para PDFs si no existe
const carpetaPDF = path.join(__dirname, 'documentos_pdfs');
if (!fs.existsSync(carpetaPDF)) {
    fs.mkdirSync(carpetaPDF);
}

// Obtener enlaces PDF y datos de la tabla
axios.get(url)
    .then(async response => {
        const html = response.data;
        const $ = cheerio.load(html);

        // Extraer enlaces a PDFs y los nombres y descripciones
        $('table tr').each((i, row) => {
            const columns = $(row).find('td');
            if (columns.length > 0) {
                const nombreResolucion = $(columns[0]).text().trim(); // Obtener nombre de la resolución
                const descripcionResolucion = $(columns[1]).text().trim(); // Obtener descripción
                const enlacePDF = $(columns[0]).find('a').attr('href'); // Obtener enlace al PDF

                // Solo agregar si hay un enlace al PDF
                if (enlacePDF) {
                    const enlaceCompleto = enlacePDF.startsWith('http') ? enlacePDF : baseUrl + enlacePDF;

                    // Obtener el nombre completo del documento desde el enlace href
                    const nombreDocumento = enlacePDF.split('/').pop(); // Obtener el nombre del archivo desde el enlace

                    // Aquí extraemos el nombre del documento completo
                    enlacesPDF.push(enlaceCompleto);
                    resoluciones.push({ nombre: nombreResolucion, descripcion: descripcionResolucion, documento: nombreDocumento });
                } else {
                    console.log(`No se encontró un enlace PDF para la resolución: ${nombreResolucion}`);
                }
            }
        });

        // Preguntar al usuario por el límite de documentos
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        rl.question('Ingrese el número de documentos a procesar: ', async (limite) => {
            // Asegurarse de que el límite no exceda la cantidad de PDFs disponibles
            const cantidadAProcesar = Math.min(limite, enlacesPDF.length);

            // Descargar los PDFs según el límite establecido
            await Promise.all(enlacesPDF.slice(0, cantidadAProcesar).map((enlace, i) => {
                return descargarPDF(enlace, resoluciones[i].documento); // Usar el nombre completo del documento
            }));

            // Preguntar al usuario por la palabra clave
            rl.question('Ingrese la palabra clave para buscar en los documentos: ', async (palabraClave) => {
                await procesarYBuscarEnPDFs(palabraClave, cantidadAProcesar);
                rl.close();
            });
        });

    })
    .catch(error => {
        console.error('Error al obtener la página:', error);
    });

// Función para procesar PDFs y buscar la palabra clave
const procesarYBuscarEnPDFs = async (palabraClave, cantidadAProcesar) => {
    await Promise.all(enlacesPDF.slice(0, cantidadAProcesar).map(async (enlace, i) => {
        const rutaArchivo = path.join(carpetaPDF, resoluciones[i].documento); // Usar el nombre del documento almacenado en resoluciones
        
        // Verificar que el archivo exista antes de intentar leerlo
        if (fs.existsSync(rutaArchivo)) {
            const texto = await extraerTextoPDF(rutaArchivo);

            // Obtener el nombre y la descripción de la resolución
            const { nombre, descripcion } = resoluciones[i]; // Obtenemos nombre y descripción

            // Aquí buscamos la palabra clave en el texto extraído
            const index = texto.indexOf(palabraClave);
            if (index !== -1) {
                const parrafos = texto.split('\n').filter(parrafo => parrafo.includes(palabraClave));
                console.log(`\nNombre: ${nombre} \nDescripción: ${descripcion} \nDocumento: ${resoluciones[i].documento} \nPárrafo(s): ${parrafos.join(' | ')} \nPalabra de búsqueda: ${palabraClave}\n\n`);
            } else {
                console.log(``);
            }
        } else {
            console.log(`El archivo ${rutaArchivo} no existe.`);
        }
    }));
};
