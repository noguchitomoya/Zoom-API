import { BadRequestException, Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SafeUser } from '../users/users.service';
import { GoogleOauthService } from './google-oauth.service';

@Controller('google')
export class GoogleController {
  constructor(
    private readonly googleOauthService: GoogleOauthService,
    private readonly configService: ConfigService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Get('oauth/url')
  getOauthUrl(@CurrentUser() user: SafeUser) {
    if (!this.googleOauthService.isEnabled()) {
      throw new BadRequestException('Google OAuth が設定されていません。');
    }
    return { url: this.googleOauthService.generateAuthUrl(user.id) };
  }

  @Get('oauth/callback')
  async oauthCallback(@Query('code') code: string, @Query('state') state: string, @Res() res: Response) {
    const redirectBase = this.configService.get<string>('FRONTEND_ORIGIN') ?? 'http://localhost:3001';
    if (!code || !state) {
      return res.redirect(`${redirectBase}/sessions?google=error`);
    }

    try {
      await this.googleOauthService.handleCallback(code, state);
      return res.redirect(`${redirectBase}/sessions?google=success`);
    } catch (error) {
      return res.redirect(`${redirectBase}/sessions?google=error`);
    }
  }
}
