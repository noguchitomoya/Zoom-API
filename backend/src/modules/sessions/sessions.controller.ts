import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentCustomer } from '../../common/decorators/current-user.decorator';
import { SafeCustomer } from '../customers/customers.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SessionsService } from './sessions.service';
import { CreateSessionDto } from './dto/create-session.dto';
import { UpdateSessionDto } from './dto/update-session.dto';

@UseGuards(JwtAuthGuard)
@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Get()
  list(@CurrentCustomer() customer: SafeCustomer) {
    return this.sessionsService.listForCustomer(customer.id);
  }

  @Post()
  create(@CurrentCustomer() customer: SafeCustomer, @Body() dto: CreateSessionDto) {
    return this.sessionsService.createSession(customer, dto);
  }

  @Get('availability')
  availability(@Query('date') date: string) {
    return this.sessionsService.getAvailability(date);
  }

  @Get(':id')
  detail(@Param('id') id: string, @CurrentCustomer() customer: SafeCustomer) {
    return this.sessionsService.getSessionDetail(customer.id, id);
  }

  @Patch(':id')
  reschedule(
    @Param('id') id: string,
    @CurrentCustomer() customer: SafeCustomer,
    @Body() dto: UpdateSessionDto,
  ) {
    return this.sessionsService.rescheduleSession(customer, id, dto);
  }

  @Delete(':id')
  cancel(@Param('id') id: string, @CurrentCustomer() customer: SafeCustomer) {
    return this.sessionsService.cancelSession(customer, id);
  }
}
