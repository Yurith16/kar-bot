import { configDesarrollador } from '../config/config.desarrollador.js';

export class NormalizadorJID {
    // Owner fijo
    static ownerJID = '50496926150@s.whatsapp.net';

    // Mapeo manual de LIDs a números reales (agrega aquí tus LIDs)
    static mapeoLIDs = {
        '20015168381136@lid': '50496926150@s.whatsapp.net',
        // Agrega más mapeos según necesites
    };

    /**
     * Convierte cualquier JID a formato estándar de usuario
     * @param {string} jid - JID a normalizar
     * @returns {string} JID normalizado
     */
    static normalizar(jid) {
        if (!jid) return jid;

        console.log(`🔧 Normalizando JID: ${jid}`);

        // 1. Primero verificar si tenemos un mapeo directo para LIDs
        if (this.mapeoLIDs[jid]) {
            console.log(`✅ Usando mapeo LID: ${jid} -> ${this.mapeoLIDs[jid]}`);
            return this.mapeoLIDs[jid];
        }

        // 2. Si es un LID sin mapeo, intentar extraer el número
        if (jid.includes('@lid')) {
            console.log(`⚠️ LID sin mapeo: ${jid}`);
            // Para debugging, mantener el LID original pero marcarlo
            return jid; // Temporalmente devolvemos el LID para debugging
        }

        // 3. Si es un JID de grupo con participante, extraer solo el usuario
        if (jid.includes('@g.us') && jid.includes(':')) {
            jid = jid.split(':')[0] + '@g.us';
        }

        // 4. Remover sufijos de grupo y dispositivos
        const jidBase = jid
            .split('@')[0]
            .split(':')[0];

        return `${jidBase}@s.whatsapp.net`;
    }

    /**
     * Obtiene el JID del remitente REAL del mensaje
     * @param {object} message - Objeto del mensaje de Baileys
     * @returns {string} JID del remitente normalizado
     */
    static obtenerRemitente(message) {
        if (!message || !message.key) return null;

        console.log('🔍 Analizando mensaje:', {
            remoteJid: message.key.remoteJid,
            participant: message.key.participant,
            fromMe: message.key.fromMe
        });

        const jidRemitente = message.key.participant || message.key.remoteJid;
        const jidNormalizado = this.normalizar(jidRemitente);

        console.log(`✅ JID normalizado: ${jidNormalizado}`);
        return jidNormalizado;
    }

    /**
     * Verifica si el REMITENTE de un mensaje es el owner
     * @param {object} message - Objeto del mensaje de Baileys
     * @returns {boolean} True si el remitente es owner
     */
    static esOwnerMensaje(message) {
        const remitente = this.obtenerRemitente(message);

        // Si es un LID sin mapeo, necesitamos una verificación alternativa
        if (remitente.includes('@lid')) {
            console.log(`🔍 LID detectado, usando verificación alternativa`);
            return this.verificarOwnerAlternativo(message);
        }

        return this.esOwner(remitente);
    }

    /**
     * Verificación alternativa para LIDs (cuando la normalización falla)
     * @param {object} message - Objeto del mensaje
     * @returns {boolean} True si es owner
     */
    static verificarOwnerAlternativo(message) {
        // Método 1: Verificar por número conocido de LID
        const jidRemitente = message.key.participant || message.key.remoteJid;
        if (this.mapeoLIDs[jidRemitente]) {
            return true;
        }

        // Método 2: Si el mensaje viene de un grupo, podrías verificar
        // el nombre del remitente o otras características
        // Por ahora, como solución temporal, permitir en base al LID conocido
        const lidsConocidos = ['20015168381136@lid'];
        return lidsConocidos.includes(jidRemitente);
    }

    // ... (el resto de los métodos se mantienen igual)
}

export const ownerJID = NormalizadorJID.ownerJID;