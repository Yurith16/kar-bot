import { makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers, fetchLatestBaileysVersion, makeCacheableSignalKeyStore } from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import pino from 'pino';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SESSION_PATH = path.join(__dirname, '..', 'sesiones');
let botStartTime = Date.now();

class ManejadorConexion {
    constructor(messageHandler) {
        this.sock = null;
        this.intentosReconexion = 0;
        this.maxIntentosReconexion = 10;
        this.estaConectado = false;
        this.eventos = {};
        this.metodoConexion = 'qr';
        this.esPrimeraConexion = true;
        this.qrGenerado = false;
        this.messageHandler = messageHandler;
    }

    // Verificar si existe sesión guardada
    existeSesionGuardada() {
        try {
            if (!fs.existsSync(SESSION_PATH)) {
                return false;
            }

            const archivos = fs.readdirSync(SESSION_PATH);
            const archivosNecesarios = ['creds.json'];

            return archivosNecesarios.every(archivo => 
                archivos.includes(archivo) && 
                fs.statSync(path.join(SESSION_PATH, archivo)).size > 0
            );
        } catch (error) {
            console.log(chalk.yellow('⚠️ No se pudo verificar la sesión existente:'), error.message);
            return false;
        }
    }

    async seleccionarMetodoConexion() {
        if (this.existeSesionGuardada()) {
            console.log(chalk.green('📁 Sesión existente detectada. Conectando automáticamente...'));
        } else {
            console.log(chalk.cyan('\n🔐 ===== MÉTODO DE CONEXIÓN ===== 🔐'));
            console.log(chalk.yellow('Método de conexión por defecto: Código QR'));
        }
        this.metodoConexion = 'qr';
        this.esPrimeraConexion = false;
    }

    async iniciarConexion() {
        try {
            console.log(chalk.yellow('🔄 Iniciando conexión con WhatsApp...'));

            botStartTime = Date.now();

            const existeSesion = this.existeSesionGuardada();
            if (existeSesion) {
                console.log(chalk.green('✅ Sesión guardada encontrada'));
            } else {
                console.log(chalk.yellow('⚠️ No se encontró sesión guardada. Se requiere autenticación.'));
            }

            const { version } = await fetchLatestBaileysVersion();
            const { state, saveCreds } = await useMultiFileAuthState(SESSION_PATH);

            if (!state.creds.registered) {
                await this.seleccionarMetodoConexion();
            } else {
                console.log(chalk.green('🔑 Credenciales registradas detectadas. Conectando...'));
                this.metodoConexion = 'qr';
                this.esPrimeraConexion = false;
            }

            this.sock = makeWASocket({
                version,
                logger: pino({ level: 'silent' }),
                printQRInTerminal: false,
                browser: Browsers.ubuntu("Chrome"),
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
                },
                markOnlineOnConnect: false,
                syncFullHistory: false,
                generateHighQualityLinkPreview: true,
                msgRetryCounterCache: new Map(),
                defaultQueryTimeoutMs: 60000,
                connectTimeoutMs: 60000,
                keepAliveIntervalMs: 10000,
                qrTimeout: 30000,
                retryRequestDelayMs: 2000,
                fireInitQueries: true,
                shouldIgnoreJid: (jid) => jid?.endsWith('@broadcast'),
                transactionOpts: {
                    maxCommitRetries: 2,
                    delayBetweenTriesMs: 1000
                },
                maxRetries: 5,
                emitOwnEvents: false,
            });

            this.configurarEventos(saveCreds);

            if (!this.sock.authState.creds.registered) {
                console.log(chalk.yellow('📱 Esperando escaneo de código QR...'));
            }

            return this.sock;

        } catch (error) {
            console.error(chalk.red('❌ Error en la conexión:'), error);
            await this.reconectar();
        }
    }

    configurarEventos(saveCreds) {
        if (!this.sock) return;

        this.sock.ev.on('connection.update', (update) => {
            this.manejarActualizacionConexion(update);
        });

        this.sock.ev.on('creds.update', saveCreds);

        this.sock.ev.on('messages.upsert', (data) => {
            const message = data.messages[0];
            if (!message || message.key.fromMe || !message.message) return;

            if (!this.isNewMessage(message.messageTimestamp)) {
                return;
            }

            setImmediate(() => {
                if (this.messageHandler) {
                    this.messageHandler(this.sock, message).catch(error => {
                        if (!error.message.includes('Bad MAC') && !error.message.includes('Failed to decrypt')) {
                            console.error('❌ Error en messageHandler:', error.message);
                        }
                    });
                }
            });

            this.dispararEvento('mensajesRecibidos', data);
        });

        this.sock.ev.on('connection.update', (update) => {
            if (update.qr && !this.qrGenerado) {
                console.log(chalk.yellow('🔄 Código QR generado. Escanea para conectar.'));
            }
        });
    }

    manejarActualizacionConexion(update) {
        const { connection, lastDisconnect, qr } = update;

        if (qr && !this.estaConectado && !this.qrGenerado) {
            this.qrGenerado = true;
            this.mostrarQR(qr);
        }

        if (connection === 'connecting') {
            console.log(chalk.blue('🔄 Conectando a WhatsApp...'));
            this.qrGenerado = false;
        } else if (connection === 'close') {
            this.estaConectado = false;
            this.qrGenerado = false;
            const desconexion = lastDisconnect?.error;
            const codigoEstado = desconexion?.output?.statusCode;

            console.log(chalk.yellow(`🔌 Conexión cerrada. Código: ${codigoEstado}`));

            if (codigoEstado === DisconnectReason.loggedOut) {
                console.log(chalk.red('❌ Sesión cerrada. Eliminando sesión...'));
                this.limpiarSesion();
                this.cerrarConexion();
                process.exit(1);
            } else if (codigoEstado === DisconnectReason.restartRequired || 
                      codigoEstado === DisconnectReason.timedOut ||
                      codigoEstado === 440) {
                console.log(chalk.yellow('🔄 Reconectando...'));
                this.reconectar();
            } else {
                console.log(chalk.yellow('🔄 Reconexión necesaria...'));
                this.reconectar();
            }

            this.dispararEvento('conexionCerrada', { codigoEstado, desconexion });
        } else if (connection === 'open') {
            this.estaConectado = true;
            this.intentosReconexion = 0;
            this.qrGenerado = false;
            console.log(chalk.green('✅ ¡Conectado a WhatsApp!'));
            console.log(chalk.cyan('🤖 Bot está listo para recibir mensajes'));

            if (this.sock.user) {
                console.log(chalk.magenta(`👤 Conectado como: ${this.sock.user.name || this.sock.user.id}`));
                console.log(chalk.green('💾 Sesión guardada correctamente'));
            }

            this.dispararEvento('conexionEstablecida', this.sock);
        }
    }

    limpiarSesion() {
        try {
            if (fs.existsSync(SESSION_PATH)) {
                fs.rmSync(SESSION_PATH, { recursive: true, force: true });
                console.log(chalk.yellow('🗑️ Sesión eliminada.'));
            }
        } catch (error) {
            console.error(chalk.red('Error al limpiar sesión:'), error);
        }
    }

    mostrarQR(qr) {
        console.clear();
        console.log(chalk.cyan('\n📱 ===== CONEXIÓN POR CÓDIGO QR ===== 📱'));
        console.log(chalk.yellow('📲 Escanea el código QR con WhatsApp:'));
        console.log(chalk.yellow('1. Abre WhatsApp'));
        console.log(chalk.yellow('2. Ve a Ajustes → Dispositivos vinculados'));
        console.log(chalk.yellow('3. Toca "Vincular un dispositivo"'));
        console.log(chalk.yellow('4. Escanea el código QR\n'));

        qrcode.generate(qr, { small: true }, (qrcodeStr) => {
            console.log(qrcodeStr);
        });

        console.log(chalk.cyan(`\n⏰ El código QR expira en aproximadamente 30 segundos...`));
        console.log(chalk.yellow('🔄 Esperando escaneo...\n'));
    }

    async reconectar() {
        if (this.intentosReconexion >= this.maxIntentosReconexion) {
            console.log(chalk.red('❌ Máximo de intentos de reconexión alcanzado'));
            console.log(chalk.yellow('🔄 Reiniciando proceso...'));
            this.cerrarConexion();
            process.exit(1);
        }

        this.intentosReconexion++;
        const delay = Math.min(2000 * this.intentosReconexion, 30000);

        console.log(chalk.yellow(`🔄 Reconectando en ${delay / 1000} segundos... (Intento ${this.intentosReconexion}/${this.maxIntentosReconexion})`));

        setTimeout(async () => {
            try {
                await this.iniciarConexion();
            } catch (error) {
                console.error(chalk.red('❌ Error en reconexión:'), error);
                this.reconectar();
            }
        }, delay);
    }

    async cerrarConexion() {
        console.log(chalk.yellow('🛑 Cerrando conexión...'));
        this.estaConectado = false;
        this.qrGenerado = false;
        if (this.sock) {
            try {
                await this.sock.end();
                console.log(chalk.green('✅ Conexión cerrada correctamente'));
            } catch (error) {
                console.error(chalk.red('Error al cerrar conexión:'), error);
            }
        }
        this.dispararEvento('conexionCerrada', { manual: true });
    }

    on(evento, callback) {
        if (!this.eventos[evento]) {
            this.eventos[evento] = [];
        }
        this.eventos[evento].push(callback);
    }

    dispararEvento(evento, datos) {
        if (this.eventos[evento]) {
            this.eventos[evento].forEach(callback => {
                try {
                    callback(datos);
                } catch (error) {
                    console.error(chalk.red(`Error en evento ${evento}:`), error);
                }
            });
        }
    }

    obtenerSocket() {
        return this.sock;
    }

    obtenerEstadoConexion() {
        return this.estaConectado;
    }

    obtenerMetodoConexion() {
        return this.metodoConexion;
    }

    isNewMessage(messageTimestamp) {
        const messageTime = messageTimestamp * 1000;
        const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
        return messageTime >= fiveMinutesAgo;
    }
}

function getBotStartTime() {
    return botStartTime;
}

export { ManejadorConexion, getBotStartTime };