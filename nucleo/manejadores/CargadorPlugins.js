import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class CargadorPlugins {
    constructor(procesadorMensajes) {
        this.procesadorMensajes = procesadorMensajes;
        this.pluginsCargados = new Map();
    }

    async cargarPlugins() {
        const pluginsDir = path.join(process.cwd(), 'plugins');

        try {
            console.log('🔍 Buscando plugins...');
            await this.explorarDirectorio(pluginsDir);
            console.log(`✅ Plugins cargados: ${this.pluginsCargados.size}`);
        } catch (error) {
            console.error('❌ Error cargando plugins:', error);
        }
    }

    async explorarDirectorio(directorio) {
        if (!fs.existsSync(directorio)) {
            console.log(`📁 Directorio de plugins no encontrado: ${directorio}`);
            return;
        }

        const items = fs.readdirSync(directorio);

        for (const item of items) {
            const rutaCompleta = path.join(directorio, item);
            const stat = fs.statSync(rutaCompleta);

            if (stat.isDirectory()) {
                await this.explorarDirectorio(rutaCompleta);
            } else if (item.endsWith('.js') && !item.startsWith('_')) {
                await this.cargarPlugin(rutaCompleta);
            }
        }
    }

    async cargarPlugin(rutaPlugin) {
        try {
            // Convertir ruta a módulo ES6
            const rutaModulo = `file://${rutaPlugin}`;

            // Importar el plugin
            const modulo = await import(rutaModulo);

            if (modulo.default && typeof modulo.default === 'object') {
                const plugin = modulo.default;

                if (plugin.name && plugin.execute) {
                    this.procesadorMensajes.registrarComando(plugin.name, plugin);
                    this.pluginsCargados.set(plugin.name, {
                        ruta: rutaPlugin,
                        plugin: plugin
                    });

                    console.log(`✅ Plugin cargado: ${plugin.name}`);
                } else {
                    console.log(`⚠️ Plugin inválido en: ${rutaPlugin}`);
                }
            } else {
                console.log(`⚠️ No se encontró export default en: ${rutaPlugin}`);
            }
        } catch (error) {
            console.error(`❌ Error cargando plugin ${rutaPlugin}:`, error);
        }
    }

    obtenerPluginsCargados() {
        return Array.from(this.pluginsCargados.keys());
    }
}