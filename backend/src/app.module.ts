import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './modules/auth/auth.module';
import { MailModule } from './modules/mail/mail.module';
import { MeetingModule } from './modules/meeting/meeting.module';
import { SessionsModule } from './modules/sessions/sessions.module';
import { CustomersModule } from './modules/customers/customers.module';
import { UsersModule } from './modules/users/users.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    UsersModule,
    CustomersModule,
    AuthModule,
    MeetingModule,
    MailModule,
    SessionsModule,
  ],
})
export class AppModule {}
