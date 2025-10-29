import { ManejadorConexion } from './ManejadorConexion.js';
import { ProcesadorMensajes } from './ProcesadorMensajes.js';
import { CargadorPlugins } from '../manejadores/CargadorPlugins.js';
import { configBot } from '../../config/config.bot.js';
import { configDesarrollador } from '../../config/config.desarrollador.js';

export class Bot {
    constructor() {
        this.manejadorConexion = new ManejadorConexion();
        this.procesadorMensajes = new ProcesadorMensajes(this.manejadorConexion);
        this.cargadorPlugins = new CargadorPlugins(this.procesadorMensajes);
    }

    async iniciar() {
        console.log(`🚀 Iniciando ${configBot.nombre} v${configBot.version}`);
        console.log(`👨‍💻 Desarrollador: ${configDesarrollador.nombre}`);

        try {
            // Cargar plugins automáticamente
            await this.cargadorPlugins.cargarPlugins();

            // Configurar eventos
            this.configurarEventos();

            // Iniciar conexión
            await this.manejadorConexion.iniciarConexion();

            // Inicializar procesador de mensajes
            this.procesadorMensajes.inicializar();

        } catch (error) {
            console.error('❌ Error fatal al iniciar el bot:', error);
            process.exit(1);
        }
    }

    configurarEventos() {
        this.manejadorConexion.on('conexionEstablecida', (sock) => {
            this.mostrarInfoConexion();
        });

        this.manejadorConexion.on('conexionCerrada', (datos) => {
            console.log('🔌 Conexión cerrada:', datos);
        });

        this.manejadorConexion.on('qrGenerado', (qr) => {
            console.log('📱 QR generado, escanea con WhatsApp');
        });
    }

    mostrarInfoConexion() {
        const plugins = this.cargadorPlugins.obtenerPluginsCargados();

        console.log('\n✨ ===== KARBOT CONECTADO ===== ✨');
        console.log(`🤖 Nombre: ${configBot.nombre}`);
        console.log(`🔧 Versión: ${configBot.version}`);
        console.log(`🎯 Prefijo: ${configBot.prefijo}`);
        console.log(`📦 Plugins cargados: ${plugins.length}`);
        console.log(`🔧 Comandos: ${this.procesadorMensajes.comandos.size}`);
        console.log('📋 Plugins:', plugins.join(', '));
        console.log('✅ Listo para recibir mensajes\n');
    }

    obtenerProcesadorMensajes() {
        return this.procesadorMensajes;
    }

    obtenerManejadorConexion() {
        return this.manejadorConexion;
    }

    obtenerCargadorPlugins() {
        return this.cargadorPlugins;
    }
}