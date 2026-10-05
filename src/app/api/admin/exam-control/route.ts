import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookies } from '@/lib/auth/session';
import { getExamControlState, setExamControlState } from '@/lib/services/exam-control.service';

export async function GET() {
  try {
    const session = await getSessionFromCookies();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const state = await getExamControlState();
    return NextResponse.json({
      success: true,
      data: state,
    });
  } catch (error: any) {
    console.error('Error fetching exam control state:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch examination status' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromCookies();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized. Please login.' }, { status: 401 });
    }

    if (session.role !== 'SUPER_ADMIN') {
      return NextResponse.json(
        { error: 'Forbidden: Only the Super Administrator has permission to start or stop the examination.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { isExamStarted } = body;

    if (typeof isExamStarted !== 'boolean') {
      return NextResponse.json(
        { error: 'Invalid payload: isExamStarted must be a boolean.' },
        { status: 400 }
      );
    }

    const updated = await setExamControlState(isExamStarted, session.userId, session.role);

    return NextResponse.json({
      success: true,
      message: isExamStarted
        ? 'Examination has been successfully started! Candidates can now attend.'
        : 'Examination has been stopped. Candidate entry is locked.',
      data: updated,
    });
  } catch (error: any) {
    console.error('Error setting exam control state:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update examination status' },
      { status: 500 }
    );
  }
}
