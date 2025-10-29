import axios from 'axios';
import crypto from 'crypto';
import { configBot } from '../../config/config.bot.js';
import { configMensajes } from '../../config/config.mensajes.js';

// Scraper savetube para descargas de audio
const savetube = {
   api: {
      base: "https://media.savetube.me/api",
      cdn: "/random-cdn",
      info: "/v2/info",
      download: "/download"
   },
   headers: {
      'accept': '*/*',
      'content-type': 'application/json',
      'origin': 'https://yt.savetube.me',
      'referer': 'https://yt.savetube.me/',
      'user-agent': 'Postify/1.0.0'
   },
   crypto: {
      hexToBuffer: (hexString) => {
         const matches = hexString.match(/.{1,2}/g);
         return Buffer.from(matches.join(''), 'hex');
      },
      decrypt: async (enc) => {
         try {
            const secretKey = 'C5D58EF67A7584E4A29F6C35BBC4EB12';
            const data = Buffer.from(enc, 'base64');
            const iv = data.slice(0, 16);
            const content = data.slice(16);
            const key = savetube.crypto.hexToBuffer(secretKey);
            const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
            let decrypted = decipher.update(content);
            decrypted = Buffer.concat([decrypted, decipher.final()]);
            return JSON.parse(decrypted.toString());
         } catch (error) {
            throw new Error(error)
         }
      }
   },
   youtube: url => {
      if (!url) return null;
      const a = [
         /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
         /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
         /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/,
         /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
         /youtu\.be\/([a-zA-Z0-9_-]{11})/
      ];
      for (let b of a) {
         if (b.test(url)) return url.match(b)[1];
      }
      return null
   },
   request: async (endpoint, data = {}, method = 'post') => {
      try {
         const { data: response } = await axios({
            method,
            url: `${endpoint.startsWith('http') ? '' : savetube.api.base}${endpoint}`,
            data: method === 'post' ? data : undefined,
            params: method === 'get' ? data : undefined,
            headers: savetube.headers
         })
         return {
            status: true,
            code: 200,
            data: response
         }
      } catch (error) {
         throw new Error(error)
      }
   },
   getCDN: async () => {
      const response = await savetube.request(savetube.api.cdn, {}, 'get');
      if (!response.status) throw new Error(response)
      return {
         status: true,
         code: 200,
         data: response.data.cdn
      }
   },
   downloadAudio: async (link) => {
      if (!link) {
         return {
            status: false,
            code: 400,
            error: "No link provided."
         }
      }
      const id = savetube.youtube(link);
      if (!id) throw new Error('Invalid YouTube link.');
      try {
         const cdnx = await savetube.getCDN();
         if (!cdnx.status) return cdnx;
         const cdn = cdnx.data;
         const result = await savetube.request(`https://${cdn}${savetube.api.info}`, {
            url: `https://www.youtube.com/watch?v=${id}`
         });
         if (!result.status) return result;
         const decrypted = await savetube.crypto.decrypt(result.data.data);
         let dl;
         try {
            dl = await savetube.request(`https://${cdn}${savetube.api.download}`, {
               id: id,
               downloadType: 'audio',
               quality: '128',
               key: decrypted.key
            });
         } catch (error) {
            throw new Error('Failed to get download link.');
         };
         return {
            status: true,
            code: 200,
            result: {
               title: decrypted.title || "Unknown Title",
               type: 'audio',
               format: 'mp3',
               thumbnail: decrypted.thumbnail || `https://i.ytimg.com/vi/${id}/0.jpg`,
               download: dl.data.data.downloadUrl,
               id: id,
               key: decrypted.key,
               duration: decrypted.duration,
               quality: '128'
            }
         }
      } catch (error) {
         throw new Error('An error occurred while processing your request.');
      }
   }
};

export default {
    name: 'play',
    description: 'Descargar audio de YouTube',
    category: 'descargas',

    execute: async (message, args, bot) => {
        try {
            const text = args.join(" ").trim();
            const jid = message.key.remoteJid;

            // Reacción de procesando
            await bot.procesadorMensajes.reaccionar(message, configBot.reacciones.procesando);

            if (!text) {
                await bot.procesadorMensajes.enviarMensaje(
                    jid,
                    `${configMensajes.humano.pensando} ${configMensajes.errores.sinArgumentos}\n\n*Ejemplo:* ${configBot.prefijo}play Shakira`
                );
                return await bot.procesadorMensajes.reaccionar(message, configBot.reacciones.error);
            }

            await bot.procesadorMensajes.enviarMensaje(jid, `${configMensajes.humano.pensando} Buscando "${text}" en YouTube...`);

            const searchApi = `https://delirius-apiofc.vercel.app/search/ytsearch?q=${text}`;
            const searchResponse = await axios.get(searchApi);
            const searchData = searchResponse.data;

            if (!searchData?.data || searchData.data.length === 0) {
                await bot.procesadorMensajes.enviarMensaje(
                    jid,
                    `${configMensajes.humano.ups} No se encontraron resultados para "${text}".`
                );
                return await bot.procesadorMensajes.reaccionar(message, configBot.reacciones.error);
            }

            const video = searchData.data[0];
            const videoDetails =
                `🎵 *${video.title}*\n\n` +
                `📺 *Canal:* ${video.author.name}\n` +
                `⏱️ *Duración:* ${video.duration}\n` +
                `👀 *Vistas:* ${video.views}\n` +
                `📅 *Publicado:* ${video.publishedAt}`;

            // Enviar información del video
            await bot.obtenerManejadorConexion().obtenerSocket().sendMessage(
                jid,
                {
                    image: { url: video.image },
                    caption: videoDetails.trim()
                },
                { quoted: message }
            );

            await bot.procesadorMensajes.enviarMensaje(jid, configMensajes.respuestas.descargaInicio);

            // Descargar audio con savetube
            const downloadResult = await savetube.downloadAudio(video.url);

            if (!downloadResult?.status || !downloadResult?.result?.download) {
                await bot.procesadorMensajes.enviarMensaje(
                    jid,
                    `${configMensajes.humano.ups} ${configMensajes.errores.mediaError}`
                );
                return await bot.procesadorMensajes.reaccionar(message, configBot.reacciones.error);
            }

            // Enviar audio
            await bot.obtenerManejadorConexion().obtenerSocket().sendMessage(
                jid,
                {
                    audio: { url: downloadResult.result.download },
                    mimetype: "audio/mpeg",
                    fileName: `${video.title}.mp3`
                },
                { quoted: message }
            );

            await bot.procesadorMensajes.enviarMensaje(jid, configMensajes.respuestas.descargaExito);
            await bot.procesadorMensajes.reaccionar(message, configBot.reacciones.exito);

        } catch (error) {
            console.error('Error en comando play:', error);
            await bot.procesadorMensajes.enviarMensaje(
                message.key.remoteJid,
                `${configMensajes.humano.ups} ${configMensajes.errores.general}\nError: ${error.message}`
            );
            await bot.procesadorMensajes.reaccionar(message, configBot.reacciones.error);
        }
    }
};