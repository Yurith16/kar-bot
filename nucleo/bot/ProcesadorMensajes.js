import { configDesarrollador } from '../../config/index.js';

class ProcesadorMensajes {
    constructor() {
        this.prefijo = '/';
        this.numeroOwner = configDesarrollador.numero;
    }

    // Extracción de texto unificada (igual a tu sistema que funciona)
    obtenerTextoMensaje(message) {
        try {
            const msg = message.message;
            if (!msg) return "";

            let text = msg.conversation || 
                       msg.extendedTextMessage?.text || 
                       msg.imageMessage?.caption || 
                       msg.videoMessage?.caption || 
                       msg.documentMessage?.caption || "";

            // Compatibilidad con mensajes temporales
            if (!text && msg.ephemeralMessage) {
                text = msg.ephemeralMessage.message?.conversation || 
                       msg.ephemeralMessage.message?.extendedTextMessage?.text || "";
            }

            // Fallback para mensajes ViewOnce
            if (!text && msg.viewOnceMessage) {
                text = msg.viewOnceMessage.message?.conversation || 
                       msg.viewOnceMessage.message?.extendedTextMessage?.text || "";
            }

            return text.trim();
        } catch (error) {
            return "";
        }
    }

    async procesar(mensaje, sock) {
        try {
            // Ignorar mensajes que no son de texto o que son del propio bot
            if (!mensaje.message || mensaje.key.fromMe) {
                return null;
            }

            const chat = mensaje.key.remoteJid;
            const usuario = mensaje.key.participant || mensaje.key.remoteJid;
            const esGrupo = chat.endsWith('@g.us');

            // Obtener el texto del mensaje
            const texto = this.obtenerTextoMensaje(mensaje);
            if (!texto) return null;

            // Verificar si es un comando
            const esComando = texto.startsWith(this.prefijo);
            if (!esComando) return null;

            // Procesar el comando
            const comandoProcesado = this.procesarComando(texto, usuario, chat, esGrupo);

            if (comandoProcesado) {
                // Agregar información adicional
                comandoProcesado.mensajeOriginal = mensaje;
                comandoProcesado.sock = sock;
                comandoProcesado.esGrupo = esGrupo;
                comandoProcesado.timestamp = new Date();

                // Verificar si es el owner
                comandoProcesado.esOwner = this.esOwner(usuario);

                return comandoProcesado;
            }

            return null;

        } catch (error) {
            console.error('❌ Error procesando mensaje:', error);
            return null;
        }
    }

    procesarComando(texto, usuario, chat, esGrupo) {
        // Remover el prefijo y dividir en partes
        const textoLimpio = texto.slice(this.prefijo.length).trim();
        const partes = textoLimpio.split(/\s+/);
        const comando = partes[0].toLowerCase();
        const args = partes.slice(1);

        return {
            comando,
            args,
            textoCompleto: textoLimpio,
            textoOriginal: texto,
            usuario,
            chat,
            esGrupo,
            esComando: true,
            prefijo: this.prefijo
        };
    }

    esOwner(usuario) {
        if (!usuario) return false;

        // Normalizar el número (remover @s.whatsapp.net y otros sufijos)
        const numeroUsuario = usuario.replace(/@.*$/, '');
        const numeroOwner = this.numeroOwner.replace(/[^0-9]/g, '');

        return numeroUsuario === numeroOwner;
    }

    // Método para reaccionar a mensajes (para compatibilidad con plugins)
    async reaccionar(sock, chat, messageKey, emoji) {
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

    // Método para enviar mensajes (para compatibilidad con plugins)
    async enviarMensaje(sock, chat, contenido, opciones = {}) {
        try {
            return await sock.sendMessage(chat, contenido, opciones);
        } catch (error) {
            console.error('❌ Error enviando mensaje:', error);
            throw error;
        }
    }
}

export { ProcesadorMensajes };