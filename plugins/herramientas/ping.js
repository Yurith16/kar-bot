export default {
    name: 'ping',
    description: 'Comando para verificar la latencia del bot',
    category: 'herramientas',
    aliases: ['latencia', 'test', 'pong'],

    execute: async (message, args, bot) => {
        try {
            console.log('🔧 EJECUTANDO COMANDO PING');

            const jid = message.remoteJid;
            const messageKey = message.key;

            // Reaccionar indicando procesamiento
            await bot.reaccionar(jid, messageKey, '⏱️');

            const inicio = Date.now();

            // Enviar mensaje inicial
            await bot.enviarMensaje(jid, { text: '🏓 Calculando latencia...' });

            const fin = Date.now();
            const latencia = fin - inicio;

            // Obtener uso de memoria
            const usoMemoria = (process.memoryUsage().rss / 1024 / 1024).toFixed(2);
            const uptime = process.uptime();

            // Determinar estado de velocidad
            let estadoVelocidad;
            if (latencia < 200) {
                estadoVelocidad = '⚡ Rápido';
            } else if (latencia < 500) {
                estadoVelocidad = '🚀 Normal';
            } else if (latencia < 1000) {
                estadoVelocidad = '🐢 Lento';
            } else {
                estadoVelocidad = '🚨 Muy lento';
            }

            // Formatear tiempo de actividad
            const horas = Math.floor(uptime / 3600);
            const minutos = Math.floor((uptime % 3600) / 60);
            const segundos = Math.floor(uptime % 60);
            const tiempoActividad = `${horas}h ${minutos}m ${segundos}s`;

            const respuesta = `
✅ *PONG!* 🏓

*📊 Estadísticas del Bot:*

🏓 *Latencia:* ${latencia}ms
⚡ *Velocidad:* ${estadoVelocidad}
🤖 *Estado:* ✅ Conectado
💾 *Uso de RAM:* ${usoMemoria}MB
⏰ *Tiempo activo:* ${tiempoActividad}
🖥️ *Plataforma:* ${process.platform}
🔧 *Node.js:* ${process.version}

${latencia < 300 ? '✅ Todo en orden' : '⚠️ Revisa la conexión'}
            `.trim();

            await bot.enviarMensaje(jid, { text: respuesta });

            // Reaccionar final
            const reaccionFinal = latencia < 300 ? '✅' : '⚠️';
            await bot.reaccionar(jid, messageKey, reaccionFinal);

            console.log(`✅ Comando ping ejecutado - Latencia: ${latencia}ms`);

        } catch (error) {
            console.error('❌ Error en comando ping:', error);

            // Intentar enviar mensaje de error
            try {
                await bot.reaccionar(message.remoteJid, message.key, '❌');
                await bot.enviarMensaje(message.remoteJid, { 
                    text: '❌ Error al calcular la latencia. Intenta nuevamente.' 
                });
            } catch (sendError) {
                console.error('❌ Error enviando mensaje de error:', sendError);
            }
        }
    }
};