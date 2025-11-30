import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { SafeCustomer } from '../../modules/customers/customers.service';

export const CurrentCustomer = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): SafeCustomer => {
    const request = ctx.switchToHttp().getRequest();
    return request.user as SafeCustomer;
  },
);
