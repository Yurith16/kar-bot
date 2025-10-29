import makeWASocket, { 
    useMultiFileAuthState, 
    DisconnectReason, 
    Browsers,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore
} from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import pino from 'pino';
import chalk from 'chalk';
import readline from 'readline';

export class ManejadorConexion {
    constructor() {
        this.sock = null;
        this.intentosReconexion = 0;
        this.maxIntentosReconexion = 10;
        this.estaConectado = false;
        this.eventos = {};

        // Configurar pairing code
        this.pairingCode = process.argv.includes("--pairing-code");
        this.useMobile = process.argv.includes("--mobile");
        this.phoneNumber = null;

        this.rl = readline.createInterface({ 
            input: process.stdin, 
            output: process.stdout 
        });

        this.configurarManejadores();
    }

    question(text) {
        return new Promise((resolve) => this.rl.question(text, resolve));
    }

    configurarManejadores() {
        process.on('SIGINT', this.cerrarConexion.bind(this));
        process.on('SIGTERM', this.cerrarConexion.bind(this));
    }

    async iniciarConexion() {
        try {
            console.log(chalk.yellow('🔄 Iniciando conexión con WhatsApp...'));

            const { version } = await fetchLatestBaileysVersion();
            const { state, saveCreds } = await useMultiFileAuthState('sesiones');

            this.sock = makeWASocket({
                version,
                logger: pino({ level: 'silent' }),
                printQRInTerminal: !this.pairingCode,
                browser: Browsers.ubuntu("Chrome"),
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
                },
                markOnlineOnConnect: true,
                syncFullHistory: false,
                generateHighQualityLinkPreview: true,
                msgRetryCounterCache: new Map(),
                defaultQueryTimeoutMs: 60000,
                connectTimeoutMs: 60000,
                keepAliveIntervalMs: 10000
            });

            this.configurarEventos(saveCreds);

            // Manejar pairing code si está activado
            if (this.pairingCode && !this.sock.authState.creds.registered) {
                await this.manejarPairingCode();
            }

        } catch (error) {
            console.error(chalk.red('❌ Error en la conexión:'), error);
            this.reconectar();
        }
    }

    async manejarPairingCode() {
        try {
            if (this.useMobile) {
                throw new Error('No se puede usar pairing code con mobile api');
            }

            // Solicitar número de teléfono
            this.phoneNumber = await this.question(
                chalk.bgBlack(chalk.greenBright(`\n📱 Ingresa tu número de WhatsApp\nFormato: 521234567890 (sin + o espacios): `))
            );

            // Limpiar el número
            this.phoneNumber = this.phoneNumber.replace(/[^0-9]/g, '');

            // Validar número con awesome-phonenumber
            const pn = (await import('awesome-phonenumber')).default;
            if (!pn('+' + this.phoneNumber).isValid()) {
                console.log(chalk.red('❌ Número inválido. Ingresa tu número internacional completo.'));
                process.exit(1);
            }

            // Solicitar código de pairing
            setTimeout(async () => {
                try {
                    let code = await this.sock.requestPairingCode(this.phoneNumber);
                    code = code?.match(/.{1,4}/g)?.join("-") || code;

                    console.log(chalk.black(chalk.bgGreen(`\n🔢 Tu Código de Pairing: `)), chalk.black(chalk.white(code)));
                    console.log(chalk.yellow(`\n📝 Instrucciones:\n1. Abre WhatsApp\n2. Ve a Ajustes → Dispositivos vinculados\n3. Toca "Vincular un dispositivo"\n4. Ingresa el código mostrado arriba\n`));
                } catch (error) {
                    console.error(chalk.red('❌ Error al obtener pairing code:'), error);
                    console.log(chalk.red('⚠️ Falló al obtener pairing code. Verifica tu número e intenta de nuevo.'));
                }
            }, 3000);

        } catch (error) {
            console.error(chalk.red('❌ Error en pairing code:'), error);
        }
    }

    configurarEventos(saveCreds) {
        if (!this.sock) return;

        this.sock.ev.on('connection.update', (update) => {
            this.manejarActualizacionConexion(update);
        });

        this.sock.ev.on('creds.update', saveCreds);

        this.sock.ev.on('messages.upsert', (data) => {
            this.dispararEvento('mensajesRecibidos', data);
        });
    }

    manejarActualizacionConexion(update) {
        const { connection, lastDisconnect, qr } = update;

        if (qr && !this.pairingCode) {
            this.mostrarQR(qr);
            this.dispararEvento('qrGenerado', qr);
        }

        if (connection === 'connecting') {
            console.log(chalk.blue('🔄 Conectando a WhatsApp...'));
        }
        else if (connection === 'close') {
            this.estaConectado = false;
            const desconexion = lastDisconnect?.error;
            const codigoEstado = desconexion?.output?.statusCode;

            console.log(chalk.yellow(`🔌 Conexión cerrada. Código: ${codigoEstado}`));

            if (codigoEstado === DisconnectReason.loggedOut) {
                console.log(chalk.red('❌ Sesión cerrada. Elimina la carpeta "sesiones" para reiniciar.'));
                this.cerrarConexion();
                process.exit(1);
            } else {
                this.reconectar();
            }

            this.dispararEvento('conexionCerrada', { codigoEstado, desconexion });

        } else if (connection === 'open') {
            this.estaConectado = true;
            this.intentosReconexion = 0;
            console.log(chalk.green('✅ ¡Conectado a WhatsApp!'));
            console.log(chalk.cyan('🤖 Karbot está listo para recibir mensajes'));

            // Mostrar información del usuario
            if (this.sock.user) {
                console.log(chalk.magenta(`👤 Conectado como: ${this.sock.user.name || this.sock.user.id}`));
            }

            this.dispararEvento('conexionEstablecida', this.sock);
        }
    }

    mostrarQR(qr) {
        console.log(chalk.cyan('\n📱 ===== ESCANEA ESTE CÓDIGO QR ===== 📱'));
        console.log(chalk.white('1. Abre WhatsApp en tu teléfono'));
        console.log(chalk.white('2. Toca los 3 puntos → Dispositivos vinculados → Vincular un dispositivo'));
        console.log(chalk.white('3. Escanea este código QR:\n'));

        // Mostrar QR con qrcode-terminal
        qrcode.generate(qr, { small: true });

        console.log(chalk.cyan('\n==========================================\n'));
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

        console.log(chalk.yellow(`🔄 Reconectando en ${delay / 1000} segundos... (Intento ${this.intentosReconexion})`));

        setTimeout(async () => {
            await this.iniciarConexion();
        }, delay);
    }

    async cerrarConexion() {
        console.log(chalk.yellow('🛑 Cerrando conexión...'));
        this.estaConectado = false;

        if (this.rl) {
            this.rl.close();
        }

        if (this.sock) {
            try {
                await this.sock.end();
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
}