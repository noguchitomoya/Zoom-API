import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google, calendar_v3 } from 'googleapis';
import { GaxiosError } from 'googleapis-common';
import { SafeUser } from '../users/users.service';
import { MeetingService } from './meeting.service';
import { GoogleOauthService } from '../google/google-oauth.service';

@Injectable()
export class GoogleMeetingService implements MeetingService {
  private readonly logger = new Logger(GoogleMeetingService.name);
  private readonly timeZone: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly googleOauthService: GoogleOauthService,
  ) {
    this.timeZone = this.configService.get<string>('GOOGLE_CALENDAR_TIMEZONE') ?? 'Asia/Tokyo';
  }

  async createMeeting(coach: SafeUser, params: { startAt: Date; endAt: Date; title?: string; attendees?: string[] }) {
    const { authClient, calendarId } = await this.googleOauthService.getAuthorizedClient(coach.id);
    if (!calendarId) {
      throw new BadRequestException('Googleカレンダーが設定されていません。');
    }

    const calendar = google.calendar({ version: 'v3', auth: authClient });

    const requestBody: calendar_v3.Schema$Event = {
      summary: params.title ?? 'Online Coaching Session',
      start: {
        dateTime: params.startAt.toISOString(),
        timeZone: this.timeZone,
      },
      end: {
        dateTime: params.endAt.toISOString(),
        timeZone: this.timeZone,
      },
      conferenceData: {
        createRequest: {
          requestId: `meet-${Date.now()}`,
        },
      },
      attendees: params.attendees?.map((email) => ({ email })),
    };

    let response;
    try {
      response = await calendar.events.insert({
        calendarId,
        requestBody,
        conferenceDataVersion: 1,
        sendUpdates: 'none',
      });
    } catch (error) {
      if (error instanceof GaxiosError && error.response) {
        this.logger.error(`Google Calendar API error (${error.response.status}): ${JSON.stringify(error.response.data)}`);
      }
      throw error;
    }

    const event = response.data;
    const meetUrl =
      event.conferenceData?.entryPoints?.find((entry) => entry.entryPointType === 'video')?.uri ??
      event.hangoutLink;

    if (!event.id || !meetUrl) {
      throw new Error('Google Calendar API did not return a Meet URL.');
    }

    this.logger.log(`Created Google Meet ${meetUrl} for event ${event.id}`);

    return {
      meetUrl,
      externalId: event.id,
    };
  }
}
