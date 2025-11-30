import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { User } from '@prisma/client';

export type SafeUser = Omit<User, 'passwordHash'>;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  listAll() {
    return this.prisma.user.findMany({
      orderBy: { name: 'asc' },
    });
  }

  findByCode(code: string) {
    return this.prisma.user.findUnique({ where: { code } });
  }

  findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  sanitize(user: User): SafeUser {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash, ...rest } = user;
    return rest;
  }
}
