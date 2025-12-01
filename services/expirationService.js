// services/expirationService.js
const pool = require('../config/database');
const cron = require('node-cron');

/**
 * Servicio para expirar reservas pendientes después de 1 hora
 * y manejar estados según el monto pagado
 */
class ExpirationService {
  constructor() {
    this.init();
  }

  init() {
    // Ejecutar cada 5 minutos para verificar reservas expiradas
    cron.schedule('*/5 * * * *', () => {
      this.expirePendingReservations();
    });
    
    console.log('🕐 Servicio de expiración de reservas iniciado');
  }

  async expirePendingReservations() {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Calcular la fecha/hora límite (1 hora atrás)
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

      // Buscar reservas pendientes creadas hace más de 1 hora
      const findExpiredQuery = `
        SELECT id_reserva, monto_total, monto_pagado
        FROM reserva 
        WHERE estado = 'pendiente' 
        AND fecha_creacion <= $1
      `;

      const expiredReservas = await client.query(findExpiredQuery, [oneHourAgo]);

      if (expiredReservas.rows.length > 0) {
        console.log(`🕐 Encontradas ${expiredReservas.rows.length} reservas por expirar`);

        for (const reserva of expiredReservas.rows) {
          await this.processExpiredReservation(client, reserva);
        }
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('❌ Error en expiración de reservas:', error);
    } finally {
      client.release();
    }
  }

  async processExpiredReservation(client, reserva) {
    const { id_reserva, monto_total, monto_pagado } = reserva;
    
    try {
      // Verificar si hay algún pago registrado
      const pagosQuery = `
        SELECT COALESCE(SUM(monto), 0) as total_pagado 
        FROM pago 
        WHERE id_reserva = $1
      `;
      
      const pagosResult = await client.query(pagosQuery, [id_reserva]);
      const totalPagado = parseFloat(pagosResult.rows[0].total_pagado);

      let nuevoEstado = 'cancelada';
      
      // Lógica de estados según el pago
      if (totalPagado >= 50) {
        if (totalPagado >= monto_total) {
          nuevoEstado = 'pagada';
        } else {
          nuevoEstado = 'en_cuotas';
        }
      }

      // Actualizar el estado de la reserva
      const updateQuery = `
        UPDATE reserva 
        SET estado = $1, monto_pagado = $2
        WHERE id_reserva = $3
      `;

      await client.query(updateQuery, [nuevoEstado, totalPagado, id_reserva]);

      console.log(`📝 Reserva ${id_reserva}: ${totalPagado} Bs pagados → Estado: ${nuevoEstado}`);

      // Si está cancelada, liberar recursos/horarios
      if (nuevoEstado === 'cancelada') {
        await this.releaseExpiredResources(client, id_reserva);
      }

    } catch (error) {
      console.error(`❌ Error procesando reserva ${id_reserva}:`, error);
      throw error;
    }
  }

  async releaseExpiredResources(client, reservaId) {
    // Aquí puedes agregar lógica para liberar los horarios
    // en tu sistema de disponibilidad si es necesario
    console.log(`📅 Liberando recursos de reserva cancelada: ${reservaId}`);
    
    // Ejemplo: Marcar horarios como disponibles
    // await client.query(
    //   'UPDATE horarios_disponibles SET disponible = true WHERE id_reserva = $1',
    //   [reservaId]
    // );
  }
}

module.exports = new ExpirationService();