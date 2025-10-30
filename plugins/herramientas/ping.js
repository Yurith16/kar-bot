export default {
    name: 'ping',
    description: 'Comando para verificar la latencia del bot',
    category: 'herramientas',
    aliases: ['latencia', 'test'],

    execute: async (message, args, bot) => {
        try {
            console.log('🔧 EJECUTANDO COMANDO PING');

            const inicio = Date.now();
            const jid = message.key.remoteJid;

            await bot.enviarMensaje(jid, '🏓 Calculando latencia...');

            const fin = Date.now();
            const latencia = fin - inicio;

            const respuesta = `
✅ *PONG!*

🏓 *Latencia:* ${latencia}ms
🤖 *Estado:* ✅ Conectado
🕐 *Tiempo de respuesta:* ${latencia < 200 ? '⚡ Rápido' : latencia < 500 ? '🚀 Normal' : '🐢 Lento'}
            `.trim();

            await bot.enviarMensaje(jid, respuesta);

            console.log('✅ Comando ping ejecutado correctamente');

        } catch (error) {
            console.error('❌ Error en comando ping:', error);
        }
    }
};