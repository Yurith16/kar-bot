import { configBot } from '../../config/config.bot.js';
import { configMensajes } from '../../config/config.mensajes.js';
import { ManejadorComandos } from './ManejadorComandos.js';

export class ProcesadorMensajes {
    constructor(manejadorConexion) {
        this.manejadorConexion = manejadorConexion;
        this.manejadorComandos = new ManejadorComandos(this);
        this.bot = null;
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

        // Ignorar mensajes del propio bot
        if (message.key.fromMe) return;

        const jid = message.key.remoteJid;
        const tipo = Object.keys(message.message)[0];

        const esGrupo = jid.endsWith('@g.us');
        const texto = this.extraerTexto(message);

        if (!texto) return;

        // Procesar comandos en privado
        if (!esGrupo && texto.startsWith(configBot.prefijo)) {
            await this.procesarComando(message, texto);
        }
        // Procesar comandos en grupos (con prefijo o mencionando al bot)
        else if (esGrupo && (texto.startsWith(configBot.prefijo) || this.estaMencionado(message))) {
            await this.procesarComando(message, texto);
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

    estaMencionado(message) {
        if (message.message.extendedTextMessage?.contextInfo?.mentionedJid) {
            const mencionados = message.message.extendedTextMessage.contextInfo.mentionedJid;
            const botJid = this.manejadorConexion.obtenerSocket()?.user?.id;
            return mencionados.includes(botJid);
        }
        return false;
    }

    async procesarComando(message, textoCompleto) {
        const jid = message.key.remoteJid;
        const esGrupo = jid.endsWith('@g.us');

        let textoLimpio = textoCompleto;

        if (esGrupo && this.estaMencionado(message)) {
            textoLimpio = textoLimpio.replace(/@\d+/g, '').trim();
        }

        if (textoLimpio.startsWith(configBot.prefijo)) {
            textoLimpio = textoLimpio.slice(configBot.prefijo.length);
        }

        const partes = textoLimpio.split(' ');
        const comando = partes[0].toLowerCase();
        const argumentos = partes.slice(1);

        console.log(`⚡ Comando detectado: ${comando}`);
        console.log(`📋 Argumentos: ${argumentos}`);
        console.log(`👥 Tipo: ${esGrupo ? 'Grupo' : 'Privado'}`);

        // Intentar reaccionar pero no bloquear si falla
        await this.reaccionarSeguro(message, configBot.reacciones.procesando);

        try {
            const exito = await this.manejadorComandos.ejecutarComando(message, comando, argumentos);

            if (exito) {
                await this.reaccionarSeguro(message, configBot.reacciones.exito);
            } else {
                await this.reaccionarSeguro(message, configBot.reacciones.error);
            }

        } catch (error) {
            console.error(`❌ Error ejecutando comando ${comando}:`, error);

            // Solo enviar mensaje de error en privado para evitar spam en grupos
            if (!esGrupo) {
                await this.mensajeErrorGeneral(message, error);
            }

            await this.reaccionarSeguro(message, configBot.reacciones.error);
        }
    }

    registrarComando(nombre, comando) {
        this.manejadorComandos.registrarComando(nombre, comando);
    }

    async mensajeErrorComandoNoEncontrado(message, comando) {
        const esGrupo = message.key.remoteJid.endsWith('@g.us');
        const respuesta = `${configMensajes.humano.ups} ${configMensajes.errores.comandoNoEncontrado}\n\nComando: ${comando}`;

        // En grupos, solo responder si fue mencionado
        if (!esGrupo || this.estaMencionado(message)) {
            await this.enviarMensajeSeguro(message.key.remoteJid, respuesta);
        }
    }

    async mensajeErrorGeneral(message, error) {
        const esGrupo = message.key.remoteJid.endsWith('@g.us');

        // En grupos, no enviar mensajes de error para evitar spam
        if (!esGrupo) {
            const respuesta = `${configMensajes.errores.general}\nError: ${error.message || error}`;
            await this.enviarMensajeSeguro(message.key.remoteJid, respuesta);
        }
    }

    async reaccionar(mensaje, reaccion) {
        return await this.reaccionarSeguro(mensaje, reaccion);
    }

    async reaccionarSeguro(mensaje, reaccion) {
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
            // Ignorar errores de reacciones, son menos críticos
            console.log('⚠️ No se pudo reaccionar (puede ser normal en algunos chats):', error.message);
        }
    }

    async enviarMensaje(jid, contenido) {
        return await this.enviarMensajeSeguro(jid, contenido);
    }

    async enviarMensajeSeguro(jid, contenido) {
        const sock = this.manejadorConexion.obtenerSocket();
        if (!sock) return;

        try {
            // Primero intentar con parámetros normales
            await sock.sendMessage(jid, { text: contenido });
        } catch (error) {
            console.error('Error al enviar mensaje:', error.message);

            // Segundo intento con parámetros diferentes
            try {
                await sock.sendMessage(jid, { text: contenido }, { 
                    waitForAck: false,
                    additionalAttributes: {}
                });
            } catch (error2) {
                console.error('Error en reintento de envío:', error2.message);

                // Tercer intento - método más directo
                try {
                    // Para errores de sesión, intentar sin cifrado
                    await this.enviarMensajeDirecto(jid, contenido);
                } catch (error3) {
                    console.error('Error en envío directo:', error3.message);
                }
            }
        }
    }

    // Método alternativo para enviar mensajes cuando falla el cifrado
    async enviarMensajeDirecto(jid, contenido) {
        const sock = this.manejadorConexion.obtenerSocket();
        if (!sock) return;

        try {
            // Usar método más básico para evitar problemas de cifrado
            await sock.sendMessage(jid, { 
                text: contenido 
            }, {
                waitForAck: false,
                additionalAttributes: {},
                // Deshabilitar algunas características que pueden causar problemas
                // timestamp: Date.now()
            });
        } catch (error) {
            console.error('Error en envío directo final:', error.message);
            throw error;
        }
    }

    async enviarMensajeConOpciones(jid, contenido, opciones = {}) {
        const sock = this.manejadorConexion.obtenerSocket();
        if (!sock) return;

        try {
            await sock.sendMessage(jid, contenido, {
                waitForAck: false,
                ...opciones
            });
        } catch (error) {
            console.error('Error al enviar mensaje con opciones:', error.message);
        }
    }

    obtenerSocket() {
        return this.manejadorConexion.obtenerSocket();
    }

    obtenerManejadorComandos() {
        return this.manejadorComandos;
    }

    obtenerComandos() {
        return this.manejadorComandos.comandos;
    }
}