import { configBot } from '../../config/config.bot.js';
import { configMensajes } from '../../config/config.mensajes.js';
import { NormalizadorJID } from '../../utilidades/NormalizadorJID.js';

export default {
    name: 'id',
    description: 'Mostrar información del JID del usuario',
    category: 'herramientas',

    execute: async (message, args, bot) => {
        try {
            const jidChat = message.key.remoteJid;
            const jidRemitente = message.key.participant || jidChat;

            // Reacción de procesando
            await bot.procesadorMensajes.reaccionar(message, configBot.reacciones.procesando);

            // Obtener información detallada
            const infoRemitente = NormalizadorJID.obtenerInfoRemitente(message);
            const infoJID = NormalizadorJID.obtenerInfoJID(jidRemitente);

            const mensajeInfo = `
🔍 *INFORMACIÓN DE IDENTIFICACIÓN*

👤 *Tu Información:*
• *JID Original:* \`${jidRemitente}\`
• *JID Normalizado:* \`${infoJID.jidUniversal}\`
• *Número:* ${infoJID.numero}
• *Es Owner:* ${infoJID.esOwner ? '✅ Sí' : '❌ No'}
• *Tipo de Chat:* ${infoRemitente.esGrupo ? '👥 Grupo' : '💬 Privado'}

💬 *Información del Chat:*
• *JID del Chat:* \`${jidChat}\`
• *Es Grupo:* ${infoRemitente.esGrupo ? '✅ Sí' : '❌ No'}

📝 *Explicación:*
- *JID Original:* Es el ID completo que WhatsApp envía
- *JID Normalizado:* Es tu ID universal (igual en grupos y privado)
- *JID del Chat:* Es el ID de la conversación actual

🎯 *Para comandos de owner, se usa tu JID Normalizado*
            `.trim();

            await bot.procesadorMensajes.enviarMensaje(jidChat, mensajeInfo);
            await bot.procesadorMensajes.reaccionar(message, configBot.reacciones.exito);

        } catch (error) {
            console.error('Error en comando id:', error);

            await bot.procesadorMensajes.enviarMensaje(
                message.key.remoteJid,
                `${configMensajes.humano.ups} ${configMensajes.errores.general}`
            );
            await bot.procesadorMensajes.reaccionar(message, configBot.reacciones.error);
        }
    }
};