import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { randomBytes } from 'crypto';
import { UsersService } from '../users/users.service';

@Injectable()
export class GoogleOauthService {
  private readonly logger = new Logger(GoogleOauthService.name);
  private readonly clientId: string | undefined;
  private readonly clientSecret: string | undefined;
  private readonly redirectUri: string | undefined;
  private readonly enabled: boolean;
  private readonly jwtSecret: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {
    this.clientId = this.configService.get<string>('GOOGLE_OAUTH_CLIENT_ID');
    this.clientSecret = this.configService.get<string>('GOOGLE_OAUTH_CLIENT_SECRET');
    this.redirectUri = this.configService.get<string>('GOOGLE_OAUTH_REDIRECT_URI');
    this.jwtSecret = this.configService.get<string>('JWT_SECRET') ?? 'oauth-state';
    this.enabled = Boolean(this.clientId && this.clientSecret && this.redirectUri);
  }

  isEnabled() {
    return this.enabled;
  }

  generateAuthUrl(userId: string) {
    this.ensureConfigured();
    const oauth2Client = this.createClient();
    const state = this.jwtService.sign(
      { userId, nonce: randomBytes(12).toString('hex') },
      { secret: this.jwtSecret, expiresIn: '10m' },
    );
    return oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: ['https://www.googleapis.com/auth/calendar.events'],
      state,
    });
  }

  async handleCallback(code: string, stateToken: string) {
    this.ensureConfigured();
    const payload = this.jwtService.verify<{ userId: string }>(stateToken, { secret: this.jwtSecret });
    const oauth2Client = this.createClient();
    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.refresh_token) {
      throw new BadRequestException('Googleアカウントの再許可が必要です。もう一度お試しください。');
    }

    await this.usersService.updateGoogleAuthData(payload.userId, {
      refreshToken: tokens.refresh_token,
      calendarId: 'primary',
    });

    this.logger.log(`Stored Google credentials for user ${payload.userId}`);
  }

  async getAuthorizedClient(userId: string): Promise<{ authClient: OAuth2Client; calendarId: string | null }> {
    this.ensureConfigured();
    const user = await this.usersService.findById(userId);
    if (!user || !user.googleRefreshToken) {
      throw new BadRequestException('Google連携が未設定です。先に連携を完了してください。');
    }

    const client = this.createClient();
    client.setCredentials({ refresh_token: user.googleRefreshToken });
    return { authClient: client, calendarId: user.googleCalendarId ?? 'primary' };
  }

  private createClient() {
    return new google.auth.OAuth2(this.clientId, this.clientSecret, this.redirectUri);
  }

  private ensureConfigured() {
    if (!this.enabled) {
      throw new BadRequestException('Google OAuth が設定されていません。');
    }
  }
}
