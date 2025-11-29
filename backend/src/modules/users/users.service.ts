import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { User } from '@prisma/client';

export type SafeUser = Omit<User, 'passwordHash' | 'googleRefreshToken'>;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findByEmployeeNumber(employeeNumber: string) {
    return this.prisma.user.findUnique({ where: { employeeNumber } });
  }

  findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  sanitize(user: User): SafeUser {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash, googleRefreshToken, ...rest } = user;
    return rest;
  }

  async updateGoogleAuthData(userId: string, params: { refreshToken?: string | null; calendarId?: string | null }) {
    const data: { googleRefreshToken?: string | null; googleCalendarId?: string | null } = {};
    if (params.refreshToken !== undefined) {
      data.googleRefreshToken = params.refreshToken;
    }
    if (params.calendarId !== undefined) {
      data.googleCalendarId = params.calendarId;
    }
    return this.prisma.user.update({
      where: { id: userId },
      data,
    });
  }
}
