import { db } from '../src/lib/db';
import bcrypt from 'bcryptjs';

async function seedLoadCandidates() {
  console.log('--- Fast Seeding 500 Candidates for Concurrency Load Test ---');
  
  // 1. Ensure Global Exam Session is started
  await db.examControl.upsert({
    where: { id: 'global' },
    update: {
      isExamStarted: true,
      startedAt: new Date(),
    },
    create: {
      id: 'global',
      isExamStarted: true,
      startedAt: new Date(),
    },
  });
  console.log('✓ Global Examination Session set to: ACTIVE (Unlocked)');

  // 2. Hash candidate password once
  const password = 'candidate@123';
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(password, salt);

  const totalCandidates = 500;
  console.log(`Preparing ${totalCandidates} candidate records...`);

  const candidateData = [];
  for (let i = 1; i <= totalCandidates; i++) {
    candidateData.push({
      name: `Load Candidate ${i}`,
      email: `candidate${i}@assessment.com`,
      passwordHash,
      role: 'USER' as const,
      isActive: true,
    });
  }

  // Fast bulk insert with skipDuplicates
  const res = await db.user.createMany({
    data: candidateData,
    skipDuplicates: true,
  });
  console.log(`✓ Inserted new candidate records: ${res.count}`);

  // 3. Clear existing assessments for fresh attempts
  console.log('Resetting previous assessment attempts for load candidates...');
  const delRes = await db.assessment.deleteMany({
    where: {
      user: {
        email: {
          startsWith: 'candidate',
          endsWith: '@assessment.com',
        },
      },
    },
  });
  console.log(`✓ Cleared ${delRes.count} previous assessment sessions`);

  const totalInDb = await db.user.count({
    where: {
      email: {
        startsWith: 'candidate',
        endsWith: '@assessment.com',
      },
    },
  });

  console.log(`✓ Total load candidates active in database: ${totalInDb}`);
  console.log(`  Password for all candidates: ${password}`);
  console.log('--- 500 Candidates Ready for Concurrency Load Test ---');
}

seedLoadCandidates()
  .catch((e) => {
    console.error('Error seeding load candidates:', e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
