import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailService } from './mail.service';

@Injectable()
export class ConsoleMailService implements MailService {
  private readonly logger = new Logger(ConsoleMailService.name);
  private readonly fromAddress: string;

  constructor(configService: ConfigService) {
    this.fromAddress = configService.get<string>('MAIL_FROM') ?? 'no-reply@example.com';
  }

  async sendSessionNotification(params: {
    to: string;
    customerName: string;
    staffName: string;
    startAt: string;
    endAt: string;
    meetUrl: string;
    title?: string;
  }) {
    this.logger.log(
      `Sending session email from ${this.fromAddress} to ${params.to} for ${params.customerName} (${params.startAt} - ${params.endAt}) with ${params.staffName}`,
    );
    this.logger.debug(`Zoom URL: ${params.meetUrl}`);
    return { success: true };
  }
}
