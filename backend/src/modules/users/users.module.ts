import { Module } from '@nestjs/common';
import { StaffController } from './staff.controller';
import { UsersService } from './users.service';

@Module({
  providers: [UsersService],
  controllers: [StaffController],
  exports: [UsersService],
})
export class UsersModule {}
