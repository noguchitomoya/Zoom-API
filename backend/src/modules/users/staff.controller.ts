import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UsersService } from './users.service';

@UseGuards(JwtAuthGuard)
@Controller('staff')
export class StaffController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  async list() {
    const staff = await this.usersService.listAll();
    return staff.map((member) => this.usersService.sanitize(member));
  }
}
