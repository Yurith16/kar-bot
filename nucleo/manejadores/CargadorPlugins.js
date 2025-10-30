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
            const rutaModulo = `file://${rutaPlugin}`;
            const modulo = await import(rutaModulo);

            console.log(`🔍 Procesando: ${rutaPlugin}`);

            // Soporte para múltiples estructuras
            let plugin = modulo.default || modulo.comando;

            if (!plugin) {
                console.log(`⚠️ No se encontró export válido en: ${rutaPlugin}`);
                return;
            }

            // Normalizar la estructura del plugin
            const pluginNormalizado = this.normalizarPlugin(plugin, rutaPlugin);

            if (pluginNormalizado && pluginNormalizado.nombre && pluginNormalizado.execute) {
                this.procesadorMensajes.registrarComando(pluginNormalizado.nombre, pluginNormalizado);
                this.pluginsCargados.set(pluginNormalizado.nombre, {
                    ruta: rutaPlugin,
                    plugin: pluginNormalizado
                });

                console.log(`✅ Plugin cargado: ${pluginNormalizado.nombre}`);

                // Registrar aliases si existen
                if (pluginNormalizado.aliases && Array.isArray(pluginNormalizado.aliases)) {
                    pluginNormalizado.aliases.forEach(alias => {
                        this.procesadorMensajes.registrarComando(alias, pluginNormalizado);
                        console.log(`✅ Alias registrado: ${alias} -> ${pluginNormalizado.nombre}`);
                    });
                }
            } else {
                console.log(`⚠️ Plugin inválido en: ${rutaPlugin}`);
                console.log(`   - ¿Tiene nombre?: ${!!pluginNormalizado?.nombre}`);
                console.log(`   - ¿Tiene execute?: ${!!pluginNormalizado?.execute}`);
            }

        } catch (error) {
            console.error(`❌ Error cargando plugin ${rutaPlugin}:`, error);
        }
    }

    normalizarPlugin(plugin, rutaPlugin) {
        // Si ya tiene la estructura correcta, retornarlo tal cual
        if (plugin.nombre && plugin.execute) {
            return plugin;
        }

        // Convertir estructura antigua a nueva
        const pluginNormalizado = { ...plugin };

        // Convertir 'name' a 'nombre'
        if (plugin.name && !plugin.nombre) {
            pluginNormalizado.nombre = plugin.name;
            console.log(`   ↪ Convertido 'name' a 'nombre': ${plugin.name}`);
        }

        // Convertir 'description' a 'descripcion'
        if (plugin.description && !plugin.descripcion) {
            pluginNormalizado.descripcion = plugin.description;
        }

        // Convertir 'category' a 'categoria'
        if (plugin.category && !plugin.categoria) {
            pluginNormalizado.categoria = plugin.category;
        }

        // Asegurar que tenga categoría por defecto
        if (!pluginNormalizado.categoria) {
            pluginNormalizado.categoria = 'general';
        }

        return pluginNormalizado;
    }

    obtenerPluginsCargados() {
        return Array.from(this.pluginsCargados.keys());
    }
}