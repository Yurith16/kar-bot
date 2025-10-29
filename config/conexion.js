export const configConexion = {
    // Configuración para hosting con restricciones
    options: {
        auth: {
            creds: {},
            keys: {}
        },
        browser: Browsers.ubuntu('Chrome'),
        printQRInTerminal: false,
        syncFullHistory: false,
        markOnlineOnConnect: false, // Cambiar a false
        retryRequestDelayMs: 3000,
        maxRetries: 3,
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 25000,
        defaultQueryTimeoutMs: 60000,
        fireInitQueries: true,
        emitOwnEvents: true,
        mobile: false
    }
};