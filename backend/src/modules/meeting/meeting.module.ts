import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GoogleModule } from '../google/google.module';
import { GoogleOauthService } from '../google/google-oauth.service';
import { GoogleMeetingService } from './google-meeting.service';
import { StubMeetingService } from './stub-meeting.service';
import { MEETING_SERVICE, MeetingService } from './meeting.service';

@Module({
  imports: [ConfigModule, GoogleModule],
  providers: [
    GoogleMeetingService,
    StubMeetingService,
    {
      provide: MEETING_SERVICE,
      inject: [GoogleOauthService, GoogleMeetingService, StubMeetingService],
      useFactory: (
        googleOauthService: GoogleOauthService,
        googleMeetingService: GoogleMeetingService,
        stubMeetingService: StubMeetingService,
      ): MeetingService => {
        return googleOauthService.isEnabled() ? googleMeetingService : stubMeetingService;
      },
    },
  ],
  exports: [MEETING_SERVICE],
})
export class MeetingModule {}
