import { configBot } from '../../config/config.bot.js';
import { configMensajes } from '../../config/config.mensajes.js';

const userRequests = {};

// Función para detectar si es URL de Instagram
function isInstagramUrl(text) {
    return /(instagram\.com|instagr\.am)/.test(text);
}

// Función de descarga de Instagram original
const instagramDownload = async (url) => {
    return new Promise(async (resolve) => {
        if (!url.match(/\/(reel|reels|p|stories|tv|s)\/[a-zA-Z0-9_-]+/i)) {
            return resolve({ status: false, creator: "KARBOT-MD" });
        }

        try {
            let jobId = await (
                await fetch("https://app.publer.io/hooks/media", {
                    method: 'POST',
                    body: JSON.stringify({
                        url: url,
                        iphone: false,
                    }),
                    headers: {
                        'Accept': '/',
                        'Accept-Encoding': 'gzip, deflate, br, zstd',
                        'Accept-Language': 'es-ES,es;q=0.9',
                        'Cache-Control': 'no-cache',
                        'Content-Type': 'application/json',
                        'Origin': 'https://publer.io',
                        'Pragma': 'no-cache',
                        'Priority': 'u=1, i',
                        'Referer': 'https://publer.io/',
                        'Sec-CH-UA': '"Chromium";v="128", "Not;A=Brand";v="24", "Google Chrome";v="128"',
                        'Sec-CH-UA-Mobile': '?0',
                        'Sec-CH-UA-Platform': '"Windows"',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
                    },
                })
            ).then(res => res.json()).then(data => data.job_id);

            let status = "working";
            let jobStatusResponse;

            while (status !== "complete") {
                jobStatusResponse = await fetch(
                    `https://app.publer.io/api/v1/job_status/${jobId}`,
                    {
                        headers: {
                            'Accept': 'application/json, text/plain, /',
                            'Accept-Encoding': 'gzip, deflate, br, zstd',
                            'Accept-Language': 'es-ES,es;q=0.9',
                            'Cache-Control': 'no-cache',
                            'Origin': 'https://publer.io',
                            'Pragma': 'no-cache',
                            'Priority': 'u=1, i',
                            'Referer': 'https://publer.io/',
                            'Sec-CH-UA': '"Chromium";v="128", "Not;A=Brand";v="24", "Google Chrome";v="128"',
                            'Sec-CH-UA-Mobile': '?0',
                            'Sec-CH-UA-Platform': '"Windows"',
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
                        },
                    }
                ).then(res => res.json());

                status = jobStatusResponse.status;

                // Pequeña pausa para no saturar la API
                await new Promise(resolve => setTimeout(resolve, 1000));
            }

            let data = jobStatusResponse.payload.map((item) => {
                return {
                    type: item.type === "photo" ? "image" : "video",
                    url: item.path,
                };
            });

            resolve({
                status: true,
                data,
            });
        } catch (e) {
            resolve({
                status: false,
                msg: new Error(e).message,
            });
        }
    });
};

// API alternativa de respaldo
async function downloadInstagramBackup(url) {
    try {
        const response = await fetch(`https://api.delirius.store/download/instagram?url=${encodeURIComponent(url)}`, {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/json'
            }
        });

        if (!response.ok) throw new Error('API alternativa falló');

        const data = await response.json();

        if (data?.status && data?.data) {
            return { 
                status: true, 
                data: data.data.map(item => ({
                    type: item.type || (item.url.includes('.mp4') ? 'video' : 'image'),
                    url: item.url
                }))
            };
        }

        throw new Error('No se pudo obtener el contenido');
    } catch (error) {
        throw new Error('API alternativa error: ' + error.message);
    }
}

export default {
    name: 'instagram',
    description: 'Descargar contenido de Instagram',
    category: 'descargas',
    aliases: ['igdl', 'ig', 'instagramdl', 'ig2', 'instagram2'],

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
                    `${configMensajes.humano.pensando} ${configMensajes.errores.sinArgumentos}\n\n*Ejemplo:* ${configBot.prefijo}instagram https://www.instagram.com/reel/...`
                );
                return await bot.procesadorMensajes.reaccionar(message, configBot.reacciones.error);
            }

            if (!isInstagramUrl(url)) {
                await bot.procesadorMensajes.enviarMensaje(
                    jid,
                    `${configMensajes.humano.ups} URL de Instagram no válida.`
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
                `${configMensajes.humano.pensando} Descargando contenido de Instagram...`
            );

            await bot.procesadorMensajes.reaccionar(message, "📥");

            let contentData = null;

            // INTENTAR MÉTODO PRINCIPAL
            try {
                const result = await instagramDownload(url);
                if (result.status && result.data.length > 0) {
                    contentData = result.data;
                } else {
                    throw new Error('Método principal falló');
                }
            } catch (error) {
                console.log('❌ Método principal falló, intentando API alternativa...');

                // INTENTAR API ALTERNATIVA
                try {
                    const result = await downloadInstagramBackup(url);
                    if (result.status && result.data.length > 0) {
                        contentData = result.data;
                    } else {
                        throw new Error('API alternativa falló');
                    }
                } catch (error2) {
                    throw new Error('Todos los métodos fallaron: ' + error2.message);
                }
            }

            await bot.procesadorMensajes.reaccionar(message, "⬆️");
            await bot.procesadorMensajes.enviarMensaje(jid, configMensajes.respuestas.descargaInicio);

            let successCount = 0;
            let failCount = 0;

            // Enviar cada elemento del contenido
            for (let i = 0; i < contentData.length; i++) {
                const item = contentData[i];

                try {
                    if (item.type === "image") {
                        await bot.obtenerManejadorConexion().obtenerSocket().sendMessage(
                            jid,
                            {
                                image: { url: item.url },
                                caption: i === 0 ? `${configMensajes.respuestas.descargaExito}` : ''
                            },
                            { quoted: i === 0 ? message : undefined }
                        );
                    } else if (item.type === "video") {
                        await bot.obtenerManejadorConexion().obtenerSocket().sendMessage(
                            jid,
                            {
                                video: { url: item.url },
                                caption: i === 0 ? `${configMensajes.respuestas.descargaExito}` : ''
                            },
                            { quoted: i === 0 ? message : undefined }
                        );
                    }
                    successCount++;

                    // Pequeña pausa entre envíos
                    if (i < contentData.length - 1) {
                        await new Promise(resolve => setTimeout(resolve, 1500));
                    }

                } catch (error) {
                    console.error(`Error enviando elemento ${i + 1}:`, error);
                    failCount++;
                }
            }

            // Manejar resultados finales
            if (failCount > 0) {
                await bot.procesadorMensajes.enviarMensaje(
                    jid,
                    `${configMensajes.humano.ups} ${failCount} de ${contentData.length} elementos no se pudieron enviar.`
                );
                await bot.procesadorMensajes.reaccionar(message, "⚠️");
            } else {
                await bot.procesadorMensajes.reaccionar(message, configBot.reacciones.exito);
            }

        } catch (error) {
            console.error('Error en comando Instagram:', error);

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