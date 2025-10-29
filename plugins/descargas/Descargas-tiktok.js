import axios from 'axios';
import { configBot } from '../../config/config.bot.js';
import { configMensajes } from '../../config/config.mensajes.js';

const userRequests = {};

// Método principal: instatiktok (manteniendo la lógica intacta)
async function tiktokApiDelirius(url) {
    try {
        const { data } = await axios.get(`https://api.delirius.store/download/tiktok?url=${encodeURIComponent(url)}`, {
            timeout: 20000,
            headers: {
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        if (data?.status && data?.data?.meta?.media) {
            const media = data.data.meta.media[0];

            // VERIFICAR SI ES GALERÍA DE IMÁGENES
            if (media.type === 'image' && media.images && Array.isArray(media.images)) {
                const validImages = media.images.filter(imgUrl => 
                    imgUrl && imgUrl.startsWith('http') && imgUrl.includes('tiktokcdn.com')
                );
                if (validImages.length > 0) {
                    return { images: validImages, success: true };
                }
            }

            // VERIFICAR SI ES VIDEO
            if (media.type === 'video') {
                const videoUrl = media.org || media.hd || media.wm;
                if (videoUrl && videoUrl.startsWith('http')) {
                    return { videoUrl, success: true };
                }
            }
        }
        return { success: false };
    } catch (error) {
        return { success: false };
    }
}

// Función para detectar si es URL de TikTok
function isTikTokUrl(text) {
    return /(tiktok\.com|vt\.tiktok\.com|vm\.tiktok\.com)/.test(text);
}

export default {
    name: 'tiktok',
    description: 'Descargar videos de TikTok',
    category: 'descargas',

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
                    `${configMensajes.humano.pensando} ${configMensajes.errores.sinArgumentos}\n\n*Ejemplo:* ${configBot.prefijo}tiktok https://tiktok.com/...`
                );
                return await bot.procesadorMensajes.reaccionar(message, configBot.reacciones.error);
            }

            if (!isTikTokUrl(url)) {
                await bot.procesadorMensajes.enviarMensaje(
                    jid,
                    `${configMensajes.humano.ups} URL de TikTok no válida.`
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
                `${configMensajes.humano.pensando} Procesando TikTok...`
            );

            await bot.procesadorMensajes.reaccionar(message, "📥");

            // Usar solo el scraper instatiktok
            const result = await tiktokApiDelirius(url);

            if (!result || !result.success) {
                throw new Error('No se pudo descargar el contenido');
            }

            await bot.procesadorMensajes.reaccionar(message, "⬆️");

            // Enviar contenido según lo obtenido
            if (result.images && result.images.length > 0) {
                // Enviar galería de imágenes
                for (let i = 0; i < result.images.length; i++) {
                    await bot.obtenerManejadorConexion().obtenerSocket().sendMessage(
                        jid,
                        {
                            image: { url: result.images[i] },
                            caption: i === 0 ? `📸 *Galería de TikTok*` : ``
                        },
                        { quoted: i === 0 ? message : undefined }
                    );

                    if (i < result.images.length - 1) {
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }
                }
            } else if (result.videoUrl) {
                // Enviar video
                await bot.obtenerManejadorConexion().obtenerSocket().sendMessage(
                    jid,
                    {
                        video: { url: result.videoUrl },
                        caption: "🎵 *Video de TikTok*"
                    },
                    { quoted: message }
                );
            }

            await bot.procesadorMensajes.enviarMensaje(jid, configMensajes.respuestas.descargaExito);
            await bot.procesadorMensajes.reaccionar(message, configBot.reacciones.exito);

        } catch (error) {
            console.error('Error en comando TikTok:', error);

            await bot.procesadorMensajes.enviarMensaje(
                jid,
                `${configMensajes.humano.ups} ${configMensajes.errores.mediaError}`
            );
            await bot.procesadorMensajes.reaccionar(message, configBot.reacciones.error);
        } finally {
            // Limpiar estado del usuario
            delete userRequests[senderKey];
        }
    }
};