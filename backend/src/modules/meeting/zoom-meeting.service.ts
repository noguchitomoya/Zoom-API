import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError } from 'axios';
import { SafeUser } from '../users/users.service';
import { MeetingService } from './meeting.service';

interface ZoomTokenCache {
  accessToken: string;
  expiresAt: number;
}

@Injectable()
export class ZoomMeetingService implements MeetingService {
  private readonly logger = new Logger(ZoomMeetingService.name);
  private readonly accountId: string | undefined;
  private readonly clientId: string | undefined;
  private readonly clientSecret: string | undefined;
  private readonly oauthBaseUrl: string;
  private readonly apiBaseUrl: string;
  private readonly timeZone: string;
  private tokenCache: ZoomTokenCache | null = null;

  constructor(private readonly configService: ConfigService) {
    this.accountId = this.configService.get<string>('ZOOM_ACCOUNT_ID');
    this.clientId = this.configService.get<string>('ZOOM_CLIENT_ID');
    this.clientSecret = this.configService.get<string>('ZOOM_CLIENT_SECRET');
    this.oauthBaseUrl = this.configService.get<string>('ZOOM_OAUTH_BASE_URL') ?? 'https://zoom.us';
    this.apiBaseUrl = this.configService.get<string>('ZOOM_API_BASE_URL') ?? 'https://api.zoom.us/v2';
    this.timeZone = this.configService.get<string>('ZOOM_MEETING_TIMEZONE') ?? 'Asia/Tokyo';
  }

  isEnabled() {
    return Boolean(this.accountId && this.clientId && this.clientSecret);
  }

  async createMeeting(
    coach: SafeUser,
    params: { startAt: Date; endAt: Date; title?: string; attendees?: string[] },
  ): Promise<{ meetUrl: string; externalId?: string }> {
    this.ensureConfigured();

    const accessToken = await this.getAccessToken();
    const durationMinutes = Math.max(
      1,
      Math.ceil((params.endAt.getTime() - params.startAt.getTime()) / 1000 / 60),
    );
    const startTime = params.startAt.toISOString().split('.')[0];

    const payload = {
      topic: params.title ?? `Coaching with ${coach.name}`,
      type: 2,
      start_time: startTime,
      duration: durationMinutes,
      timezone: this.timeZone,
      agenda: `Online coaching session hosted by ${coach.name}`,
      settings: {
        join_before_host: true,
        waiting_room: false,
        host_video: true,
        participant_video: true,
        mute_upon_entry: true,
        approval_type: 2,
        registrants_email_notification: false,
      },
    };

    try {
      const { data } = await axios.post(
        `${this.apiBaseUrl}/users/me/meetings`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );

      const joinUrl: string | undefined = data?.join_url;
      const meetingId: string | undefined = data?.id ? String(data.id) : undefined;

      if (!joinUrl) {
        throw new Error('Zoom API did not return a join_url.');
      }

      this.logger.log(`Created Zoom meeting ${meetingId ?? ''} for ${coach.email}`);

      return {
        meetUrl: joinUrl,
        externalId: meetingId,
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        this.logAxiosError(error);
      }
      throw error;
    }
  }

  private ensureConfigured() {
    if (!this.isEnabled()) {
      throw new BadRequestException('Zoom API が未設定です。管理者にお問い合わせください。');
    }
  }

  private async getAccessToken(): Promise<string> {
    if (this.tokenCache && this.tokenCache.expiresAt > Date.now() + 5000) {
      return this.tokenCache.accessToken;
    }

    this.ensureConfigured();

    const endpoint = `${this.oauthBaseUrl}/oauth/token?grant_type=account_credentials&account_id=${this.accountId}`;
    const basicAuth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');

    try {
      const { data } = await axios.post(
        endpoint,
        undefined,
        {
          headers: {
            Authorization: `Basic ${basicAuth}`,
          },
        },
      );

      if (!data?.access_token) {
        throw new Error('Zoom OAuth response did not include an access token.');
      }

      const expiresInSeconds = typeof data.expires_in === 'number' ? data.expires_in : 3600;
      this.tokenCache = {
        accessToken: data.access_token,
        expiresAt: Date.now() + Math.max(0, expiresInSeconds - 60) * 1000,
      };

      return data.access_token;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        this.logAxiosError(error, 'Failed to obtain Zoom access token');
      }
      throw error;
    }
  }

  private logAxiosError(error: AxiosError, prefix = 'Zoom API error') {
    const status = error.response?.status;
    const data = error.response?.data;
    this.logger.error(`${prefix}${status ? ` (${status})` : ''}: ${JSON.stringify(data ?? error.message)}`);
  }
}


