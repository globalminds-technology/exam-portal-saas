import { db } from '../src/lib/db';

async function removeLoadCandidates() {
  console.log('--- Removing Load Candidates ---');

  // 1. Identify all load candidates
  const loadUsers = await db.user.findMany({
    where: {
      OR: [
        { name: { startsWith: 'Load Candidate' } },
        { email: { startsWith: 'candidate', endsWith: '@assessment.com' } }
      ]
    },
    select: {
      id: true,
      name: true,
      email: true,
    }
  });

  if (loadUsers.length === 0) {
    console.log('No Load Candidates found in database.');
    return;
  }

  const userIds = loadUsers.map(u => u.id);
  console.log(`Identified ${loadUsers.length} load candidate records to delete.`);

  // 2. Remove associated assessment records and answers
  console.log('Removing associated assessment attempts and answers...');
  const delAssessments = await db.assessment.deleteMany({
    where: {
      userId: { in: userIds }
    }
  });
  console.log(`✓ Deleted ${delAssessments.count} assessment records.`);

  // 3. Remove the load candidate user records
  console.log('Deleting load candidate users...');
  const delUsers = await db.user.deleteMany({
    where: {
      id: { in: userIds }
    }
  });
  console.log(`✓ Successfully deleted ${delUsers.count} load candidate user records.`);

  const remainingUsers = await db.user.count();
  console.log(`✓ Total remaining users in database: ${remainingUsers}`);
  console.log('--- Done ---');
}

removeLoadCandidates()
  .catch((e) => {
    console.error('Error removing load candidates:', e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
