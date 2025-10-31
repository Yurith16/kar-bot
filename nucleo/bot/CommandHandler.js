import { configBot, configMensajes, configDesarrollador } from '../../config/index.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class CommandHandler {
    constructor(bot) {
        this.bot = bot;
        this.comandos = new Map();
        this.aliases = new Map();
        this.categorias = new Set();
        this.pluginsDir = path.join(__dirname, '..', '..', 'plugins');
    }

    async cargarComandos() {
        console.log(chalk.cyan('🔍 Buscando comandos en plugins...'));

        try {
            await this.cargarComandosDesdeCarpeta(this.pluginsDir);
            console.log(chalk.green(`✅ Comandos cargados: ${this.comandos.size} comandos, ${this.aliases.size} aliases`));
            console.log(chalk.blue(`📂 Categorías: ${Array.from(this.categorias).join(', ')}`));
        } catch (error) {
            console.error(chalk.red('❌ Error cargando comandos:'), error);
        }
    }

    async cargarComandosDesdeCarpeta(carpeta) {
        try {
            if (!fs.existsSync(carpeta)) {
                console.log(chalk.yellow(`⚠️ Carpeta no existe: ${carpeta}`));
                return;
            }

            const items = fs.readdirSync(carpeta, { withFileTypes: true });

            for (const item of items) {
                const rutaCompleta = path.join(carpeta, item.name);

                if (item.isDirectory()) {
                    // Es una subcarpeta (herramientas, descargas, juegos, etc.)
                    await this.cargarComandosDesdeCarpeta(rutaCompleta);
                } else if (item.isFile() && item.name.endsWith('.js')) {
                    // Es un archivo JavaScript, cargarlo como comando
                    await this.cargarComandoDesdeArchivo(rutaCompleta, path.basename(carpeta));
                }
            }
        } catch (error) {
            console.error(chalk.red(`❌ Error cargando carpeta ${carpeta}:`), error);
        }
    }

    async cargarComandoDesdeArchivo(rutaArchivo, categoria) {
        try {
            // Importar el módulo del comando
            const moduloComando = await import(`file://${rutaArchivo}`);
            const comandoConfig = moduloComando.default || moduloComando;

            // Validar estructura del comando
            if (!comandoConfig.name || !comandoConfig.execute) {
                console.log(chalk.yellow(`⚠️ Estructura inválida en: ${rutaArchivo}`));
                return;
            }

            const nombreComando = comandoConfig.name.toLowerCase();

            // Configurar comando completo
            const comandoCompleto = {
                nombre: nombreComando,
                descripcion: comandoConfig.description || 'Sin descripción',
                categoria: comandoConfig.category || categoria,
                aliases: comandoConfig.aliases || [],
                uso: comandoConfig.usage || `${configBot.prefijo}${nombreComando}`,
                soloOwner: comandoConfig.ownerOnly || false,
                execute: comandoConfig.execute,
                ruta: rutaArchivo
            };

            // Registrar comando principal
            this.comandos.set(nombreComando, comandoCompleto);
            this.categorias.add(comandoCompleto.categoria);

            console.log(chalk.green(`✅ Comando cargado: ${configBot.prefijo}${nombreComando} (${comandoCompleto.categoria})`));

            // Registrar aliases
            if (comandoCompleto.aliases && comandoCompleto.aliases.length > 0) {
                comandoCompleto.aliases.forEach(alias => {
                    const aliasLower = alias.toLowerCase();
                    this.aliases.set(aliasLower, nombreComando);
                    console.log(chalk.blue(`   ↳ Alias: ${configBot.prefijo}${alias}`));
                });
            }

        } catch (error) {
            console.error(chalk.red(`❌ Error cargando comando ${rutaArchivo}:`), error);
        }
    }

    obtenerComando(nombre) {
        const nombreLower = nombre.toLowerCase();

        // Buscar comando directo
        if (this.comandos.has(nombreLower)) {
            return this.comandos.get(nombreLower);
        }

        // Buscar por alias
        if (this.aliases.has(nombreLower)) {
            const comandoReal = this.aliases.get(nombreLower);
            return this.comandos.get(comandoReal);
        }

        return null;
    }

    async ejecutarComando(mensajeProcesado, sock) {
        const { comando, args, chat, usuario, esOwner } = mensajeProcesado;

        try {
            const comandoObj = this.obtenerComando(comando);

            if (!comandoObj) {
                await this.enviarMensajeSeguro(sock, chat, { 
                    text: configMensajes.errores.comandoNoEncontrado 
                }, mensajeProcesado);
                return;
            }

            // Verificar permisos de owner
            if (comandoObj.soloOwner && !esOwner) {
                await this.enviarMensajeSeguro(sock, chat, { 
                    text: configMensajes.errores.soloOwner 
                }, mensajeProcesado);
                return;
            }

            console.log(chalk.blue(`🔧 Ejecutando: ${configBot.prefijo}${comando} por ${usuario} en ${chat}`));

            // Preparar objeto de mensaje para el comando
            const mensajeComando = {
                key: mensajeProcesado.mensajeOriginal?.key,
                remoteJid: chat,
                from: usuario,
                args: args,
                text: mensajeProcesado.textoCompleto,
                isGroup: mensajeProcesado.esGrupo,
                isOwner: esOwner
            };

            // Ejecutar el comando
            await comandoObj.execute(mensajeComando, args, this.bot);

        } catch (error) {
            console.error(chalk.red(`❌ Error ejecutando comando ${comando}:`), error);
            await this.manejarErrorComando(sock, chat, error, comando, mensajeProcesado);
        }
    }

    async enviarMensajeSeguro(sock, chat, mensaje, mensajeOriginal = null) {
        try {
            if (mensajeOriginal && mensajeOriginal.mensajeOriginal) {
                await sock.sendMessage(chat, mensaje, {
                    quoted: mensajeOriginal.mensajeOriginal
                });
            } else {
                await sock.sendMessage(chat, mensaje);
            }
        } catch (error) {
            console.error(chalk.red('❌ Error enviando mensaje:'), error);
            // Intentar sin quote si falla
            try {
                await sock.sendMessage(chat, mensaje);
            } catch (fallbackError) {
                console.error(chalk.red('❌ Error enviando mensaje sin quote:'), fallbackError);
            }
        }
    }

    async manejarErrorComando(sock, chat, error, nombreComando, mensajeOriginal = null) {
        let mensajeError = configMensajes.errores.general;

        if (error.message?.includes('No sessions') || error.message?.includes('SessionError')) {
            mensajeError = '🔐 Error de sesión. Intenta nuevamente.';
        } else if (error.message?.includes('not-acceptable')) {
            mensajeError = '🚫 No se pudo enviar el mensaje. Intenta más tarde.';
        } else if (error.message?.includes('rate limit')) {
            mensajeError = '⏰ Demasiadas solicitudes. Espera un momento.';
        }

        try {
            await this.enviarMensajeSeguro(sock, chat, { 
                text: `${configMensajes.humano.ups}\n${mensajeError}` 
            }, mensajeOriginal);
        } catch (sendError) {
            console.error(chalk.red('❌ Error enviando mensaje de error:'), sendError);
        }
    }

    async mostrarMenuAyuda(mensaje, sock) {
        try {
            const categorias = {};

            // Agrupar comandos por categoría
            for (const [nombre, comando] of this.comandos) {
                if (!categorias[comando.categoria]) {
                    categorias[comando.categoria] = [];
                }
                categorias[comando.categoria].push(comando);
            }

            let respuesta = `📚 *${configMensajes.respuestas.ayuda}*\n\n`;

            for (const [categoria, comandos] of Object.entries(categorias)) {
                respuesta += `*${categoria.toUpperCase()}*\n`;
                comandos.forEach(comando => {
                    respuesta += `• ${configBot.prefijo}${comando.nombre} - ${comando.descripcion}\n`;
                });
                respuesta += '\n';
            }

            respuesta += `💡 Usa ${configBot.prefijo}ayuda [comando] para más detalles`;
            respuesta += `\n\n🔧 Total: ${this.comandos.size} comandos disponibles`;

            await this.enviarMensajeSeguro(sock, mensaje.chat, { text: respuesta }, mensaje);

        } catch (error) {
            console.error(chalk.red('❌ Error mostrando ayuda:'), error);
            await this.manejarErrorComando(sock, mensaje.chat, error, 'ayuda', mensaje);
        }
    }

    async mostrarAyudaComando(mensaje, sock, nombreComando) {
        try {
            const comando = this.obtenerComando(nombreComando);

            if (!comando) {
                await this.enviarMensajeSeguro(sock, mensaje.chat, { 
                    text: `${configMensajes.errores.comandoNoEncontrado}\nUsa ${configBot.prefijo}ayuda para ver la lista.` 
                }, mensaje);
                return;
            }

            const ayuda = `
🆘 *AYUDA PARA ${configBot.prefijo.toUpperCase()}${comando.nombre.toUpperCase()}*

*Descripción:* ${comando.descripcion}
*Categoría:* ${comando.categoria}
*Uso:* ${comando.uso}
${comando.aliases.length > 0 ? `*Aliases:* ${comando.aliases.map(a => configBot.prefijo + a).join(', ')}` : ''}
${comando.soloOwner ? '*⚠️ Solo disponible para el desarrollador*' : ''}
            `.trim();

            await this.enviarMensajeSeguro(sock, mensaje.chat, { text: ayuda }, mensaje);

        } catch (error) {
            console.error(chalk.red('❌ Error mostrando ayuda de comando:'), error);
            await this.manejarErrorComando(sock, mensaje.chat, error, 'ayuda', mensaje);
        }
    }

    obtenerComandos() {
        return this.comandos;
    }

    obtenerCategorias() {
        return Array.from(this.categorias);
    }

    obtenerComandosPorCategoria(categoria) {
        return Array.from(this.comandos.values()).filter(cmd => cmd.categoria === categoria);
    }

    formatearTiempo(segundos) {
        const horas = Math.floor(segundos / 3600);
        const minutos = Math.floor((segundos % 3600) / 60);
        const segs = Math.floor(segundos % 60);

        return `${horas}h ${minutos}m ${segs}s`;
    }
}

export { CommandHandler };