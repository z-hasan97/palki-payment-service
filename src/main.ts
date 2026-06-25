import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { PalkiLoggerService } from '@palki/logger';
import { KafkaConsumerService, KafkaProducerService } from '@palki/messaging';
import { MessageSignerService } from '@palki/messaging';
import { PaymentConsumer } from './consumers/payment.consumer';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(PalkiLoggerService));
  await app.init();
  const logger = app.get(PalkiLoggerService);
  const consumer = app.get(KafkaConsumerService);
  const producer = app.get(KafkaProducerService);
  const signer = app.get(MessageSignerService);
  const handlers: Record<string, any> = {
    'package.findAll': app.get(PaymentConsumer),
    'package.findOne': app.get(PaymentConsumer),
    'payment.initiate': app.get(PaymentConsumer),
    'payment.verify': app.get(PaymentConsumer),
    'payment.findAll': app.get(PaymentConsumer),
  };

  async function handleAndReply(topic: string, payload: any, handler: any) {
    try {
      const result = await handler.handle(payload.payload || payload);
      const env = signer.sign({ status: 'success', data: result, correlationId: payload.correlationId, messageId: payload.messageId, timestamp: new Date().toISOString() });
      await producer.send(topic + '.reply', env as any);
    } catch (error: any) {
      logger.logError('Handler error', { topic, error: error.message });
      const env = signer.sign({ status: 'error', error: { messageId: payload.messageId, code: 'INTERNAL-5001', message: error.message, timestamp: new Date().toISOString(), correlationId: payload.correlationId } });
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
