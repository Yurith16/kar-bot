export default {
    name: 'ping',
    description: 'Comando para verificar la latencia del bot',
    category: 'herramientas',

    execute: async (message, args, bot) => {
        const inicio = Date.now();

        // Enviar mensaje inicial
        await bot.procesadorMensajes.enviarMensaje(message.key.remoteJid, '🏓 Calculando latencia...');

        const fin = Date.now();
        const latencia = fin - inicio;

        // Respuesta con información detallada
        const respuesta = `
✅ *PONG!*

🏓 *Latencia:* ${latencia}ms
🤖 *Estado:* ✅ Conectado
🕐 *Tiempo de respuesta:* ${latencia < 200 ? '⚡ Rápido' : latencia < 500 ? '🚀 Normal' : '🐢 Lento'}
        `.trim();

        await bot.procesadorMensajes.enviarMensaje(message.key.remoteJid, respuesta);
    }
};