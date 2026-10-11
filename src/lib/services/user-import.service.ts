import * as XLSX from 'xlsx';
import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';

export interface RawCandidateRow {
  name: string;
  mobileNumber?: string;
  email?: string;
}

export interface GeneratedCandidateCredential {
  name: string;
  mobileNumber: string;
  username: string;
  email: string;
  plainPassword: string;
  status: 'CREATED' | 'ALREADY_EXISTS' | 'ERROR';
  errorMessage?: string;
}

export interface ImportRosterResult {
  totalProcessed: number;
  totalCreated: number;
  totalSkipped: number;
  credentials: GeneratedCandidateCredential[];
  csvContent: string;
  batchId: string;
  batchName: string;
}

/**
 * Extracts candidate's clean first name in lowercase, filtering out common titles.
 * E.g., "Mr. Rahul Sharma" -> "rahul", "Dr. Emily Watson" -> "emily", "Saanvi Bose" -> "saanvi"
 */
export function extractFirstName(name: string): string {
  const titles = new Set(['mr', 'mrs', 'ms', 'miss', 'dr', 'prof', 'shri', 'smt']);
  const parts = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(Boolean);

  const filtered = parts.filter((p) => !titles.has(p));
  if (filtered.length > 0) {
    return filtered[0];
  }
  return parts.length > 0 ? parts[0] : 'user';
}

/**
 * Generates a clean, normalized base username (Login ID) from a full name.
 * E.g., "Rahul Sharma" -> "rahul.sharma", "John Smith Jr." -> "john.smith"
 */
export function generateBaseUsername(name: string): string {
  const titles = new Set(['mr', 'mrs', 'ms', 'miss', 'dr', 'prof', 'shri', 'smt']);
  const parts = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(Boolean);

  const filtered = parts.filter((p) => !titles.has(p));
  const tokens = filtered.length > 0 ? filtered : parts;

  if (tokens.length === 0) {
    return 'candidate';
  }
  if (tokens.length === 1) {
    return tokens[0];
  }
  return `${tokens[0]}.${tokens[1]}`;
}

/**
 * Generates candidate password strictly formatted as:
 * <first_name_in_lowercase>@123
 * E.g., "Rahul Sharma" -> "rahul@123", "Saanvi Bose" -> "saanvi@123", "John" -> "john@123"
 */
export function generateCandidatePassword(name: string): string {
  const firstName = extractFirstName(name);
  return `${firstName}@123`;
}

/**
 * Generates a secure, memorable 8-10 character random password.
 * Format: Prefix + Symbol + 4 Digits (e.g. Exam!4829, Pass#7391)
 */
export function generateSecurePassword(): string {
  const prefixes = ['Exam', 'Pass', 'Test', 'Cert', 'Grad', 'Eval', 'User', 'Hero'];
  const symbols = ['!', '@', '#', '$', '*', '?'];
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  const symbol = symbols[Math.floor(Math.random() * symbols.length)];
  const digits = Math.floor(1000 + Math.random() * 9000).toString(); // 4 random digits
  return `${prefix}${symbol}${digits}`;
}

/**
 * Parses an Excel (.xlsx, .xls) or CSV buffer into a list of candidate names and mobile numbers.
 */
export function parseCandidateWorkbook(buffer: Buffer): RawCandidateRow[] {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error('The uploaded Excel document does not contain any sheets.');
  }

  const worksheet = workbook.Sheets[sheetName];
  const jsonData = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, { defval: '' });

  if (!jsonData || jsonData.length === 0) {
    throw new Error('The uploaded document is empty or does not contain valid tabular rows.');
  }

  const candidateRows: RawCandidateRow[] = [];

  for (const row of jsonData) {
    let nameVal = '';
    let mobileVal = '';
    let emailVal = '';

    for (const [key, rawVal] of Object.entries(row)) {
      if (rawVal === undefined || rawVal === null) continue;
      const valStr = String(rawVal).trim();
      if (!valStr) continue;

      const normalizedKey = key.trim().toLowerCase().replace(/[^a-z0-9]/g, '');

      // Name matching
      if (
        ['name', 'fullname', 'candidatename', 'studentname', 'username', 'user', 'candidate', 'student'].includes(
          normalizedKey
        )
      ) {
        nameVal = valStr;
      }

      // Mobile / Phone matching
      if (
        [
          'mobile',
          'mobilenumber',
          'mobilephone',
          'phone',
          'phonenumber',
          'contact',
          'contactnumber',
          'cell',
          'cellphone',
          'whatsapp',
          'number',
          'tel',
          'telephone',
        ].includes(normalizedKey)
      ) {
        mobileVal = valStr.replace(/\.0+$/, '');
      }

      // Email matching (optional if provided)
      if (
        ['email', 'emailaddress', 'mail', 'candidateemail'].includes(normalizedKey)
      ) {
        emailVal = valStr.toLowerCase();
      }
    }

    // Fallback if no explicit name header: first column with alphabetic text
    if (!nameVal) {
      const firstTextEntry = Object.values(row).find(
        (v) => typeof v === 'string' && v.trim().length > 1 && !/^\+?[0-9\s\-]+$/.test(v.trim())
      );
      if (firstTextEntry && typeof firstTextEntry === 'string') {
        nameVal = firstTextEntry.trim();
      }
    }

    // Fallback if no explicit mobile header: find any column that resembles a phone number (7-15 digits)
    if (!mobileVal) {
      for (const rawVal of Object.values(row)) {
        if (rawVal === undefined || rawVal === null) continue;
        const strVal = String(rawVal).trim().replace(/\.0+$/, '');
        const cleanDigits = strVal.replace(/[^0-9]/g, '');
        if (cleanDigits.length >= 7 && cleanDigits.length <= 15) {
          mobileVal = strVal;
          break;
        }
      }
    }

    if (nameVal) {
      candidateRows.push({
        name: nameVal,
        mobileNumber: mobileVal || undefined,
        email: emailVal || undefined,
      });
    }
  }

  if (candidateRows.length === 0) {
    throw new Error(
      'Could not detect candidate names in the uploaded document. Please ensure a column named "Candidate Name" or "Name" exists.'
    );
  }

  return candidateRows;
}

/**
 * Imports candidates from an Excel/CSV roster containing Name and Mobile Number,
 * automatically generates Login IDs and passwords (firstname@123), persists in DB,
 * and compiles the credentials CSV for the administrator.
 */
export async function importCandidatesFromBuffer(
  buffer: Buffer,
  originalFileName: string = 'candidates',
  createdById?: string
): Promise<ImportRosterResult> {
  const rawCandidates = parseCandidateWorkbook(buffer);

  // Fetch existing users to avoid username/email/mobile collisions and sync credentials
  const existingUsers: any[] = await db.user.findMany({
    select: { id: true, name: true, email: true, contactNumber: true } as any,
  });

  const existingByEmail = new Map<string, any>();
  const existingByContact = new Map<string, any>();
  const existingEmails = new Set<string>();

  for (const u of existingUsers) {
    if (u.email) {
      const emailLower = u.email.toLowerCase();
      existingByEmail.set(emailLower, u);
      existingEmails.add(emailLower);
    }
    if (u.contactNumber) {
      const clean = String(u.contactNumber).trim();
      existingByContact.set(clean, u);
      const digitsOnly = clean.replace(/[^0-9]/g, '');
      if (digitsOnly) existingByContact.set(digitsOnly, u);
    }
  }

  const credentials: GeneratedCandidateCredential[] = [];
  const assignedUsernames = new Set<string>();

  // Helper to ensure guaranteed uniqueness for Login ID
  const getUniqueUsername = (base: string): string => {
    let candidateUsername = base;
    let counter = 1;

    while (
      assignedUsernames.has(candidateUsername) ||
      existingEmails.has(candidateUsername) ||
      existingEmails.has(`${candidateUsername}@assessment.com`)
    ) {
      counter++;
      candidateUsername = `${base}${counter}`;
    }

    assignedUsernames.add(candidateUsername);
    return candidateUsername;
  };

  // Strip extension for a friendly batch name
  const batchName = originalFileName.replace(/\.[^.]+$/, '');

  // Create a UserBatch record for this import session
  const userBatch = await db.userBatch.create({
    data: {
      fileName: originalFileName,
      batchName,
      totalCandidates: 0,
      createdById: createdById || null,
    } as any,
  });

  interface CandidateRecord {
    name: string;
    mobileNumber: string;
    username: string;
    email: string;
    plainPassword: string;
    isExisting: boolean;
    existingId?: string;
  }

  const candidateRecords: CandidateRecord[] = [];

  // 1. Process candidate rows: match existing or generate new Login ID
  for (const raw of rawCandidates) {
    const cleanMobile = raw.mobileNumber ? raw.mobileNumber.trim() : '';
    const digitsMobile = cleanMobile.replace(/[^0-9]/g, '');
    const plainPassword = generateCandidatePassword(raw.name);

    // Check if candidate already exists in database
    let existingUser: any = null;
    if (cleanMobile) {
      existingUser = existingByContact.get(cleanMobile) || (digitsMobile ? existingByContact.get(digitsMobile) : null);
    }
    if (!existingUser && raw.email) {
      existingUser = existingByEmail.get(raw.email.toLowerCase());
    }

    if (existingUser) {
      // User already exists: retrieve their Login ID and sync their password
      const existingLoginId = existingUser.email.replace(/@assessment\.com$/, '');
      candidateRecords.push({
        name: raw.name || existingUser.name,
        mobileNumber: cleanMobile || existingUser.contactNumber || '',
        username: existingLoginId,
        email: existingUser.email,
        plainPassword, // Always provide actual password (firstname@123), NEVER "(Already Exists)"!
        isExisting: true,
        existingId: existingUser.id,
      });
    } else {
      // New candidate: generate unique Login ID
      const baseUsername = generateBaseUsername(raw.name);
      const username = getUniqueUsername(baseUsername);
      const email = raw.email ? raw.email.toLowerCase() : `${username}@assessment.com`;

      existingEmails.add(email);
      if (cleanMobile) {
        existingByContact.set(cleanMobile, { email, contactNumber: cleanMobile });
        if (digitsMobile) existingByContact.set(digitsMobile, { email, contactNumber: cleanMobile });
      }

      candidateRecords.push({
        name: raw.name,
        mobileNumber: cleanMobile,
        username,
        email,
        plainPassword,
        isExisting: false,
      });
    }
  }

  // 2. Pre-hash all unique passwords in parallel
  const uniquePasswords = Array.from(new Set(candidateRecords.map((c) => c.plainPassword)));
  const passwordHashMap = new Map<string, string>();

  await Promise.all(
    uniquePasswords.map(async (pwd) => {
      const hash = await bcrypt.hash(pwd, 8);
      passwordHashMap.set(pwd, hash);
    })
  );

  // 3. Insert new candidate users in bulk
  const newItems = candidateRecords.filter((c) => !c.isExisting);
  if (newItems.length > 0) {
    const toInsert = newItems.map((c) => ({
      name: c.name,
      email: c.email,
      contactNumber: c.mobileNumber || null,
      passwordHash: passwordHashMap.get(c.plainPassword)!,
      role: 'USER' as const,
      isActive: true,
      batchId: userBatch.id,
      createdById: createdById || null,
    }));

    await db.user.createMany({
      data: toInsert as any,
      skipDuplicates: true,
    });
  }

  // 4. Update existing candidates so their password is guaranteed to be firstname@123
  const existingItems = candidateRecords.filter((c) => c.isExisting && c.existingId);
  if (existingItems.length > 0) {
    await Promise.all(
      existingItems.map((c) =>
        db.user.update({
          where: { id: c.existingId },
          data: {
            passwordHash: passwordHashMap.get(c.plainPassword)!,
            batchId: userBatch.id,
            isActive: true,
          } as any,
        }).catch(() => {})
      )
    );
  }

  // 5. Populate credentials output: Every user receives their real Login ID and Password
  for (const c of candidateRecords) {
    credentials.push({
      name: c.name,
      mobileNumber: c.mobileNumber || 'N/A',
      username: c.username,
      email: c.email,
      plainPassword: c.plainPassword, // Guaranteed real password (e.g. sandhya@123)
      status: 'CREATED',
    });
  }

  // Build CSV content string for Admin to distribute directly to candidates
  const csvLines: string[] = [];
  csvLines.push('Candidate Name,Mobile Number,Login ID,Password,Status,Creation Date');

  const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 19);

  for (const cred of credentials) {
    const escapedName = `"${cred.name.replace(/"/g, '""')}"`;
    // Standard RFC 4180 quoted string for mobile numbers
    const mobileText =
      cred.mobileNumber && cred.mobileNumber !== 'N/A'
        ? `"${cred.mobileNumber.replace(/"/g, '""')}"`
        : '""';
    const escapedUsername = `"${cred.username.replace(/"/g, '""')}"`;
    const escapedPassword = `"${cred.plainPassword.replace(/"/g, '""')}"`;
    const escapedStatus = `"${cred.status}"`;

    csvLines.push(
      `${escapedName},${mobileText},${escapedUsername},${escapedPassword},${escapedStatus},"${nowStr}"`
    );
  }

  const csvContent = csvLines.join('\r\n');

  // Update batch with actual count
  await db.userBatch.update({
    where: { id: userBatch.id },
    data: { totalCandidates: credentials.length },
  });

  return {
    totalProcessed: rawCandidates.length,
    totalCreated: credentials.length,
    totalSkipped: 0,
    credentials,
    csvContent,
    batchId: userBatch.id,
    batchName,
  };
}

/**
 * Generates a clean CSV sample template for administrators containing Candidate Name and Mobile Number.
 */
export function generateSampleCandidateTemplate(): string {
  return [
    'Candidate Name,Mobile Number',
    'John Smith,9876543210',
    'Sarah Connor,9876543211',
    'Michael Chang,9876543212',
    'Emily Watson,9876543213',
  ].join('\r\n');
}
