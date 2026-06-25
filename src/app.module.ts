import { Module } from '@nestjs/common';
import { ConfigModule } from '@palki/config';
import { LoggerModule } from '@palki/logger';
import { DatabaseModule } from '@palki/database';
import { KafkaConsumerService, KafkaProducerService } from '@palki/messaging';
import { MessageSignerService } from '@palki/messaging';
import { User } from './entities/user.entity';
import { Client } from './entities/client.entity';
import { Package } from './entities/package.entity';
import { Payment } from './entities/payment.entity';
import { PaymentConsumer } from './consumers/payment.consumer';

@Module({
  imports: [ConfigModule, LoggerModule, DatabaseModule.forRoot([User, Client, Package, Payment])],
  providers: [KafkaConsumerService, KafkaProducerService, MessageSignerService, PaymentConsumer],
})
export class AppModule {}
