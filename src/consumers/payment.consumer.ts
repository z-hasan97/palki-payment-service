import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Payment, PaymentStatus } from '../entities/payment.entity';
import { Client, ClientStatus } from '../entities/client.entity';
import { Package } from '../entities/package.entity';
import { User } from '../entities/user.entity';

@Injectable()
export class PaymentConsumer {
  constructor(
    @InjectRepository(Payment) private readonly paymentRepo: Repository<Payment>,
    @InjectRepository(Client) private readonly clientRepo: Repository<Client>,
    @InjectRepository(Package) private readonly packageRepo: Repository<Package>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
  ) {}

  async handle(payload: any) {
    const roles = payload.roles || [];
    const userId = payload.userId || null;
    const data = payload.payload || payload;
    const action = data.action || 'findAll';

    if (action === 'initiate') {
      const payment = this.paymentRepo.create({ userId: data.userId || userId, packageId: data.packageId, amount: data.amount, status: PaymentStatus.PENDING });
      await this.paymentRepo.save(payment);
      return { 'payment-id': (payment as any).id, 'payment-status': 'PENDING', message: 'Payment initiated' };
    }

    if (action === 'verify') {
      if (!data.paymentId) throw new Error('PAYMENT_ID_REQUIRED');
      const existing = await this.paymentRepo.findOne({ where: { id: data.paymentId } as any });
      if (!existing) throw new Error('PAYMENT_NOT_FOUND');
      if (existing.status === PaymentStatus.COMPLETED) return { 'payment-status': 'COMPLETED', message: 'Payment already verified' };
      await this.paymentRepo.update(data.paymentId, { status: PaymentStatus.COMPLETED, transactionId: data.transactionId || 'txn_' + Date.now(), paymentMethod: data.paymentMethod || 'sslcommerz' });
      const payment = await this.paymentRepo.findOne({ where: { id: data.paymentId } as any });
      if (payment) {
        const pkg = await this.packageRepo.findOne({ where: { id: payment.packageId } as any });
        const startDate = new Date(); const endDate = new Date();
        endDate.setDate(endDate.getDate() + ((pkg as any)?.durationDays || 30));
        await this.clientRepo.save({ userId: payment.userId, packageId: payment.packageId, startDate, endDate, status: ClientStatus.ACTIVE } as any);
        await this.userRepo.update(payment.userId, { roles: ['CLIENT'] } as any);
      }
      return { 'payment-status': 'COMPLETED', message: 'Payment verified, client upgraded' };
    }

    const where: any = {};
    if (!roles.includes('ADMIN') && userId) where.userId = userId;
    return this.paymentRepo.find({ where });
  }
}