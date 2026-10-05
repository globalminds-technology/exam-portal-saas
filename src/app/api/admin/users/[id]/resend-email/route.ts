import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookies, hasAdminAccess } from '@/lib/auth/session';
import { db } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { sendCandidateCredentialsEmail } from '@/lib/services/email.service';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSessionFromCookies();
    if (!session || !hasAdminAccess(session.role)) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 403 });
    }

    const { id } = await params;
    const user: any = await db.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        contactNumber: true,
        role: true,
        createdById: true,
      } as any,
    });

    if (!user) {
      return NextResponse.json({ error: 'Candidate not found.' }, { status: 404 });
    }

    if (user.role !== 'USER') {
      return NextResponse.json(
        { error: 'Credentials email can only be resent for candidates.' },
        { status: 400 }
      );
    }

    if (session.role === 'ADMIN' && user.createdById !== session.userId) {
      return NextResponse.json(
        { error: 'Unauthorized: You can only resend credentials to candidates added by you.' },
        { status: 403 }
      );
    }

    // Generate a fresh secure password
    const prefixes = ['Exam', 'Pass', 'Test', 'Cert', 'Grad', 'Prep'];
    const symbols = ['@', '#', '!', '$'];
    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    const symbol = symbols[Math.floor(Math.random() * symbols.length)];
    const digits = Math.floor(1000 + Math.random() * 9000);
    const newPassword = `${prefix}${symbol}${digits}`;

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(newPassword, salt);

    await db.user.update({
      where: { id },
      data: { passwordHash },
    });

    const emailResult = await sendCandidateCredentialsEmail({
      name: user.name,
      email: user.email,
      contactNumber: user.contactNumber,
      password: newPassword,
    });

    return NextResponse.json({
      success: true,
      message: `Fresh credentials generated and email sent to ${user.email}.`,
      plainPassword: newPassword,
      emailResult,
    });
  } catch (error: any) {
    console.error('Error resending candidate email:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to resend credentials email.' },
      { status: 500 }
    );
  }
}
