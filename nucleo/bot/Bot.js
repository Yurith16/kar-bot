import { ManejadorConexion } from './ManejadorConexion.js';
import { CommandHandler } from './CommandHandler.js';
import { configBot } from '../../config/config.bot.js';
import { configDesarrollador } from '../../config/config.desarrollador.js';

export class Bot {
    constructor() {
        this.manejadorConexion = new ManejadorConexion();
        this.commandHandler = new CommandHandler(this.manejadorConexion);
    }

    async iniciar() {
        console.log(`🚀 Iniciando ${configBot.nombre} v${configBot.version}`);
        console.log(`👨‍💻 Desarrollador: ${configDesarrollador.nombre}`);

        try {
            // Cargar comandos
            await this.commandHandler.cargarComandos();

            // Configurar eventos
            this.configurarEventos();

            // Iniciar conexión
            await this.manejadorConexion.iniciarConexion();

            // Inicializar command handler
            this.commandHandler.inicializar();

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
    }

    mostrarInfoConexion() {
        const comandos = this.commandHandler.obtenerComandosCargados();
        const categorias = this.commandHandler.obtenerCategorias();

        console.log('\n✨ ===== KARBOT CONECTADO ===== ✨');
        console.log(`🤖 Nombre: ${configBot.nombre}`);
        console.log(`🔧 Versión: ${configBot.version}`);
        console.log(`🎯 Prefijo: ${configBot.prefijo}`);
        console.log(`📦 Comandos cargados: ${comandos.length}`);
        console.log(`📊 Categorías: ${categorias.length}`);
        console.log('✅ Listo para recibir mensajes\n');
    }

    obtenerCommandHandler() {
        return this.commandHandler;
    }

    obtenerManejadorConexion() {
        return this.manejadorConexion;
    }
}