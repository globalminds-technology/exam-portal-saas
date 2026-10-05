import { db } from '@/lib/db';

export interface ExamControlState {
  isExamStarted: boolean;
  startedAt: Date | null;
  startedById: string | null;
  startedBy: {
    id: string;
    name: string;
    email: string;
  } | null;
  updatedAt: Date;
}

/**
 * Gets the current examination control state.
 * If not initialized yet, creates the default singleton record.
 */
export async function getExamControlState(): Promise<ExamControlState> {
  let record = await (db as any).examControl.findUnique({
    where: { id: 'global' },
    include: {
      startedBy: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });

  if (!record) {
    record = await (db as any).examControl.create({
      data: {
        id: 'global',
        isExamStarted: false,
      },
      include: {
        startedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
  }

  return {
    isExamStarted: record.isExamStarted,
    startedAt: record.startedAt,
    startedById: record.startedById,
    startedBy: record.startedBy,
    updatedAt: record.updatedAt,
  };
}

/**
 * Toggles or sets the global examination start state.
 * Must only be invoked by SUPER_ADMIN.
 */
export async function setExamControlState(
  isExamStarted: boolean,
  actorUserId: string,
  actorRole: string
): Promise<ExamControlState> {
  if (actorRole !== 'SUPER_ADMIN') {
    throw new Error('Forbidden: Only the Super Administrator has permission to start or stop examinations.');
  }

  const updated = await (db as any).examControl.upsert({
    where: { id: 'global' },
    update: {
      isExamStarted,
      startedAt: isExamStarted ? new Date() : null,
      startedById: isExamStarted ? actorUserId : null,
    },
    create: {
      id: 'global',
      isExamStarted,
      startedAt: isExamStarted ? new Date() : null,
      startedById: isExamStarted ? actorUserId : null,
    },
    include: {
      startedBy: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });

  return {
    isExamStarted: updated.isExamStarted,
    startedAt: updated.startedAt,
    startedById: updated.startedById,
    startedBy: updated.startedBy,
    updatedAt: updated.updatedAt,
  };
}
