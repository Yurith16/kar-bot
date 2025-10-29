import { configBot } from '../../config/config.bot.js';
import { configDesarrollador } from '../../config/config.desarrollador.js';
import { configMensajes } from '../../config/config.mensajes.js';

export default {
    name: 'menu',
    description: 'Menú principal del bot',
    category: 'herramientas',

    execute: async (message, args, bot) => {
        try {
            const jid = message.key.remoteJid;
            const username = '@' + (message.key.participant || message.key.remoteJid).split('@')[0];

            // Reacción del menú
            await bot.procesadorMensajes.reaccionar(message, "📱");

            const _uptime = process.uptime() * 1000;
            const uptime = clockString(_uptime);

            // Comandos organizados por categorías
            const menuCommands = {
                'descargas': [
                    `${configBot.prefijo}play <nombre/url>`,
                    `${configBot.prefijo}tiktok <url>`,
                    `${configBot.prefijo}facebook <url>`,
                    `${configBot.prefijo}imagen <nombre>`
                ],
                'herramientas': [
                    `${configBot.prefijo}ping`,
                    `${configBot.prefijo}menu`
                ],
                'propietario': [
                    `${configBot.prefijo}setprefix <nuevo_prefijo>`
                ]
            };

            const borderedTags = {
                'descargas': '📥 DESCARGAS 📥',
                'herramientas': '🛠️ HERRAMIENTAS 🛠️',
                'propietario': '👑 PROPIETARIO 👑'
            };

            const menuSections = Object.keys(borderedTags).map(tag => {
                const commandsInTag = menuCommands[tag] ? menuCommands[tag].join('\n') : '';

                if (commandsInTag) {
                    return `
╭━━〔 ${borderedTags[tag]} 〕━━╮
┃
${commandsInTag.split('\n').map(cmd => `┃ ➡️ ${cmd}`).join('\n')}
┃
╰━━━━━━━━━━━━━━━━━━━━╯
`.trim();
                }
                return '';
            }).filter(section => section !== '');

            const infoBotSection = `
╭━━〔 ℹ️ INFO DEL BOT ℹ️ 〕━━╮
┃
┃ ➡️ Nombre: ${configBot.nombre}
┃ ➡️ Versión: ${configBot.version}
┃ ➡️ Desarrollador: ${configDesarrollador.nombre}
┃ ➡️ GitHub: ${configDesarrollador.github}
┃ ➡️ Actividad: ${uptime}
┃ ➡️ Prefijo: ${configBot.prefijo}
┃ ➡️ Estado: ✅ Conectado
┃
╰━━━━━━━━━━━━━━━━━━━━╯
`.trim();

            const infoUsuarioSection = `
╭━━〔 👤 INFO DEL USUARIO 👤 〕━━╮
┃
┃ ➡️ Usuario: ${username}
┃ ➡️ Comandos: ${Object.values(menuCommands).flat().length}
┃
╰━━━━━━━━━━━━━━━━━━━━╯
`.trim();

            const mainHeader = `
╭━━〔 🔥 ${configBot.nombre} 🔥 〕━━╮
┃
┃ ➡️ Hola, ${username}
┃ ➡️ ${configMensajes.respuestas.bienvenida}
┃
╰━━━━━━━━━━━━━━━━━━━━╯
`.trim();

            const footer = `
╭━━〔 📝 NOTAS 〕━━╮
┃
┃ ➡️ Usa ${configBot.prefijo}menu para ver este menú
┃ ➡️ ¿Necesitas ayuda? Contacta al desarrollador
┃
╰━━━━━━━━━━━━━━━━━━━━╯
`.trim();

            const fullText = [
                mainHeader,
                infoBotSection,
                infoUsuarioSection,
                ...menuSections,
                footer,
                `🔥 *${configBot.nombre}* - Tu asistente personal 🔥`
            ].join('\n\n');

            // Imágenes aleatorias del bot (reemplaza con tus URLs)
            const botImages = [
                'https://images.unsplash.com/photo-1614680376573-df3480f0c6ff?w=500&h=500&fit=crop',  // Robot 1
                'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=500&h=500&fit=crop',  // Robot 2
                'https://images.unsplash.com/photo-1535378620166-273708d44e4c?w=500&h=500&fit=crop'   // Tecnología
            ];

            const randomImage = botImages[Math.floor(Math.random() * botImages.length)];

            await bot.obtenerManejadorConexion().obtenerSocket().sendMessage(
                jid,
                {
                    image: { url: randomImage },
                    caption: fullText
                },
                { quoted: message }
            );

            await bot.procesadorMensajes.reaccionar(message, configBot.reacciones.exito);

        } catch (error) {
            console.error('Error en menú:', error);
            await bot.procesadorMensajes.enviarMensaje(
                message.key.remoteJid,
                `${configMensajes.humano.ups} ${configMensajes.errores.general}`
            );
            await bot.procesadorMensajes.reaccionar(message, configBot.reacciones.error);
        }
    }
};

function clockString(ms) {
    const h = isNaN(ms) ? '--' : Math.floor(ms / 3600000);
    const m = isNaN(ms) ? '--' : Math.floor(ms / 60000) % 60;
    const s = isNaN(ms) ? '--' : Math.floor(ms / 1000) % 60;
    return [h, m, s].map(v => v.toString().padStart(2, 0)).join(':');
}