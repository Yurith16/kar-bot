import { configBot } from '../../config/config.bot.js';
import { configMensajes } from '../../config/config.mensajes.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Crypto from 'crypto';
import ffmpeg from 'fluent-ffmpeg';
import pkg from 'node-webpmux';
import { downloadContentFromMessage } from '@whiskeysockets/baileys';

const { Image } = pkg;

// Para usar __dirname en ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const tempFolder = path.join(__dirname, '../../temp/');
if (!fs.existsSync(tempFolder)) fs.mkdirSync(tempFolder, { recursive: true });

// Configurar FFmpeg path con ffmpeg-static
try {
    import('ffmpeg-static').then((ffmpegPath) => {
        ffmpeg.setFfmpegPath(ffmpegPath.default);
        console.log('✅ FFmpeg configurado con ffmpeg-static');
    }).catch(() => {
        // Si ffmpeg-static falla, intentar con @ffmpeg-installer/ffmpeg
        import('@ffmpeg-installer/ffmpeg').then((ffmpegInstaller) => {
            ffmpeg.setFfmpegPath(ffmpegInstaller.default);
            console.log('✅ FFmpeg configurado con @ffmpeg-installer/ffmpeg');
        }).catch((error) => {
            console.log('⚠️ No se pudo configurar FFmpeg automáticamente');
        });
    });
} catch (error) {
    console.log('⚠️ Error configurando FFmpeg:', error.message);
}

/* === FUNCIONES DE CONVERSIÓN DE STICKERS === */

function randomFileName(ext) {
    return `${Crypto.randomBytes(6).readUIntLE(0, 6).toString(36)}.${ext}`;
}

async function imageToWebp(media) {
    const tmpIn = path.join(tempFolder, randomFileName('jpg'));
    const tmpOut = path.join(tempFolder, randomFileName('webp'));
    fs.writeFileSync(tmpIn, media);

    await new Promise((resolve, reject) => {
        ffmpeg(tmpIn)
            .on('error', reject)
            .on('end', resolve)
            .addOutputOptions([
                "-vcodec", "libwebp",
                "-vf", "scale='min(320,iw)':min'(320,ih)':force_original_aspect_ratio=decrease,fps=15,pad=320:320:-1:-1:color=white@0.0,split[a][b];[a]palettegen=reserve_transparent=on:transparency_color=ffffff[p];[b][p]paletteuse"
            ])
            .toFormat('webp')
            .save(tmpOut);
    });

    const buff = fs.readFileSync(tmpOut);
    fs.unlinkSync(tmpIn);
    fs.unlinkSync(tmpOut);
    return buff;
}

async function videoToWebp(media) {
    const tmpIn = path.join(tempFolder, randomFileName('mp4'));
    const tmpOut = path.join(tempFolder, randomFileName('webp'));
    fs.writeFileSync(tmpIn, media);

    await new Promise((resolve, reject) => {
        ffmpeg(tmpIn)
            .on('error', reject)
            .on('end', resolve)
            .addOutputOptions([
                "-vcodec", "libwebp",
                "-vf", "scale='min(320,iw)':min'(320,ih)':force_original_aspect_ratio=decrease,fps=15,pad=320:320:-1:-1:color=white@0.0,split[a][b];[a]palettegen=reserve_transparent=on:transparency_color=ffffff[p];[b][p]paletteuse",
                "-loop", "0",
                "-ss", "00:00:00",
                "-t", "00:00:05",
                "-preset", "default",
                "-an",
                "-vsync", "0"
            ])
            .toFormat('webp')
            .save(tmpOut);
    });

    const buff = fs.readFileSync(tmpOut);
    fs.unlinkSync(tmpIn);
    fs.unlinkSync(tmpOut);
    return buff;
}

async function addExif(webpBuffer, metadata) {
    const tmpIn = path.join(tempFolder, randomFileName('webp'));
    const tmpOut = path.join(tempFolder, randomFileName('webp'));
    fs.writeFileSync(tmpIn, webpBuffer);

    const json = {
        "sticker-pack-id": "karbot-sticker",
        "sticker-pack-name": metadata.packname,
        "sticker-pack-publisher": metadata.author,
        "emojis": metadata.categories || [""]
    };

    const exifAttr = Buffer.from([
        0x49, 0x49, 0x2A, 0x00,
        0x08, 0x00, 0x00, 0x00,
        0x01, 0x00, 0x41, 0x57,
        0x07, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x16, 0x00,
        0x00, 0x00
    ]);
    const jsonBuff = Buffer.from(JSON.stringify(json), "utf-8");
    const exif = Buffer.concat([exifAttr, jsonBuff]);
    exif.writeUIntLE(jsonBuff.length, 14, 4);

    const img = new Image();
    await img.load(tmpIn);
    img.exif = exif;
    await img.save(tmpOut);
    fs.unlinkSync(tmpIn);
    return tmpOut;
}

async function writeExifImg(media, metadata) {
    const wMedia = await imageToWebp(media);
    return await addExif(wMedia, metadata);
}

async function writeExifVid(media, metadata) {
    const wMedia = await videoToWebp(media);
    return await addExif(wMedia, metadata);
}

export default {
    name: 's',
    description: 'Crear stickers desde imágenes o videos',
    category: 'utilidades',

    execute: async (message, args, bot) => {
        const jid = message.key.remoteJid;

        try {
            // Reacción de procesando
            await bot.procesadorMensajes.reaccionar(message, configBot.reacciones.procesando);

            const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;

            if (!quoted) {
                await bot.procesadorMensajes.enviarMensaje(
                    jid,
                    `${configMensajes.humano.pensando} Responde a una imagen o video con el comando ${configBot.prefijo}s para crear un sticker.`
                );
                return await bot.procesadorMensajes.reaccionar(message, configBot.reacciones.error);
            }

            const mediaType = quoted.imageMessage ? 'image' : quoted.videoMessage ? 'video' : null;
            if (!mediaType) {
                await bot.procesadorMensajes.enviarMensaje(
                    jid,
                    `${configMensajes.humano.ups} Solo puedes convertir imágenes o videos en stickers.`
                );
                return await bot.procesadorMensajes.reaccionar(message, configBot.reacciones.error);
            }

            await bot.procesadorMensajes.reaccionar(message, "🛠️");

            const mediaStream = await downloadContentFromMessage(quoted[`${mediaType}Message`], mediaType);
            let buffer = Buffer.alloc(0);
            for await (const chunk of mediaStream) buffer = Buffer.concat([buffer, chunk]);

            const metadata = {
                packname: "",
                author: configBot.nombre
            };

            await bot.procesadorMensajes.enviarMensaje(
                jid,
                `${configMensajes.humano.pensando} Creando sticker...`
            );

            const stickerPath = mediaType === 'image'
                ? await writeExifImg(buffer, metadata)
                : await writeExifVid(buffer, metadata);

            await bot.procesadorMensajes.reaccionar(message, "⬆️");

            // Enviar el sticker
            await bot.obtenerManejadorConexion().obtenerSocket().sendMessage(
                jid,
                {
                    sticker: { url: stickerPath }
                },
                { quoted: message }
            );

            // Limpiar archivo temporal del sticker
            if (fs.existsSync(stickerPath)) {
                fs.unlinkSync(stickerPath);
            }

            await bot.procesadorMensajes.reaccionar(message, configBot.reacciones.exito);

        } catch (error) {
            console.error('❌ Error en el comando de sticker:', error);

            await bot.procesadorMensajes.enviarMensaje(
                jid,
                `${configMensajes.humano.ups} ${configMensajes.errores.mediaError}\nError: ${error.message}`
            );
            await bot.procesadorMensajes.reaccionar(message, configBot.reacciones.error);
        }
    }
};