import { configBot } from '../../config/config.bot.js';
import { configMensajes } from '../../config/config.mensajes.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { lookup } from 'mime-types';

// Para usar __dirname en ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const userRequests = {};

// Función principal de MediaFire
async function mediafireDl(url) {
    let html = '';
    let link = null;

    try {
        if (!url.includes('mediafire.com')) {
            throw new Error('URL de MediaFire inválida');
        }

        // MÉTODO 1: Descarga directa
        try {
            const res = await fetch(url, { 
                headers: { 
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
                    'Referer': 'https://www.mediafire.com/'
                },
                timeout: 30000
            });

            if (!res.ok) throw new Error('Error en la petición');

            html = await res.text();

            // Buscar enlace de descarga usando expresiones regulares
            let linkMatch = html.match(/href="(https:\/\/download\d+\.mediafire\.com[^"]+)"/);
            if (linkMatch) {
                link = linkMatch[1];
            } 
            // Patrón alternativo
            else {
                const altMatch = html.match(/"(https:\/\/[^"]*mediafire[^"]*\.(zip|rar|pdf|jpg|jpeg|png|gif|mp4|mp3|exe|apk|txt|doc|docx|xls|xlsx|ppt|pptx)[^"]*)"/i);
                if (altMatch) {
                    link = altMatch[1];
                }
            }

            // Buscar en el botón de descarga
            const downloadButtonMatch = html.match(/id="downloadButton"[^>]*href="([^"]*)"/);
            if (downloadButtonMatch && !link) {
                link = downloadButtonMatch[1];
            }

        } catch (directError) {
            console.log('Método directo falló, intentando método alternativo...');

            // MÉTODO 2: Usar proxy de traducción
            try {
                const translateUrl = `https://www-mediafire-com.translate.goog/${url.replace('https://www.mediafire.com/', '')}?_x_tr_sl=en&_x_tr_tl=es&_x_tr_hl=es&_x_tr_pto=wapp`;
                const res = await fetch(translateUrl, { 
                    headers: { 
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    },
                    timeout: 30000
                });

                if (!res.ok) throw new Error('Error en método alternativo');

                html = await res.text();
                const downloadButtonMatch = html.match(/id="downloadButton"[^>]*href="([^"]*)"/);
                if (downloadButtonMatch) {
                    link = downloadButtonMatch[1];
                }
            } catch (translateError) {
                console.log('Método alternativo también falló');
                throw new Error('No se pudo acceder al enlace de MediaFire');
            }
        }

        if (!link || link.includes('javascript:void(0)')) {
            throw new Error('No se pudo encontrar el enlace de descarga válido');
        }

        // Extraer información del archivo usando expresiones regulares

        // Nombre del archivo
        let name = 'archivo_descargado';
        const nameMatch = html.match(/class="dl-btn-label"[^>]*title="([^"]*)"/) || 
                         html.match(/class="filename"[^>]*>([^<]*)</);
        if (nameMatch) {
            name = nameMatch[1].replace(/\s+/g, ' ').replace(/\n/g, '').trim();
        }

        // Tamaño del archivo
        let size = 'Tamaño no disponible';
        const sizeMatch = html.match(/class="details"[^>]*>.*?(\d+\.?\d*\s*[KMGT]?B)/is);
        if (sizeMatch) {
            size = sizeMatch[1];
        }

        // Fecha
        let date = 'Fecha no disponible';
        const dateMatch = html.match(/<li>.*?Fecha.*?<span>([^<]*)<\/span>/i);
        if (dateMatch) {
            date = dateMatch[1];
        }

        // Determinar tipo MIME
        let mime = '';
        const ext = name.split('.').pop()?.toLowerCase();
        mime = lookup(ext) || 'application/octet-stream';

        // Validar enlace final
        if (!link.startsWith('http')) {
            throw new Error('Enlace de descarga inválido');
        }

        return { name, size, date, mime, link };

    } catch (error) {
        console.error('Error en mediafireDl:', error.message);
        throw new Error(`Error al procesar MediaFire: ${error.message}`);
    }
}

// Función para descargar archivo
async function downloadFile(url, fileName) {
    const tmpDir = path.join(__dirname, '../../temp');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

    const tempFile = path.join(tmpDir, `${Date.now()}_${fileName}`);

    try {
        console.log('📥 Descargando archivo desde:', url);

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': '*/*',
            },
        });

        if (!response.ok) {
            throw new Error(`Error HTTP: ${response.status}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Escribir archivo temporal
        fs.writeFileSync(tempFile, buffer);

        const stats = fs.statSync(tempFile);
        const fileSizeMB = stats.size / (1024 * 1024);

        console.log('✅ Archivo descargado:', fileSizeMB.toFixed(1), 'MB');

        return {
            filePath: tempFile,
            sizeMB: fileSizeMB,
            buffer: buffer
        };

    } catch (error) {
        console.error('❌ Error descargando archivo:', error.message);
        if (fs.existsSync(tempFile)) {
            fs.unlinkSync(tempFile);
        }
        throw error;
    }
}

export default {
    name: 'mediafire',
    description: 'Descargar archivos de MediaFire',
    category: 'descargas',
    aliases: ['mf'],

    execute: async (message, args, bot) => {
        const jid = message.key.remoteJid;
        const url = args[0];
        const sender = message.key.participant || jid;
        const senderKey = sender.split('@')[0];

        try {
            // Reacción de procesando
            await bot.procesadorMensajes.reaccionar(message, configBot.reacciones.procesando);

            if (!url) {
                await bot.procesadorMensajes.enviarMensaje(
                    jid,
                    `${configMensajes.humano.pensando} ${configMensajes.errores.sinArgumentos}\n\n*Ejemplo:* ${configBot.prefijo}mediafire https://www.mediafire.com/file/...`
                );
                return await bot.procesadorMensajes.reaccionar(message, configBot.reacciones.error);
            }

            // Verificar si ya tiene una descarga en proceso
            if (userRequests[senderKey]) {
                await bot.procesadorMensajes.enviarMensaje(
                    jid,
                    `${configMensajes.humano.ocupado} Espere a que termine su descarga actual.`
                );
                return;
            }

            userRequests[senderKey] = true;

            await bot.procesadorMensajes.enviarMensaje(
                jid,
                `${configMensajes.humano.pensando} Procesando enlace de MediaFire...`
            );

            console.log('🔍 Procesando enlace MediaFire:', url);

            // Obtener información del archivo
            const fileInfo = await mediafireDl(url);
            const { name: fileName, size, date, mime, link } = fileInfo;

            console.log('✅ Archivo encontrado:', fileName);

            // Mostrar información del archivo
            const fileDetails = `📁 *${fileName}*\n\n` +
                               `💾 *Tamaño:* ${size}\n` +
                               `📅 *Fecha:* ${date}\n` +
                               `📄 *Tipo:* ${mime}`;

            await bot.procesadorMensajes.enviarMensaje(
                jid,
                fileDetails,
                { quoted: message }
            );

            await bot.procesadorMensajes.reaccionar(message, "📥");
            await bot.procesadorMensajes.enviarMensaje(jid, configMensajes.respuestas.descargaInicio);

            console.log('⬇️ Descargando archivo...');

            // Descargar el archivo
            const downloadedFile = await downloadFile(link, fileName);

            await bot.procesadorMensajes.reaccionar(message, "⬆️");

            console.log('📄 Enviando como documento...');

            // Enviar siempre como documento
            await bot.obtenerManejadorConexion().obtenerSocket().sendMessage(
                jid,
                {
                    document: downloadedFile.buffer,
                    mimetype: mime,
                    fileName: fileName,
                    caption: `${configMensajes.respuestas.descargaExito}\n\n📁 *${fileName}*\n💾 ${size}\n📅 ${date}`,
                },
                { quoted: message }
            );

            // Limpiar archivo temporal
            if (fs.existsSync(downloadedFile.filePath)) {
                fs.unlinkSync(downloadedFile.filePath);
            }

            await bot.procesadorMensajes.reaccionar(message, configBot.reacciones.exito);

            console.log('✅ Proceso completado exitosamente');

        } catch (error) {
            console.error('❌ Error en mediafire:', error);

            await bot.procesadorMensajes.enviarMensaje(
                jid,
                `${configMensajes.humano.ups} ${configMensajes.errores.mediaError}\nError: ${error.message}`
            );
            await bot.procesadorMensajes.reaccionar(message, configBot.reacciones.error);
        } finally {
            // Limpiar estado del usuario
            delete userRequests[senderKey];
        }
    }
};