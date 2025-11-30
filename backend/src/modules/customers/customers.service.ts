import { ConflictException, Injectable } from '@nestjs/common';
import { Customer } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export type SafeCustomer = Omit<Customer, 'passwordHash'>;

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string) {
    return this.prisma.customer.findUnique({ where: { email: email.toLowerCase() } });
  }

  findById(id: string) {
    return this.prisma.customer.findUnique({ where: { id } });
  }

  async createCustomer(data: { name: string; email: string; passwordHash: string; phone?: string; note?: string }) {
    const email = data.email.toLowerCase();
    const existing = await this.prisma.customer.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('既に登録済みのメールアドレスです。');
    }

    return this.prisma.customer.create({
      data: {
        ...data,
        email,
      },
    });
  }

  sanitize(customer: Customer): SafeCustomer {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash, ...rest } = customer;
    return rest;
  }
}
