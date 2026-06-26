import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { PalkiLoggerService } from '@palki/logger';
import { KafkaConsumerService, KafkaProducerService } from '@palki/messaging';
import { MessageSignerService } from '@palki/messaging';
import { PaymentConsumer } from './consumers/payment.consumer';

function mapErrorCode(msg: string): string {
  const codes: Record<string,string> = { PAYMENT_NOT_FOUND: 'NOT_FOUND-3001', PAYMENT_ID_REQUIRED: 'VALIDATION-2001' };
  return codes[msg] || 'INTERNAL-5001';
}
function mapErrorMessage(msg: string): string {
  const messages: Record<string,string> = { PAYMENT_NOT_FOUND: 'Payment not found', PAYMENT_ID_REQUIRED: 'Payment ID is required' };
  return messages[msg] || msg;
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(PalkiLoggerService));
  await app.init();
  const logger = app.get(PalkiLoggerService);
  const consumer = app.get(KafkaConsumerService);
  const producer = app.get(KafkaProducerService);
  const signer = app.get(MessageSignerService);
  const pc = app.get(PaymentConsumer);
  const handlers: Record<string, any> = {
    'package.findAll': pc, 'package.findOne': pc,
    'payment.initiate': pc, 'payment.verify': pc, 'payment.findAll': pc,
  };

  async function handleAndReply(topic: string, payload: any, handler: any) {
    try {
      const result = await handler.handle({ ...(payload.payload || payload), topic });
      const env = signer.sign({ status: 'success', data: result, correlationId: payload.correlationId, messageId: payload.messageId, timestamp: new Date().toISOString() });
      await producer.send(topic + '.reply', env as any);
    } catch (error: any) {
      logger.logError('Handler error', { topic, error: error.message });
      const env = signer.sign({ status: 'error', error: { messageId: payload.messageId, code: mapErrorCode(error.message), message: mapErrorMessage(error.message), timestamp: new Date().toISOString(), correlationId: payload.correlationId } });
      await producer.send(topic + '.reply', env as any);
    }
  }

  await consumer.onModuleInit();
  for (const [topic, handler] of Object.entries(handlers)) {
    await consumer.subscribe(topic, async (p) => {
      const msg = JSON.parse(p.message.value?.toString() || '{}');
      logger.info('Processing ' + topic, { messageId: msg.messageId, correlationId: msg.correlationId });
      await handleAndReply(topic, msg, handler);
    });
  }
  await consumer.startConsuming();
  logger.info('Payment Service consumers started');
}
bootstrap();
