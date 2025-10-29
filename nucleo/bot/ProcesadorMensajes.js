import { configBot } from '../../config/config.bot.js';
import { configMensajes } from '../../config/config.mensajes.js';

export class ProcesadorMensajes {
    constructor(manejadorConexion) {
        this.manejadorConexion = manejadorConexion;
        this.comandos = new Map();
        this.bot = null; // Se establecerá después
    }

    setBot(bot) {
        this.bot = bot;
    }

    inicializar() {
        this.manejadorConexion.on('mensajesRecibidos', (data) => {
            this.procesarMensajesLote(data);
        });
    }

    async procesarMensajesLote(data) {
        const { messages } = data;

        for (const message of messages) {
            await this.procesarMensajeIndividual(message);
        }
    }

    async procesarMensajeIndividual(message) {
        if (!message.message) return;

        const jid = message.key.remoteJid;
        const tipo = Object.keys(message.message)[0];

        // Solo procesar mensajes de texto con comandos
        if (tipo === 'conversation' || tipo === 'extendedTextMessage') {
            const texto = this.extraerTexto(message);

            if (texto && texto.startsWith(configBot.prefijo)) {
                await this.procesarComando(message, texto);
            }
        }
    }

    extraerTexto(message) {
        if (message.message.conversation) {
            return message.message.conversation;
        }
        if (message.message.extendedTextMessage?.text) {
            return message.message.extendedTextMessage.text;
        }
        return null;
    }

    async procesarComando(message, textoCompleto) {
        const partes = textoCompleto.slice(configBot.prefijo.length).split(' ');
        const comando = partes[0].toLowerCase();
        const argumentos = partes.slice(1);

        console.log(`⚡ Comando detectado: ${comando}`);
        console.log(`📋 Argumentos: ${argumentos}`);

        // Reacción de procesando
        await this.reaccionar(message, configBot.reacciones.procesando);

        try {
            // Buscar y ejecutar comando
            const comandoHandler = this.comandos.get(comando);

            if (comandoHandler) {
                // Pasar el bot como tercer parámetro
                await comandoHandler.execute(message, argumentos, this.bot);
                await this.reaccionar(message, configBot.reacciones.exito);
            } else {
                await this.mensajeErrorComandoNoEncontrado(message, comando);
                await this.reaccionar(message, configBot.reacciones.error);
            }

        } catch (error) {
            console.error(`❌ Error ejecutando comando ${comando}:`, error);
            await this.mensajeErrorGeneral(message, error);
            await this.reaccionar(message, configBot.reacciones.error);
        }
    }

    registrarComando(nombre, comando) {
        this.comandos.set(nombre.toLowerCase(), comando);
        console.log(`✅ Comando registrado: ${nombre}`);
    }

    async mensajeErrorComandoNoEncontrado(message, comando) {
        const respuesta = `${configMensajes.humano.ups} ${configMensajes.errores.comandoNoEncontrado}\n\nComando: ${comando}`;
        await this.enviarMensaje(message.key.remoteJid, respuesta);
    }

    async mensajeErrorGeneral(message, error) {
        const respuesta = `${configMensajes.errores.general}\nError: ${error.message || error}`;
        await this.enviarMensaje(message.key.remoteJid, respuesta);
    }

    async reaccionar(mensaje, reaccion) {
        const sock = this.manejadorConexion.obtenerSocket();
        if (!sock) return;

        try {
            await sock.sendMessage(mensaje.key.remoteJid, {
                react: {
                    text: reaccion,
                    key: mensaje.key
                }
            });
        } catch (error) {
            console.error('Error al reaccionar:', error);
        }
    }

    async enviarMensaje(jid, contenido) {
        const sock = this.manejadorConexion.obtenerSocket();
        if (!sock) return;

        try {
            await sock.sendMessage(jid, { text: contenido });
        } catch (error) {
            console.error('Error al enviar mensaje:', error);
        }
    }
}