import { configBot } from '../../config/config.bot.js';
import { configMensajes } from '../../config/config.mensajes.js';
import fs from 'fs';
import path from 'path';

const userRequests = {};
const API_BASE = "https://honduras-api.onrender.com";

// Función para sanitizar nombres de archivo
function sanitizeFileName(name) {
    return name.replace(/[^a-z0-9áéíóúñü \.,_-]/gim, "").trim();
}

// Función para validar URLs de YouTube
function isValidYouTubeUrl(url) {
    try {
        const ytRegex = /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|embed\/|v\/|shorts\/)|youtu\.be\/|music\.youtube\.com\/watch\?v=)/i;
        return ytRegex.test(url) && extractVideoId(url);
    } catch (error) {
        return false;
    }
}

// Función para extraer video ID
function extractVideoId(url) {
    try {
        const patterns = [
            /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|m\.youtube\.com\/watch\?v=|youtube\.com\/shorts\/)([^&\n?#]+)/,
            /youtube\.com\/watch\?.*v=([^&]+)/,
            /youtu\.be\/([^?#]+)/
        ];

        for (const pattern of patterns) {
            const match = url.match(pattern);
            if (match && match[1]) {
                return match[1];
            }
        }
        return null;
    } catch (error) {
        return null;
    }
}

// Función para obtener información del video
async function getVideoInfo(text) {
    const yts = (await import('yt-search')).default;
    let video;
    const isYouTubeUrl = isValidYouTubeUrl(text);

    if (isYouTubeUrl) {
        for (let attempt = 1; attempt <= 2; attempt++) {
            try {
                const videoId = extractVideoId(text);
                if (!videoId) throw new Error('URL no válida');

                const videoInfo = await yts({ videoId: videoId });

                if (!videoInfo || !videoInfo.title) {
                    throw new Error('No se pudo obtener información');
                }

                video = {
                    videoId: videoId,
                    url: `https://youtu.be/${videoId}`,
                    title: videoInfo.title,
                    author: {
                        name: videoInfo.author?.name || 'Desconocido'
                    },
                    duration: {
                        seconds: videoInfo.seconds || 0,
                        timestamp: videoInfo.timestamp || '00:00'
                    },
                    thumbnail: videoInfo.thumbnail || `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
                    views: videoInfo.views || 0
                };
                break;
            } catch (error) {
                if (attempt === 2) throw error;
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
    } else {
        const { videos } = await yts(text);
        if (!videos || videos.length === 0) {
            throw new Error(`No encontrado: ${text}`);
        }
        video = videos[0];
    }

    return video;
}

// Función para determinar calidad basada en duración
function getRecommendedQuality(durationMinutes) {
    if (durationMinutes <= 10) return '720p';
    if (durationMinutes <= 30) return '480p';
    if (durationMinutes <= 120) return '360p';
    return '360p';
}

// Función para descargar y verificar tamaño del archivo
async function downloadAndCheckSize(videoUrl, fileName) {
    const tmpDir = path.join(process.cwd(), 'temp');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

    const tempFile = path.join(tmpDir, `${Date.now()}_${fileName}.mp4`);

    try {
        console.log('📥 Iniciando descarga desde:', videoUrl);

        const response = await fetch(videoUrl, {
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
        const fileSizeGB = fileSizeMB / 1024;

        console.log('✅ Descarga completada:', fileSizeMB.toFixed(1), 'MB');

        return {
            filePath: tempFile,
            sizeMB: fileSizeMB,
            sizeGB: fileSizeGB,
            buffer: buffer
        };

    } catch (error) {
        console.error('❌ Error en downloadAndCheckSize:', error.message);
        // Limpiar en caso de error
        if (fs.existsSync(tempFile)) {
            fs.unlinkSync(tempFile);
        }
        throw error;
    }
}

export default {
    name: 'play2',
    description: 'Descargar video MP4 de YouTube (soporta videos largos)',
    category: 'descargas',

    execute: async (message, args, bot) => {
        const jid = message.key.remoteJid;
        const text = args.join(' ');
        const sender = message.key.participant || jid;
        const senderKey = sender.split('@')[0];

        try {
            // Reacción de procesando
            await bot.procesadorMensajes.reaccionar(message, configBot.reacciones.procesando);

            if (!text) {
                await bot.procesadorMensajes.enviarMensaje(
                    jid,
                    `${configMensajes.humano.pensando} ${configMensajes.errores.sinArgumentos}\n\n*Ejemplo:* ${configBot.prefijo}play2 Shakira`
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
                `${configMensajes.humano.pensando} Buscando video: ${text}...`
            );

            console.log('🔍 Buscando video:', text);

            // Obtener información del video
            const video = await getVideoInfo(text);
            const durationInMinutes = video.duration?.seconds ? Math.floor(video.duration.seconds / 60) : 0;
            const recommendedQuality = getRecommendedQuality(durationInMinutes);

            console.log('✅ Video encontrado:', video.title);

            // Mostrar información del video
            const videoDetails = `🎬 *${video.title}*\n\n` +
                               `👤 *Canal:* ${video.author.name}\n` +
                               `⏱️ *Duración:* ${video.duration?.timestamp || '00:00'}\n` +
                               `👀 *Vistas:* ${video.views.toLocaleString()}\n` +
                               `📊 *Calidad recomendada:* ${recommendedQuality}`;

            await bot.obtenerManejadorConexion().obtenerSocket().sendMessage(
                jid,
                {
                    image: { url: video.thumbnail },
                    caption: videoDetails,
                },
                { quoted: message }
            );

            await bot.procesadorMensajes.reaccionar(message, "📥");

            await bot.procesadorMensajes.enviarMensaje(
                jid,
                `${configMensajes.respuestas.descargaInicio}`
            );

            console.log('🔗 Obteniendo enlace de descarga...');

            // Descargar video usando la API
            const apiUrl = `${API_BASE}/api/ytmp4?url=${encodeURIComponent(video.url)}`;
            console.log('🌐 Llamando a API:', apiUrl);

            const response = await fetch(apiUrl, { 
                timeout: 60000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });

            if (!response.ok) {
                throw new Error('API no respondió correctamente');
            }

            const data = await response.json();
            console.log('📋 Respuesta API:', data);

            if (!data || !data.éxito || !data.descarga || !data.descarga.enlace) {
                throw new Error('No se pudo obtener el enlace de descarga');
            }

            const downloadData = data;
            console.log('🎯 Enlace de descarga obtenido:', downloadData.descarga.enlace);

            await bot.procesadorMensajes.reaccionar(message, "⬇️");

            // Descargar y verificar tamaño
            const downloadedFile = await downloadAndCheckSize(
                downloadData.descarga.enlace, 
                sanitizeFileName(video.title)
            );

            console.log('✅ Archivo descargado:', downloadedFile.sizeMB.toFixed(1), 'MB');

            // Verificar límite de WhatsApp (2GB = 2048MB)
            if (downloadedFile.sizeGB > 2) {
                // Limpiar archivo temporal
                if (fs.existsSync(downloadedFile.filePath)) {
                    fs.unlinkSync(downloadedFile.filePath);
                }

                await bot.procesadorMensajes.enviarMensaje(
                    jid,
                    {
                        text: `❌ *Archivo demasiado grande*\n\nEl video pesa ${downloadedFile.sizeGB.toFixed(2)}GB\n\n📝 *Límite de WhatsApp:* 2GB\n💡 *Sugerencia:* Intenta con un video más corto.`,
                    },
                    { quoted: message }
                );
                return await bot.procesadorMensajes.reaccionar(message, configBot.reacciones.error);
            }

            // Determinar cómo enviar basado en el tamaño
            const shouldSendAsDocument = downloadedFile.sizeMB > 80;

            await bot.procesadorMensajes.reaccionar(message, "⬆️");

            if (shouldSendAsDocument) {
                // Enviar como documento para archivos grandes (>80MB)
                console.log('📄 Enviando como documento...');
                await bot.obtenerManejadorConexion().obtenerSocket().sendMessage(
                    jid,
                    {
                        document: downloadedFile.buffer,
                        mimetype: "video/mp4",
                        fileName: `${sanitizeFileName(video.title)}.mp4`,
                        caption: `${configMensajes.respuestas.descargaExito}\n\n🎬 *${video.title}*\n⏱️ ${video.duration?.timestamp || '00:00'}\n💾 ${downloadedFile.sizeMB.toFixed(1)}MB`,
                    },
                    { quoted: message }
                );
            } else {
                // Enviar como video normal para archivos pequeños (≤80MB)
                console.log('🎬 Enviando como video...');
                await bot.obtenerManejadorConexion().obtenerSocket().sendMessage(
                    jid,
                    {
                        video: downloadedFile.buffer,
                        caption: `${configMensajes.respuestas.descargaExito}\n\n🎬 *${video.title}*\n⏱️ ${video.duration?.timestamp || '00:00'}`,
                    },
                    { quoted: message }
                );
            }

            // Limpiar archivo temporal
            if (fs.existsSync(downloadedFile.filePath)) {
                fs.unlinkSync(downloadedFile.filePath);
            }

            await bot.procesadorMensajes.reaccionar(message, configBot.reacciones.exito);

            console.log('✅ Proceso completado exitosamente');

        } catch (error) {
            console.error('❌ Error en play2:', error);

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