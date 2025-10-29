import { configBot } from '../../config/config.bot.js';
import { configMensajes } from '../../config/config.mensajes.js';

const userRequests = {};

// Función para detectar si es URL de Facebook
function isFacebookUrl(text) {
    return /(facebook\.com|fb\.watch|fb\.com)/.test(text);
}

// Función para extraer URLs del mensaje
function extractFacebookUrls(text) {
    const urlRegex = /(https?:\/\/[^\s]+facebook\.com[^\s]+|https?:\/\/[^\s]+fb\.watch[^\s]+)/gi;
    const urls = text.match(urlRegex);
    return urls ? urls.slice(0, 10) : [];
}

// Configuración de APIs
const API_BASE = "https://api-sky.ultraplus.click";
const SKY_API_KEY = "Russellxz";

// === MÉTODO 1: API Sky ===
async function callSkyFacebook(url) {
    try {
        const response = await fetch(`${API_BASE}/api/download/facebook?url=${encodeURIComponent(url)}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${SKY_API_KEY}`,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/json'
            },
            timeout: 60000
        });

        if (!response.ok) throw new Error('API Sky falló');

        const data = await response.json();

        if (data?.status === "true" && data?.data) {
            const videoUrl = data.data.video_hd || data.data.video_sd;
            if (videoUrl) {
                return { videoUrl, success: true, method: 'API Sky' };
            }
        }
        throw new Error('No se pudo obtener el video de API Sky');
    } catch (error) {
        throw new Error('API Sky error: ' + error.message);
    }
}

// === MÉTODO 2: Scraping InstaTikTok ===
async function fetchDownloadLinks(url) {
    try {
        const SITE_URL = 'https://instatiktok.com/';
        const form = new URLSearchParams();
        form.append('url', url);
        form.append('platform', 'facebook');
        form.append('siteurl', SITE_URL);

        const response = await fetch(`${SITE_URL}api`, {
            method: 'POST',
            body: form.toString(),
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'Origin': SITE_URL,
                'Referer': SITE_URL,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'X-Requested-With': 'XMLHttpRequest'
            },
            timeout: 60000
        });

        if (!response.ok) throw new Error('InstaTikTok API falló');

        const data = await response.json();

        if (data?.status !== 'success' || !data?.html) {
            throw new Error('Error del servidor InstaTikTok');
        }

        // Simular parsing con cheerio (simplificado)
        const html = data.html;
        const videoUrlMatch = html.match(/href="(https?:\/\/[^"]*\.mp4[^"]*)"/i);

        if (videoUrlMatch && videoUrlMatch[1]) {
            return { videoUrl: videoUrlMatch[1], success: true, method: 'InstaTikTok' };
        }

        throw new Error('No se encontró enlace de video');
    } catch (error) {
        throw new Error('InstaTikTok error: ' + error.message);
    }
}

// === MÉTODO 3: API Prince ===
async function callPrinceAPI(url) {
    try {
        const response = await fetch(`https://api.princetechn.com/api/download/facebook?apikey=prince&url=${encodeURIComponent(url)}`, {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/json'
            },
            timeout: 40000
        });

        if (!response.ok) throw new Error('API Prince falló');

        const data = await response.json();

        if (data?.status === 200 && data?.success && data?.result) {
            const videoUrl = data.result.hd_video || data.result.sd_video;
            if (videoUrl) {
                return { videoUrl, success: true, method: 'API Prince' };
            }
        }
        throw new Error('No se pudo obtener el video de API Prince');
    } catch (error) {
        throw new Error('API Prince error: ' + error.message);
    }
}

// Función principal de descarga con múltiples métodos
async function downloadFacebookVideo(url) {
    let result = null;

    // INTENTAR MÉTODO 1: API Sky
    try {
        console.log('🔹 Intentando API Sky...');
        result = await callSkyFacebook(url);
        if (result.success) return result;
    } catch (error) {
        console.log('❌ API Sky falló:', error.message);
    }

    // INTENTAR MÉTODO 2: InstaTikTok
    try {
        console.log('🔹 Intentando InstaTikTok...');
        result = await fetchDownloadLinks(url);
        if (result.success) return result;
    } catch (error) {
        console.log('❌ InstaTikTok falló:', error.message);
    }

    // INTENTAR MÉTODO 3: API Prince
    try {
        console.log('🔹 Intentando API Prince...');
        result = await callPrinceAPI(url);
        if (result.success) return result;
    } catch (error) {
        console.log('❌ API Prince falló:', error.message);
    }

    // INTENTAR MÉTODOS ORIGINALES COMO FALLBACK
    try {
        console.log('🔹 Intentando APIs originales...');
        const response = await fetch(`https://api.delirius.store/download/facebook?url=${encodeURIComponent(url)}`, {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/json'
            }
        });

        if (response.ok) {
            const data = await response.json();
            if (data?.status && data?.data?.meta?.media) {
                const media = data.data.meta.media[0];
                if (media.type === 'video') {
                    const videoUrl = media.org || media.hd || media.wm;
                    if (videoUrl) {
                        return { videoUrl, success: true, method: 'Delirius API' };
                    }
                }
            }
        }
    } catch (error) {
        console.log('❌ APIs originales fallaron:', error.message);
    }

    throw new Error('Todas las APIs fallaron');
}

// Comando principal Facebook
export default {
    name: 'facebook',
    description: 'Descargar videos de Facebook',
    category: 'descargas',
    aliases: ['fb', 'fbdl'],

    execute: async (message, args, bot) => {
        const jid = message.key.remoteJid;
        const text = args.join(' ');
        const sender = message.key.participant || jid;
        const senderKey = sender.split('@')[0];

        try {
            // Reacción de procesando
            await bot.procesadorMensajes.reaccionar(message, configBot.reacciones.procesando);

            // Extraer URLs
            const urls = extractFacebookUrls(text);

            if (!text || urls.length === 0) {
                await bot.procesadorMensajes.enviarMensaje(
                    jid,
                    `${configMensajes.humano.pensando} ${configMensajes.errores.sinArgumentos}\n\n*Ejemplo:* ${configBot.prefijo}facebook https://facebook.com/...`
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
                `${configMensajes.humano.pensando} Procesando ${urls.length > 1 ? `${urls.length} videos` : 'video'} de Facebook...`
            );

            await bot.procesadorMensajes.reaccionar(message, "📥");

            let successCount = 0;
            let failCount = 0;

            // Procesar cada URL
            for (let i = 0; i < urls.length; i++) {
                const url = urls[i];

                try {
                    // Obtener el video
                    const result = await downloadFacebookVideo(url);

                    if (!result.success) {
                        throw new Error(result.error || 'No se pudo descargar el video');
                    }

                    await bot.procesadorMensajes.reaccionar(message, "⬆️");

                    if (i === 0) {
                        await bot.procesadorMensajes.enviarMensaje(jid, configMensajes.respuestas.descargaInicio);
                    }

                    // Enviar el video con caption simplificado
                    const caption = `${configMensajes.respuestas.descargaExito}`;

                    await bot.obtenerManejadorConexion().obtenerSocket().sendMessage(
                        jid,
                        {
                            video: { url: result.videoUrl },
                            caption: caption
                        },
                        { quoted: i === 0 ? message : undefined }
                    );

                    successCount++;

                } catch (error) {
                    console.error(`Error procesando URL ${i+1}:`, error);
                    failCount++;

                    await bot.procesadorMensajes.enviarMensaje(
                        jid,
                        `${configMensajes.humano.ups} Error en video ${i+1}: ${error.message}`
                    );
                }

                // Pequeña pausa entre descargas
                if (i < urls.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
            }

            // Manejar resultados finales
            if (failCount > 0) {
                await bot.procesadorMensajes.enviarMensaje(
                    jid,
                    `${configMensajes.humano.ups} ${failCount} de ${urls.length} videos fallaron.`
                );
                await bot.procesadorMensajes.reaccionar(message, configBot.reacciones.error);
            }

            if (successCount > 0) {
                await bot.procesadorMensajes.reaccionar(message, configBot.reacciones.exito);
            }

        } catch (error) {
            console.error('Error en comando Facebook:', error);

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