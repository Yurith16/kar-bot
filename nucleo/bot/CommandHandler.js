import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { configBot } from '../../config/config.bot.js';
import { configMensajes } from '../../config/config.mensajes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class CommandHandler {
    constructor(manejadorConexion) {
        this.manejadorConexion = manejadorConexion;
        this.COMMANDS = new Map();
        this.RESPONSE_HANDLERS = new Map();
        this.ADMIN_COMMANDS = new Set();
        this.OWNER_COMMANDS = new Set();

        // Cache para metadata de grupos
        this.groupCache = new Map();
        this.cacheTimeout = 30000; // 30 segundos

        console.log('🔄 CommandHandler inicializado');
    }

    // ==================== CARGA DE COMANDOS ====================

    async cargarComandos() {
        console.log('🔍 Buscando comandos...');

        const pluginsDir = path.join(process.cwd(), 'plugins');
        if (!fs.existsSync(pluginsDir)) {
            console.log('❌ Directorio de plugins no encontrado');
            return;
        }

        await this.explorarDirectorio(pluginsDir);
        console.log(`✅ Comandos cargados: ${this.COMMANDS.size}`);
    }

    async explorarDirectorio(directorio) {
        try {
            const items = fs.readdirSync(directorio);

            for (const item of items) {
                const rutaCompleta = path.join(directorio, item);
                const stat = fs.statSync(rutaCompleta);

                if (stat.isDirectory()) {
                    await this.explorarDirectorio(rutaCompleta);
                } else if (item.endsWith('.js') && !item.startsWith('_')) {
                    await this.cargarComando(rutaCompleta);
                }
            }
        } catch (error) {
            console.error(`❌ Error explorando directorio ${directorio}:`, error);
        }
    }

    async cargarComando(rutaComando) {
        try {
            const rutaModulo = `file://${rutaComando}`;
            const modulo = await import(rutaModulo);

            // Soporte para múltiples estructuras
            let plugin = modulo.default || modulo.comando;

            if (!plugin) {
                console.log(`⚠️ No se encontró export válido en: ${rutaComando}`);
                return;
            }

            // Normalizar estructura del plugin
            const pluginNormalizado = this.normalizarPlugin(plugin, rutaComando);

            if (pluginNormalizado && pluginNormalizado.nombre && pluginNormalizado.execute) {
                this.registrarComando(pluginNormalizado.nombre, pluginNormalizado);

                // Registrar aliases
                if (pluginNormalizado.aliases && Array.isArray(pluginNormalizado.aliases)) {
                    pluginNormalizado.aliases.forEach(alias => {
                        this.registrarComando(alias, pluginNormalizado);
                    });
                }

                // Clasificar comandos
                if (pluginNormalizado.isAdmin) {
                    this.ADMIN_COMMANDS.add(pluginNormalizado.nombre);
                }
                if (pluginNormalizado.isOwner) {
                    this.OWNER_COMMANDS.add(pluginNormalizado.nombre);
                }

                console.log(`✅ Comando cargado: ${pluginNormalizado.nombre}`);
            } else {
                console.log(`⚠️ Comando inválido en: ${rutaComando}`);
            }

        } catch (error) {
            console.error(`❌ Error cargando comando ${rutaComando}:`, error);
        }
    }

    normalizarPlugin(plugin, rutaComando) {
        const normalizado = { ...plugin };

        // Convertir estructura antigua a nueva
        if (plugin.name && !plugin.nombre) {
            normalizado.nombre = plugin.name;
        }
        if (plugin.description && !plugin.descripcion) {
            normalizado.descripcion = plugin.description;
        }
        if (plugin.category && !plugin.categoria) {
            normalizado.categoria = plugin.category;
        }

        // Valores por defecto
        if (!normalizado.categoria) normalizado.categoria = 'general';
        if (!normalizado.aliases) normalizado.aliases = [];

        return normalizado;
    }

    registrarComando(nombre, comando) {
        const nombreLower = nombre.toLowerCase();
        this.COMMANDS.set(nombreLower, comando);
    }

    // ==================== PROCESAMIENTO DE MENSAJES ====================

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

    estaMencionado(message) {
        try {
            if (message.message.extendedTextMessage?.contextInfo?.mentionedJid) {
                const mencionados = message.message.extendedTextMessage.contextInfo.mentionedJid;
                const botJid = this.manejadorConexion.obtenerSocket()?.user?.id;
                return mencionados.includes(botJid);
            }
            return false;
        } catch (error) {
            return false;
        }
    }

    // ==================== EJECUCIÓN DE COMANDOS ====================

    async procesarComando(message, textoCompleto) {
        const jid = message.key.remoteJid;
        const esGrupo = jid.endsWith('@g.us');
        const sender = message.key.participant || jid;

        let textoLimpio = textoCompleto;

        // Si es grupo y está mencionado, remover la mención
        if (esGrupo && this.estaMencionado(message)) {
            textoLimpio = textoLimpio.replace(/@\d+/g, '').trim();
        }

        // Remover prefijo
        if (textoLimpio.startsWith(configBot.prefijo)) {
            textoLimpio = textoLimpio.slice(configBot.prefijo.length);
        }

        const partes = textoLimpio.split(/\s+/);
        const comando = partes[0].toLowerCase();
        const argumentos = partes.slice(1);

        console.log(`⚡ Comando detectado: ${comando}`);
        console.log(`📋 Argumentos: ${argumentos}`);
        console.log(`👥 Tipo: ${esGrupo ? 'Grupo' : 'Privado'}`);

        // Intentar reaccionar (no crítico si falla)
        await this.reaccionarSeguro(message, configBot.reacciones.procesando);

        try {
            const exito = await this.ejecutarComando(message, comando, argumentos);

            if (exito) {
                await this.reaccionarSeguro(message, configBot.reacciones.exito);
            } else {
                await this.reaccionarSeguro(message, configBot.reacciones.error);
            }

        } catch (error) {
            console.error(`❌ Error ejecutando comando ${comando}:`, error);

            // Solo enviar error en privado para evitar spam en grupos
            if (!esGrupo) {
                await this.enviarMensajeSeguro(jid, `${configMensajes.errores.general}\nError: ${error.message}`);
            }

            await this.reaccionarSeguro(message, configBot.reacciones.error);
        }
    }

    async ejecutarComando(message, comando, argumentos) {
        const comandoHandler = this.COMMANDS.get(comando.toLowerCase());

        if (!comandoHandler) {
            await this.mensajeErrorComandoNoEncontrado(message, comando);
            return false;
        }

        const jid = message.key.remoteJid;
        const esGrupo = jid.endsWith('@g.us');
        const sender = message.key.participant || jid;

        // Verificar permisos de administrador
        if (this.ADMIN_COMMANDS.has(comandoHandler.nombre) && esGrupo) {
            const esAdmin = await this.esAdministrador(jid, sender);
            if (!esAdmin && !this.esOwner(sender)) {
                if (this.estaMencionado(message)) {
                    await this.enviarMensajeSeguro(jid, "❌ Solo administradores pueden usar este comando.");
                }
                return false;
            }
        }

        // Verificar permisos de owner
        if (this.OWNER_COMMANDS.has(comandoHandler.nombre) && !this.esOwner(sender)) {
            await this.enviarMensajeSeguro(jid, "❌ Este comando es exclusivo para el propietario del bot.");
            return false;
        }

        // Ejecutar comando
        try {
            await comandoHandler.execute(message, argumentos, this);
            return true;
        } catch (error) {
            console.error(`💥 Error en comando ${comando}:`, error);
            throw error;
        }
    }

    async esAdministrador(jid, usuario) {
        try {
            const ahora = Date.now();
            const cacheKey = `${jid}-admins`;
            const cached = this.groupCache.get(cacheKey);

            if (cached && (ahora - cached.timestamp) < this.cacheTimeout) {
                return cached.admins.includes(usuario);
            }

            const sock = this.manejadorConexion.obtenerSocket();
            const metadata = await sock.groupMetadata(jid);
            const admins = metadata.participants
                .filter(p => p.admin)
                .map(p => p.id);

            // Guardar en cache
            this.groupCache.set(cacheKey, {
                admins,
                timestamp: ahora
            });

            return admins.includes(usuario);
        } catch (error) {
            console.error('Error verificando administrador:', error);
            return false;
        }
    }

    esOwner(usuario) {
        // Implementar lógica de owner según tu configuración
        // Por ahora retorna true para testing
        return true;
    }

    // ==================== MÉTODOS DE UTILIDAD ====================

    async mensajeErrorComandoNoEncontrado(message, comando) {
        const esGrupo = message.key.remoteJid.endsWith('@g.us');
        const respuesta = `${configMensajes.humano.ups} ${configMensajes.errores.comandoNoEncontrado}\n\nComando: ${comando}`;

        // En grupos, solo responder si fue mencionado
        if (!esGrupo || this.estaMencionado(message)) {
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
            // Ignorar errores de reacciones
            console.log('⚠️ No se pudo reaccionar:', error.message);
        }
    }

    async enviarMensaje(jid, contenido) {
        return await this.enviarMensajeSeguro(jid, contenido);
    }

    async enviarMensajeSeguro(jid, contenido) {
        const sock = this.manejadorConexion.obtenerSocket();
        if (!sock) return;

        try {
            await sock.sendMessage(jid, { text: contenido });
        } catch (error) {
            console.error('Error al enviar mensaje:', error.message);

            // Reintento con parámetros diferentes
            try {
                await sock.sendMessage(jid, { text: contenido }, { 
                    waitForAck: false,
                    additionalAttributes: {}
                });
            } catch (error2) {
                console.error('Error en reintento de envío:', error2.message);
            }
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

    // ==================== INFORMACIÓN DEL SISTEMA ====================

    obtenerComandosCargados() {
        return Array.from(this.COMMANDS.keys());
    }

    obtenerTotalComandos() {
        return this.COMMANDS.size;
    }

    obtenerCategorias() {
        const categorias = new Set();
        for (const comando of this.COMMANDS.values()) {
            categorias.add(comando.categoria);
        }
        return Array.from(categorias);
    }
}