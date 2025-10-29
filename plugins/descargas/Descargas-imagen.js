import { configBot } from '../../config/config.bot.js';
import { configMensajes } from '../../config/config.mensajes.js';

export default {
    name: 'imagen',
    description: 'Buscar imágenes en Google',
    category: 'internet',
    aliases: ['gimage', 'image'],

    execute: async (message, args, bot) => {
        const jid = message.key.remoteJid;
        const text = args.join(' ');

        try {
            // Reacción de procesando
            await bot.procesadorMensajes.reaccionar(message, configBot.reacciones.procesando);

            if (!text) {
                await bot.procesadorMensajes.enviarMensaje(
                    jid,
                    `${configMensajes.humano.pensando} ${configMensajes.errores.sinArgumentos}\n\n*Ejemplo:* ${configBot.prefijo}imagen Minecraft`
                );
                return await bot.procesadorMensajes.reaccionar(message, configBot.reacciones.error);
            }

            await bot.procesadorMensajes.enviarMensaje(
                jid,
                `${configMensajes.humano.pensando} Buscando imágenes de: ${text}...`
            );

            // API funcional para buscar imágenes
            const apiUrl = `https://api.delirius.store/search/gimage?query=${encodeURIComponent(text)}`;

            const response = await fetch(apiUrl, {
                method: 'GET',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error('Error al conectar con la API de búsqueda');
            }

            const apiData = await response.json();

            // Verificar estructura de la respuesta
            if (!apiData.status || !apiData.data || !Array.isArray(apiData.data)) {
                throw new Error('Formato de respuesta inválido');
            }

            const data = apiData.data;

            // Filtrar solo imágenes con formatos soportados
            const filteredData = data.filter(image => {
                if (!image.url) return false;
                const url = image.url.toLowerCase();
                return url.endsWith('.jpg') || url.endsWith('.jpeg') || url.endsWith('.png') || url.includes('image');
            });

            if (filteredData.length === 0) {
                await bot.procesadorMensajes.enviarMensaje(
                    jid,
                    `${configMensajes.humano.ups} No se encontraron imágenes de: ${text}`
                );
                return await bot.procesadorMensajes.reaccionar(message, configBot.reacciones.error);
            }

            // Tomar las primeras 10 imágenes o todas las disponibles si hay menos
            const imagesToSend = filteredData.slice(0, 10);

            await bot.procesadorMensajes.reaccionar(message, "📸");
            await bot.procesadorMensajes.enviarMensaje(jid, `${configMensajes.respuestas.descargaInicio}\nEnviando ${imagesToSend.length} imágenes...`);

            let successCount = 0;
            let failCount = 0;

            // Enviar cada imagen individualmente
            for (let i = 0; i < imagesToSend.length; i++) {
                const image = imagesToSend[i];

                try {
                    // Crear caption para cada imagen
                    let caption = `🖼️ *Imagen ${i + 1}/${imagesToSend.length}*\n`;
                    caption += `🔍 *Búsqueda:* ${text}\n`;

                    if (image.origin?.website?.url) {
                        caption += `🔗 *Fuente:* ${image.origin.website.url}\n`;
                    }

                    if (image.origin?.width && image.origin?.height) {
                        caption += `📐 *Resolución:* ${image.origin.width}x${image.origin.height}`;
                    }

                    // Enviar la imagen
                    await bot.obtenerManejadorConexion().obtenerSocket().sendMessage(
                        jid,
                        {
                            image: { url: image.url },
                            caption: caption
                        },
                        { quoted: i === 0 ? message : undefined } // Solo citar el primer mensaje
                    );

                    successCount++;

                    // Pequeña pausa entre envíos para evitar flood
                    if (i < imagesToSend.length - 1) {
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }

                } catch (error) {
                    console.error(`Error enviando imagen ${i + 1}:`, error);
                    failCount++;
                }
            }

            // Mensaje final de resumen
            if (failCount > 0) {
                await bot.procesadorMensajes.enviarMensaje(
                    jid,
                    `${configMensajes.humano.ups} ${failCount} de ${imagesToSend.length} imágenes no se pudieron enviar.`
                );
                await bot.procesadorMensajes.reaccionar(message, "⚠️");
            } else {
                await bot.procesadorMensajes.enviarMensaje(
                    jid,
                    `${configMensajes.humano.listo} ¡Listo! Se enviaron ${successCount} imágenes de: ${text}`
                );
                await bot.procesadorMensajes.reaccionar(message, configBot.reacciones.exito);
            }

        } catch (error) {
            console.error('Error en comando imagen:', error);

            await bot.procesadorMensajes.enviarMensaje(
                jid,
                `${configMensajes.humano.ups} Error al buscar imágenes. Intenta más tarde.`
            );
            await bot.procesadorMensajes.reaccionar(message, configBot.reacciones.error);
        }
    }
};