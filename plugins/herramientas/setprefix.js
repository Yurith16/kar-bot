import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { configBot } from '../../config/config.bot.js';
import { configMensajes } from '../../config/config.mensajes.js';
import { configDesarrollador } from '../../config/config.desarrollador.js'; // ← AGREGAR ESTA LÍNEA

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default {
    name: 'setprefix',
    description: 'Cambiar el prefijo del bot (Solo Owner)',
    category: 'herramientas',

    execute: async (message, args, bot) => {
        const jid = message.key.remoteJid;

        try {
            const nuevoPrefijo = args[0];

            // Reacción de procesando
            await bot.procesadorMensajes.reaccionar(message, configBot.reacciones.procesando);

            // OBTENER EL JID REAL usando la función de Baileys si está disponible
            let jidRemitente;

            if (bot.obtenerManejadorConexion().obtenerSocket()?.decodeJid) {
                // Usar decodeJid de Baileys que maneja LIDs correctamente
                jidRemitente = bot.obtenerManejadorConexion().obtenerSocket().decodeJid(
                    message.key.participant || message.key.remoteJid
                );
            } else {
                // Fallback: usar nuestro normalizador mejorado
                jidRemitente = message.key.participant || message.key.remoteJid;
                // Limpiar el JID manualmente
                jidRemitente = jidRemitente.split(':')[0].split('@')[0] + '@s.whatsapp.net';
            }

            console.log(`🔍 JID del remitente: ${jidRemitente}`);
            console.log(`👑 Owner configurado: ${configDesarrollador.numero}@s.whatsapp.net`);

            // Verificar si es owner comparando con el número del desarrollador
            const numeroRemitente = jidRemitente.split('@')[0];

            // Si configDesarrollador.numero no existe, usar fallback
            const numeroOwner = configDesarrollador.numero || '50496926150';

            if (numeroRemitente !== numeroOwner) {
                await bot.procesadorMensajes.enviarMensaje(
                    jid,
                    `${configMensajes.humano.noPermitido} ${configMensajes.errores.soloOwner}`
                );
                return await bot.procesadorMensajes.reaccionar(message, configBot.reacciones.error);
            }

            if (!nuevoPrefijo) {
                await bot.procesadorMensajes.enviarMensaje(
                    jid,
                    `${configMensajes.humano.pensando} ${configMensajes.errores.sinArgumentos}\n\n${configMensajes.owner.usoCorrecto}\n*Ejemplo:* ${configBot.prefijo}setprefix !`
                );
                return await bot.procesadorMensajes.reaccionar(message, configBot.reacciones.error);
            }

            // Validar que el prefijo sea un solo carácter
            if (nuevoPrefijo.length !== 1) {
                await bot.procesadorMensajes.enviarMensaje(
                    jid,
                    `${configMensajes.humano.ups} ${configMensajes.errores.prefijoInvalido}\nEl prefijo debe ser un solo carácter (ej: !, ., *, #, etc.)`
                );
                return await bot.procesadorMensajes.reaccionar(message, configBot.reacciones.error);
            }

            await bot.procesadorMensajes.enviarMensaje(jid, configMensajes.owner.cambioPrefijo);

            // Ruta al archivo de configuración
            const configPath = join(process.cwd(), 'config', 'config.bot.js');

            // Leer el archivo actual
            let configContent = await fs.readFile(configPath, 'utf8');

            // Reemplazar el prefijo en el archivo
            const nuevoConfigContent = configContent.replace(
                /prefijo: ".*?"/,
                `prefijo: "${nuevoPrefijo}"`
            );

            // Escribir el archivo actualizado
            await fs.writeFile(configPath, nuevoConfigContent, 'utf8');

            // Mensaje de éxito
            const mensajeExito = `
${configMensajes.respuestas.prefijoCambiado}

${configMensajes.owner.prefijoNuevo} *${nuevoPrefijo}*

🔧 *Prefijo anterior:* ${configBot.prefijo}
🎯 *Prefijo nuevo:* ${nuevoPrefijo}

📝 *Nota:* El cambio surtirá efecto después de reiniciar el bot.
            `.trim();

            await bot.procesadorMensajes.enviarMensaje(jid, mensajeExito);
            await bot.procesadorMensajes.reaccionar(message, configBot.reacciones.exito);

        } catch (error) {
            console.error('Error en comando setprefix:', error);

            await bot.procesadorMensajes.enviarMensaje(
                jid,
                `${configMensajes.humano.ups} ${configMensajes.errores.general}\nError: ${error.message}`
            );
            await bot.procesadorMensajes.reaccionar(message, configBot.reacciones.error);
        }
    }
};