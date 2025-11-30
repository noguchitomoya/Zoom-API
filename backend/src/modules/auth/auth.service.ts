import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { CustomersService, SafeCustomer } from '../customers/customers.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly customersService: CustomersService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const email = dto.email.toLowerCase().trim();
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const customer = await this.customersService.createCustomer({
      name: dto.name,
      email,
      passwordHash,
      phone: dto.phone,
    });
    return this.customersService.sanitize(customer);
  }

  async validateCredentials(dto: LoginDto): Promise<SafeCustomer> {
    const email = dto.email.toLowerCase().trim();
    const customer = await this.customersService.findByEmail(email);
    if (!customer) {
      throw new UnauthorizedException('メールアドレスまたはパスワードが正しくありません。');
    }

    const isValid = await bcrypt.compare(dto.password, customer.passwordHash);
    if (!isValid) {
      throw new UnauthorizedException('メールアドレスまたはパスワードが正しくありません。');
    }

    return this.customersService.sanitize(customer);
  }

  async login(customer: SafeCustomer) {
    const payload = {
      sub: customer.id,
      name: customer.name,
      email: customer.email,
    };

    return {
      customer,
      accessToken: this.jwtService.sign(payload),
    };
  }
}
