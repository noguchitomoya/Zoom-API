import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EmailStatus, Session, SessionStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MAIL_SERVICE, MailService } from '../mail/mail.service';
import { MEETING_SERVICE, MeetingService } from '../meeting/meeting.service';
import { SafeUser, UsersService } from '../users/users.service';
import { SafeCustomer } from '../customers/customers.service';
import { CreateSessionDto } from './dto/create-session.dto';
import { UpdateSessionDto } from './dto/update-session.dto';

const SLOT_START_HOUR = 10;
const SLOT_END_HOUR = 19; // exclusive for ending hour
const SLOT_DURATION_MINUTES = 60;
const BOOKABLE_DAYS = 10;
const TIMEZONE = 'Asia/Tokyo';

@Injectable()
export class SessionsService {
  private readonly logger = new Logger(SessionsService.name);
  private readonly hourFormatter = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    hour12: false,
    timeZone: TIMEZONE,
  });

  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    @Inject(MEETING_SERVICE) private readonly meetingService: MeetingService,
    @Inject(MAIL_SERVICE) private readonly mailService: MailService,
  ) {}

  listForCustomer(customerId: string) {
    return this.prisma.session.findMany({
      where: { customerId },
      include: {
        staff: {
          select: { id: true, name: true, email: true, code: true },
        },
      },
      orderBy: { startAt: 'desc' },
    });
  }

  async getSessionDetail(customerId: string, sessionId: string) {
    const session = await this.prisma.session.findFirst({
      where: { id: sessionId, customerId },
      include: {
        staff: {
          select: { id: true, name: true, email: true, code: true },
        },
      },
    });
    if (!session) {
      throw new NotFoundException('予約が見つかりません。');
    }
    return session;
  }

  async getAvailability(dateIso: string) {
    if (!dateIso) {
      throw new BadRequestException('日付を指定してください。');
    }

    const staffMembers = await this.usersService.listAll();
    if (!staffMembers.length) {
      return [];
    }

    const dayStart = this.parseDateAtTimezone(dateIso);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

    const sessions = await this.prisma.session.findMany({
      where: {
        startAt: {
          gte: dayStart,
          lt: dayEnd,
        },
        status: SessionStatus.scheduled,
      },
      select: {
        staffId: true,
        startAt: true,
      },
    });

    const bookedMap = new Map<string, Set<number>>();
    sessions.forEach((session) => {
      const slotKey = Math.floor(session.startAt.getTime() / (60 * 60 * 1000));
      if (!bookedMap.has(session.staffId)) {
        bookedMap.set(session.staffId, new Set());
      }
      bookedMap.get(session.staffId)?.add(slotKey);
    });

    const availability = staffMembers.map((staff) => {
      const slots = [];
      for (let hour = SLOT_START_HOUR; hour < SLOT_END_HOUR; hour += 1) {
        const slotStart = new Date(dayStart.getTime());
        slotStart.setHours(slotStart.getHours() + hour);
        const slotKey = Math.floor(slotStart.getTime() / (60 * 60 * 1000));
        const isBooked = bookedMap.get(staff.id)?.has(slotKey) ?? false;
        slots.push({
          startAt: slotStart.toISOString(),
          available: !isBooked,
        });
      }
      return {
        staff: this.usersService.sanitize(staff),
        slots,
      };
    });

    return availability;
  }

  async createSession(customer: SafeCustomer, dto: CreateSessionDto) {
    const staff = await this.ensureStaff(dto.staffId);
    const { startAt, endAt } = this.computeSlotWindow(dto.startAt);
    await this.ensureSlotIsAvailable(staff.id, startAt);

    const session = await this.persistSession({
      staff,
      customer,
      startAt,
      endAt,
      title: dto.title,
    });

    return session;
  }

  async rescheduleSession(customer: SafeCustomer, sessionId: string, dto: UpdateSessionDto) {
    const existing = await this.ensureSessionOwnedByCustomer(sessionId, customer.id);
    if (existing.status === SessionStatus.cancelled) {
      throw new BadRequestException('キャンセル済みの予約は変更できません。');
    }

    const staffId = dto.staffId ?? existing.staffId;
    const staff = await this.ensureStaff(staffId);
    const startInput = dto.startAt ?? existing.startAt.toISOString();
    const { startAt, endAt } = this.computeSlotWindow(startInput);

    if (staffId !== existing.staffId || startAt.getTime() !== existing.startAt.getTime()) {
      await this.ensureSlotIsAvailable(staff.id, startAt, existing.id);
    }

    const updated = await this.persistSession({
      staff,
      customer,
      startAt,
      endAt,
      title: dto.title ?? existing.title ?? undefined,
      existingSessionId: existing.id,
    });

    return updated;
  }

  async cancelSession(customer: SafeCustomer, sessionId: string) {
    const session = await this.ensureSessionOwnedByCustomer(sessionId, customer.id);
    if (session.status === SessionStatus.cancelled) {
      return session;
    }
    return this.prisma.session.update({
      where: { id: sessionId },
      data: { status: SessionStatus.cancelled },
      include: {
        staff: {
          select: { id: true, name: true, email: true, code: true },
        },
      },
    });
  }

  private async persistSession(params: {
    staff: SafeUser;
    customer: SafeCustomer;
    startAt: Date;
    endAt: Date;
    title?: string;
    existingSessionId?: string;
  }) {
    const { staff, customer, startAt, endAt, title, existingSessionId } = params;
    const sessionTitle = title ?? `${staff.name} とのオンラインミーティング`;

    const meeting = await this.createMeetingRecord({
      staff,
      customer,
      startAt,
      endAt,
      title: sessionTitle,
    });

    const data = {
      customerId: customer.id,
      staffId: staff.id,
      startAt,
      endAt,
      title: sessionTitle,
      meetUrl: meeting.meetUrl,
      externalId: meeting.externalId ?? null,
      status: SessionStatus.scheduled,
    };

    try {
      const session = await (existingSessionId
        ? this.prisma.session.update({
            where: { id: existingSessionId },
            data,
            include: {
              staff: { select: { id: true, name: true, email: true, code: true } },
            },
          })
        : this.prisma.session.create({
            data,
            include: {
              staff: { select: { id: true, name: true, email: true, code: true } },
            },
          }));

      await this.logEmailNotification({
        sessionId: session.id,
        customer,
        staff,
        startAt,
        endAt,
        title: session.title,
        meetUrl: session.meetUrl,
      });

      return session;
    } catch (error) {
      if (error instanceof Error && 'code' in error && error['code'] === 'P2002') {
        throw new BadRequestException('すでに予約済みの枠です。別の時間をお選びください。');
      }
      throw error;
    }
  }

  private async createMeetingRecord(params: {
    staff: SafeUser;
    customer: SafeCustomer;
    startAt: Date;
    endAt: Date;
    title: string;
  }) {
    try {
      return await this.meetingService.createMeeting(params.staff, {
        startAt: params.startAt,
        endAt: params.endAt,
        title: params.title,
        attendees: [params.customer.email],
      });
    } catch (error) {
      this.logger.error('Zoomミーティングの作成に失敗しました', error instanceof Error ? error.stack : undefined);
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException('Zoomリンクの作成に失敗しました。時間をおいて再度お試しください。');
    }
  }

  private async logEmailNotification(params: {
    sessionId: string;
    customer: SafeCustomer;
    staff: SafeUser;
    startAt: Date;
    endAt: Date;
    title: string;
    meetUrl: string;
  }) {
    let emailStatus: EmailStatus = EmailStatus.success;
    let emailErrorMessage: string | undefined;

    try {
      const mailResult = await this.mailService.sendSessionNotification({
        to: params.customer.email,
        customerName: params.customer.name,
        staffName: params.staff.name,
        startAt: params.startAt.toISOString(),
        endAt: params.endAt.toISOString(),
        meetUrl: params.meetUrl,
        title: params.title,
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
          sessionId: params.sessionId,
          toEmail: params.customer.email,
          subject: params.title,
          body: params.meetUrl,
          status: emailStatus,
          errorMessage: emailErrorMessage,
        },
      });
    }
  }

  private computeSlotWindow(startAtIso: string) {
    const startAt = new Date(startAtIso);
    if (Number.isNaN(startAt.getTime())) {
      throw new BadRequestException('日時の形式が不正です。');
    }

    const now = new Date();
    if (startAt < now) {
      throw new BadRequestException('過去の日時は予約できません。');
    }

    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + BOOKABLE_DAYS);
    if (startAt > maxDate) {
      throw new BadRequestException(`${BOOKABLE_DAYS}日より先の予約はできません。`);
    }

    if (startAt.getUTCMinutes() !== 0 || startAt.getUTCSeconds() !== 0 || startAt.getUTCMilliseconds() !== 0) {
      throw new BadRequestException('予約枠は1時間刻みです。00分を指定してください。');
    }

    const hourInTokyo = Number(this.hourFormatter.format(startAt));
    if (hourInTokyo < SLOT_START_HOUR || hourInTokyo >= SLOT_END_HOUR) {
      throw new BadRequestException('予約可能時間は10:00〜19:00です。');
    }

    const endAt = new Date(startAt.getTime() + SLOT_DURATION_MINUTES * 60 * 1000);
    return { startAt, endAt };
  }

  private async ensureSlotIsAvailable(staffId: string, startAt: Date, excludeSessionId?: string) {
    const overlap = await this.prisma.session.findFirst({
      where: {
        staffId,
        startAt,
        status: {
          not: SessionStatus.cancelled,
        },
        ...(excludeSessionId
          ? {
              NOT: { id: excludeSessionId },
            }
          : {}),
      },
    });

    if (overlap) {
      throw new BadRequestException('すでに予約済みの枠です。別の時間をお選びください。');
    }
  }

  private async ensureStaff(staffId: string): Promise<SafeUser> {
    const staff = await this.usersService.findById(staffId);
    if (!staff) {
      throw new BadRequestException('担当者が存在しません。');
    }
    return this.usersService.sanitize(staff);
  }

  private async ensureSessionOwnedByCustomer(sessionId: string, customerId: string): Promise<Session> {
    const session = await this.prisma.session.findUnique({ where: { id: sessionId } });
    if (!session || session.customerId !== customerId) {
      throw new NotFoundException('予約が見つかりません。');
    }
    return session;
  }

  private parseDateAtTimezone(dateIso: string) {
    const base = new Date(`${dateIso}T00:00:00+09:00`);
    if (Number.isNaN(base.getTime())) {
      throw new BadRequestException('日付の形式が不正です。YYYY-MM-DD で指定してください。');
    }
    return base;
  }
}
