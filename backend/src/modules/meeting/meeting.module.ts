import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ZoomMeetingService } from './zoom-meeting.service';
import { StubMeetingService } from './stub-meeting.service';
import { MEETING_SERVICE, MeetingService } from './meeting.service';

@Module({
  imports: [ConfigModule],
  providers: [
    ZoomMeetingService,
    StubMeetingService,
    {
      provide: MEETING_SERVICE,
      inject: [ZoomMeetingService, StubMeetingService],
      useFactory: (
        zoomMeetingService: ZoomMeetingService,
        stubMeetingService: StubMeetingService,
      ): MeetingService => {
        return zoomMeetingService.isEnabled() ? zoomMeetingService : stubMeetingService;
      },
    },
  ],
  exports: [MEETING_SERVICE],
})
export class MeetingModule {}
