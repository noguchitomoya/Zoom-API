import { SafeUser } from '../users/users.service';

export interface MeetingService {
  createMeeting(
    coach: SafeUser,
    params: {
      startAt: Date;
      endAt: Date;
      title?: string;
      attendees?: string[];
    },
  ): Promise<{ meetUrl: string; externalId?: string }>;
}

export const MEETING_SERVICE = Symbol('MEETING_SERVICE');
