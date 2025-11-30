import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SafeUser } from '../users/users.service';
import { MeetingService } from './meeting.service';

@Injectable()
export class StubMeetingService implements MeetingService {
  private readonly logger = new Logger(StubMeetingService.name);

  constructor(private readonly configService: ConfigService) {}

  async createMeeting(_: SafeUser, params: { startAt: Date; endAt: Date; title?: string; attendees?: string[] }) {
    const domain = this.configService.get<string>('ZOOM_MEETING_DOMAIN') ?? 'https://zoom.us/j';
    const meetingId = this.generateMeetingId();
    const meetUrl = `${domain.replace(/\/$/, '')}/${meetingId}`;
    this.logger.log(
      `(Stub) Generated Zoom URL ${meetUrl} for "${params.title ?? 'Coaching Session'}" with attendees ${
        params.attendees?.join(', ') ?? 'none'
      }`,
    );
    return {
      meetUrl,
      externalId: `stub-${Date.now()}`,
    };
  }

  private generateMeetingId() {
    const digits = '0123456789';
    return Array.from({ length: 11 })
      .map(() => digits[Math.floor(Math.random() * digits.length)])
      .join('');
  }
}
