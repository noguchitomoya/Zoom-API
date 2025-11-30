import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { EmailStatus, SessionStatus } from '@prisma/client';
import { SafeUser } from '../users/users.service';
import { PrismaService } from '../../prisma/prisma.service';
import { StudentsService } from '../students/students.service';
import { MAIL_SERVICE, MailService } from '../mail/mail.service';
import { MEETING_SERVICE, MeetingService } from '../meeting/meeting.service';
import { CreateSessionDto } from './dto/create-session.dto';

@Injectable()
export class SessionsService {
  private readonly logger = new Logger(SessionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly studentsService: StudentsService,
    @Inject(MEETING_SERVICE) private readonly meetingService: MeetingService,
    @Inject(MAIL_SERVICE) private readonly mailService: MailService,
  ) {}

  listForCoach(coachId: string) {
    return this.prisma.session.findMany({
      where: { coachId },
      include: {
        student: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { startAt: 'desc' },
    });
  }

  async createSession(coach: SafeUser, dto: CreateSessionDto) {
    const startAt = new Date(dto.startAt);
    const endAt = new Date(dto.endAt);

    if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
      throw new BadRequestException('日時の形式が不正です。');
    }
    if (startAt >= endAt) {
      throw new BadRequestException('終了時刻は開始時刻より後である必要があります。');
    }

    const student = await this.studentsService.ensureStudentOwnedByCoach(dto.studentId, coach.id);

    let meeting;
    try {
      meeting = await this.meetingService.createMeeting(coach, {
        startAt,
        endAt,
        title: dto.title ?? `Coaching with ${student.name}`,
        attendees: [student.email],
      });
    } catch (error) {
      this.logger.error('Zoomミーティングの作成に失敗しました', error instanceof Error ? error.stack : undefined);
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException('Zoomリンクの作成に失敗しました。時間をおいて再度お試しください。');
    }

    const session = await this.prisma.session.create({
      data: {
        studentId: student.id,
        coachId: coach.id,
        startAt,
        endAt,
        title: dto.title,
        meetUrl: meeting.meetUrl,
        externalId: meeting.externalId ?? null,
        status: SessionStatus.scheduled,
      },
      include: {
        student: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    let emailStatus: EmailStatus = EmailStatus.success;
    let emailErrorMessage: string | undefined;

    try {
      const mailResult = await this.mailService.sendSessionNotification({
        to: student.email,
        studentName: student.name,
        coachName: coach.name,
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
        meetUrl: meeting.meetUrl,
        title: dto.title,
      });
      if (!mailResult.success) {
        throw new Error(mailResult.errorMessage ?? 'メール送信に失敗しました。');
      }
    } catch (error) {
      emailStatus = EmailStatus.failed;
      emailErrorMessage = error instanceof Error ? error.message : 'メール送信に失敗しました。';
      this.logger.error('メール送信に失敗しました', emailErrorMessage);
    } finally {
      await this.prisma.emailLog.create({
        data: {
          sessionId: session.id,
          toEmail: student.email,
          subject: dto.title ?? 'オンラインセッションのご案内',
          body: meeting.meetUrl,
          status: emailStatus,
          errorMessage: emailErrorMessage,
        },
      });
    }

    return {
      session,
      emailStatus,
      emailErrorMessage,
    };
  }
}
