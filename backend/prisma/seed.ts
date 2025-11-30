import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const staff = [
    { code: 'STAFF_A', name: '担当A', email: 'staff-a@example.com' },
    { code: 'STAFF_B', name: '担当B', email: 'staff-b@example.com' },
  ];

  for (const member of staff) {
    const existing = await prisma.user.findUnique({ where: { code: member.code } });
    if (!existing) {
      const passwordHash = await bcrypt.hash('temp-password', 10);
      await prisma.user.create({
        data: {
          code: member.code,
          name: member.name,
          email: member.email,
          passwordHash,
        },
      });
      console.log(`Seeded staff ${member.name} (${member.code})`);
    }
  }

  const sampleCustomerEmail = 'customer@example.com';
  const existingCustomer = await prisma.customer.findUnique({ where: { email: sampleCustomerEmail } });
  if (!existingCustomer) {
    const passwordHash = await bcrypt.hash('password123', 10);
    await prisma.customer.create({
      data: {
        name: 'デモ顧客',
        email: sampleCustomerEmail,
        passwordHash,
        phone: '000-0000-0000',
      },
    });
    console.log('Seeded demo customer (customer@example.com / password123)');
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
