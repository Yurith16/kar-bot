import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class CargadorPlugins {
    constructor(bot) {
        this.bot = bot;
        this.plugins = new Map();
        this.pluginsDir = path.join(__dirname, '..', 'plugins');
        this.categorias = ['descargas', 'juegos', 'herramientas', 'utilidades'];
    }

    async cargarPlugins() {
        console.log(chalk.cyan('📦 Iniciando carga de plugins...'));

        for (const categoria of this.categorias) {
            await this.cargarPluginsCategoria(categoria);
        }

        console.log(chalk.green(`✅ Plugins cargados: ${this.plugins.size} total`));
    }

    async cargarPluginsCategoria(categoria) {
        const categoriaPath = path.join(this.pluginsDir, categoria);

        try {
            if (!fs.existsSync(categoriaPath)) {
                console.log(chalk.yellow(`⚠️ No existe la categoría: ${categoria}`));
                return;
            }

            const archivos = fs.readdirSync(categoriaPath);
            const pluginsCategoria = archivos.filter(archivo => 
                archivo.endsWith('.js') && !archivo.startsWith('_')
            );

            console.log(chalk.blue(`🔍 Buscando plugins en ${categoria}: ${pluginsCategoria.length} encontrados`));

            for (const archivo of pluginsCategoria) {
                await this.cargarPlugin(path.join(categoriaPath, archivo), categoria);
            }

        } catch (error) {
            console.error(chalk.red(`❌ Error cargando categoría ${categoria}:`), error);
        }
    }

    async cargarPlugin(rutaPlugin, categoria) {
        try {
            // Importar el plugin
            const moduloPlugin = await import(`file://${rutaPlugin}`);
            const PluginClass = moduloPlugin.default || moduloPlugin;

            // Crear instancia del plugin
            const plugin = new PluginClass(this.bot);

            // Validar que el plugin tenga la estructura correcta
            if (!plugin.nombre || !plugin.comandos) {
                console.log(chalk.yellow(`⚠️ Plugin inválido en ${rutaPlugin}, estructura incorrecta`));
                return;
            }

            // Registrar el plugin
            this.plugins.set(plugin.nombre, {
                instancia: plugin,
                categoria: categoria,
                ruta: rutaPlugin,
                comandos: plugin.comandos || []
            });

            // Cargar comandos del plugin
            await this.cargarComandosPlugin(plugin);

            console.log(chalk.green(`✅ Plugin cargado: ${plugin.nombre} (${categoria})`));

        } catch (error) {
            console.error(chalk.red(`❌ Error cargando plugin ${rutaPlugin}:`), error);
        }
    }

    async cargarComandosPlugin(plugin) {
        if (!plugin.comandos || typeof plugin.comandos !== 'object') {
            return;
        }

        for (const [nombreComando, configComando] of Object.entries(plugin.comandos)) {
            try {
                // Agregar información del plugin al comando
                const comandoCompleto = {
                    ...configComando,
                    plugin: plugin.nombre,
                    categoria: plugin.categoria || 'general'
                };

                // Registrar el comando en el bot
                this.bot.agregarComando(nombreComando, comandoCompleto);

            } catch (error) {
                console.error(chalk.red(`❌ Error cargando comando ${nombreComando} del plugin ${plugin.nombre}:`), error);
            }
        }
    }

    async descargarPlugin(nombre) {
        const plugin = this.plugins.get(nombre);
        if (!plugin) {
            console.log(chalk.yellow(`⚠️ Plugin no encontrado: ${nombre}`));
            return false;
        }

        try {
            // Eliminar comandos del plugin
            for (const comando of plugin.comandos) {
                this.bot.eliminarComando(comando);
            }

            // Eliminar el plugin
            this.plugins.delete(nombre);

            console.log(chalk.green(`✅ Plugin descargado: ${nombre}`));
            return true;

        } catch (error) {
            console.error(chalk.red(`❌ Error descargando plugin ${nombre}:`), error);
            return false;
        }
    }

    async recargarPlugin(nombre) {
        const plugin = this.plugins.get(nombre);
        if (!plugin) {
            console.log(chalk.yellow(`⚠️ Plugin no encontrado para recargar: ${nombre}`));
            return false;
        }

        try {
            // Descargar primero
            await this.descargarPlugin(nombre);

            // Volver a cargar
            await this.cargarPlugin(plugin.ruta, plugin.categoria);

            console.log(chalk.green(`✅ Plugin recargado: ${nombre}`));
            return true;

        } catch (error) {
            console.error(chalk.red(`❌ Error recargando plugin ${nombre}:`), error);
            return false;
        }
    }

    obtenerPlugins() {
        return Array.from(this.plugins.values()).map(pluginInfo => ({
            nombre: pluginInfo.instancia.nombre,
            categoria: pluginInfo.categoria,
            descripcion: pluginInfo.instancia.descripcion || 'Sin descripción',
            version: pluginInfo.instancia.version || '1.0.0',
            comandos: pluginInfo.comandos.length
        }));
    }

    obtenerPlugin(nombre) {
        return this.plugins.get(nombre);
    }

    // Método para cargar un plugin específico por ruta
    async cargarPluginEspecifico(rutaCompleta) {
        try {
            const categoria = path.basename(path.dirname(rutaCompleta));
            await this.cargarPlugin(rutaCompleta, categoria);
            return true;
        } catch (error) {
            console.error(chalk.red(`❌ Error cargando plugin específico ${rutaCompleta}:`), error);
            return false;
        }
    }

    // Método para listar plugins por categoría
    listarPluginsPorCategoria() {
        const resultado = {};

        for (const categoria of this.categorias) {
            resultado[categoria] = Array.from(this.plugins.values())
                .filter(plugin => plugin.categoria === categoria)
                .map(plugin => plugin.instancia.nombre);
        }

        return resultado;
    }

    // Método para verificar estado de plugins
    obtenerEstadoPlugins() {
        const estado = {
            total: this.plugins.size,
            porCategoria: {},
            errores: []
        };

        for (const [nombre, plugin] of this.plugins) {
            if (!estado.porCategoria[plugin.categoria]) {
                estado.porCategoria[plugin.categoria] = 0;
            }
            estado.porCategoria[plugin.categoria]++;
        }

        return estado;
    }
}

export { CargadorPlugins };