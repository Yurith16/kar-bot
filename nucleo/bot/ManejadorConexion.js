import { makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers, fetchLatestBaileysVersion, makeCacheableSignalKeyStore } from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import pino from 'pino';
import chalk from 'chalk';
import readline from 'readline';
import fs from 'fs';
import path from 'path';

class ManejadorConexion {
  constructor() {
    this.sock = null;
    this.intentosReconexion = 0;
    this.maxIntentosReconexion = 10;
    this.estaConectado = false;
    this.eventos = {};
    this.pairingCode = true;
    this.phoneNumber = null;
    this.metodoConexion = 'qr';
    this.esPrimeraConexion = true;
    this.qrGenerado = false;
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

  // Verificar si existe sesión guardada
  existeSesionGuardada() {
    try {
      const sesionesDir = 'sesiones';
      if (!fs.existsSync(sesionesDir)) {
        return false;
      }

      const archivos = fs.readdirSync(sesionesDir);
      const archivosNecesarios = ['creds.json', 'pre-key-1.json', 'session-1.json'];

      return archivosNecesarios.every(archivo => 
        archivos.includes(archivo) && 
        fs.statSync(path.join(sesionesDir, archivo)).size > 0
      );
    } catch (error) {
      console.log(chalk.yellow('⚠️ No se pudo verificar la sesión existente:', error.message));
      return false;
    }
  }

  async seleccionarMetodoConexion() {
    // Solo preguntar en la primera conexión si no hay sesión guardada
    if (this.esPrimeraConexion && !this.existeSesionGuardada()) {
      console.log(chalk.cyan('\n🔐 ===== MÉTODO DE CONEXIÓN ===== 🔐'));
      console.log(chalk.yellow('1. Código QR (Recomendado)'));
      console.log(chalk.yellow('2. Pairing Code'));

      const opcion = await this.question(chalk.green('Selecciona el método de conexión (1-2): '));

      if (opcion === '1') {
        this.metodoConexion = 'qr';
        console.log(chalk.cyan('✅ Método seleccionado: Código QR'));
      } else if (opcion === '2') {
        this.metodoConexion = 'pairing';
        console.log(chalk.cyan('✅ Método seleccionado: Pairing Code'));
      } else {
        console.log(chalk.red('❌ Opción inválida. Usando método por defecto: Código QR'));
        this.metodoConexion = 'qr';
      }
      this.esPrimeraConexion = false;
    } else if (this.existeSesionGuardada()) {
      console.log(chalk.green('📁 Sesión existente detectada. Conectando automáticamente...'));
      this.metodoConexion = 'qr'; // Para reconexiones usar QR
    }
  }

  async iniciarConexion() {
    try {
      console.log(chalk.yellow('🔄 Iniciando conexión con WhatsApp...'));

      // Verificar si existe sesión antes de intentar conectar
      const existeSesion = this.existeSesionGuardada();
      if (existeSesion) {
        console.log(chalk.green('✅ Sesión guardada encontrada'));
      } else {
        console.log(chalk.yellow('⚠️ No se encontró sesión guardada. Se requiere autenticación.'));
      }

      const { version } = await fetchLatestBaileysVersion();
      const { state, saveCreds } = await useMultiFileAuthState('sesiones');

      // Solo preguntar por método si no hay credenciales registradas
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
        markOnlineOnConnect: true,
        syncFullHistory: false,
        generateHighQualityLinkPreview: true,
        msgRetryCounterCache: new Map(),
        defaultQueryTimeoutMs: 60000,
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 10000,
        qrTimeout: 30000,
        // Configuración adicional para mejor manejo de sesiones
        retryRequestDelayMs: 2000,
        fireInitQueries: true,
        shouldIgnoreJid: (jid) => false,
      });

      this.configurarEventos(saveCreds);

      // Solo manejar pairing code si no está registrado y se seleccionó ese método
      if (!this.sock.authState.creds.registered && this.metodoConexion === 'pairing') {
        await this.manejarPairingCode();
      } else if (!this.sock.authState.creds.registered) {
        console.log(chalk.yellow('📱 Esperando escaneo de código QR...'));
      }

    } catch (error) {
      console.error(chalk.red('❌ Error en la conexión:'), error);
      await this.reconectar();
    }
  }

  async manejarPairingCode() {
    try {
      console.log(chalk.cyan('\n📱 ===== CONEXIÓN POR PAIRING CODE ===== 📱'));
      this.phoneNumber = await this.question(
        chalk.green('Por favor ingresa tu número de WhatsApp:\nFormato: 521234567890 (sin + o espacios): ')
      );
      this.phoneNumber = this.phoneNumber.replace(/[^0-9]/g, '');
      const pn = (await import('awesome-phonenumber')).default;
      if (!pn('+' + this.phoneNumber).isValid()) {
        console.log(chalk.red('❌ Número inválido. Ingresa tu número internacional completo.'));
        process.exit(1);
      }
      console.log(chalk.yellow('⏳ Solicitando código de pairing...'));
      setTimeout(async () => {
        try {
          let code = await this.sock.requestPairingCode(this.phoneNumber);
          code = code?.match(/.{1,4}/g)?.join("-") || code;
          console.log(chalk.black(chalk.bgGreen(`\n🔢 TU CÓDIGO DE PAIRING: ${code}`)));
          console.log(chalk.yellow(`\n📝 INSTRUCCIONES:\n1. Abre WhatsApp\n2. Ve a Ajustes → Dispositivos vinculados\n3. Toca "Vincular un dispositivo"\n4. Ingresa el código mostrado arriba\n`));
          console.log(chalk.cyan('⏰ El código expira en 20 segundos...'));
        } catch (error) {
          console.error(chalk.red('❌ Error al obtener pairing code:'), error);
          console.log(chalk.red('⚠️ Falló al obtener pairing code. Verifica tu número e intenta de nuevo.'));
          await this.manejarPairingCode();
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

    // Manejar errores de autenticación
    this.sock.ev.on('connection.update', (update) => {
      if (update.qr) {
        console.log(chalk.yellow('🔄 Código QR generado. Escanea para conectar.'));
      }
    });
  }

  manejarActualizacionConexion(update) {
    const { connection, lastDisconnect, qr, isNewLogin } = update;

    // Manejar código QR si está presente y no estamos usando pairing code
    if (qr && this.metodoConexion === 'qr' && !this.estaConectado && !this.qrGenerado) {
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
        console.log(chalk.red('❌ Sesión cerrada. Elimina la carpeta "sesiones" para reiniciar.'));
        this.limpiarSesion();
        this.cerrarConexion();
        process.exit(1);
      } else if (codigoEstado === DisconnectReason.restartRequired) {
        console.log(chalk.yellow('🔄 Reinicio requerido. Reconectando...'));
        this.reconectar();
      } else if (codigoEstado === DisconnectReason.timedOut) {
        console.log(chalk.yellow('⏰ Timeout de conexión. Reconectando...'));
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
      const sesionesDir = 'sesiones';
      if (fs.existsSync(sesionesDir)) {
        fs.rmSync(sesionesDir, { recursive: true, force: true });
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
    if (this.rl) {
      this.rl.close();
    }
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
}

export { ManejadorConexion };