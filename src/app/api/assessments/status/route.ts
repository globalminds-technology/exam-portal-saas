import { NextResponse } from 'next/server';
import { getSessionFromCookies } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { submitAssessment, EXAM_DURATION_MINUTES } from '@/lib/services/assessment.service';
import { getExamControlState } from '@/lib/services/exam-control.service';

export async function GET() {
  try {
    const session = await getSessionFromCookies();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const assessment = await db.assessment.findFirst({
      where: { userId: session.userId },
      select: {
        id: true,
        status: true,
        startedAt: true,
        deadlineAt: true,
        durationMinutes: true,
        submittedAt: true,
        totalQuestions: true,
        attemptedQuestions: true,
      },
    });

    // Load all categories configured for the examination (questionQuantity > 0)
    const configuredCategories = await db.category.findMany({
      where: { questionQuantity: { gt: 0 } },
      select: {
        id: true,
        name: true,
        questionQuantity: true,
      },
      orderBy: { name: 'asc' },
    });

    const totalConfiguredQuestions = configuredCategories.reduce(
      (acc, c) => acc + c.questionQuantity,
      0
    );
    const isConfigured = totalConfiguredQuestions > 0;

    const examControl = await getExamControlState();

    if (!assessment) {
      return NextResponse.json({
        status: 'NOT_STARTED',
        hasAttempted: false,
        isConfigured,
        isExamStarted: examControl.isExamStarted,
        examStartedAt: examControl.startedAt,
        totalQuestions: totalConfiguredQuestions,
        durationMinutes: Math.max(1, totalConfiguredQuestions),
        categories: configuredCategories.map((c) => ({
          name: c.name,
          quantity: c.questionQuantity,
        })),
      });
    }

    // Check if in-progress exam has passed its duration deadline
    if (assessment.status === 'IN_PROGRESS') {
      const dur = assessment.durationMinutes || assessment.totalQuestions || EXAM_DURATION_MINUTES;
      const deadline =
        assessment.deadlineAt ||
        new Date(assessment.startedAt.getTime() + dur * 60 * 1000);

      if (Date.now() >= deadline.getTime()) {
        await submitAssessment(assessment.id, session.userId, 'time_expired');
        return NextResponse.json({
          status: 'COMPLETED',
          hasAttempted: true,
          attemptUsed: true,
          isConfigured: true,
          totalQuestions: assessment.totalQuestions,
          durationMinutes: dur,
          assessmentId: assessment.id,
          submittedAt: new Date().toISOString(),
          message: `The ${dur}-minute assessment duration has expired. The exam has been automatically submitted.`,
        });
      }
    }

    if (assessment.status === 'COMPLETED') {
      return NextResponse.json({
        status: 'COMPLETED',
        hasAttempted: true,
        attemptUsed: true,
        isConfigured: true,
        totalQuestions: assessment.totalQuestions,
        durationMinutes: assessment.durationMinutes || assessment.totalQuestions,
        assessmentId: assessment.id,
        submittedAt: assessment.submittedAt,
        message: 'You have already completed your assessment. Only one attempt is permitted.',
      });
    }

    return NextResponse.json({
      status: 'IN_PROGRESS',
      hasAttempted: false,
      isConfigured: true,
      isExamStarted: examControl.isExamStarted,
      examStartedAt: examControl.startedAt,
      totalQuestions: assessment.totalQuestions,
      durationMinutes: assessment.durationMinutes || assessment.totalQuestions,
      assessmentId: assessment.id,
      startedAt: assessment.startedAt,
    });
  } catch (error: any) {
    console.error('Error checking assessment status:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to check assessment status.' },
      { status: 500 }
    );
  }
}
