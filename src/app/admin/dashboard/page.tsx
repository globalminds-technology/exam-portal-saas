'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  HelpCircle,
  CheckCircle2,
  Users,
  PlayCircle,
  FileCheck2,
  TrendingUp,
  ArrowRight,
  Upload,
  Layers,
  ChevronRight,
  Radio,
  Power,
  Clock,
  ShieldCheck,
} from 'lucide-react';

interface DashboardStats {
  totalQuestions: number;
  activeQuestions: number;
  inactiveQuestions: number;
  totalUsers: number;
  assessmentsStarted: number;
  assessmentsCompleted: number;
  avgScore: string;
  avgPercentage: string;
  categories: { id: string; name: string; _count: { questions: number } }[];
  recentAssessments: {
    id: string;
    status: string;
    score: number;
    percentage: number;
    startedAt: string;
    submittedAt: string | null;
    user: { name: string; email: string };
  }[];
}

import { useRouter } from 'next/navigation';

export default function AdminDashboardPage() {
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<{ id: string; name: string; email: string; role: string } | null>(null);
  const [examControl, setExamControl] = useState<{
    isExamStarted: boolean;
    startedAt: string | null;
    startedBy?: { name: string; email: string } | null;
  }>({
    isExamStarted: false,
    startedAt: null,
  });
  const [isTogglingExam, setIsTogglingExam] = useState(false);
  const [examControlMsg, setExamControlMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    async function loadStats() {
      try {
        const [statsRes, userRes, examRes] = await Promise.all([
          fetch('/api/admin/dashboard-stats'),
          fetch('/api/auth/me'),
          fetch('/api/admin/exam-control'),
        ]);

        if (!statsRes.ok) {
          router.push('/login');
          return;
        }

        const data = await statsRes.json();
        if (data.error || !Array.isArray(data.recentAssessments)) {
          router.push('/login');
          return;
        }
        setStats(data);

        if (userRes.ok) {
          const uData = await userRes.json();
          if (uData.user) setCurrentUser(uData.user);
        }

        if (examRes.ok) {
          const eData = await examRes.json();
          if (eData.data) setExamControl(eData.data);
        }
      } catch (err) {
        console.error('Failed to load stats:', err);
      } finally {
        setLoading(false);
      }
    }
    loadStats();
  }, [router]);

  const handleToggleExam = async (shouldStart: boolean) => {
    const actionWord = shouldStart ? 'START' : 'STOP';
    const confirmMessage = shouldStart
      ? 'Are you sure you want to START the examination?\n\nOnce started, registered candidates will immediately be able to attend and complete their assessment.'
      : 'Are you sure you want to STOP the examination?\n\nThis will prevent any new candidate entries.';

    if (!window.confirm(confirmMessage)) {
      return;
    }

    setIsTogglingExam(true);
    setExamControlMsg(null);

    try {
      const res = await fetch('/api/admin/exam-control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isExamStarted: shouldStart }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `Failed to ${actionWord.toLowerCase()} examination.`);
      }

      setExamControl(data.data);
      setExamControlMsg({
        text: data.message || `Examination successfully ${shouldStart ? 'started' : 'stopped'}.`,
        type: 'success',
      });
      setTimeout(() => setExamControlMsg(null), 6000);
    } catch (err: any) {
      setExamControlMsg({
        text: err.message || 'An error occurred while updating examination state.',
        type: 'error',
      });
    } finally {
      setIsTogglingExam(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16 text-center">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-slate-600 font-medium">Loading administrative dashboard...</p>
      </div>
    );
  }

  if (!stats || !Array.isArray(stats.recentAssessments)) {
    return null;
  }

  return (
    <div className="w-full px-4 sm:px-8 lg:px-10 py-8 space-y-8">
      {/* Header with Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Administrator Dashboard
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            System overview, question bank metrics, and candidate assessment analytics
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <Link
            href="/admin/questions/import"
            className="inline-flex items-center justify-center h-10 px-4 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 shadow-sm transition-all space-x-2 whitespace-nowrap cursor-pointer active:scale-95 shrink-0"
          >
            <Upload className="w-4 h-4 shrink-0" />
            <span className="whitespace-nowrap">Import Questions</span>
          </Link>
          <Link
            href="/admin/results"
            className="inline-flex items-center justify-center h-10 px-4 rounded-xl border border-slate-300 bg-white text-slate-700 text-sm font-semibold hover:bg-slate-50 shadow-xs transition-all space-x-2 whitespace-nowrap cursor-pointer active:scale-95 shrink-0"
          >
            <FileCheck2 className="w-4 h-4 shrink-0" />
            <span className="whitespace-nowrap">View Results</span>
          </Link>
        </div>
      </div>

      {/* Super Admin Examination Session Control Card */}
      <div
        className={`rounded-2xl p-4 sm:px-6 sm:py-4 border transition-all shadow-sm ${
          examControl.isExamStarted
            ? 'bg-gradient-to-r from-emerald-50/70 via-white to-teal-50/40 border-emerald-300'
            : 'bg-gradient-to-r from-slate-50/80 via-white to-amber-50/30 border-slate-200'
        }`}
      >
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-1.5 max-w-2xl">
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <div
                className={`w-7 h-7 rounded-lg flex items-center justify-center border shrink-0 ${
                  examControl.isExamStarted
                    ? 'bg-emerald-100 border-emerald-200 text-emerald-700'
                    : 'bg-amber-100 border-amber-200 text-amber-700'
                }`}
              >
                <Radio className={`w-3.5 h-3.5 ${examControl.isExamStarted ? 'animate-pulse text-emerald-600' : 'text-amber-600'}`} />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Global Session Controller
              </span>
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold border gap-1.5 ${
                  examControl.isExamStarted
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : 'bg-amber-50 text-amber-800 border-amber-200'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    examControl.isExamStarted ? 'bg-emerald-500 animate-ping' : 'bg-amber-500'
                  }`}
                />
                <span>{examControl.isExamStarted ? 'EXAMINATION LIVE' : 'SESSION LOCKED'}</span>
              </span>
            </div>

            <h3 className="text-base sm:text-lg font-bold tracking-tight text-slate-900">
              {examControl.isExamStarted
                ? 'Examination Is Active — Candidates Can Attend'
                : 'Examination Is Not Started — Candidate Entry Is Locked'}
            </h3>

            <p className="text-xs text-slate-500 leading-relaxed">
              {examControl.isExamStarted
                ? `The assessment is currently live. Registered candidates are authorized to begin their single attempt. Started on ${
                    examControl.startedAt ? new Date(examControl.startedAt).toLocaleString() : 'recently'
                  }${examControl.startedBy ? ` by ${examControl.startedBy.name}` : ''}.`
                : 'Candidates can log in, but cannot attend or start their assessment until the Super Administrator initiates the exam session with the button.'}
            </p>

            {examControlMsg && (
              <div
                className={`p-2.5 rounded-lg text-xs font-semibold flex items-center space-x-2 ${
                  examControlMsg.type === 'success'
                    ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                    : 'bg-rose-50 border border-rose-200 text-rose-800'
                }`}
              >
                <span>{examControlMsg.text}</span>
              </div>
            )}
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 shrink-0">
            {currentUser?.role === 'SUPER_ADMIN' ? (
              !examControl.isExamStarted ? (
                <button
                  onClick={() => handleToggleExam(true)}
                  disabled={isTogglingExam}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white font-bold text-xs sm:text-sm shadow-sm transition-all flex items-center justify-center space-x-2 cursor-pointer active:scale-95 disabled:opacity-75 border border-teal-600/20"
                >
                  <PlayCircle className="w-4 h-4 text-white" />
                  <span>{isTogglingExam ? 'Starting Exam...' : 'Start Examination'}</span>
                </button>
              ) : (
                <button
                  onClick={() => handleToggleExam(false)}
                  disabled={isTogglingExam}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-700 hover:to-rose-800 text-white font-bold text-xs sm:text-sm shadow-sm transition-all flex items-center justify-center space-x-2 cursor-pointer active:scale-95 disabled:opacity-75 border border-rose-600/20"
                >
                  <Power className="w-4 h-4 text-white" />
                  <span>{isTogglingExam ? 'Stopping...' : 'Stop Examination'}</span>
                </button>
              )
            ) : (
              <div className="px-4 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 flex items-center space-x-2">
                <ShieldCheck className="w-4 h-4 text-teal-600 shrink-0" />
                <span>Super Administrator exclusive control</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 6 Key Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Total Questions</span>
            <HelpCircle className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-extrabold text-slate-900">{stats.totalQuestions}</div>
          <div className="text-[11px] text-slate-400 mt-1">In question bank</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Active Questions</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-extrabold text-emerald-700">{stats.activeQuestions}</div>
          <div className="text-[11px] text-slate-400 mt-1">Available for assessments</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Total Users</span>
            <Users className="w-4 h-4 text-purple-600" />
          </div>
          <div className="text-2xl font-extrabold text-purple-700">{stats.totalUsers}</div>
          <div className="text-[11px] text-slate-400 mt-1">Registered candidates</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Started</span>
            <PlayCircle className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-extrabold text-amber-700">{stats.assessmentsStarted}</div>
          <div className="text-[11px] text-slate-400 mt-1">Total exam attempts</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Completed</span>
            <FileCheck2 className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-extrabold text-blue-700">
            {stats.assessmentsCompleted}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">Evaluated server-side</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Average Score</span>
            <TrendingUp className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-2xl font-extrabold text-indigo-700">
            {stats.avgScore} <span className="text-xs font-normal text-slate-400">/ 50</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1">{stats.avgPercentage}% overall</div>
        </div>
      </div>

      {/* Main Section: Recent Assessments */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Recent Assessments</h2>
              <p className="text-xs text-slate-500">Latest candidate test activities and scores</p>
            </div>
            <Link
              href="/admin/results"
              className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center"
            >
              <span>View All Results</span>
              <ChevronRight className="w-4 h-4 ml-1" />
            </Link>
          </div>

          {(!stats.recentAssessments || stats.recentAssessments.length === 0) ? (
            <div className="py-12 text-center text-slate-400 text-sm">
              No assessments recorded yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-400 text-[11px] font-bold uppercase tracking-wider">
                    <th className="pb-3">Candidate</th>
                    <th className="pb-3">Status</th>
                    <th className="pb-3">Score</th>
                    <th className="pb-3">Percentage</th>
                    <th className="pb-3">Submission Date</th>
                    <th className="pb-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(stats.recentAssessments || []).map((a) => (
                    <tr key={a.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-3.5">
                        <div className="font-semibold text-slate-900">{a.user.name}</div>
                        <div className="text-xs text-slate-400">{a.user.email}</div>
                      </td>
                      <td className="py-3.5">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            a.status === 'COMPLETED'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-amber-50 text-amber-700 border border-amber-200'
                          }`}
                        >
                          {a.status}
                        </span>
                      </td>
                      <td className="py-3.5 font-bold text-slate-900">
                        {a.status === 'COMPLETED' ? `${a.score}/50` : '-'}
                      </td>
                      <td className="py-3.5 font-semibold text-slate-700">
                        {a.status === 'COMPLETED' ? `${a.percentage.toFixed(1)}%` : '-'}
                      </td>
                      <td className="py-3.5 text-xs text-slate-500">
                        {a.submittedAt ? new Date(a.submittedAt).toLocaleDateString() : 'In Progress'}
                      </td>
                      <td className="py-3.5 text-right">
                        {a.status === 'COMPLETED' ? (
                          <Link
                            href={`/admin/results/${a.id}`}
                            className="text-xs font-semibold text-blue-600 hover:text-blue-800"
                          >
                            Review &rarr;
                          </Link>
                        ) : (
                          <span className="text-xs text-slate-400">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </div>
    </div>
  );
}
