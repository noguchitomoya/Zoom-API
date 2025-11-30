import { BadRequestException } from '@nestjs/common';
import { SessionStatus } from '@prisma/client';
import { SessionsService } from '../../src/modules/sessions/sessions.service';
import { MailService } from '../../src/modules/mail/mail.service';
import { MeetingService } from '../../src/modules/meeting/meeting.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { SafeCustomer } from '../../src/modules/customers/customers.service';
import { SafeUser, UsersService } from '../../src/modules/users/users.service';

const customer: SafeCustomer = {
  id: 'cust-1',
  name: '山田太郎',
  email: 'customer@example.com',
  phone: null,
  note: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const staff: SafeUser = {
  id: 'staff-1',
  code: 'STAFF_A',
  name: '担当A',
  email: 'staff-a@example.com',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const sessionRecord = {
  id: 'session-1',
  customerId: customer.id,
  staffId: staff.id,
  startAt: new Date('2025-12-01T01:00:00.000Z'),
  endAt: new Date('2025-12-01T02:00:00.000Z'),
  status: SessionStatus.scheduled,
  meetUrl: 'https://zoom.us/j/123456789',
  externalId: 'zoom-1',
  title: 'テスト',
  createdAt: new Date(),
  updatedAt: new Date(),
  staff: {
    id: staff.id,
    code: staff.code,
    name: staff.name,
    email: staff.email,
  },
};

describe('SessionsService (unit)', () => {
  let service: SessionsService;
  let prisma: jest.Mocked<Pick<PrismaService, 'session' | 'emailLog'>>;
  let usersService: jest.Mocked<UsersService>;
  let meetingService: jest.Mocked<MeetingService>;
  let mailService: jest.Mocked<MailService>;

  beforeEach(() => {
    prisma = {
      session: {
        create: jest.fn().mockResolvedValue(sessionRecord),
        update: jest.fn().mockResolvedValue({ ...sessionRecord, status: SessionStatus.cancelled }),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(sessionRecord),
      },
      emailLog: {
        create: jest.fn(),
      },
    } as unknown as jest.Mocked<Pick<PrismaService, 'session' | 'emailLog'>>;

    usersService = {
      findById: jest.fn().mockResolvedValue({ ...staff, passwordHash: '' } as any),
      sanitize: jest.fn().mockImplementation((value) => value as SafeUser),
      listAll: jest.fn().mockResolvedValue([{ ...staff, passwordHash: '' } as any]),
    } as unknown as jest.Mocked<UsersService>;

    meetingService = {
      createMeeting: jest.fn().mockResolvedValue({
        meetUrl: sessionRecord.meetUrl,
        externalId: sessionRecord.externalId,
      }),
    } as jest.Mocked<MeetingService>;

    mailService = {
      sendSessionNotification: jest.fn().mockResolvedValue({ success: true }),
    } as jest.Mocked<MailService>;

    service = new SessionsService(
      prisma as unknown as PrismaService,
      usersService,
      meetingService,
      mailService,
    );
  });

  it('creates a new reservation', async () => {
    const iso = '2025-12-01T10:00:00+09:00';
    const result = await service.createSession(customer, { staffId: staff.id, startAt: iso, title: '面談' });

    expect(prisma.session.create).toHaveBeenCalled();
    expect(meetingService.createMeeting).toHaveBeenCalled();
    expect(mailService.sendSessionNotification).toHaveBeenCalledWith(
      expect.objectContaining({ customerName: customer.name, staffName: staff.name }),
    );
    expect(result).toEqual(sessionRecord);
  });

  it('prevents double booking', async () => {
    prisma.session.findFirst.mockResolvedValueOnce(sessionRecord);

    await expect(
      service.createSession(customer, { staffId: staff.id, startAt: '2025-12-01T10:00:00+09:00' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('cancels a reservation', async () => {
    const result = await service.cancelSession(customer, sessionRecord.id);
    expect(prisma.session.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: SessionStatus.cancelled } }),
    );
    expect(result.status).toBe(SessionStatus.cancelled);
  });
});
