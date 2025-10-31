import { ManejadorConexion } from './ManejadorConexion.js';
import { ProcesadorMensajes } from './ProcesadorMensajes.js';
import { CommandHandler } from './CommandHandler.js';
import { configBot, configMensajes, configDesarrollador } from '../../config/index.js';
import chalk from 'chalk';

class Bot {
    constructor() {
        this.manejadorConexion = new ManejadorConexion(this.messageHandler.bind(this));
        this._procesadorMensajes = new ProcesadorMensajes(); // ← Cambiado a _procesadorMensajes
        this.commandHandler = new CommandHandler(this);
        this.estaListo = false;

        this.configurarEventos();
    }

    // Message handler similar al de tu bot que funciona
    async messageHandler(sock, message) {
        try {
            const jid = message.key.remoteJid;
            if (!jid) return;

            // Ignorar mensajes del propio bot
            if (message.key.fromMe) return;

            // Ignorar mensajes antiguos
            if (!this.manejadorConexion.isNewMessage(message.messageTimestamp)) return;

            const texto = this.procesadorMensajes.obtenerTextoMensaje(message);
            const esGrupo = jid.endsWith("@g.us");
            const esComando = texto.startsWith("/");

            // Solo mostrar comandos en consola
            if (esComando && texto.length > 0) {
                const sender = message.key.participant || jid;
                const senderNumber = sender.split("@")[0];
                console.log(chalk.cyan(`📨 [${esGrupo ? 'GRUPO' : 'PRIVADO'}] ${senderNumber}: ${texto.substring(0, 50)}`));
            }

            if (texto.length === 0) return;

            // Procesar el mensaje
            const mensajeProcesado = await this.procesadorMensajes.procesar(message, sock);

            if (mensajeProcesado && mensajeProcesado.esComando) {
                await this.commandHandler.ejecutarComando(mensajeProcesado, sock);
            }

        } catch (error) {
            // Ignorar errores de decrypt/ Bad MAC
            if (!error.message.includes('Bad MAC') && !error.message.includes('Failed to decrypt')) {
                console.error(chalk.red('❌ Error en messageHandler:'), error.message);
            }
        }
    }

    configurarEventos() {
        // Eventos de conexión
        this.manejadorConexion.on('conexionEstablecida', (sock) => {
            this.estaListo = true;
            console.log(chalk.green(`🤖 ${configBot.nombre} v${configBot.version} está listo!`));
            console.log(chalk.cyan(`🎯 Prefijo: ${configBot.prefijo}`));
        });

        this.manejadorConexion.on('conexionCerrada', (datos) => {
            this.estaListo = false;
            console.log(chalk.yellow('🔌 Conexión cerrada, bot no disponible'));
        });
    }

    async iniciar() {
        console.log(chalk.cyan(`🚀 Iniciando ${configBot.nombre} v${configBot.version}...`));
        console.log(chalk.yellow(`👨‍💻 Desarrollador: ${configDesarrollador.nombre}`));

        try {
            // Primero cargar comandos
            await this.commandHandler.cargarComandos();

            // Luego iniciar conexión
            await this.manejadorConexion.iniciarConexion();
        } catch (error) {
            console.error(chalk.red('❌ Error al iniciar el bot:'), error);
            process.exit(1);
        }
    }

    async detener() {
        console.log(chalk.yellow('🛑 Deteniendo bot...'));
        this.estaListo = false;
        await this.manejadorConexion.cerrarConexion();
    }

    // Método para que los plugins envíen mensajes
    async enviarMensaje(chat, mensaje, options = {}) {
        if (!this.estaListo) {
            throw new Error('Bot no está listo');
        }

        const sock = this.manejadorConexion.obtenerSocket();
        if (!sock) {
            throw new Error('Socket no disponible');
        }

        return await sock.sendMessage(chat, mensaje, options);
    }

    // Método para reaccionar (para compatibilidad con plugins)
    async reaccionar(chat, messageKey, emoji) {
        if (!this.estaListo) return;

        const sock = this.manejadorConexion.obtenerSocket();
        if (!sock) return;

        try {
            await sock.sendMessage(chat, {
                react: {
                    text: emoji,
                    key: messageKey
                }
            });
        } catch (error) {
            console.error('❌ Error reaccionando:', error);
        }
    }

    // Getter para procesadorMensajes (para compatibilidad con plugins)
    get procesadorMensajes() {
        return this._procesadorMensajes;
    }

    obtenerEstado() {
        return {
            listo: this.estaListo,
            conectado: this.manejadorConexion.obtenerEstadoConexion(),
            metodoConexion: this.manejadorConexion.obtenerMetodoConexion(),
            comandosCargados: this.commandHandler.comandos.size
        };
    }

    obtenerCommandHandler() {
        return this.commandHandler;
    }
}

export { Bot };