import { Bot } from './nucleo/bot/Bot.js';
import { configBot } from './config/config.bot.js';

async function main() {
    try {
        const bot = new Bot();

        // Establecer referencia del bot en el procesador de mensajes
        bot.procesadorMensajes.setBot(bot);

        await bot.iniciar();
    } catch (error) {
        console.error('❌ Error fatal:', error);
        process.exit(1);
    }
}

// Manejar cierre graceful
process.on('SIGINT', async () => {
    console.log('\n🛑 Deteniendo Karbot...');
    process.exit(0);
});

process.on('unhandledRejection', (error) => {
    console.error('❌ Error no manejado:', error);
});

process.on('uncaughtException', (error) => {
    console.error('❌ Excepción no capturada:', error);
    process.exit(1);
});

main();